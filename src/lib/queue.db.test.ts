import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { and, eq } from 'drizzle-orm';

import { queueCounters, queueTickets } from '@/db/schema';
import { testDb, warmPool } from '@/test/fixtures';

import { isUniqueViolation } from './booking';
import { callNextTicket, getQueueTickets, issueWalkInTicket, recallTicket } from './queue-service';

/**
 * Queue numbering under concurrency.
 *
 * Two receptionists pressing Arrived in the same second must not hand the same number to
 * two patients, and a number must never be skipped or reused. The guarantee lives in
 * Postgres — the row lock on queue_counters, with the unique index as the backstop — so
 * these tests need a real database.
 *
 * Dates are pinned in the future and unique to this file. A day's numbering is global by
 * definition, so two files sharing a date would sabotage each other.
 */

const { db, pool, close } = testDb(12);

const DATE_A = '2027-07-05';
const DATE_B = '2027-07-06';
const DATE_C = '2027-07-07';
const DATES = [DATE_A, DATE_B, DATE_C];

after(async () => {
  for (const date of DATES) {
    await db.delete(queueTickets).where(eq(queueTickets.serviceDate, date));
    await db.delete(queueCounters).where(eq(queueCounters.serviceDate, date));
  }
  await close();
});

describe('issuing numbers', () => {
  it('starts at 1 and counts up within a category', async () => {
    const first = await issueWalkInTicket(db, null, DATE_A, 'consultation');
    const second = await issueWalkInTicket(db, null, DATE_A, 'consultation');
    const third = await issueWalkInTicket(db, null, DATE_A, 'consultation');

    assert.deepEqual([first.number, second.number, third.number], [1, 2, 3]);
  });

  it('numbers each category separately', async () => {
    const lab = await issueWalkInTicket(db, null, DATE_A, 'laboratory');
    const imaging = await issueWalkInTicket(db, null, DATE_A, 'imaging');

    assert.equal(lab.number, 1);
    assert.equal(imaging.number, 1);
  });

  it('restarts on the next clinic day', async () => {
    const tomorrow = await issueWalkInTicket(db, null, DATE_B, 'consultation');
    assert.equal(tomorrow.number, 1);
  });

  /*
   * The one that matters. Ten receptionists at once must produce 1..10 with nothing
   * repeated and nothing skipped.
   *
   * warmPool first: without it the first attempt can finish while the others are still
   * doing TCP and TLS setup, so they never overlap and the test would pass even with the
   * counter replaced by `select max(number) + 1`.
   */
  it('hands out ten distinct numbers under a stampede', async () => {
    await warmPool(pool, 10);

    const issued = await Promise.all(
      Array.from({ length: 10 }, () => issueWalkInTicket(db, null, DATE_C, 'consultation')),
    );

    const numbers = issued.map((t) => t.number).sort((a, b) => a - b);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(new Set(numbers).size, 10, 'every number is distinct');
  });

  it('leaves the counter agreeing with the tickets it handed out', async () => {
    const [counter] = await db
      .select({ last: queueCounters.lastNumber })
      .from(queueCounters)
      .where(
        and(eq(queueCounters.serviceDate, DATE_C), eq(queueCounters.category, 'consultation')),
      );

    const tickets = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(
        and(eq(queueTickets.serviceDate, DATE_C), eq(queueTickets.category, 'consultation')),
      );

    assert.equal(counter.last, tickets.length);
  });
});

describe('calling the next number', () => {
  it('moves the first waiting ticket onto the board', async () => {
    const called = await callNextTicket(db, null, DATE_A, 'laboratory');
    assert.equal(called?.number, 1);

    const board = await getQueueTickets(db, DATE_A);
    const serving = board.filter((t) => t.category === 'laboratory' && t.status === 'called');
    assert.equal(serving.length, 1);
    assert.equal(serving[0].number, 1);
  });

  it('finishes the previous one, so only one number is ever on the board', async () => {
    await issueWalkInTicket(db, null, DATE_A, 'laboratory');
    const second = await callNextTicket(db, null, DATE_A, 'laboratory');
    assert.equal(second?.number, 2);

    const board = await getQueueTickets(db, DATE_A);
    const lab = board.filter((t) => t.category === 'laboratory');
    assert.equal(lab.filter((t) => t.status === 'called').length, 1);
    assert.equal(lab.filter((t) => t.status === 'done').length, 1);
  });

  it('returns null rather than inventing a patient when nobody is waiting', async () => {
    const empty = await callNextTicket(db, null, DATE_B, 'imaging');
    assert.equal(empty, null);
  });

  /*
   * Two rooms pressing Call next at the same moment. Both may succeed in advancing the
   * queue, but they must never be handed the same number — that would send one patient
   * to two rooms and leave the other uncalled.
   */
  it('never hands the same number to two rooms', async () => {
    await warmPool(pool, 4);
    for (let i = 0; i < 4; i++) await issueWalkInTicket(db, null, DATE_B, 'laboratory');

    const results = await Promise.all([
      callNextTicket(db, null, DATE_B, 'laboratory'),
      callNextTicket(db, null, DATE_B, 'laboratory'),
    ]);

    const numbers = results.filter((r) => r !== null).map((r) => r!.number);
    assert.equal(new Set(numbers).size, numbers.length, 'no number was called twice');
  });

  it('puts a mis-tapped call back at the front of the queue', async () => {
    await recallTicket(db, DATE_A, 'laboratory');

    const board = await getQueueTickets(db, DATE_A);
    const lab = board.filter((t) => t.category === 'laboratory');
    assert.equal(lab.filter((t) => t.status === 'called').length, 0);
    assert.ok(lab.some((t) => t.number === 2 && t.status === 'waiting'));
  });
});

describe('the unique index behind the counter', () => {
  it('refuses a duplicate number even if allocation were got wrong', async () => {
    // Matched with isUniqueViolation, not a regex on the message: Drizzle wraps the
    // driver error, so the 23505 code sits on `error.cause` and a message match here
    // would pass for a completely unrelated failure.
    let thrown: unknown;
    try {
      await db
        .insert(queueTickets)
        .values({ serviceDate: DATE_A, category: 'consultation', number: 1 });
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, 'the insert was rejected');
    assert.ok(
      isUniqueViolation(thrown, 'queue_tickets_number_key'),
      'rejected by the backstop index, not by something else',
    );
  });
});
