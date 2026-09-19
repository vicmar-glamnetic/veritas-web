import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { and, eq } from 'drizzle-orm';

import { bookingEvents, bookings, patients, sessionBlackouts } from '@/db/schema';
import { makeFixture, testDb, testPatient, warmPool, type Fixture } from '@/test/fixtures';

import { BookingError, createBooking } from './booking';
import { addDays, manilaToUtc } from './time';

const DATE = '2027-04-12';
const NOW = manilaToUtc(addDays(DATE, -7), '08:00');
const SLOT = manilaToUtc(DATE, '09:00');

const { db, pool, close } = testDb(16);
const cleanups: Array<() => Promise<void>> = [];

async function fixture(options: Parameters<typeof makeFixture>[1]) {
  const f = await makeFixture(db, options);
  cleanups.push(f.cleanup);
  return f;
}

/** A session with exactly one slot, so "the last place" is unambiguous. */
function singleSlot(onlineCapacity: number) {
  return {
    date: DATE,
    startTime: '09:00:00',
    endTime: '09:20:00',
    slotMinutes: 20,
    capacity: Math.max(onlineCapacity, 1) + 1,
    onlineCapacity,
  };
}

function book(f: Fixture, n: number, overrides: Record<string, unknown> = {}) {
  return createBooking(db, {
    serviceId: f.serviceId,
    doctorId: f.doctorId,
    sessionId: f.sessionId,
    start: SLOT,
    patient: testPatient(f, n),
    consentAt: NOW,
    now: NOW,
    ...overrides,
  });
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no_error';
  } catch (error) {
    return error instanceof BookingError ? error.reason : `unexpected:${String(error)}`;
  }
}

after(async () => {
  for (const c of cleanups) await c().catch(() => {});
  await close();
});

describe('createBooking', () => {
  it('books a slot and returns a reference the patient can quote', async () => {
    const f = await fixture(singleSlot(1));
    const booking = await book(f, 1);

    assert.match(booking.referenceCode, /^VRT-[234679ACDEFGHJKMNPQRTUVWXY]{4}$/);
    assert.equal(booking.slotIndex, 0);
    assert.equal(booking.scheduledStart.toISOString(), '2027-04-12T01:00:00.000Z');
    assert.equal(booking.scheduledEnd.toISOString(), '2027-04-12T01:20:00.000Z');
    assert.ok(booking.cancelToken.length >= 24, 'cancel token is a real secret');
  });

  it('writes the creation event to the append-only log', async () => {
    const f = await fixture(singleSlot(1));
    const booking = await book(f, 1);

    const events = await db
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, booking.id));

    assert.equal(events.length, 1);
    assert.equal(events[0]!.fromStatus, null);
    assert.equal(events[0]!.toStatus, 'booked');
    assert.equal(events[0]!.actor, 'patient');
    assert.equal(events[0]!.actorStaffUserId, null);
  });

  it('hands out consecutive seats while places remain', async () => {
    const f = await fixture(singleSlot(3));
    const seats = [await book(f, 1), await book(f, 2), await book(f, 3)];
    assert.deepEqual(seats.map((b) => b.slotIndex).sort(), [0, 1, 2]);
    assert.equal(await reasonOf(book(f, 4)), 'slot_full');
  });

  it('gives the seat back when a booking is cancelled', async () => {
    const f = await fixture(singleSlot(1));
    const first = await book(f, 1);
    assert.equal(await reasonOf(book(f, 2)), 'slot_full');

    await db
      .update(bookings)
      .set({ status: 'cancelled_by_patient' })
      .where(eq(bookings.id, first.id));

    const second = await book(f, 2);
    assert.equal(second.slotIndex, 0, 'the freed seat is reused');
  });

  it('still holds the seat once the patient has arrived', async () => {
    const f = await fixture(singleSlot(1));
    const first = await book(f, 1);
    await db.update(bookings).set({ status: 'arrived' }).where(eq(bookings.id, first.id));
    assert.equal(await reasonOf(book(f, 2)), 'slot_full');
  });

  it('refuses a slot inside the cut-off', async () => {
    const f = await fixture({ ...singleSlot(1), bookingCutoffHours: 24 });
    const tooLate = manilaToUtc(DATE, '07:00');
    assert.equal(await reasonOf(book(f, 1, { now: tooLate })), 'slot_past_cutoff');
  });

  it('refuses a slot the clinic has blacked out', async () => {
    const f = await fixture(singleSlot(1));
    await db.insert(sessionBlackouts).values({
      sessionId: null,
      doctorId: null,
      date: DATE,
      reason: 'Typhoon',
    });
    try {
      assert.equal(await reasonOf(book(f, 1)), 'slot_blacked_out');
    } finally {
      await db.delete(sessionBlackouts).where(eq(sessionBlackouts.date, DATE));
    }
  });

  it('refuses a time that is not one of the session’s slots', async () => {
    const f = await fixture(singleSlot(1));
    const offGrid = manilaToUtc(DATE, '09:07');
    assert.equal(await reasonOf(book(f, 1, { start: offGrid })), 'slot_not_in_session');
  });

  it('refuses a day the session does not run', async () => {
    const f = await fixture(singleSlot(1));
    const wrongDay = manilaToUtc(addDays(DATE, 1), '09:00');
    assert.equal(await reasonOf(book(f, 1, { start: wrongDay })), 'slot_not_in_session');
  });

  it('refuses a service that is not bookable online', async () => {
    const f = await fixture({ ...singleSlot(1), bookableOnline: false });
    assert.equal(await reasonOf(book(f, 1)), 'service_not_bookable');
  });

  it('refuses a doctor who does not deliver the service', async () => {
    const a = await fixture(singleSlot(1));
    const b = await fixture(singleSlot(1));
    assert.equal(
      await reasonOf(book(a, 1, { doctorId: b.doctorId })),
      'doctor_not_available_for_service',
    );
  });

  it('refuses a slot that is kept entirely for walk-ins', async () => {
    // 3 slots, 2 online places: [1,1,0]. The 09:40 slot is walk-in only.
    const f = await fixture({
      date: DATE,
      startTime: '09:00:00',
      endTime: '10:00:00',
      slotMinutes: 20,
      capacity: 3,
      onlineCapacity: 2,
    });
    const walkInOnly = manilaToUtc(DATE, '09:40');
    assert.equal(await reasonOf(book(f, 1, { start: walkInOnly })), 'slot_full');
  });

  it('reuses one patient record for the same person, and not for a namesake', async () => {
    const f = await fixture(singleSlot(3));
    const me = { fullName: 'Ana Reyes', mobile: `${f.mobilePrefix}001` };

    await book(f, 1, { patient: { ...me, email: 'ana@example.test' } });
    await book(f, 2, { patient: { ...me, email: 'ana.new@example.test' } });

    const rows = await db
      .select()
      .from(patients)
      .where(and(eq(patients.mobile, me.mobile), eq(patients.fullName, 'Ana Reyes')));
    assert.equal(rows.length, 1, 'same name and mobile is the same patient');
    assert.equal(rows[0]!.email, 'ana.new@example.test', 'contact details are refreshed');

    // A child sharing the family mobile must not be filed under the parent.
    await book(f, 3, { patient: { fullName: 'Ana Reyes Jr', mobile: me.mobile } });
    const all = await db.select().from(patients).where(eq(patients.mobile, me.mobile));
    assert.equal(all.length, 2, 'a different name on a shared mobile is a different patient');
  });
});

