import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import type { Db } from '@/db/client';
import {
  bookings,
  doctors,
  patients,
  queueCounters,
  queueTickets,
  rooms,
  services,
} from '@/db/schema';

import { isUniqueViolation } from './booking';
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
 * A ticket whose booking the desk has since cancelled or marked as not come is not in the
 * queue, whatever its own status says. `cancelTicketForBooking` keeps the two in step from
 * now on; this also covers numbers left behind before it existed, so the wall's Next and
 * the room lists show only people who are really waiting, and Call never picks them.
 */
const stillBooked = sql`(${queueTickets.bookingId} is null or not exists (
  select 1 from bookings ab where ab.id = ${queueTickets.bookingId}
    and ab.status in ('no_show', 'cancelled_by_clinic', 'cancelled_by_patient')))`;

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
 * existing ticket is reused. If the desk had cancelled it (the booking went to no-show
 * or was cancelled after arrival), it comes back as waiting with its old number, so the
 * patient keeps the place they had. The unique index on `booking_id` is what makes one
 * ticket per booking safe rather than merely likely.
 */
export async function issueTicketForBooking(
  tx: Tx,
  input: {
    bookingId: string;
    patientId: string;
    serviceDate: string;
    category: QueueCategory;
    /** The booked doctor, which puts a consultation in that doctor's line. */
    doctorId: string | null;
    staffId: string | null;
  },
): Promise<IssuedTicket> {
  const [existing] = await tx
    .select({
      id: queueTickets.id,
      category: queueTickets.category,
      number: queueTickets.number,
      status: queueTickets.status,
    })
    .from(queueTickets)
    .where(eq(queueTickets.bookingId, input.bookingId))
    .limit(1);

  if (existing) {
    if (existing.status === 'cancelled') {
      await tx
        .update(queueTickets)
        .set({ status: 'waiting', endedAt: null, calledAt: null, startedAt: null, roomId: null })
        .where(eq(queueTickets.id, existing.id));
    }
    return { id: existing.id, category: existing.category, number: existing.number } as IssuedTicket;
  }

  const number = await nextNumber(tx, input.serviceDate, input.category);

  const [ticket] = await tx
    .insert(queueTickets)
    .values({
      serviceDate: input.serviceDate,
      category: input.category,
      number,
      bookingId: input.bookingId,
      patientId: input.patientId,
      doctorId: input.category === 'consultation' ? input.doctorId : null,
      issuedByStaffUserId: input.staffId,
    })
    .returning({ id: queueTickets.id, category: queueTickets.category, number: queueTickets.number });

  return ticket as IssuedTicket;
}

/**
 * Take a booking's number off the board, inside the caller's transaction: the desk
 * marked them as not come, or cancelled them, after they had arrived. Only a number
 * still waiting, on the board or skipped is cancelled; one already seen stays as it was.
 */
export async function cancelTicketForBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx
    .update(queueTickets)
    .set({ status: 'cancelled', endedAt: new Date() })
    .where(
      and(
        eq(queueTickets.bookingId, bookingId),
        inArray(queueTickets.status, ['waiting', 'called', 'skipped']),
      ),
    );
}

/**
 * Clear today's queue from the waiting room screen.
 *
 * With a category: everyone still waiting (or skipped) in it — the people in a room stay
 * on the board until that room finishes them. Without one: everything, waiting, skipped
 * and on the board, in every category, so the wall starts empty.
 *
 * Tickets are cancelled, not deleted, and the counter is left alone: a number already
 * shown to the room is never handed to someone else, so the next one issued continues
 * the day's sequence. A cleared booking's number comes back if the desk marks the
 * patient arrived again.
 */
export async function clearQueue(
  db: Db,
  serviceDate: string,
  category: QueueCategory | null,
): Promise<number> {
  const rows = await db
    .update(queueTickets)
    .set({ status: 'cancelled', endedAt: new Date() })
    .where(
      and(
        eq(queueTickets.serviceDate, serviceDate),
        category
          ? and(eq(queueTickets.category, category), inArray(queueTickets.status, ['waiting', 'skipped']))
          : inArray(queueTickets.status, ['waiting', 'skipped', 'called']),
      ),
    )
    .returning({ id: queueTickets.id });
  return rows.length;
}

