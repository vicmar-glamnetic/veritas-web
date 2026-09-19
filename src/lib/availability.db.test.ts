import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { eq } from 'drizzle-orm';

import { bookings, sessionBlackouts } from '@/db/schema';
import { makeFixture, testDb, type Fixture } from '@/test/fixtures';

import { computeAvailability } from './availability';
import { createBooking } from './booking';
import { addDays, manilaDateString, manilaToUtc } from './time';

/**
 * Engine behaviour against a real database.
 *
 * Dates are pinned in the future and `now` is injected, so these never depend on when
 * they are run and never collide with the seeded demo data.
 *
 * Each database test file uses its OWN date. A clinic-wide blackout is global by
 * definition, so two files exercising blackouts on the same date would sabotage each
 * other. The suite also runs test files serially for the same reason.
 */
const DATE = '2027-03-08';
const NOW = manilaToUtc(addDays(DATE, -7), '08:00');

const { db, close } = testDb();
const cleanups: Array<() => Promise<void>> = [];

async function fixture(options: Parameters<typeof makeFixture>[1]) {
  const f = await makeFixture(db, options);
  cleanups.push(f.cleanup);
  return f;
}

function query(f: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    serviceId: f.serviceId,
    doctorId: f.doctorId,
    now: NOW,
    horizonDays: 30,
    ...overrides,
  };
}

after(async () => {
  for (const c of cleanups) await c().catch(() => {});
  await close();
});

