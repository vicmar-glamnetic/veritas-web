import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import {
  OCCUPYING_STATUSES,
  bookingEvents,
  bookings,
  patients,
  serviceDoctors,
  services,
  sessionBlackouts,
  sessions,
} from '@/db/schema';

import { distributeOnlineCapacity, slotStartTimes } from './availability';
import { generateCancelToken, generateReferenceCode } from './reference';
import { manilaDateString, manilaTimeString } from './time';

/**
 * Creating a booking.
 *
 * Two people can tap Confirm on the last place at the same instant, so this is written
 * to be safe under concurrency in two independent ways:
 *
 *   1. The whole thing runs in one transaction that begins by taking a row lock on the
 *      session (`SELECT ... FOR UPDATE`). Two bookings against the same session queue up
 *      rather than interleaving, so the count-then-insert cannot race.
 *
 *   2. Even if that lock were removed or a future caller forgot the transaction, the
 *      partial unique index `bookings_slot_seat_key` makes a duplicate seat physically
 *      impossible. The loser's INSERT fails.
 *
 * The second guarantee is the real one. The first is what turns a constraint violation
 * into an orderly "that slot just went" instead of an error the patient has to retry.
 */

export type BookingFailureReason =
  | 'service_not_found'
  | 'service_not_bookable'
  | 'doctor_not_available_for_service'
  | 'session_not_found'
  | 'slot_not_in_session'
  | 'slot_blacked_out'
  | 'slot_past_cutoff'
  | 'slot_full';

export class BookingError extends Error {
  constructor(readonly reason: BookingFailureReason, message?: string) {
    super(message ?? reason);
    this.name = 'BookingError';
  }
}

export type CreateBookingInput = {
  serviceId: string;
  doctorId?: string | null;
  sessionId: string;
  /** UTC instant of the slot the patient picked. */
  start: Date;
  patient: {
    fullName: string;
    /** Already normalised to +639XXXXXXXXX. */
    mobile: string;
    email?: string | null;
    dateOfBirth?: string | null;
  };
  notes?: string | null;
  consentAt: Date;
  now?: Date;
};

export type CreatedBooking = {
  id: string;
  referenceCode: string;
  cancelToken: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  slotIndex: number;
};

