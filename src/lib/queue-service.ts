import { and, asc, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import type { Db } from '@/db/client';
import { bookings, doctors, patients, queueCounters, queueTickets } from '@/db/schema';

import type { QueueCategory, QueueTicketRow } from './queue';

/*
 * The database is passed in rather than imported, exactly as createBooking does it.
 * Reaching for the app's singleton here would point every database test at whatever
 * DATABASE_URL happens to be — which on this project is still production.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tx = PgTransaction<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type IssuedTicket = { id: string; category: QueueCategory; number: number };

/**
 * Take the next number for a day and category.
 *
 * One statement. Postgres holds the counter row for the duration, so two receptionists
 * pressing Arrived in the same second get 14 and 15. The version of this that looks
 * right and is not is `select max(number) + 1` — under any real concurrency both readers
 * see 13 and both try to write 14, and one of them loses a patient's place in the queue.
 *
 * The unique index on (service_date, category, number) is the backstop, not the
 * mechanism. `queue.db.test.ts` proves both.
 */
async function nextNumber(tx: Tx, serviceDate: string, category: QueueCategory): Promise<number> {
  const [counter] = await tx
    .insert(queueCounters)
    .values({ serviceDate, category, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [queueCounters.serviceDate, queueCounters.category],
      set: { lastNumber: sql`${queueCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: queueCounters.lastNumber });

  return counter.lastNumber;
}

/**
 * Give a booking its place in the queue, inside the caller's transaction.
 *
 * Re-marking someone arrived after a no-show must not burn a second number, so an
 * existing ticket is returned untouched. The unique index on `booking_id` is what makes
 * that safe rather than merely likely.
 */
export async function issueTicketForBooking(
  tx: Tx,
  input: {
    bookingId: string;
    patientId: string;
    serviceDate: string;
    category: QueueCategory;
    staffId: string;
  },
): Promise<IssuedTicket> {
  const [existing] = await tx
    .select({ id: queueTickets.id, category: queueTickets.category, number: queueTickets.number })
    .from(queueTickets)
    .where(eq(queueTickets.bookingId, input.bookingId))
    .limit(1);

  if (existing) return existing as IssuedTicket;

  const number = await nextNumber(tx, input.serviceDate, input.category);

  const [ticket] = await tx
    .insert(queueTickets)
    .values({
      serviceDate: input.serviceDate,
      category: input.category,
      number,
      bookingId: input.bookingId,
      patientId: input.patientId,
      issuedByStaffUserId: input.staffId,
    })
    .returning({ id: queueTickets.id, category: queueTickets.category, number: queueTickets.number });

  return ticket as IssuedTicket;
}

/** A walk-in: a place in the queue with no appointment behind it. */
export async function issueWalkInTicket(
  db: Db,
  staffId: string | null,
  serviceDate: string,
  category: QueueCategory,
): Promise<IssuedTicket> {
  return db.transaction(async (tx) => {
    const number = await nextNumber(tx, serviceDate, category);

    const [ticket] = await tx
      .insert(queueTickets)
      .values({ serviceDate, category, number, issuedByStaffUserId: staffId })
      .returning({
        id: queueTickets.id,
        category: queueTickets.category,
        number: queueTickets.number,
      });

    return ticket as IssuedTicket;
  });
}

/**
 * Put the next waiting number on the board.
 *
 * Whoever is currently called is finished first, so at most one ticket per category is
 * ever `called` and the board cannot show two numbers at once.
 *
 * The row is taken with FOR UPDATE and the status is re-checked in the UPDATE's WHERE
 * clause, the same way booking status changes work: two people pressing Call next at the
 * same moment must not hand the same number to two rooms.
 */
export async function callNextTicket(
  db: Db,
  staffId: string | null,
  serviceDate: string,
  category: QueueCategory,
): Promise<IssuedTicket | null> {
  return db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(queueTickets)
      .set({ status: 'done', endedAt: now })
      .where(
        and(
          eq(queueTickets.serviceDate, serviceDate),
          eq(queueTickets.category, category),
          eq(queueTickets.status, 'called'),
        ),
      );

    const [next] = await tx
      .select({
        id: queueTickets.id,
        category: queueTickets.category,
        number: queueTickets.number,
      })
      .from(queueTickets)
      .where(
        and(
          eq(queueTickets.serviceDate, serviceDate),
          eq(queueTickets.category, category),
          eq(queueTickets.status, 'waiting'),
        ),
      )
      .orderBy(asc(queueTickets.number))
      .limit(1)
      .for('update');

    if (!next) return null;

    const claimed = await tx
      .update(queueTickets)
      .set({ status: 'called', calledAt: now, calledByStaffUserId: staffId })
      .where(and(eq(queueTickets.id, next.id), eq(queueTickets.status, 'waiting')))
      .returning({ id: queueTickets.id });

    return claimed.length ? (next as IssuedTicket) : null;
  });
}

/** Send the number on the board back to waiting, for a mis-tap. */
export async function recallTicket(
  db: Db,
  serviceDate: string,
  category: QueueCategory,
): Promise<void> {
  await db
    .update(queueTickets)
    .set({ status: 'waiting', calledAt: null })
    .where(
      and(
        eq(queueTickets.serviceDate, serviceDate),
        eq(queueTickets.category, category),
        eq(queueTickets.status, 'called'),
      ),
    );
}

/**
 * Everything the board shows for one clinic day.
 *
 * Deliberately narrow: a screen in a public waiting room has no business receiving a
 * mobile number, an email address or a service name, even inside a prop that nothing
 * renders. "Chest X-ray" beside a name is a diagnosis hint.
 */
export async function getQueueTickets(db: Db, serviceDate: string): Promise<QueueTicketRow[]> {
  const rows = await db
    .select({
      id: queueTickets.id,
      category: queueTickets.category,
      number: queueTickets.number,
      status: queueTickets.status,
      patientName: patients.fullName,
      doctorName: doctors.fullName,
      calledAt: queueTickets.calledAt,
    })
    .from(queueTickets)
    .leftJoin(patients, eq(patients.id, queueTickets.patientId))
    // The doctor reaches the ticket through its booking; a walk-in has neither, and the
    // left joins let both fall through as null rather than dropping the row.
    .leftJoin(bookings, eq(bookings.id, queueTickets.bookingId))
    .leftJoin(doctors, eq(doctors.id, bookings.doctorId))
    .where(eq(queueTickets.serviceDate, serviceDate))
    .orderBy(asc(queueTickets.number));

  return rows as QueueTicketRow[];
}
