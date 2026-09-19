import type { Metadata } from 'next';
import Link from 'next/link';

import { getBookingsForDate, getDayCounts, todayInManila } from '@/lib/admin/queries';
import { requireStaff } from '@/lib/auth';
import { formatMobile, telHref } from '@/lib/mobile';
import { addDays, formatManilaDate, formatManilaTime, manilaToUtc } from '@/lib/time';

import { TodayList, type TodayBooking } from './today-list';
import { Flash } from './ui';

export const metadata: Metadata = { title: 'Today' };
// The front desk must never see a cached list.
export const dynamic = 'force-dynamic';

/**
 * The screen staff open every morning.
 *
 * Defaults to today in Manila but takes a `date`, so the desk can look at tomorrow the
 * afternoon before, which is when they ring people about fasting.
 *
 * All the formatting happens here, on the server, and the list component receives
 * strings. Nothing in the browser does timezone arithmetic.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; denied?: string; done?: string; error?: string; cancel?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;

  const today = todayInManila();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today;
  const isToday = date === today;

  const [{ live, cancelled }, counts] = await Promise.all([
    loadDay(date, isToday),
    getDayCounts(date),
  ]);
  const seen = counts.arrived + counts.no_show;
  const expected = counts.booked + seen;
  const progress = expected === 0 ? 0 : Math.round((seen / expected) * 100);

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

      <Flash done={params.done} error={params.error} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-ink-900">
            {isToday ? 'Today' : formatManilaDate(manilaToUtc(date, '12:00'))}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {isToday ? (
              formatManilaDate(manilaToUtc(date, '12:00'))
            ) : (
              <Link href="/admin" className="text-brand-700 underline underline-offset-4">
                Back to today
              </Link>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <DateLink date={addDays(date, -1)} label="← Previous" />
          {!isToday ? <DateLink date={today} label="Today" /> : null}
          <DateLink date={addDays(date, 1)} label="Next →" />
        </div>
      </div>

      {/* How far through the day the desk is, at a glance. */}
      <div className="mt-5 rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-sm font-semibold text-ink-900">
            {expected === 0
              ? 'Nothing booked'
              : `${seen} of ${expected} seen`}
            {counts.cancelled > 0 ? (
              <span className="ml-2 font-normal text-ink-500">
                · {counts.cancelled} cancelled
              </span>
            ) : null}
          </p>
          <p className="text-sm text-ink-500">
            {counts.arrived} arrived · {counts.no_show} did not come · {counts.booked} still
            expected
          </p>
        </div>
        <div
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Patients seen so far"
        >
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-6">
        {live.length === 0 ? (
          <p className="rounded border border-line bg-surface px-5 py-12 text-center text-ink-500">
            Nothing booked for this day.
            <br />
            <Link href="/admin/bookings" className="text-brand-700 underline underline-offset-4">
              Search all bookings
            </Link>
          </p>
        ) : (
          <TodayList bookings={live} cancelId={params.cancel} dateParam={date} />
        )}
      </div>

      {cancelled.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-ink-700">
            {cancelled.length} cancelled {cancelled.length === 1 ? 'booking' : 'bookings'}
          </summary>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {cancelled.map((b) => (
              <li key={b.id} className="px-4 py-3 text-sm text-ink-500">
                <span className="tabular-nums">{formatManilaTime(b.scheduledStart)}</span>
                <span className="mx-2">·</span>
                {b.patientName}
                <span className="mx-2">·</span>
                {b.serviceName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
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

/**
 * Fetch and format the day. Kept out of the component because reading the clock during
 * render is exactly the impurity the React lint rules are there to catch, even though
 * this page is force-dynamic and only ever renders on the server.
 */
async function loadDay(date: string, isToday: boolean) {
  const list = await getBookingsForDate(date);
  const now = Date.now();

  const live: TodayBooking[] = list
    .filter((b) => !b.status.startsWith('cancelled'))
    .map((b) => ({
      id: b.id,
      referenceCode: b.referenceCode,
      ticket: b.ticket,
      status: b.status,
      time: formatManilaTime(b.scheduledStart),
      patientName: b.patientName,
      mobileDisplay: formatMobile(b.patientMobile),
      mobileHref: telHref(b.patientMobile),
      serviceName: b.serviceName,
      doctorName: b.doctorName,
      notes: b.notes,
      prepInstructions: b.prepInstructions,
      isPast: isToday && b.scheduledStart.getTime() < now,
    }));

  return { live, cancelled: list.filter((b) => b.status.startsWith('cancelled')) };
}
