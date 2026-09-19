'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import {
  bookingEvents,
  bookings,
  doctors,
  promos,
  sessionBlackouts,
  services,
  sessions,
  siteSettings,
  staffSessions,
  staffUsers,
} from '@/db/schema';
import { requireAdmin, requireStaff, revokeAllSessions } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import {
  blackoutSchema,
  doctorSchema,
  promoSchema,
  serviceSchema,
  sessionSchema,
  settingsSchema,
  staffSchema,
} from '@/lib/admin/schemas';

/**
 * Create and update actions for the admin screens.
 *
 * Each one re-checks authorisation for itself. Each validates with Zod before touching
 * the database, and reports back through a `?done=` or `?error=` redirect so the result
 * survives without JavaScript.
 */

function back(path: string, message: string, isError = false): never {
  const key = isError ? 'error' : 'done';
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

/** Zod's first message, which is the one worth showing. */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Please check the form and try again.';
}

function refreshPublic(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/* ------------------------------- Doctors -------------------------------- */

export async function saveDoctor(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = doctorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/doctors', firstIssue(parsed.error), true);

  const { id, ...values } = parsed.data;
  if (id) {
    await db.update(doctors).set(values).where(eq(doctors.id, id));
  } else {
    await db.insert(doctors).values(values);
  }

  refreshPublic('/doctors', '/', '/book');
  back('/admin/doctors', id ? 'Doctor updated.' : 'Doctor added.');
}

/* ------------------------------- Services ------------------------------- */

export async function saveService(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/services', firstIssue(parsed.error), true);

  const { id, ...values } = parsed.data;
  if (id) {
    await db.update(services).set(values).where(eq(services.id, id));
  } else {
    await db.insert(services).values(values);
  }

  refreshPublic('/prices', '/services', '/book');
  back('/admin/services', id ? 'Service updated.' : 'Service added.');
}

/* ------------------------------- Sessions ------------------------------- */

export async function saveSession(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = sessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/schedules', firstIssue(parsed.error), true);

  const { id, startTime, endTime, ...rest } = parsed.data;
  const values = { ...rest, startTime: `${startTime}:00`, endTime: `${endTime}:00` };

  try {
    if (id) {
      await db.update(sessions).set(values).where(eq(sessions.id, id));
    } else {
      await db.insert(sessions).values(values);
    }
  } catch (error) {
    // The database has its own check constraints; surface them rather than a 500.
    console.error('[admin] session save failed:', error);
    back('/admin/schedules', 'That session is not valid. Check the times and capacity.', true);
  }

  refreshPublic('/doctors', '/book');
  back('/admin/schedules', id ? 'Session updated.' : 'Session added.');
}

export async function addBlackout(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = blackoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/schedules', firstIssue(parsed.error), true);

  await db.insert(sessionBlackouts).values(parsed.data);
  refreshPublic('/book');
  back('/admin/schedules', 'Closed day added. Check who needs ringing below.');
}

export async function removeBlackout(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (id) await db.delete(sessionBlackouts).where(eq(sessionBlackouts.id, id));
  refreshPublic('/book');
  back('/admin/schedules', 'Closed day removed.');
}

/* -------------------------------- Promos -------------------------------- */

export async function savePromo(formData: FormData): Promise<void> {
  await requireStaff();
  const parsed = promoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/promos', firstIssue(parsed.error), true);

  const { id, ...values } = parsed.data;
  if (id) {
    await db.update(promos).set(values).where(eq(promos.id, id));
  } else {
    await db.insert(promos).values(values);
  }

  refreshPublic('/promos', '/');
  back('/admin/promos', id ? 'Promo updated.' : 'Promo added.');
}

/* ------------------------------- Settings ------------------------------- */

export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/settings', firstIssue(parsed.error), true);

  await db
    .update(siteSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));

  // Every public page shows the clinic name, address or phone somewhere.
  refreshPublic('/', '/contact', '/services', '/prices', '/doctors', '/promos', '/privacy', '/book');
  back('/admin/settings', 'Settings saved.');
}

/* ------------------------------ Staff users ----------------------------- */

