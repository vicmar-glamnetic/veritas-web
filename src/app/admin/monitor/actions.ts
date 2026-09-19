'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db';
import { callNextTicket, issueWalkInTicket, recallTicket } from '@/lib/queue-service';
import { requireStaff } from '@/lib/auth';
import { manilaDateString } from '@/lib/time';

/**
 * The board's controls.
 *
 * Every one of these calls `requireStaff()` for itself. A server action is its own
 * endpoint and is reachable without the protecting layout ever rendering, so the guard
 * on the route secures nothing on its own.
 *
 * They are plain form posts, so the buttons work with JavaScript off.
 */

const categorySchema = z.enum(['consultation', 'laboratory', 'imaging']);

function readCategory(formData: FormData) {
  return categorySchema.safeParse(formData.get('category'));
}

function refresh() {
  revalidatePath('/admin/monitor');
  revalidatePath('/admin');
}

/** Put the next waiting number on the board. */
export async function callNext(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = readCategory(formData);
  if (!parsed.success) return;

  await callNextTicket(db, staff.id, manilaDateString(), parsed.data);
  refresh();
}

/** Undo a mis-tap: send the number on the board back to the front of the queue. */
export async function recall(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = readCategory(formData);
  if (!parsed.success) return;

  await recallTicket(db, manilaDateString(), parsed.data);
  refresh();
}

/** A patient at the desk with no appointment still needs a place in the queue. */
export async function issueWalkIn(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = readCategory(formData);
  if (!parsed.success) return;

  await issueWalkInTicket(db, staff.id, manilaDateString(), parsed.data);
  refresh();
}