export type WalkInInput = {
  staffId: string | null;
  serviceDate: string;
  category: QueueCategory;
  /** A consultation walk-in's doctor, or null for whichever doctor is free first. */
  doctorId?: string | null;
  /**
   * Who they are. Reception takes a name and a mobile, which becomes a `walkin` patient
   * record, so the clinic knows afterwards who held the number. Left out, the number is
   * issued bare — kept for the moment somebody needs a place before they can give a name.
   */
  patient?: { fullName: string; mobile: string } | null;
};

/**
 * A walk-in: a place in the queue with no appointment behind it.
 *
 * Nothing is invented in `bookings`. The ticket and, when a name was given, the patient
 * row are the whole record; `patients.merged_into_id` is there for the day the clinic
 * system reconciles a walk-in with the same person's online bookings.
 */
export async function issueWalkInTicket(db: Db, input: WalkInInput): Promise<IssuedTicket> {
  return db.transaction(async (tx) => {
    let patientId: string | null = null;
    if (input.patient) {
      const [created] = await tx
        .insert(patients)
        .values({
          fullName: input.patient.fullName,
          mobile: input.patient.mobile,
          source: 'walkin',
        })
        .returning({ id: patients.id });
      patientId = created.id;
    }

    const number = await nextNumber(tx, input.serviceDate, input.category);

    const [ticket] = await tx
      .insert(queueTickets)
      .values({
        serviceDate: input.serviceDate,
        category: input.category,
        number,
        patientId,
        doctorId: input.category === 'consultation' ? (input.doctorId ?? null) : null,
        issuedByStaffUserId: input.staffId,
      })
      .returning({
        id: queueTickets.id,
        category: queueTickets.category,
        number: queueTickets.number,
      });

    return ticket as IssuedTicket;
  });
}

/* -------------------------------------------------------------------------- */
/* A room working its line                                                    */
/* -------------------------------------------------------------------------- */

export type Station = {
  serviceDate: string;
  roomId: string;
  /** Whose consultation line this room calls from. Ignored for laboratory and imaging. */
  doctorId: string | null;
  staffId: string | null;
};

export type CallResult =
  | { ok: true; ticket: IssuedTicket }
  | { ok: false; reason: 'nobody_waiting' | 'room_busy' | 'no_room' | 'no_doctor' };

/**
 * The WHERE clause for one line: this category, and for consultation, this doctor's
 * patients plus the walk-ins waiting for whoever is free first. Mirrors `isInLine`.
 */
function lineFilter(category: QueueCategory, doctorId: string | null) {
  if (category !== 'consultation') return eq(queueTickets.category, category);
  return and(
    eq(queueTickets.category, category),
    or(eq(queueTickets.doctorId, doctorId!), isNull(queueTickets.doctorId)),
  );
}

/**
 * Call the next patient in this room's line.
 *
 * Refused while the room still has somebody on the board: they are finished, skipped
 * or undone first, so a patient never drops off the board without staff saying what
 * happened to them. The old Call next quietly marked whoever was showing as seen.
 *
 * The next ticket is taken with FOR UPDATE SKIP LOCKED. Two laboratory rooms share one
 * line; when both press Call at the same moment the second simply takes the next patient
 * rather than queueing behind the first room's transaction. Correctness does not rest on
 * the SKIP — plain FOR UPDATE re-checks a row after waiting and moves on — but nobody at
 * a desk should wait on somebody else's tap. The status is re-checked in the UPDATE as
 * everywhere else, and the partial unique index on a room's called ticket stops one room
 * ending up with two numbers on the board.
 */
