import 'server-only';

import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { bookings, doctors, patients, queueTickets, services } from '@/db/schema';
import { formatTicket, type QueueCategory } from '@/lib/queue';
import { addDays, manilaDateString, manilaToUtc } from '@/lib/time';

/** One row of the bookings list, flattened for display. */
export type AdminBooking = {
  id: string;
  referenceCode: string;
  status: (typeof bookings.$inferSelect)['status'];
  scheduledStart: Date;
  scheduledEnd: Date;
  notes: string | null;
  patientName: string;
  patientMobile: string;
  patientEmail: string | null;
  serviceName: string;
  serviceCategory: 'consultation' | 'laboratory' | 'imaging';
  prepInstructions: string | null;
  doctorName: string | null;
  /** The queue number reception issued at check-in, e.g. "C-014". Null until arrived. */
  ticket: string | null;
};

const SELECTION = {
  id: bookings.id,
  referenceCode: bookings.referenceCode,
  status: bookings.status,
  scheduledStart: bookings.scheduledStart,
  scheduledEnd: bookings.scheduledEnd,
  notes: bookings.notes,
  patientName: patients.fullName,
  patientMobile: patients.mobile,
  patientEmail: patients.email,
  serviceName: services.name,
  serviceCategory: services.category,
  prepInstructions: services.prepInstructions,
  doctorName: doctors.fullName,
  ticketCategory: queueTickets.category,
  ticketNumber: queueTickets.number,
};

function baseQuery() {
  return db
    .select(SELECTION)
    .from(bookings)
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(doctors, eq(doctors.id, bookings.doctorId))
    // At most one ticket per booking, enforced by queue_tickets_booking_key, so this
    // cannot multiply rows.
    .leftJoin(queueTickets, eq(queueTickets.bookingId, bookings.id));
}

/** Turns the two ticket columns into the string staff read out, or null. */
function withTicket<T extends { ticketCategory: unknown; ticketNumber: number | null }>(
  row: T,
): Omit<T, 'ticketCategory' | 'ticketNumber'> & { ticket: string | null } {
  const { ticketCategory, ticketNumber, ...rest } = row;
  return {
    ...rest,
    ticket:
      ticketCategory && ticketNumber
        ? formatTicket(ticketCategory as QueueCategory, ticketNumber)
        : null,
  };
}

/**
 * Every booking for one Manila calendar day, earliest first.
 *
 * The window is built from the Manila date, not from UTC midnight: the clinic's day runs
 * 16:00 to 16:00 in UTC terms, and slicing on the wrong boundary would show tomorrow's
 * early-morning laboratory list on today's screen.
 */
export async function getBookingsForDate(date: string): Promise<AdminBooking[]> {
  const from = manilaToUtc(date, '00:00');
  const to = manilaToUtc(addDays(date, 1), '00:00');

  const rows = await baseQuery()
    .where(and(gte(bookings.scheduledStart, from), lt(bookings.scheduledStart, to)))
    .orderBy(asc(bookings.scheduledStart), asc(bookings.slotIndex));

  return rows.map(withTicket);
}

export type BookingFilters = {
  from?: string;
  to?: string;
  doctorId?: string;
  serviceId?: string;
  status?: string;
  q?: string;
};

/** The filtered bookings list. Everything is optional and combines with AND. */
export async function findBookings(filters: BookingFilters, limit = 200): Promise<AdminBooking[]> {
  const conditions = [];

  if (filters.from) conditions.push(gte(bookings.scheduledStart, manilaToUtc(filters.from, '00:00')));
  if (filters.to) conditions.push(lt(bookings.scheduledStart, manilaToUtc(addDays(filters.to, 1), '00:00')));
  if (filters.doctorId) conditions.push(eq(bookings.doctorId, filters.doctorId));
  if (filters.serviceId) conditions.push(eq(bookings.serviceId, filters.serviceId));
  if (filters.status) {
    conditions.push(
      filters.status === 'live'
        ? inArray(bookings.status, ['booked', 'arrived', 'no_show'])
        : eq(bookings.status, filters.status as AdminBooking['status']),
    );
  }

  // One box that searches either a reference code or a mobile number, because that is
  // what the front desk has in front of them: a phone, or a patient reading a code out.
  if (filters.q) {
    const term = filters.q.trim();
    if (term) {
      const digits = term.replace(/[^\d]/g, '');
      conditions.push(
        or(
          ilike(bookings.referenceCode, `%${term.toUpperCase()}%`),
          ilike(patients.fullName, `%${term}%`),
          ...(digits.length >= 4 ? [ilike(patients.mobile, `%${digits.slice(-9)}%`)] : []),
        )!,
      );
    }
  }

  const rows = await baseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.scheduledStart))
    .limit(limit);

  return rows.map(withTicket);
}

/** Counts for the Today screen's summary line. */
export async function getDayCounts(date: string) {
  const from = manilaToUtc(date, '00:00');
  const to = manilaToUtc(addDays(date, 1), '00:00');

  const rows = await db
    .select({ status: bookings.status, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(gte(bookings.scheduledStart, from), lt(bookings.scheduledStart, to)))
    .groupBy(bookings.status);

  const counts = { booked: 0, arrived: 0, no_show: 0, cancelled: 0, total: 0 };
  for (const row of rows) {
    counts.total += row.n;
    if (row.status === 'booked') counts.booked += row.n;
    else if (row.status === 'arrived') counts.arrived += row.n;
    else if (row.status === 'no_show') counts.no_show += row.n;
    else counts.cancelled += row.n;
  }
  return counts;
}

/** Bookings caught by a blackout, so staff know who to ring. */
export async function getBookingsAffectedByBlackout(
  date: string,
  target: { sessionId?: string; doctorId?: string },
): Promise<AdminBooking[]> {
  const from = manilaToUtc(date, '00:00');
  const to = manilaToUtc(addDays(date, 1), '00:00');

  const conditions = [
    gte(bookings.scheduledStart, from),
    lt(bookings.scheduledStart, to),
    inArray(bookings.status, ['booked', 'arrived']),
  ];
  if (target.sessionId) conditions.push(eq(bookings.sessionId, target.sessionId));
  if (target.doctorId) conditions.push(eq(bookings.doctorId, target.doctorId));

  const rows = await baseQuery().where(and(...conditions)).orderBy(asc(bookings.scheduledStart));
  return rows.map(withTicket);
}

export const todayInManila = () => manilaDateString();
