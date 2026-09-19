import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import {
  OCCUPYING_STATUSES,
  bookings,
  serviceDoctors,
  services,
  sessionBlackouts,
  sessions,
} from '@/db/schema';

import { addDays, dateRange, dayOfWeekForDate, manilaDateString, manilaToUtc } from './time';

/**
 * The availability engine.
 *
 * Nothing about the calendar is stored. Given a service and optionally a doctor, this
 * expands the recurring `sessions` templates into dated slots, subtracts blackouts, the
 * booking cut-off and existing bookings, and returns what is left. Staff never maintain
 * a list of open times; they maintain sessions, and this derives the rest.
 *
 * Read the rules in CLAUDE.md alongside this file.
 */

export type AvailabilitySlot = {
  sessionId: string;
  doctorId: string | null;
  /** UTC instant the slot begins. */
  start: Date;
  end: Date;
  /** How many online places this particular slot has. */
  capacity: number;
  booked: number;
  open: number;
};

export type AvailabilityDay = {
  /** Manila calendar date, "YYYY-MM-DD". */
  date: string;
  slots: AvailabilitySlot[];
  openCount: number;
};

export type AvailabilityQuery = {
  serviceId: string;
  /** Required in practice for consultations; ignored for laboratory and imaging. */
  doctorId?: string | null;
  /** Defaults to now. Injected by tests. */
  now?: Date;
  /** Defaults to site_settings.booking_horizon_days, passed in by the caller. */
  horizonDays?: number;
};

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** "09:00:00" -> 540 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 540 -> "09:00:00" */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * The wall-clock start of every whole slot in a session. A trailing gap too short for a
 * full slot is dropped: a 09:00–12:10 session in 20-minute slots ends at 12:00, because
 * nobody wants a 10-minute consultation.
 */
export function slotStartTimes(
  startTime: string,
  endTime: string,
  slotMinutes: number,
): string[] {
  if (slotMinutes <= 0) return [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const out: string[] = [];
  for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
    out.push(minutesToTime(t));
  }
  return out;
}

/**
 * Spread a session's online places across its slots as evenly as possible.
 *
 * `capacity` counts patients per session, not per slot, so a 9-to-12 clinic in
 * 20-minute slots with 6 online places has to decide *which* of its 9 slots are
 * bookable. Bunching them at the front would leave walk-ins nothing until 11am, so they
 * are spread: [1,1,0,1,1,0,1,1,0].
 *
 * The first slot is always offered online where there is anything to offer, because a
 * patient looking at the calendar expects the session's opening time to be available.
 *
 * Returns one entry per slot, summing to `total`.
 */
