import 'server-only';

import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db';
import {
  doctors,
  promos,
  serviceDoctors,
  services,
  sessions,
  siteSettings,
} from '@/db/schema';

import { manilaDateString } from './time';

/**
 * Read-side queries for the public site.
 *
 * Each is wrapped in React's `cache` so that a page rendering the same thing twice —
 * the footer and the contact panel both want the clinic phone number — hits the
 * database once per render.
 */

export type SiteSettings = typeof siteSettings.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Promo = typeof promos.$inferSelect;
export type ClinicSession = typeof sessions.$inferSelect;

/**
 * Falls back to a usable default if the settings row is missing, so a half-configured
 * database renders a plain page instead of a 500. Seeding writes the real row.
 */
const FALLBACK_SETTINGS: SiteSettings = {
  id: 1,
  clinicName: 'Veritas Clinic',
  address: '',
  phonePrimary: '',
  phoneSecondary: null,
  email: '',
  facebookUrl: null,
  openingHoursText: '',
  mapEmbedUrl: null,
  bookingHorizonDays: 30,
  updatedAt: new Date(),
};

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  return row ?? FALLBACK_SETTINGS;
});

export const getActiveDoctors = cache(async (): Promise<Doctor[]> =>
  db
    .select()
    .from(doctors)
    .where(eq(doctors.isActive, true))
    .orderBy(asc(doctors.sortOrder), asc(doctors.fullName)),
);

/** Active sessions for active doctors, used to derive each doctor's clinic days. */
export const getActiveDoctorSessions = cache(async (): Promise<ClinicSession[]> =>
  db
    .select()
    .from(sessions)
    .where(and(eq(sessions.isActive, true), eq(sessions.serviceCategory, 'consultation')))
    .orderBy(asc(sessions.dayOfWeek), asc(sessions.startTime)),
);

/** Everything the clinic offers, for the /services page. */
export const getActiveServices = cache(async (): Promise<Service[]> =>
  db
    .select()
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder), asc(services.name)),
);

/** The published price list: laboratory and imaging that staff have chosen to list. */
export const getListedServices = cache(async (): Promise<Service[]> =>
  db
    .select()
    .from(services)
    .where(and(eq(services.isActive, true), eq(services.isListedOnline, true)))
    .orderBy(asc(services.sortOrder), asc(services.name)),
);

/**
 * Promos that are live *today in Manila*. The date comparison is done on calendar
 * dates, not instants, so a promo ending today is still visible all day in the clinic's
 * own timezone rather than disappearing at 8am when UTC rolls over.
 */
export const getActivePromos = cache(async (): Promise<Promo[]> => {
  const today = manilaDateString();
  return db
    .select()
    .from(promos)
    .where(
      and(eq(promos.isActive, true), lte(promos.startsOn, today), gte(promos.endsOn, today)),
    )
    .orderBy(asc(promos.sortOrder), asc(promos.startsOn));
});

/** Which doctors deliver which consultation service. */
export const getServiceDoctorLinks = cache(
  async (): Promise<{ serviceId: string; doctorId: string }[]> =>
    db
      .select({ serviceId: serviceDoctors.serviceId, doctorId: serviceDoctors.doctorId })
      .from(serviceDoctors),
);
