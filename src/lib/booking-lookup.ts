import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  OCCUPYING_STATUSES,
  bookingEvents,
  bookings,
  doctors,
  patients,
  services,
} from '@/db/schema';

/**
 * Reading and cancelling a booking the patient already has.
 *
 * There is no patient login, so a booking is proved in one of two ways:
 *
 *   - the reference code plus the mobile number it was booked with, or
 *   - the single-purpose cancel token from the confirmation email.
 *
 * Neither ever appears in a query string. The mobile is POSTed; the token lives in the
 * path and does nothing except cancel this one booking.
 */

export type BookingView = {
  id: string;
  referenceCode: string;
  status: (typeof bookings.$inferSelect)['status'];
  scheduledStart: Date;
  scheduledEnd: Date;
  notes: string | null;
  patientFirstName: string;
  serviceName: string;
  prepInstructions: string | null;
  doctorName: string | null;
  isCancelled: boolean;
  isPast: boolean;
};

function toView(row: {
  id: string;
  referenceCode: string;
  status: BookingView['status'];
  scheduledStart: Date;
  scheduledEnd: Date;
  notes: string | null;
  patientName: string;
  serviceName: string;
  prepInstructions: string | null;
  doctorName: string | null;
}): BookingView {
  return {
    ...row,
    // Only the first name is shown back, so a guessed reference code cannot be used to
    // harvest a full name.
    patientFirstName: row.patientName.trim().split(/\s+/)[0] ?? row.patientName,
    isCancelled: row.status.startsWith('cancelled'),
    isPast: row.scheduledStart.getTime() < Date.now(),
  };
}

const SELECTION = {
  id: bookings.id,
  referenceCode: bookings.referenceCode,
  status: bookings.status,
  scheduledStart: bookings.scheduledStart,
  scheduledEnd: bookings.scheduledEnd,
  notes: bookings.notes,
  patientName: patients.fullName,
  serviceName: services.name,
  prepInstructions: services.prepInstructions,
  doctorName: doctors.fullName,
};

/** Reference code plus the mobile it was booked with. Both must match. */
export async function findBookingByReferenceAndMobile(
  reference: string,
  mobile: string,
): Promise<BookingView | null> {
  const [row] = await db
    .select(SELECTION)
    .from(bookings)
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(doctors, eq(doctors.id, bookings.doctorId))
    .where(and(eq(bookings.referenceCode, reference), eq(patients.mobile, mobile)))
    .limit(1);

  return row ? toView(row) : null;
}

/** The emailed cancellation link. */
export async function findBookingByCancelToken(token: string): Promise<BookingView | null> {
  const [row] = await db
    .select(SELECTION)
    .from(bookings)
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(doctors, eq(doctors.id, bookings.doctorId))
    .where(eq(bookings.cancelToken, token))
    .limit(1);

  return row ? toView(row) : null;
}

export type CancelOutcome = 'cancelled' | 'already_cancelled' | 'not_found' | 'too_late';

/**
 * Cancels a booking the patient has proved they own.
 *
 * The status guard is in the WHERE clause, so two taps on the same link cannot write two
 * cancellation events, and a booking the clinic has already marked arrived cannot be
 * cancelled out from under the front desk.
 */
export async function cancelBookingById(
  bookingId: string,
  reason = 'Cancelled by the patient',
): Promise<CancelOutcome> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: bookings.status, start: bookings.scheduledStart })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');

    if (!current) return 'not_found';
    if (current.status.startsWith('cancelled')) return 'already_cancelled';
    if (current.status === 'arrived') return 'too_late';

    const updated = await tx
      .update(bookings)
      .set({ status: 'cancelled_by_patient', updatedAt: new Date() })
      .where(
        and(eq(bookings.id, bookingId), inArray(bookings.status, [...OCCUPYING_STATUSES])),
      )
      .returning({ id: bookings.id });

    if (updated.length === 0) return 'already_cancelled';

    await tx.insert(bookingEvents).values({
      bookingId,
      fromStatus: current.status,
      toStatus: 'cancelled_by_patient',
      actor: 'patient',
      actorStaffUserId: null,
      reason,
    });

    return 'cancelled';
  });
}