export async function saveStaff(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back('/admin/staff', firstIssue(parsed.error), true);

  const { id, password, ...values } = parsed.data;

  // Locking yourself out of the only admin account is unrecoverable without a DBA.
  if (id && id === me.id && (!values.isActive || values.role !== 'admin')) {
    back('/admin/staff', 'You cannot remove your own admin access while signed in.', true);
  }

  try {
    if (id) {
      await db
        .update(staffUsers)
        .set({ ...values, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
        .where(eq(staffUsers.id, id));

      // Deactivating someone must end their sessions now, not in twelve hours.
      if (!values.isActive) await revokeAllSessions(id);
    } else {
      if (!password) back('/admin/staff', 'A new account needs a password.', true);
      await db.insert(staffUsers).values({ ...values, passwordHash: await hashPassword(password) });
    }
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e?.code === '23505' || e?.cause?.code === '23505') {
      back('/admin/staff', 'That email address already has an account.', true);
    }
    throw error;
  }

  back('/admin/staff', id ? 'Staff member updated.' : 'Staff member added.');
}

/* -------------------------------------------------------------------------- */
/* Deleting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Deleting is allowed, but never at the cost of the record.
 *
 * `bookings` points at doctors, services and sessions with `on delete restrict`, and
 * that is deliberate: a booking is a clinical record, and a row that quietly rewrites
 * last month's appointments is worse than a list with an inactive entry in it. So each
 * delete first counts what depends on the row. If anything does, it refuses and says to
 * deactivate instead, which achieves what the person actually wanted: it disappears from
 * the website and the booking form.
 *
 * Things nothing depends on, like a finished promo, delete outright.
 */
async function countDependents(
  table: 'doctor' | 'service' | 'session',
  id: string,
): Promise<number> {
  const column = { doctor: bookings.doctorId, service: bookings.serviceId, session: bookings.sessionId }[table];
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(column, id));
  return row?.n ?? 0;
}

export async function deleteDoctor(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) back('/admin/doctors', 'Nothing to delete.', true);

  const used = await countDependents('doctor', id);
  if (used > 0) {
    back(
      '/admin/doctors',
      `This doctor is on ${used} booking${used === 1 ? '' : 's'}, so deleting would break the record. Untick Active instead to take them off the website and the booking form.`,
      true,
    );
  }

  // Their sessions have no bookings either, so clear them out with the doctor.
  await db.delete(sessions).where(eq(sessions.doctorId, id));
  await db.delete(doctors).where(eq(doctors.id, id));

  refreshPublic('/doctors', '/', '/book');
  back('/admin/doctors', 'Doctor deleted.');
}

export async function deleteService(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) back('/admin/services', 'Nothing to delete.', true);

  const used = await countDependents('service', id);
  if (used > 0) {
    back(
      '/admin/services',
      `This service is on ${used} booking${used === 1 ? '' : 's'}, so deleting would break the record. Untick Active instead to take it off the website and the booking form.`,
      true,
    );
  }

  await db.delete(services).where(eq(services.id, id));
  refreshPublic('/prices', '/services', '/book');
  back('/admin/services', 'Service deleted.');
}

export async function deleteSession(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) back('/admin/schedules', 'Nothing to delete.', true);

  const used = await countDependents('session', id);
  if (used > 0) {
    back(
      '/admin/schedules',
      `This session has ${used} booking${used === 1 ? '' : 's'} against it, so deleting would break the record. Untick Active instead to stop it being offered.`,
      true,
    );
  }

  await db.delete(sessions).where(eq(sessions.id, id));
  refreshPublic('/doctors', '/book');
  back('/admin/schedules', 'Session deleted.');
}

export async function deletePromo(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  if (!id) back('/admin/promos', 'Nothing to delete.', true);

  // Nothing points at a promo, so this one is a plain delete.
  await db.delete(promos).where(eq(promos.id, id));
  refreshPublic('/promos', '/');
  back('/admin/promos', 'Promo deleted.');
}

export async function deleteStaff(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) back('/admin/staff', 'Nothing to delete.', true);

  if (id === me.id) {
    back('/admin/staff', 'You cannot delete your own account while signed in.', true);
  }

  // Every status change is stamped with who made it. Deleting someone who has worked the
  // desk would erase their name from that history, so keep them and deactivate instead.
  const [acted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookingEvents)
    .where(eq(bookingEvents.actorStaffUserId, id));

  if ((acted?.n ?? 0) > 0) {
    back(
      '/admin/staff',
      `This person has made ${acted.n} change${acted.n === 1 ? '' : 's'} to bookings, and deleting them would take their name off that history. Untick Active instead, which signs them out and stops them signing back in.`,
      true,
    );
  }

  await db.delete(staffSessions).where(eq(staffSessions.staffUserId, id));
  await db.delete(staffUsers).where(eq(staffUsers.id, id));
  back('/admin/staff', 'Staff member deleted.');
}