export async function callNextForRoom(db: Db, station: Station): Promise<CallResult> {
  try {
    return await db.transaction(async (tx): Promise<CallResult> => {
      const [room] = await tx
        .select({ category: rooms.category, isActive: rooms.isActive })
        .from(rooms)
        .where(eq(rooms.id, station.roomId))
        .limit(1);

      if (!room || !room.isActive) return { ok: false, reason: 'no_room' };
      const category = room.category as QueueCategory;
      if (category === 'consultation' && !station.doctorId) return { ok: false, reason: 'no_doctor' };

      // A number left on the board when the clinic closed last night belongs to a day
      // that is over. Close it, or the room would refuse every call the next morning
      // while its own screen, which only shows today, says it is free.
      await tx
        .update(queueTickets)
        .set({ status: 'done', endedAt: new Date() })
        .where(
          and(
            eq(queueTickets.roomId, station.roomId),
            eq(queueTickets.status, 'called'),
            lt(queueTickets.serviceDate, station.serviceDate),
          ),
        );

      const [busy] = await tx
        .select({ id: queueTickets.id })
        .from(queueTickets)
        .where(and(eq(queueTickets.roomId, station.roomId), eq(queueTickets.status, 'called')))
        .limit(1);
      if (busy) return { ok: false, reason: 'room_busy' };

      const [next] = await tx
        .select({ id: queueTickets.id, category: queueTickets.category, number: queueTickets.number })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.serviceDate, station.serviceDate),
            eq(queueTickets.status, 'waiting'),
            lineFilter(category, station.doctorId),
            stillBooked,
          ),
        )
        // Recalled patients first, in the order they came back; then issue order.
        // compareInLine in queue.ts is the same rule, pinned by unit tests.
        .orderBy(sql`${queueTickets.recalledAt} asc nulls last`, asc(queueTickets.number))
        .limit(1)
        .for('update', { skipLocked: true });

      if (!next) return { ok: false, reason: 'nobody_waiting' };

      const claimed = await tx
        .update(queueTickets)
        .set({
          status: 'called',
          roomId: station.roomId,
          calledAt: new Date(),
          calledByStaffUserId: station.staffId,
          // A first-available walk-in now belongs to the doctor who called them.
          ...(category === 'consultation' ? { doctorId: station.doctorId } : {}),
        })
        .where(and(eq(queueTickets.id, next.id), eq(queueTickets.status, 'waiting')))
        .returning({ id: queueTickets.id });

      return claimed.length
        ? { ok: true, ticket: next as IssuedTicket }
        : { ok: false, reason: 'nobody_waiting' };
    });
  } catch (error) {
    // Somebody else in the same room pressed Call in the same instant and won.
    if (isUniqueViolation(error, 'queue_tickets_room_called_key')) {
      return { ok: false, reason: 'room_busy' };
    }
    throw error;
  }
}

/** The patient came in. Waiting time ends and service time begins here. */
export async function startTicket(db: Db, roomId: string): Promise<boolean> {
  const rows = await db
    .update(queueTickets)
    .set({ startedAt: new Date() })
    .where(
      and(
        eq(queueTickets.roomId, roomId),
        eq(queueTickets.status, 'called'),
        isNull(queueTickets.startedAt),
      ),
    )
    .returning({ id: queueTickets.id });
  return rows.length > 0;
}

/** Seen. The number leaves the board and the room is free to call again. */
export async function finishTicket(db: Db, roomId: string): Promise<boolean> {
  const rows = await db
    .update(queueTickets)
    .set({ status: 'done', endedAt: new Date() })
    .where(and(eq(queueTickets.roomId, roomId), eq(queueTickets.status, 'called')))
    .returning({ id: queueTickets.id });
  return rows.length > 0;
}

/**
 * Called, and nobody came. Only before Start: someone who is already in the room has, by
 * definition, turned up.
 */
export async function skipTicket(db: Db, roomId: string): Promise<boolean> {
  const rows = await db
    .update(queueTickets)
    .set({ status: 'skipped', endedAt: new Date() })
    .where(
      and(
        eq(queueTickets.roomId, roomId),
        eq(queueTickets.status, 'called'),
        isNull(queueTickets.startedAt),
      ),
    )
    .returning({ id: queueTickets.id });
  return rows.length > 0;
}

/**
 * Undo a mis-tap: the number goes back to waiting, in its old place. Only before Start,
 * for the same reason as skip. A first-available walk-in stays with the doctor who
 * called them, which is harmless: they were at the front of that line anyway.
 */
