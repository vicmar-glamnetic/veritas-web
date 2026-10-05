'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { walkInSchema } from '@/lib/admin/schemas';
import { requireDesk } from '@/lib/auth';
import { formatTicket } from '@/lib/queue';
import { issueWalkInTicket } from '@/lib/queue-service';
import { manilaDateString } from '@/lib/time';

export type WalkInValues = {
  fullName: string;
  mobile: string;
  category: string;
  doctorId: string;
};

export type WalkInState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; values: WalkInValues };

/**
 * A patient at the desk with no appointment.
 *
 * Returns its result rather than redirecting, so a rejected form comes back with the
 * name and mobile still in it, and neither ever goes near a URL. The same reason the
 * public forms work this way.
 */
export async function addWalkIn(_previous: WalkInState, formData: FormData): Promise<WalkInState> {
  const staff = await requireDesk();

  const values: WalkInValues = {
    fullName: String(formData.get('fullName') ?? ''),
    mobile: String(formData.get('mobile') ?? ''),
    category: String(formData.get('category') ?? ''),
    doctorId: String(formData.get('doctorId') ?? ''),
  };

  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Please check the form.',
      values,
    };
  }

  const ticket = await issueWalkInTicket(db, {
    staffId: staff.id,
    serviceDate: manilaDateString(),
    category: parsed.data.category,
    doctorId: parsed.data.doctorId,
    patient: { fullName: parsed.data.fullName, mobile: parsed.data.mobile },
  });

  revalidatePath('/admin/monitor');
  revalidatePath('/admin/station');

  return {
    status: 'success',
    message: `${formatTicket(ticket.category, ticket.number)} for ${parsed.data.fullName}. Tell them their number and to watch the screen.`,
  };
}
