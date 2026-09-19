import type { Metadata } from 'next';
import Link from 'next/link';

import { getBookingsForDate, getDayCounts, todayInManila } from '@/lib/admin/queries';
import { requireStaff } from '@/lib/auth';
import { addDays, formatManilaDate, manilaToUtc } from '@/lib/time';

import { BookingRow } from './booking-row';

export const metadata: Metadata = { title: 'Today' };
// The front desk must never see a cached list.
export const dynamic = 'force-dynamic';

/**
 * The screen staff open every morning.
 *
 * Defaults to today in Manila, but takes a `date` so the desk can look at tomorrow's
 * list the afternoon before, which is when they ring people about fasting.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; denied?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;

  const today = todayInManila();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today;

  const [list, counts] = await Promise.all([getBookingsForDate(date), getDayCounts(date)]);
  const live = list.filter((b) => !b.status.startsWith('cancelled'));
  const cancelled = list.filter((b) => b.status.startsWith('cancelled'));

  return (
    <div>
      {params.denied ? (
        <p
          role="alert"
          className="mb-5 rounded border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-800"
        >
          That area is for admin accounts only.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-ink-900">
            {date === today ? 'Today' : formatManilaDate(manilaToUtc(date, '12:00'))}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {date === today ? formatManilaDate(manilaToUtc(date, '12:00')) : null}
            {date !== today ? (
              <Link href="/admin" className="text-brand-700 underline underline-offset-4">
                Back to today
              </Link>
            ) : null}
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <DateLink date={addDays(date, -1)} label="Previous day" />
          <DateLink date={addDays(date, 1)} label="Next day" />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
        <Stat label="Expected" value={counts.booked} />
        <Stat label="Arrived" value={counts.arrived} />
        <Stat label="Did not come" value={counts.no_show} />
        <Stat label="Cancelled" value={counts.cancelled} />
      </dl>

      {live.length === 0 ? (
        <p className="mt-8 rounded border border-line bg-surface px-5 py-10 text-center text-ink-500">
          Nothing booked for this day.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {live.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </ul>
      )}

      {cancelled.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-ink-700">
            {cancelled.length} cancelled {cancelled.length === 1 ? 'booking' : 'bookings'}
          </summary>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {cancelled.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs font-semibold tracking-[0.12em] text-ink-400 uppercase">{label}</dt>
      <dd className="mt-1 font-serif text-2xl text-ink-900 tabular-nums">{value}</dd>
    </div>
  );
}

function DateLink({ date, label }: { date: string; label: string }) {
  return (
    <Link
      href={`/admin?date=${date}`}
      className="rounded border border-line-strong bg-surface px-3 py-2 font-medium text-ink-900 hover:bg-surface-sunken"
    >
      {label}
    </Link>
  );
}
