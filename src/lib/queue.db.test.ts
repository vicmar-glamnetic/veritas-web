import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { and, eq, inArray } from 'drizzle-orm';

import { bookings, doctors, patients, queueCounters, queueTickets, rooms } from '@/db/schema';
import { makeFixture, testDb, testPatient, warmPool, type Fixture } from '@/test/fixtures';

import { createBooking, isUniqueViolation } from './booking';
import { manilaToUtc } from './time';
import {
  callNextForRoom,
  cancelTicketForBooking,
  finishTicket,
  getQueueTickets,
  issueTicketForBooking,
  issueWalkInTicket,
  recallSkipped,
  referTicket,
  skipTicket,
  startTicket,
  undoCall,
  type CallResult,
} from './queue-service';

/**
 * Queue numbering and calling, against a real database.
 *
 * Two receptionists pressing Arrived in the same second must not hand the same number to
 * two patients, and two rooms pressing Call at once must not be handed the same patient.
 * Both guarantees live in Postgres — the counter's row lock, SKIP LOCKED, and the unique
 * indexes — so these tests need it.
 *
 * Dates are pinned in the future and unique to this file. A day's numbering is global by
 * definition, so two files sharing a date would sabotage each other. Rooms and doctors
 * get a random suffix, because their names are unique and a failed run leaves debris.
 */

const { db, pool, close } = testDb(12);

const DATE_A = '2027-07-05';
const DATE_B = '2027-07-06';
const DATE_C = '2027-07-07';
const DATE_D = '2027-07-08';
const DATE_E = '2027-07-09';
const DATES = [DATE_A, DATE_B, DATE_C, DATE_D, DATE_E];

const run = randomUUID().slice(0, 8);
let lab1: string;
let lab2: string;
let xray: string;
let consult1: string;
let consult2: string;
let reyes: string;
let santos: string;
let fixture: Fixture | undefined;

const walkIn = (date: string, category: 'consultation' | 'laboratory' | 'imaging', doctorId?: string | null) =>
  issueWalkInTicket(db, { staffId: null, serviceDate: date, category, doctorId });

const call = (date: string, roomId: string, doctorId: string | null = null) =>
  callNextForRoom(db, { serviceDate: date, roomId, doctorId, staffId: null });

const numberOf = (result: CallResult) => (result.ok ? result.ticket.number : null);

before(async () => {
  const made = await db
    .insert(rooms)
    .values([
      { name: `Phlebotomy 1 ${run}`, category: 'laboratory' },
      { name: `Phlebotomy 2 ${run}`, category: 'laboratory' },
      { name: `X-ray ${run}`, category: 'imaging' },
      { name: `Consultation 1 ${run}`, category: 'consultation' },
      { name: `Consultation 2 ${run}`, category: 'consultation' },
    ])
    .returning({ id: rooms.id });
  [lab1, lab2, xray, consult1, consult2] = made.map((r) => r.id);

  const docs = await db
    .insert(doctors)
    .values([
      { fullName: `Dra. Reyes ${run}`, specialty: 'Family Medicine' },
      { fullName: `Dr. Santos ${run}`, specialty: 'Internal Medicine' },
    ])
    .returning({ id: doctors.id });
  [reyes, santos] = docs.map((d) => d.id);
});

after(async () => {
  const tickets = await db
    .select({ patientId: queueTickets.patientId })
    .from(queueTickets)
    .where(inArray(queueTickets.serviceDate, DATES));
  const patientIds = tickets.map((t) => t.patientId).filter((id): id is string => id !== null);

  await db.delete(queueTickets).where(inArray(queueTickets.serviceDate, DATES));
  await db.delete(queueCounters).where(inArray(queueCounters.serviceDate, DATES));
  // The booking points at its patient, so the fixture's own cleanup goes first.
  await fixture?.cleanup();
  if (patientIds.length) await db.delete(patients).where(inArray(patients.id, patientIds));
  await db.delete(rooms).where(inArray(rooms.id, [lab1, lab2, xray, consult1, consult2]));
  await db.delete(doctors).where(inArray(doctors.id, [reyes, santos]));
  await close();
});

