import { randomInt } from 'node:crypto';

import { eq, inArray, like } from 'drizzle-orm';
import type { Pool } from 'pg';

import { createDb, type Db } from '@/db/client';
import {
  bookingEvents,
  bookings,
  doctors,
  patients,
  serviceDoctors,
  services,
  sessionBlackouts,
  sessions,
} from '@/db/schema';
import { dayOfWeekForDate } from '@/lib/time';

/**
 * Test fixtures.
 *
 * Tests need a real Postgres because the guarantees being tested — the row lock and the
 * partial unique index — live in the database, not in TypeScript. Point
 * TEST_DATABASE_URL (or DATABASE_URL) at a throwaway cluster; see the README.
 *
 * Every fixture tags its rows with a unique run id so a failed test cannot leave
 * anything behind that a later run would trip over.
 */

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * A pool big enough that the concurrency tests' attempts genuinely overlap. The raw
 * pool is exposed too, because the deterministic interleaving tests need to drive two
 * connections by hand rather than hope the event loop schedules them against each other.
 */
export function testDb(max = 12): { db: Db; pool: Pool; close: () => Promise<void> } {
  if (!TEST_DB_URL) {
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the database tests.');
  }
  const { db, pool } = createDb(TEST_DB_URL, { max });
  return { db, pool, close: () => pool.end() };
}

/**
 * Opens and returns `count` connections, then hands them back to the pool.
 *
 * Without this, a "fire N bookings at once" test can quietly pass for the wrong reason:
 * the first attempt finishes while the others are still doing TCP and TLS setup, so
 * they never actually overlap and the test would pass even with every guard removed.
 */
export async function warmPool(pool: Pool, count: number): Promise<void> {
  const clients = await Promise.all(Array.from({ length: count }, () => pool.connect()));
  for (const client of clients) client.release();
}

export type Fixture = {
  tag: string;
  doctorId: string;
  serviceId: string;
  sessionId: string;
  /** Manila date the session runs on. */
  date: string;
  /** First slot's wall-clock time. */
  firstSlot: string;
  mobilePrefix: string;
  cleanup: () => Promise<void>;
};

export type FixtureOptions = {
  date: string;
  startTime?: string;
  endTime?: string;
  slotMinutes?: number;
  capacity?: number;
  onlineCapacity?: number;
  bookingCutoffHours?: number;
  category?: 'consultation' | 'laboratory' | 'imaging';
  bookableOnline?: boolean;
};

export async function makeFixture(db: Db, options: FixtureOptions): Promise<Fixture> {
  const tag = `test-${Date.now().toString(36)}-${randomInt(1e6).toString(36)}`;
  const category = options.category ?? 'consultation';
  const startTime = options.startTime ?? '09:00:00';
  const endTime = options.endTime ?? '12:00:00';

  const [doctor] = await db
    .insert(doctors)
    .values({ fullName: `${tag} Doctor`, specialty: 'Test Medicine', isActive: true })
    .returning({ id: doctors.id });

  const [service] = await db
    .insert(services)
    .values({
      name: `${tag} Service`,
      category,
      pricePhp: '500.00',
      durationMinutes: options.slotMinutes ?? 20,
      isBookableOnline: options.bookableOnline ?? true,
      isListedOnline: false,
      isActive: true,
    })
    .returning({ id: services.id });

  if (category === 'consultation') {
    await db.insert(serviceDoctors).values({ serviceId: service.id, doctorId: doctor.id });
  }

  const [session] = await db
    .insert(sessions)
    .values({
      doctorId: category === 'consultation' ? doctor.id : null,
      serviceCategory: category,
      dayOfWeek: dayOfWeekForDate(options.date),
      startTime,
      endTime,
      slotMinutes: options.slotMinutes ?? 20,
      capacity: options.capacity ?? 9,
      onlineCapacity: options.onlineCapacity ?? 6,
      bookingCutoffHours: options.bookingCutoffHours ?? 2,
      isActive: true,
    })
    .returning({ id: sessions.id });

  // Unique 0917 number range per fixture, so cleanup can find its own patients.
  const mobilePrefix = `+639${randomInt(100, 999)}${randomInt(100, 999)}`;

  const cleanup = async () => {
    const ids = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.sessionId, session.id));
    const bookingIds = ids.map((r) => r.id);
    if (bookingIds.length > 0) {
      await db.delete(bookingEvents).where(inArray(bookingEvents.bookingId, bookingIds));
      await db.delete(bookings).where(inArray(bookings.id, bookingIds));
    }
    await db.delete(sessionBlackouts).where(eq(sessionBlackouts.sessionId, session.id));
    await db.delete(sessionBlackouts).where(eq(sessionBlackouts.doctorId, doctor.id));
    await db.delete(sessions).where(eq(sessions.id, session.id));
    await db.delete(serviceDoctors).where(eq(serviceDoctors.serviceId, service.id));
    await db.delete(services).where(eq(services.id, service.id));
    await db.delete(doctors).where(eq(doctors.id, doctor.id));
    await db.delete(patients).where(like(patients.mobile, `${mobilePrefix}%`));
  };

  return {
    tag,
    doctorId: doctor.id,
    serviceId: service.id,
    sessionId: session.id,
    date: options.date,
    firstSlot: startTime,
    mobilePrefix,
    cleanup,
  };
}

/** A distinct patient for each concurrent booking attempt. */
export function testPatient(fixture: Fixture, n: number) {
  return {
    fullName: `Test Patient ${n}`,
    mobile: `${fixture.mobilePrefix}${String(n).padStart(3, '0')}`,
    email: `patient${n}@example.test`,
  };
}