/**
 * A realistic stampede. The interleaving is not guaranteed here, which is why the
 * forced-race tests in concurrency.db.test.ts carry the actual guarantee. Connections
 * are opened up front so the attempts are not accidentally serialised by connection
 * setup, which would let this pass even with the guards removed.
 */
describe('concurrency: a stampede on the last place', () => {
  it('lets exactly one of eight simultaneous attempts win', async () => {
    const f = await fixture(singleSlot(1));
    await warmPool(pool, 8);

    // All eight are launched before any of them can finish.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => book(f, i + 1)),
    );

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');

    assert.equal(won.length, 1, `exactly one booking should succeed, got ${won.length}`);
    assert.equal(lost.length, 7);

    for (const failure of lost) {
      const error = (failure as PromiseRejectedResult).reason;
      assert.ok(error instanceof BookingError, `expected BookingError, got ${error}`);
      assert.equal(error.reason, 'slot_full', 'losers are told the slot is gone, not crashed at');
    }

    // And the database agrees.
    const live = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, f.sessionId), eq(bookings.status, 'booked')));
    assert.equal(live.length, 1);
    assert.equal(live[0]!.slotIndex, 0);
  });

  it('fills a three-place slot exactly three times under a stampede of twelve', async () => {
    const f = await fixture(singleSlot(3));
    await warmPool(pool, 12);

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => book(f, i + 1)),
    );

    const won = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof book>>> =>
        r.status === 'fulfilled',
      )
      .map((r) => r.value);

    assert.equal(won.length, 3, `three places, three winners, got ${won.length}`);
    assert.deepEqual(
      won.map((b) => b.slotIndex).sort(),
      [0, 1, 2],
      'winners hold distinct seats',
    );
    assert.equal(
      new Set(won.map((b) => b.referenceCode)).size,
      3,
      'every winner gets a distinct reference code',
    );

    const live = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, f.sessionId), eq(bookings.status, 'booked')));
    assert.equal(live.length, 3, 'the database never held more than capacity');
  });
});
