import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, describe, it } from 'node:test';

import type { PoolClient } from 'pg';

import { bookings, patients } from '@/db/schema';
import { makeFixture, testDb, type Fixture } from '@/test/fixtures';

import { isUniqueViolation } from './booking';
import { manilaToUtc } from './time';

/**
 * Two people going for the last place, with the interleaving forced rather than raced.
 *
 * The stampede test in booking.db.test.ts fires many bookings at once, which is a good
 * smoke test but is at the mercy of the event loop: if one attempt happens to finish
 * before the others start, it passes even with every guard removed. These tests drive
 * two connections by hand, so the dangerous interleaving is guaranteed to happen and
 * the assertions genuinely depend on the guards being there.
 */

const DATE = '2027-05-10';
const SLOT = manilaToUtc(DATE, '09:00');

const { db, pool, close } = testDb(8);
const cleanups: Array<() => Promise<void>> = [];

async function fixture() {
  const f = await makeFixture(db, {
    date: DATE,
    startTime: '09:00:00',
    endTime: '09:20:00',
    slotMinutes: 20,
    capacity: 2,
    onlineCapacity: 1,
  });
  cleanups.push(f.cleanup);
  return f;
}

/**
 * Inserts a booking straight into the table, bypassing the application layer.
 *
 * `label` only distinguishes rows within one test; the reference code and cancel token
 * are made unique per run, because both are globally unique in the schema and a
 * hardcoded value would collide with anything a previously failed run left behind.
 */
let rawSeq = 0;
async function insertSeat(client: PoolClient, f: Fixture, seat: number, label: string) {
  const unique = `${Date.now().toString(36)}${(rawSeq += 1).toString(36)}`;
  const [patient] = (
    await client.query<{ id: string }>(
      `insert into patients (full_name, mobile, source) values ($1, $2, 'online') returning id`,
      [`Racer ${label}`, `${f.mobilePrefix}${String(rawSeq % 1000).padStart(3, '0')}`],
    )
  ).rows;

  return client.query(
    `insert into bookings
       (reference_code, patient_id, service_id, doctor_id, session_id,
        scheduled_start, scheduled_end, slot_index, status, consent_at, cancel_token)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'booked', now(), $9)`,
    [
      `VRT-${label}-${unique}`,
      patient.id,
      f.serviceId,
      f.doctorId,
      f.sessionId,
      SLOT,
      new Date(SLOT.getTime() + 20 * 60_000),
      seat,
      `tok-${label}-${unique}`,
    ],
  );
}

/** True if the promise has not settled after `ms`. */
async function stillPending(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([
    promise.then(() => 'settled').catch(() => 'settled'),
    sleep(ms).then(() => marker),
  ]);
  return winner === marker;
}

after(async () => {
  for (const c of cleanups) await c().catch(() => {});
  await close();
});

describe('the last place, with the race forced', () => {
  it('makes the second booker wait at the session row lock', async () => {
    const f = await fixture();
    const a = await pool.connect();
    const b = await pool.connect();

    try {
      await a.query('begin');
      await b.query('begin');

      // A takes the session lock, exactly as createBooking does.
      await a.query('select id from sessions where id = $1 for update', [f.sessionId]);

      // B asks for the same lock and must be made to wait.
      const bWaiting = b.query('select id from sessions where id = $1 for update', [f.sessionId]);
      assert.ok(
        await stillPending(bWaiting, 250),
        'B should be blocked while A holds the session lock',
      );

      // A books the only place and commits.
      await insertSeat(a, f, 0, 'AAAA');
      await a.query('commit');

      // Only now does B get the lock, and it sees the place already gone.
      await bWaiting;
      const seen = await b.query('select slot_index from bookings where session_id = $1', [
        f.sessionId,
      ]);
      assert.equal(seen.rowCount, 1, 'B now sees the booking A committed');
      assert.equal(seen.rows[0].slot_index, 0);

      await b.query('rollback');
    } finally {
      a.release();
      b.release();
    }
  });

  it('refuses a duplicate seat even with no lock at all', async () => {
    // The guarantee that does not depend on anyone remembering to take a lock.
    const f = await fixture();
    const a = await pool.connect();
    const b = await pool.connect();

    try {
      await a.query('begin');
      await b.query('begin');

      // Both transactions read an empty slot, then both try to take seat 0.
      const aSeen = await a.query('select slot_index from bookings where session_id = $1', [f.sessionId]);
      const bSeen = await b.query('select slot_index from bookings where session_id = $1', [f.sessionId]);
      assert.equal(aSeen.rowCount, 0);
      assert.equal(bSeen.rowCount, 0, 'both see the slot as free: the dangerous moment');

      await insertSeat(a, f, 0, 'BBBB');

      // B's identical insert blocks on the unique index until A resolves.
      const bInsert = insertSeat(b, f, 0, 'CCCC');
      assert.ok(await stillPending(bInsert, 250), 'B waits on the index while A is open');

      await a.query('commit');

      await assert.rejects(
        bInsert,
        (error: { code?: string; constraint?: string }) => {
          assert.equal(error.code, '23505', 'unique violation');
          assert.equal(error.constraint, 'bookings_slot_seat_key');
          return true;
        },
        'B must be rejected by the database, not merely by application logic',
      );

      await b.query('rollback');

      const live = await a.query(
        `select count(*)::int as n from bookings where session_id = $1 and status = 'booked'`,
        [f.sessionId],
      );
      assert.equal(live.rows[0].n, 1, 'exactly one booking survives');
    } finally {
      a.release();
      b.release();
    }
  });

  it('lets a cancelled booking release its seat to the next person', async () => {
    const f = await fixture();
    const a = await pool.connect();
    try {
      await insertSeat(a, f, 0, 'DDDD');
      await a.query(
        `update bookings set status = 'cancelled_by_patient' where session_id = $1`,
        [f.sessionId],
      );
      // The partial index only covers live bookings, so seat 0 is free again.
      await assert.doesNotReject(insertSeat(a, f, 0, 'EEEE'));
    } finally {
      a.release();
    }
  });
});

describe('recognising the database’s refusal', () => {
  it('sees through the ORM’s wrapper to the unique violation underneath', async () => {
    // Drizzle re-throws driver errors wrapped in its own Error with the original on
    // `cause`. If isUniqueViolation ever stops unwrapping that, the loser of a race
    // gets a raw SQL dump instead of a readable message, so pin the behaviour here.
    const f = await fixture();
    const client = await pool.connect();
    try {
      await insertSeat(client, f, 0, 'FFFF');
    } finally {
      client.release();
    }

    const duplicate = db.insert(bookings).values({
      referenceCode: 'VRT-GGGG',
      patientId: (
        await db
          .insert(patients)
          .values({ fullName: 'Duplicate Racer', mobile: `${f.mobilePrefix}900`, source: 'online' })
          .returning({ id: patients.id })
      )[0]!.id,
      serviceId: f.serviceId,
      doctorId: f.doctorId,
      sessionId: f.sessionId,
      scheduledStart: SLOT,
      scheduledEnd: new Date(SLOT.getTime() + 20 * 60_000),
      slotIndex: 0,
      status: 'booked',
      consentAt: new Date(),
      cancelToken: `tok-dup-${Date.now()}`,
    });

    await assert.rejects(duplicate, (error: unknown) => {
      assert.ok(
        isUniqueViolation(error, 'bookings_slot_seat_key'),
        'the wrapped error must still be recognised as a seat collision',
      );
      assert.equal(
        isUniqueViolation(error, 'bookings_reference_code_key'),
        false,
        'and must not be confused with a different constraint',
      );
      return true;
    });
  });
});