export async function undoCall(db: Db, roomId: string): Promise<boolean> {
  const rows = await db
    .update(queueTickets)
    .set({ status: 'waiting', calledAt: null, roomId: null, calledByStaffUserId: null })
    .where(
      and(
        eq(queueTickets.roomId, roomId),
        eq(queueTickets.status, 'called'),
        isNull(queueTickets.startedAt),
      ),
    )
    .returning({ id: queueTickets.id });
  return rows.length > 0;
}

/**
 * A skipped patient came back: to the front of their line, once.
 *
 * The once-only rule is in the WHERE clause, `recalled_at is null`, not in a check
 * beforehand, so two people pressing Recall cannot both succeed and a second no-show
 * cannot be recalled at all. They need a new number from reception.
 */
export async function recallSkipped(db: Db, ticketId: string): Promise<boolean> {
  const rows = await db
    .update(queueTickets)
    .set({
      status: 'waiting',
      recalledAt: new Date(),
      calledAt: null,
      endedAt: null,
      roomId: null,
      calledByStaffUserId: null,
    })
    .where(
      and(
        eq(queueTickets.id, ticketId),
        eq(queueTickets.status, 'skipped'),
        isNull(queueTickets.recalledAt),
      ),
    )
    .returning({ id: queueTickets.id });
  return rows.length > 0;
}

export type ReferResult =
  | { ok: true; ticket: IssuedTicket }
  | { ok: false; reason: 'nobody_in_room' | 'same_department' | 'already_sent' };

/**
 * Send the patient in this room on to another department, with a new number there.
 *
 * C- is consultation, L- laboratory, I- imaging, and a patient who needs more than one
 * gets a number from each: the doctor sends them to the laboratory, the laboratory sends
 * them on to imaging. The new ticket carries the same patient and points back at the one
 * it came from, so the numbers stay one visit.
 *
 * Only for somebody already started in this room: the doctor has seen them. The new
 * number joins the back of its line in issue order, like any other.
 *
 * One open number per department per visit. A visit is the chain of tickets linked by
 * `referred_from_ticket_id`: the doctor sending someone to the laboratory and imaging,
 * and the laboratory then trying to send them to imaging too, must not give them a
 * second I- number. That is checked across the whole chain here; the unique index on
 * (referred_from_ticket_id, category) is the backstop that makes a double tap on the same
 * button safe even when the two requests interleave.
 */
export async function referTicket(
  db: Db,
  input: {
    roomId: string;
    serviceDate: string;
    category: QueueCategory;
    note: string | null;
    staffId: string | null;
  },
): Promise<ReferResult> {
  try {
    return await db.transaction(async (tx): Promise<ReferResult> => {
      const [current] = await tx
        .select({
          id: queueTickets.id,
          category: queueTickets.category,
          patientId: queueTickets.patientId,
        })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.roomId, input.roomId),
            eq(queueTickets.status, 'called'),
            isNotNull(queueTickets.startedAt),
          ),
        )
        .limit(1)
        .for('update');

      if (!current) return { ok: false, reason: 'nobody_in_room' };
      if (current.category === input.category) return { ok: false, reason: 'same_department' };

      // Up the chain to where the visit started, then down every branch of it.
      const open = await tx.execute(sql`
        with recursive up as (
          select id, referred_from_ticket_id from queue_tickets where id = ${current.id}
          union all
          select q.id, q.referred_from_ticket_id
            from queue_tickets q join up on q.id = up.referred_from_ticket_id
        ),
        visit as (
          select id, category, status from queue_tickets
           where id in (select id from up where referred_from_ticket_id is null)
          union all
          select q.id, q.category, q.status
            from queue_tickets q join visit v on q.referred_from_ticket_id = v.id
        )
        select 1 from visit
         where category = ${input.category} and status in ('waiting', 'called')
         limit 1`);
      if (open.rows.length > 0) return { ok: false, reason: 'already_sent' };

      const number = await nextNumber(tx, input.serviceDate, input.category);
      const [ticket] = await tx
        .insert(queueTickets)
        .values({
          serviceDate: input.serviceDate,
          category: input.category,
          number,
          patientId: current.patientId,
          referredFromTicketId: current.id,
          referralNote: input.note,
          issuedByStaffUserId: input.staffId,
        })
        .returning({
          id: queueTickets.id,
          category: queueTickets.category,
          number: queueTickets.number,
        });

      return { ok: true, ticket: ticket as IssuedTicket };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'queue_tickets_referral_key')) {
      return { ok: false, reason: 'already_sent' };
    }
    throw error;
  }
}