describe('computeAvailability', () => {
  it('expands a weekly session into dated slots inside the horizon', async () => {
    // 09:00-12:00 in 20-minute slots = 9 slots; 6 online places spread [1,1,0,1,1,0,1,1,0].
    const f = await fixture({ date: DATE, onlineCapacity: 6, capacity: 9 });
    const days = await computeAvailability(db, query(f));

    // The session recurs weekly, so the 30-day horizon catches several occurrences.
    assert.ok(days.length >= 4, `expected recurring days, got ${days.length}`);
    const day = days.find((d) => d.date === DATE);
    assert.ok(day, `expected ${DATE} to be available`);
    assert.equal(day.slots.length, 6, 'six slots carry an online place');
    assert.equal(day.openCount, 6);
  });

  it('converts Manila wall-clock to the right UTC instant', async () => {
    const f = await fixture({ date: DATE, startTime: '09:00:00', endTime: '10:00:00' });
    const days = await computeAvailability(db, query(f));
    const day = days.find((d) => d.date === DATE)!;
    // 09:00 in Manila is 01:00 UTC the same day.
    assert.equal(day.slots[0]!.start.toISOString(), '2027-03-08T01:00:00.000Z');
  });

  it('leaves the walk-in slots out of the online calendar', async () => {
    const f = await fixture({ date: DATE, capacity: 9, onlineCapacity: 6 });
    const day = (await computeAvailability(db, query(f))).find((d) => d.date === DATE)!;
    const times = day.slots.map((s) => s.start.toISOString().slice(11, 16));
    // Slots 3, 6 and 9 of the morning are held back: 09:40, 10:40, 11:40 Manila.
    assert.deepEqual(times, ['01:00', '01:20', '02:00', '02:20', '03:00', '03:20']);
  });

  it('honours the booking cut-off', async () => {
    const f = await fixture({ date: DATE, bookingCutoffHours: 24 });
    // Two hours before the session starts, with a 24-hour cut-off, that day is closed.
    const justBefore = manilaToUtc(DATE, '07:00');
    const days = await computeAvailability(db, query(f, { now: justBefore }));
    assert.equal(days.find((d) => d.date === DATE), undefined);
  });

  it('respects the horizon', async () => {
    const f = await fixture({ date: DATE });
    const days = await computeAvailability(db, query(f, { horizonDays: 3 }));
    const lastAllowed = addDays(manilaDateString(NOW), 2);
    assert.equal(
      days.find((d) => d.date === DATE),
      undefined,
      'the session is 7 days out, the horizon is 3',
    );
    assert.ok(
      days.every((d) => d.date <= lastAllowed),
      `nothing past ${lastAllowed}, got ${days.map((d) => d.date).join(', ')}`,
    );
  });

  it('offers same-day slots that clear the cut-off', async () => {
    // NOW is 08:00 Manila on a day this weekly session also runs. The 09:00 slot is
    // inside the 2-hour cut-off, but 10:00 onwards should still be bookable today.
    const f = await fixture({ date: DATE, bookingCutoffHours: 2 });
    const today = manilaDateString(NOW);
    const days = await computeAvailability(db, query(f));
    const day = days.find((d) => d.date === today);
    assert.ok(day, 'today should still have late-morning slots');
    assert.ok(
      day.slots.every((s) => s.start.getTime() - NOW.getTime() >= 2 * 60 * 60 * 1000),
      'every offered slot clears the cut-off',
    );
  });

  it('skips a clinic-wide blackout', async () => {
    const f = await fixture({ date: DATE });
    await db.insert(sessionBlackouts).values({
      sessionId: null,
      doctorId: null,
      date: DATE,
      reason: 'Public holiday',
    });
    try {
      const days = await computeAvailability(db, query(f));
      assert.equal(days.find((d) => d.date === DATE), undefined);
      assert.ok(days.some((d) => d.date === addDays(DATE, 7)), 'the next week is unaffected');
    } finally {
      await db.delete(sessionBlackouts).where(eq(sessionBlackouts.date, DATE));
    }
  });

  it('skips a blackout on one session', async () => {
    const f = await fixture({ date: DATE });
    await db.insert(sessionBlackouts).values({
      sessionId: f.sessionId,
      date: DATE,
      reason: 'Equipment servicing',
    });
    const days = await computeAvailability(db, query(f));
    assert.equal(days.find((d) => d.date === DATE), undefined);
  });

  it('skips a blackout on the doctor', async () => {
    const f = await fixture({ date: DATE });
    await db.insert(sessionBlackouts).values({
      doctorId: f.doctorId,
      date: DATE,
      reason: 'Attending a conference',
    });
    const days = await computeAvailability(db, query(f));
    assert.equal(days.find((d) => d.date === DATE), undefined);
  });

  it('drops a slot once its online places are gone, and the date once all are', async () => {
    // One slot in the whole session, one online place in it.
    const f = await fixture({
      date: DATE,
      startTime: '09:00:00',
      endTime: '09:20:00',
      slotMinutes: 20,
      capacity: 2,
      onlineCapacity: 1,
    });

    const before = await computeAvailability(db, query(f));
    assert.equal(before.find((d) => d.date === DATE)!.slots.length, 1);

    const booking = await createBooking(db, {
      serviceId: f.serviceId,
      doctorId: f.doctorId,
      sessionId: f.sessionId,
      start: manilaToUtc(DATE, '09:00'),
      patient: { fullName: 'Taker', mobile: `${f.mobilePrefix}001` },
      consentAt: NOW,
      now: NOW,
    });

    const after = await computeAvailability(db, query(f));
    assert.equal(after.find((d) => d.date === DATE), undefined, 'date disappears when full');

    // Cancelling gives the place back.
    await db
      .update(bookings)
      .set({ status: 'cancelled_by_patient' })
      .where(eq(bookings.id, booking.id));

    const afterCancel = await computeAvailability(db, query(f));
    assert.ok(afterCancel.find((d) => d.date === DATE), 'cancelling frees the slot');
  });

  it('offers nothing for a service that is not bookable online', async () => {
    const f = await fixture({ date: DATE, bookableOnline: false });
    assert.deepEqual(await computeAvailability(db, query(f)), []);
  });

  it('offers nothing when the doctor does not deliver the service', async () => {
    const a = await fixture({ date: DATE });
    const b = await fixture({ date: DATE });
    // Doctor B holds clinic, but is not linked to service A.
    const days = await computeAvailability(db, query(a, { doctorId: b.doctorId }));
    assert.deepEqual(days, []);
  });

  it('works for laboratory sessions, which have no doctor', async () => {
    const f = await fixture({
      date: DATE,
      category: 'laboratory',
      startTime: '07:00:00',
      endTime: '11:00:00',
      slotMinutes: 15,
      capacity: 32,
      onlineCapacity: 16,
    });
    const days = await computeAvailability(db, query(f, { doctorId: null }));
    const day = days.find((d) => d.date === DATE)!;
    assert.equal(day.slots.length, 16, 'every 15-minute slot carries one online place');
    assert.equal(day.openCount, 16);
    assert.equal(day.slots[0]!.doctorId, null);
  });
});
