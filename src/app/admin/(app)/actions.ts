'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireStaff, destroySession } from '@/lib/auth';
import { changeBookingStatus, type StaffStatus } from '@/lib/admin/status';

/**
 * Booking status changes from the admin screens.
 *
 * Note the `requireStaff()` at the top of each: a server action is its own endpoint and
 * can be invoked without the guarded layout ever rendering, so the page guard is not
 * enough on its own.
 */

const statusSchema = z.object({
  bookingId: z.uuid(),
  status: z.enum(['arrived', 'no_show', 'cancelled_by_clinic']),
  reason: z.string().trim().max(300).optional(),
});

export type ActionResult = { ok: boolean; message?: string };

export async function setBookingStatus(formData: FormData): Promise<void> {
  const staff = await requireStaff();

  const parsed = statusSchema.safeParse({
    bookingId: formData.get('bookingId') ?? '',
    status: formData.get('status') ?? '',
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) return;

  await changeBookingStatus(
    staff,
    parsed.data.bookingId,
    parsed.data.status as StaffStatus,
    parsed.data.reason ?? null,
  );

  // Admin screens are dynamic, but revalidating keeps any cached public availability
  // in step with a slot that has just been freed.
  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/book');
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/admin/login');
}