/** The onward numbers already issued from a ticket, for the room that sent them. */
export async function getReferrals(db: Db, ticketId: string): Promise<IssuedTicket[]> {
  const rows = await db
    .select({ id: queueTickets.id, category: queueTickets.category, number: queueTickets.number })
    .from(queueTickets)
    .where(eq(queueTickets.referredFromTicketId, ticketId))
    .orderBy(asc(queueTickets.category));
  return rows as IssuedTicket[];
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

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
      doctorId: queueTickets.doctorId,
      doctorName: doctors.fullName,
      roomName: rooms.name,
      calledAt: queueTickets.calledAt,
      recalledAt: queueTickets.recalledAt,
    })
    .from(queueTickets)
    .leftJoin(patients, eq(patients.id, queueTickets.patientId))
    .leftJoin(doctors, eq(doctors.id, queueTickets.doctorId))
    .leftJoin(rooms, eq(rooms.id, queueTickets.roomId))
    .where(and(eq(queueTickets.serviceDate, serviceDate), stillBooked))
    .orderBy(asc(queueTickets.number));

  return rows as QueueTicketRow[];
}

export type StationTicket = {
  id: string;
  category: QueueCategory;
  number: number;
  status: 'waiting' | 'called' | 'done' | 'skipped' | 'cancelled';
  /** Full name: this is a staff screen in a room, not the wall. */
  patientName: string | null;
  /** What they booked, if they booked. Walk-ins have none. */
  serviceName: string | null;
  isWalkIn: boolean;
  /** Null for a first-available walk-in still waiting. */
  doctorId: string | null;
  roomId: string | null;
  roomName: string | null;
  calledAt: Date | null;
  startedAt: Date | null;
  recalledAt: Date | null;
  /** Where they were sent from, e.g. C-002, and what for. Null if they came from the desk. */
  referredFrom: { category: QueueCategory; number: number } | null;
  referralNote: string | null;
};

/**
 * One line for a station screen: who is waiting, who was skipped, and who is in which
 * room. Staff-only, so it carries the full name and the booked service, which the doctor
 * needs and the wall must never get.
 */
/** The ticket a referral came from, joined under its own name. */
const sender = alias(queueTickets, 'sender');

export async function getLineTickets(
  db: Db,
  serviceDate: string,
  category: QueueCategory,
  doctorId: string | null,
): Promise<StationTicket[]> {
  const rows = await db
    .select({
      id: queueTickets.id,
      category: queueTickets.category,
      number: queueTickets.number,
      status: queueTickets.status,
      patientName: patients.fullName,
      serviceName: services.name,
      bookingId: queueTickets.bookingId,
      doctorId: queueTickets.doctorId,
      roomId: queueTickets.roomId,
      roomName: rooms.name,
      calledAt: queueTickets.calledAt,
      startedAt: queueTickets.startedAt,
      recalledAt: queueTickets.recalledAt,
      referralNote: queueTickets.referralNote,
      fromCategory: sender.category,
      fromNumber: sender.number,
    })
    .from(queueTickets)
    .leftJoin(patients, eq(patients.id, queueTickets.patientId))
    .leftJoin(sender, eq(sender.id, queueTickets.referredFromTicketId))
    .leftJoin(bookings, eq(bookings.id, queueTickets.bookingId))
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(rooms, eq(rooms.id, queueTickets.roomId))
    .where(
      and(
        eq(queueTickets.serviceDate, serviceDate),
        stillBooked,
        category === 'consultation' && !doctorId
          ? eq(queueTickets.category, category)
          : lineFilter(category, doctorId),
      ),
    )
    .orderBy(asc(queueTickets.number));

  return rows.map(({ bookingId, fromCategory, fromNumber, ...row }) => ({
    ...row,
    // Sent on from another room is not a walk-in, even though it has no booking.
    isWalkIn: bookingId === null && fromNumber === null,
    referredFrom:
      fromCategory && fromNumber !== null ? { category: fromCategory, number: fromNumber } : null,
  })) as StationTicket[];
}