export function distributeOnlineCapacity(total: number, slotCount: number): number[] {
  if (slotCount <= 0) return [];
  const capped = Math.max(0, total);
  return Array.from(
    { length: slotCount },
    (_, i) =>
      Math.ceil(((i + 1) * capped) / slotCount) - Math.ceil((i * capped) / slotCount),
  );
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

const DEFAULT_HORIZON_DAYS = 30;

/**
 * Every bookable slot for a service, grouped by Manila calendar date.
 *
 * Only dates with at least one open slot come back, so a calendar can grey out every
 * date it does not receive.
 */
export async function computeAvailability(
  db: Db,
  query: AvailabilityQuery,
): Promise<AvailabilityDay[]> {
  const now = query.now ?? new Date();
  const horizonDays = query.horizonDays ?? DEFAULT_HORIZON_DAYS;

  /* 1. The service decides which sessions are relevant. */
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, query.serviceId))
    .limit(1);

  if (!service || !service.isActive || !service.isBookableOnline) return [];

  // For a consultation the chosen doctor must actually deliver this service.
  if (service.category === 'consultation' && query.doctorId) {
    const [link] = await db
      .select({ doctorId: serviceDoctors.doctorId })
      .from(serviceDoctors)
      .where(
        and(
          eq(serviceDoctors.serviceId, service.id),
          eq(serviceDoctors.doctorId, query.doctorId),
        ),
      )
      .limit(1);
    if (!link) return [];
  }

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.isActive, true),
        eq(sessions.serviceCategory, service.category),
        ...(query.doctorId ? [eq(sessions.doctorId, query.doctorId)] : []),
      ),
    );

  if (sessionRows.length === 0) return [];

  /* 2. The window we are expanding into. */
  const today = manilaDateString(now);
  const dates = dateRange(today, horizonDays);
  const lastDate = dates[dates.length - 1]!;

  const windowStart = manilaToUtc(today, '00:00');
  const windowEnd = manilaToUtc(addDays(lastDate, 1), '00:00');

  /* 3. Blackouts across the window, and bookings already taken. */
  const sessionIds = sessionRows.map((s) => s.id);

  const [blackoutRows, bookingCounts] = await Promise.all([
    db
      .select()
      .from(sessionBlackouts)
      .where(and(gte(sessionBlackouts.date, today), lt(sessionBlackouts.date, addDays(lastDate, 1)))),
    db
      .select({
        sessionId: bookings.sessionId,
        scheduledStart: bookings.scheduledStart,
        taken: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.sessionId, sessionIds),
          gte(bookings.scheduledStart, windowStart),
          lt(bookings.scheduledStart, windowEnd),
          inArray(bookings.status, [...OCCUPYING_STATUSES]),
        ),
      )
      .groupBy(bookings.sessionId, bookings.scheduledStart),
  ]);

  const takenBySlot = new Map<string, number>();
  for (const row of bookingCounts) {
    takenBySlot.set(`${row.sessionId}|${row.scheduledStart.toISOString()}`, row.taken);
  }

  // Blackouts split by what they target.
  const clinicClosedDates = new Set<string>();
  const closedSessionDates = new Set<string>();
  const closedDoctorDates = new Set<string>();
  for (const b of blackoutRows) {
    if (b.sessionId) closedSessionDates.add(`${b.sessionId}|${b.date}`);
    else if (b.doctorId) closedDoctorDates.add(`${b.doctorId}|${b.date}`);
    else clinicClosedDates.add(b.date);
  }

  /* 4. Expand. */
  const days: AvailabilityDay[] = [];

  for (const date of dates) {
    if (clinicClosedDates.has(date)) continue;

    const dow = dayOfWeekForDate(date);
    const slots: AvailabilitySlot[] = [];

    for (const session of sessionRows) {
      if (session.dayOfWeek !== dow) continue;
      if (closedSessionDates.has(`${session.id}|${date}`)) continue;
      if (session.doctorId && closedDoctorDates.has(`${session.doctorId}|${date}`)) continue;

      const starts = slotStartTimes(session.startTime, session.endTime, session.slotMinutes);
      const perSlot = distributeOnlineCapacity(session.onlineCapacity, starts.length);
      const cutoffMs = session.bookingCutoffHours * 60 * 60 * 1000;

      starts.forEach((wallClock, index) => {
        const capacity = perSlot[index] ?? 0;
        if (capacity === 0) return; // held entirely for walk-ins

        const start = manilaToUtc(date, wallClock);
        if (start.getTime() - now.getTime() < cutoffMs) return; // too close to now

        const booked = takenBySlot.get(`${session.id}|${start.toISOString()}`) ?? 0;
        const open = capacity - booked;
        if (open <= 0) return;

        slots.push({
          sessionId: session.id,
          doctorId: session.doctorId,
          start,
          end: new Date(start.getTime() + session.slotMinutes * 60_000),
          capacity,
          booked,
          open,
        });
      });
    }

    if (slots.length === 0) continue;

    slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    days.push({ date, slots, openCount: slots.reduce((sum, s) => sum + s.open, 0) });
  }

  return days;
}

/** Just the dates that have something free, for the calendar. */
export async function availableDates(db: Db, query: AvailabilityQuery): Promise<string[]> {
  const days = await computeAvailability(db, query);
  return days.map((d) => d.date);
}
