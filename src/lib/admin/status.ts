import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { bookingEvents, bookings } from '@/db/schema';
import type { Staff } from '@/lib/auth';

/**
 * Staff-driven status changes.
 *
 * Every change is written twice: the new status on the booking, and an append-only row
 * in `booking_events` naming the member of staff who made it. They go in one
 * transaction, so the log can never disagree with the booking.
 *
 * The allowed-from list is enforced in the UPDATE's WHERE clause rather than checked
 * beforehand, so two receptionists clicking at once cannot both write an event.
 */

export type StaffStatus = 'arrived' | 'no_show' | 'cancelled_by_clinic';

const ALLOWED_FROM: Record<StaffStatus, string[]> = {
  // You can only arrive from a live booking, and a no-show can be corrected to arrived.
  arrived: ['booked', 'no_show'],
  no_show: ['booked', 'arrived'],
  cancelled_by_clinic: ['booked', 'arrived', 'no_show'],
};

export type StatusChangeResult =
  | { ok: true; from: string; to: StaffStatus }
  | { ok: false; reason: 'not_found' | 'not_allowed' };

export async function changeBookingStatus(
  staff: Staff,
  bookingId: string,
  to: StaffStatus,
  note?: string | null,
): Promise<StatusChangeResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');

    if (!current) return { ok: false, reason: 'not_found' };
    if (current.status === to) return { ok: true, from: current.status, to };

    const allowed = ALLOWED_FROM[to];
    const updated = await tx
      .update(bookings)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, allowed as never)))
      .returning({ id: bookings.id });

    if (updated.length === 0) return { ok: false, reason: 'not_allowed' };

    await tx.insert(bookingEvents).values({
      bookingId,
      fromStatus: current.status,
      toStatus: to,
      actor: 'staff',
      actorStaffUserId: staff.id,
      reason: note?.trim() || defaultReason(to, staff),
    });

    return { ok: true, from: current.status, to };
  });
}

function defaultReason(to: StaffStatus, staff: Staff): string {
  const who = `${staff.name} at the front desk`;
  if (to === 'arrived') return `Marked arrived by ${who}`;
  if (to === 'no_show') return `Marked as did not arrive by ${who}`;
  return `Cancelled by ${who}`;
}