/**
 * Postgres unique-violation, looked for anywhere in the cause chain.
 *
 * Drizzle wraps driver errors in its own `Failed query: ...` Error and hangs the real
 * one off `cause`, so checking `error.code` on the top-level object silently never
 * matches. Getting this wrong meant a patient who lost a race saw a raw SQL dump
 * instead of "that slot has just gone".
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const e = current as { code?: string; constraint?: string; cause?: unknown };
    if (e.code === '23505' && (!constraint || e.constraint === constraint)) return true;
    current = e.cause;
  }
  return false;
}

export async function createBooking(
  db: Db,
  input: CreateBookingInput,
): Promise<CreatedBooking> {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    /* Serialise every booking against this session. Cheap at clinic volumes, and it
       means the capacity check below is reliable rather than merely likely. */
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
      .for('update');

    if (!session || !session.isActive) {
      throw new BookingError('session_not_found', 'That clinic session is no longer running.');
    }

    /* The service must exist, be live, and be offered online. */
    const [service] = await tx
      .select()
      .from(services)
      .where(eq(services.id, input.serviceId))
      .limit(1);

    if (!service || !service.isActive) {
      throw new BookingError('service_not_found', 'That service is no longer offered.');
    }
    if (!service.isBookableOnline) {
      throw new BookingError(
        'service_not_bookable',
        'That service cannot be booked online. Please call the clinic.',
      );
    }
    if (service.category !== session.serviceCategory) {
      throw new BookingError('slot_not_in_session', 'That slot is not for this service.');
    }

    /* Consultations: the doctor must both match the session and deliver the service. */
    const doctorId = session.doctorId;
    if (session.serviceCategory === 'consultation') {
      if (input.doctorId && input.doctorId !== doctorId) {
        throw new BookingError(
          'doctor_not_available_for_service',
          'That doctor does not hold this clinic.',
        );
      }
      const [link] = await tx
        .select({ doctorId: serviceDoctors.doctorId })
        .from(serviceDoctors)
        .where(
          and(
            eq(serviceDoctors.serviceId, service.id),
            eq(serviceDoctors.doctorId, doctorId!),
          ),
        )
        .limit(1);
      if (!link) {
        throw new BookingError(
          'doctor_not_available_for_service',
          'That doctor does not offer this service.',
        );
      }
    }

    /* The slot must be a real slot of this session, on a day the session runs. */
    const date = manilaDateString(input.start);
    const wallClock = manilaTimeString(input.start);
    const starts = slotStartTimes(session.startTime, session.endTime, session.slotMinutes);
    const slotPosition = starts.findIndex((t) => t.slice(0, 5) === wallClock);

    if (slotPosition === -1) {
      throw new BookingError('slot_not_in_session', 'That time is not one of our slots.');
    }
    if (dayOfWeekUtcManila(date) !== session.dayOfWeek) {
      throw new BookingError('slot_not_in_session', 'That session does not run on that day.');
    }

    /* Blackouts: clinic-wide, this session, or this doctor. */
    const blackout = await tx
      .select({ id: sessionBlackouts.id })
      .from(sessionBlackouts)
      .where(
        and(
          eq(sessionBlackouts.date, date),
          sql`(
            (${sessionBlackouts.sessionId} is null and ${sessionBlackouts.doctorId} is null)
            or ${sessionBlackouts.sessionId} = ${session.id}
            ${doctorId ? sql`or ${sessionBlackouts.doctorId} = ${doctorId}` : sql``}
          )`,
        ),
      )
      .limit(1);

    if (blackout.length > 0) {
      throw new BookingError('slot_blacked_out', 'The clinic is closed that day.');
    }

    /* Cut-off. */
    const cutoffMs = session.bookingCutoffHours * 60 * 60 * 1000;
    if (input.start.getTime() - now.getTime() < cutoffMs) {
      throw new BookingError(
        'slot_past_cutoff',
        'That slot is too close to now to book online. Please call the clinic.',
      );
    }

    /* How many online places this particular slot has. */
    const perSlot = distributeOnlineCapacity(session.onlineCapacity, starts.length);
    const slotCapacity = perSlot[slotPosition] ?? 0;
    if (slotCapacity === 0) {
      throw new BookingError('slot_full', 'That time is kept for walk-in patients.');
    }

    /* Which seats are already gone. */
    const takenRows = await tx
      .select({ slotIndex: bookings.slotIndex })
      .from(bookings)
      .where(
        and(
          eq(bookings.sessionId, session.id),
          eq(bookings.scheduledStart, input.start),
          inArray(bookings.status, [...OCCUPYING_STATUSES]),
        ),
      );

    const taken = new Set(takenRows.map((r) => r.slotIndex));
    let seat = -1;
    for (let i = 0; i < slotCapacity; i++) {
      if (!taken.has(i)) {
        seat = i;
        break;
      }
    }
    if (seat === -1) {
      throw new BookingError('slot_full', 'That slot has just been taken.');
    }

    /* Patient record. Matched on mobile *and* name: families share one mobile, and
       attaching a child's booking to a parent's record would be worse than a duplicate.
       The clinic system merges duplicates later via patients.merged_into_id. */
    const patientId = await upsertPatient(tx, input.patient);

    const scheduledEnd = new Date(input.start.getTime() + session.slotMinutes * 60_000);
    const cancelToken = generateCancelToken();

    /* Insert, retrying only on a reference-code collision. A seat collision cannot
       happen while we hold the session lock, but if it ever did the unique index would
       surface it here and we report it as a full slot rather than a crash. */
    for (let attempt = 0; attempt < 5; attempt++) {
      const referenceCode = generateReferenceCode();
      try {
        const [booking] = await tx
          .insert(bookings)
          .values({
            referenceCode,
            patientId,
            serviceId: service.id,
            doctorId,
            sessionId: session.id,
            scheduledStart: input.start,
            scheduledEnd,
            slotIndex: seat,
            status: 'booked',
            notes: input.notes ?? null,
            consentAt: input.consentAt,
            cancelToken,
          })
          .returning();

        await tx.insert(bookingEvents).values({
          bookingId: booking.id,
          fromStatus: null,
          toStatus: 'booked',
          actor: 'patient',
          actorStaffUserId: null,
          reason: 'Booked online',
        });

        return {
          id: booking.id,
          referenceCode: booking.referenceCode,
          cancelToken: booking.cancelToken,
          scheduledStart: booking.scheduledStart,
          scheduledEnd: booking.scheduledEnd,
          slotIndex: booking.slotIndex,
        };
      } catch (error) {
        if (isUniqueViolation(error, 'bookings_slot_seat_key')) {
          throw new BookingError('slot_full', 'That slot has just been taken.');
        }
        if (isUniqueViolation(error, 'bookings_reference_code_key')) {
          continue; // astronomically unlikely; just draw another code
        }
        throw error;
      }
    }

    throw new BookingError('slot_full', 'We could not complete that booking. Please try again.');
  });
}

/** 0 = Sunday. Works on a "YYYY-MM-DD" Manila calendar date. */
function dayOfWeekUtcManila(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function upsertPatient(
  tx: Tx,
  patient: CreateBookingInput['patient'],
): Promise<string> {
  const [existing] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.mobile, patient.mobile),
        sql`lower(${patients.fullName}) = lower(${patient.fullName})`,
        sql`${patients.mergedIntoId} is null`,
      ),
    )
    .limit(1);

  if (existing) {
    // Keep the most recent contact details without disturbing anything else.
    await tx
      .update(patients)
      .set({
        email: patient.email ?? null,
        ...(patient.dateOfBirth ? { dateOfBirth: patient.dateOfBirth } : {}),
        updatedAt: new Date(),
      })
      .where(eq(patients.id, existing.id));
    return existing.id;
  }

  const [created] = await tx
    .insert(patients)
    .values({
      fullName: patient.fullName,
      mobile: patient.mobile,
      email: patient.email ?? null,
      dateOfBirth: patient.dateOfBirth ?? null,
      source: 'online',
    })
    .returning({ id: patients.id });

  return created.id;
}
