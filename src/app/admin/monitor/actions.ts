'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { requireDesk } from '@/lib/auth';
import { QUEUE_CATEGORIES } from '@/lib/queue';
import { clearQueue } from '@/lib/queue-service';
import { manilaDateString } from '@/lib/time';

/**
 * Clearing the queue from the waiting room screen.
 *
 * Desk only, checked here as well as by hiding the buttons: an action is its own
 * endpoint. Plain form posts behind a confirmation dialog, so they work with JavaScript
 * off and a stray tap cannot empty the clinic's queue.
 */

function done(message: string): never {
  revalidatePath('/admin/monitor');
  revalidatePath('/admin/station');
  redirect(`/admin/monitor?notice=${encodeURIComponent(message)}`);
}

const categorySchema = z.object({ category: z.enum(['consultation', 'laboratory', 'imaging']) });

export async function clearWaiting(formData: FormData): Promise<void> {
  await requireDesk();
  const parsed = categorySchema.safeParse({ category: formData.get('category') ?? '' });
  if (!parsed.success) done('Nothing cleared.');

  const label = QUEUE_CATEGORIES.find((c) => c.key === parsed.data.category)!.label;
  const n = await clearQueue(db, manilaDateString(), parsed.data.category);
  done(`${label}: ${n} waiting ${n === 1 ? 'number' : 'numbers'} cleared.`);
}

export async function clearAll(): Promise<void> {
  await requireDesk();
  const n = await clearQueue(db, manilaDateString(), null);
  done(`Cleared ${n} ${n === 1 ? 'number' : 'numbers'}. The board is empty.`);
}