describe('issuing numbers', () => {
  it('starts at 1 and counts up within a category', async () => {
    const first = await walkIn(DATE_A, 'consultation');
    const second = await walkIn(DATE_A, 'consultation');
    const third = await walkIn(DATE_A, 'consultation');

    assert.deepEqual([first.number, second.number, third.number], [1, 2, 3]);
  });

  it('numbers each category separately', async () => {
    const lab = await walkIn(DATE_A, 'laboratory');
    const imaging = await walkIn(DATE_A, 'imaging');

    assert.equal(lab.number, 1);
    assert.equal(imaging.number, 1);
  });

  it('restarts on the next clinic day', async () => {
    const tomorrow = await walkIn(DATE_B, 'consultation');
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
      Array.from({ length: 10 }, () => walkIn(DATE_C, 'consultation')),
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

  it('records who a named walk-in was, as a walk-in patient', async () => {
    const ticket = await issueWalkInTicket(db, {
      staffId: null,
      serviceDate: DATE_C,
      category: 'laboratory',
      patient: { fullName: `Ana Walkin ${run}`, mobile: '+639171234567' },
    });

    const [row] = await db
      .select({ source: patients.source, name: patients.fullName })
      .from(queueTickets)
      .innerJoin(patients, eq(patients.id, queueTickets.patientId))
      .where(eq(queueTickets.id, ticket.id));

    assert.equal(row.source, 'walkin');
    assert.equal(row.name, `Ana Walkin ${run}`);
  });

  it('never puts a laboratory or imaging number in a doctor’s line', async () => {
    const ticket = await walkIn(DATE_C, 'imaging', reyes);
    const [row] = await db
      .select({ doctorId: queueTickets.doctorId })
      .from(queueTickets)
      .where(eq(queueTickets.id, ticket.id));

    assert.equal(row.doctorId, null);
  });
});

describe('a room calling its line', () => {
  it('puts the first waiting number on the board, with the room', async () => {
    // DATE_A laboratory has L-001 waiting from above.
    const result = await call(DATE_A, lab1);
    assert.equal(numberOf(result), 1);

    const board = await getQueueTickets(db, DATE_A);
    const serving = board.filter((t) => t.category === 'laboratory' && t.status === 'called');
    assert.equal(serving.length, 1);
    assert.equal(serving[0].roomName, `Phlebotomy 1 ${run}`);
  });

  it('will not call a second patient into a room that still has one', async () => {
    await walkIn(DATE_A, 'laboratory');
    const result = await call(DATE_A, lab1);

    assert.deepEqual(result, { ok: false, reason: 'room_busy' });
  });

  it('frees the room on Finish, and the next call takes the next number', async () => {
    assert.equal(await finishTicket(db, lab1), true);
    assert.equal(numberOf(await call(DATE_A, lab1)), 2);
  });

  it('says so rather than inventing a patient when nobody is waiting', async () => {
    assert.deepEqual(await call(DATE_B, xray), { ok: false, reason: 'nobody_waiting' });
  });

  /*
   * Two laboratory rooms share one line. Pressing Call at the same moment, each must get
   * a patient, and never the same one. (This passes with plain FOR UPDATE too: Postgres
   * re-checks a locked row after the wait and moves on. SKIP LOCKED only saves the wait.)
   */
  it('closes a number left on the board from an earlier day before calling', async () => {
    // lab1 still has L-002 from DATE_A on the board. On a later day it must not block.
    await walkIn(DATE_D, 'laboratory');
    assert.equal(numberOf(await call(DATE_D, lab1)), 1);

    const stale = await getQueueTickets(db, DATE_A);
    assert.equal(stale.find((t) => t.category === 'laboratory' && t.number === 2)?.status, 'done');
    await finishTicket(db, lab1);
  });

  it('gives two rooms on one line two different patients at once', async () => {
    await warmPool(pool, 4);
    for (let i = 0; i < 4; i++) await walkIn(DATE_D, 'laboratory');

    const results = await Promise.all([call(DATE_D, lab1), call(DATE_D, lab2)]);
    const numbers = results.map(numberOf);

    assert.ok(numbers.every((n) => n !== null), 'both rooms got somebody');
    assert.equal(new Set(numbers).size, 2, 'and not the same somebody');
  });

  /*
   * Two people in the same room pressing Call at once. Whatever the interleaving, the
   * room must end up with one number on the board, not two; the partial unique index on a
   * room's called ticket is the guarantee.
   */
  it('never puts two numbers on the board for one room', async () => {
    await finishTicket(db, lab1);
    await warmPool(pool, 4);

    await Promise.all([call(DATE_D, lab1), call(DATE_D, lab1), call(DATE_D, lab1)]);

    const inRoom = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(and(eq(queueTickets.roomId, lab1), eq(queueTickets.status, 'called')));
    assert.equal(inRoom.length, 1);
  });
});

describe('each doctor’s own line', () => {
  it('calls only that doctor’s patients, plus first-available walk-ins', async () => {
    const forSantos = await walkIn(DATE_E, 'consultation', santos); // C-001
    const anyDoctor = await walkIn(DATE_E, 'consultation', null); // C-002

    // Reyes skips Santos' patient and takes the walk-in waiting for anyone.
    const result = await call(DATE_E, consult1, reyes);
    assert.equal(numberOf(result), anyDoctor.number);

    // Who called them now owns them, so the record says which doctor saw them.
    const [row] = await db
      .select({ doctorId: queueTickets.doctorId })
      .from(queueTickets)
      .where(eq(queueTickets.id, anyDoctor.id));
    assert.equal(row.doctorId, reyes);

    // Santos' patient is still waiting for Santos.
    assert.equal(numberOf(await call(DATE_E, consult2, santos)), forSantos.number);
  });

  it('refuses a consultation room with no doctor to call for', async () => {
    await finishTicket(db, consult1);
    assert.deepEqual(await call(DATE_E, consult1, null), { ok: false, reason: 'no_doctor' });
  });
});

describe('skip and recall', () => {
  it('a recalled patient goes to the front of the line', async () => {
    // I-001, I-002, I-003 on DATE_B.
    for (let i = 0; i < 3; i++) await walkIn(DATE_B, 'imaging');

    assert.equal(numberOf(await call(DATE_B, xray)), 1);
    assert.equal(await skipTicket(db, xray), true);

    assert.equal(numberOf(await call(DATE_B, xray)), 2);
    await finishTicket(db, xray);

    // I-001 turns up after all. Recalled, they go ahead of I-003.
    const [first] = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(
        and(
          eq(queueTickets.serviceDate, DATE_B),
          eq(queueTickets.category, 'imaging'),
          eq(queueTickets.number, 1),
        ),
      );
    assert.equal(await recallSkipped(db, first.id), true);
    assert.equal(numberOf(await call(DATE_B, xray)), 1);
  });

  it('only once: a second no-show cannot be recalled', async () => {
    assert.equal(await skipTicket(db, xray), true);

    const [first] = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(
        and(
          eq(queueTickets.serviceDate, DATE_B),
          eq(queueTickets.category, 'imaging'),
          eq(queueTickets.number, 1),
        ),
      );
    assert.equal(await recallSkipped(db, first.id), false);
  });

  it('cannot skip somebody who has already started', async () => {
    assert.equal(numberOf(await call(DATE_B, xray)), 3);
    assert.equal(await startTicket(db, xray), true);
    assert.equal(await skipTicket(db, xray), false);
    assert.equal(await finishTicket(db, xray), true);
  });

  it('undo puts a mis-tapped call back in its place', async () => {
    await walkIn(DATE_B, 'imaging'); // I-004
    assert.equal(numberOf(await call(DATE_B, xray)), 4);
    assert.equal(await undoCall(db, xray), true);

    const board = await getQueueTickets(db, DATE_B);
    const four = board.find((t) => t.category === 'imaging' && t.number === 4);
    assert.equal(four?.status, 'waiting');
    assert.equal(four?.roomName, null);
  });
});

describe('sending a patient on to another department', () => {
  const send = (roomId: string, category: 'consultation' | 'laboratory' | 'imaging') =>
    referTicket(db, { roomId, serviceDate: DATE_E, category, note: 'CBC, FBS', staffId: null });

  it('only sends somebody who has been seen', async () => {
    // consult2 has Santos' patient on the board from above, not yet started.
    assert.deepEqual(await send(consult2, 'laboratory'), { ok: false, reason: 'nobody_in_room' });
  });

  it('gives a new L- number for the same patient, linked to the consultation', async () => {
    await startTicket(db, consult2);
    const result = await send(consult2, 'laboratory');
    assert.ok(result.ok);
    assert.equal(result.ticket.category, 'laboratory');

    const [sent] = await db
      .select({
        from: queueTickets.referredFromTicketId,
        note: queueTickets.referralNote,
        status: queueTickets.status,
        doctorId: queueTickets.doctorId,
      })
      .from(queueTickets)
      .where(eq(queueTickets.id, result.ticket.id));
    const [consultation] = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(and(eq(queueTickets.roomId, consult2), eq(queueTickets.status, 'called')));

    assert.equal(sent.from, consultation.id);
    assert.equal(sent.note, 'CBC, FBS');
    assert.equal(sent.status, 'waiting');
    assert.equal(sent.doctorId, null, 'the laboratory line has no doctor');
  });

  it('refuses a second number for the same department, even on a double tap', async () => {
    await warmPool(pool, 2);
    const results = await Promise.all([send(consult2, 'imaging'), send(consult2, 'imaging')]);
    assert.equal(results.filter((r) => r.ok).length, 1, 'exactly one I- number');
    assert.deepEqual(await send(consult2, 'laboratory'), { ok: false, reason: 'already_sent' });
  });

  it('does not send a patient to the department they are already in', async () => {
    assert.deepEqual(await send(consult2, 'consultation'), { ok: false, reason: 'same_department' });
  });

  it('will not give the visit a second I- number from the laboratory', async () => {
    await finishTicket(db, consult2);
    // L-001 on DATE_E is the one the consultation issued; it already has an I- too.
    assert.equal(numberOf(await call(DATE_E, lab2)), 1);
    await startTicket(db, lab2);
    assert.deepEqual(await send(lab2, 'imaging'), { ok: false, reason: 'already_sent' });
    await finishTicket(db, lab2);
  });

  it('lets the laboratory send them on to imaging when the doctor did not', async () => {
    // A fresh visit: Reyes sends a first-available walk-in to the laboratory only.
    await walkIn(DATE_E, 'consultation', reyes);
    assert.ok((await call(DATE_E, consult1, reyes)).ok);
    await startTicket(db, consult1);
    const toLab = await send(consult1, 'laboratory');
    assert.ok(toLab.ok);
    await finishTicket(db, consult1);

    assert.equal(numberOf(await call(DATE_E, lab1)), toLab.ok ? toLab.ticket.number : -1);
    await startTicket(db, lab1);
    const toImaging = await send(lab1, 'imaging');
    assert.ok(toImaging.ok, 'consultation → laboratory → imaging');
    await finishTicket(db, lab1);
  });
});

describe('a booking cancelled after arrival', () => {
  it('leaves the lists, and gets its old number back if they arrive after all', async () => {
    fixture = await makeFixture(db, { date: DATE_E, startTime: '15:00:00', endTime: '15:20:00' });
    const booking = await createBooking(db, {
      serviceId: fixture.serviceId,
      doctorId: fixture.doctorId,
      sessionId: fixture.sessionId,
      start: manilaToUtc(DATE_E, '15:00'),
      patient: testPatient(fixture, 1),
      consentAt: new Date('2027-07-01T00:00:00Z'),
      now: new Date('2027-07-01T00:00:00Z'),
    });
    const [{ patientId }] = await db
      .select({ patientId: bookings.patientId })
      .from(bookings)
      .where(eq(bookings.id, booking.id));

    const arrive = () =>
      db.transaction((tx) =>
        issueTicketForBooking(tx, {
          bookingId: booking.id,
          patientId,
          serviceDate: DATE_E,
          category: 'consultation',
          doctorId: fixture!.doctorId,
          staffId: null,
        }),
      );
    const statusOf = async (id: string) =>
      (await db.select({ s: queueTickets.status }).from(queueTickets).where(eq(queueTickets.id, id)))[0].s;

    const first = await arrive();
    assert.equal(await statusOf(first.id), 'waiting');

    await db.transaction((tx) => cancelTicketForBooking(tx, booking.id));
    assert.equal(await statusOf(first.id), 'cancelled');
    const board = await getQueueTickets(db, DATE_E);
    assert.ok(
      !board.some((t) => t.id === first.id && (t.status === 'waiting' || t.status === 'called')),
      'not on the board or in Next',
    );

    // A number left waiting from before the fix: the booking is no-show, the ticket says
    // waiting. It must still stay off the board.
    await db.update(queueTickets).set({ status: 'waiting' }).where(eq(queueTickets.id, first.id));
    await db.update(bookings).set({ status: 'no_show' }).where(eq(bookings.id, booking.id));
    assert.ok(!(await getQueueTickets(db, DATE_E)).some((t) => t.id === first.id), 'legacy row hidden');
    await db.update(bookings).set({ status: 'arrived' }).where(eq(bookings.id, booking.id));
    await db.transaction((tx) => cancelTicketForBooking(tx, booking.id));

    const again = await arrive();
    assert.equal(again.id, first.id, 'the same ticket');
    assert.equal(again.number, first.number, 'and the same number');
    assert.equal(await statusOf(first.id), 'waiting');
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
