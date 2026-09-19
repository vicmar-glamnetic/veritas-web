import { formatMobile } from '@/lib/mobile';
import { formatManilaTime } from '@/lib/time';
import type { AdminBooking } from '@/lib/admin/queries';

import { setBookingStatus } from './actions';

/**
 * One booking, as the front desk sees it.
 *
 * The action buttons are plain forms posting a server action, so the screen works if
 * JavaScript has not loaded yet — which on the clinic's desktop, first thing in the
 * morning, it often has not.
 */
export function BookingRow({ booking, showDate }: { booking: AdminBooking; showDate?: string }) {
  const live = booking.status === 'booked';
  const cancelled = booking.status.startsWith('cancelled');

  return (
    <li className={`px-4 py-3.5 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-serif text-lg text-ink-900 tabular-nums">
              {formatManilaTime(booking.scheduledStart)}
            </span>
            <span className="font-semibold text-ink-900">{booking.patientName}</span>
            <StatusBadge status={booking.status} />
          </div>

          <p className="mt-1 text-sm text-ink-700">
            {booking.serviceName}
            {booking.doctorName ? ` · ${booking.doctorName}` : ''}
          </p>

          <p className="mt-0.5 text-sm text-ink-500">
            <a
              href={`tel:${booking.patientMobile}`}
              className="underline underline-offset-4 hover:text-ink-900"
            >
              {formatMobile(booking.patientMobile)}
            </a>
            <span className="mx-2 text-line-strong">|</span>
            <span className="font-mono text-xs tracking-wider">{booking.referenceCode}</span>
            {booking.ticket ? (
              <span className="ml-2 rounded bg-brand-700 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-white">
                {booking.ticket}
              </span>
            ) : null}
            {showDate ? <span className="ml-2 text-ink-400">{showDate}</span> : null}
          </p>

          {booking.notes ? (
            <p className="mt-1.5 rounded border-l-2 border-line-strong bg-surface-sunken px-3 py-1.5 text-sm text-ink-700">
              {booking.notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!cancelled ? (
            <>
              <StatusButton
                bookingId={booking.id}
                status="arrived"
                label="Arrived"
                active={booking.status === 'arrived'}
              />
              <StatusButton
                bookingId={booking.id}
                status="no_show"
                label="Did not come"
                active={booking.status === 'no_show'}
              />
              {live || booking.status === 'no_show' ? (
                <StatusButton bookingId={booking.id} status="cancelled_by_clinic" label="Cancel" tone="danger" />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StatusButton({
  bookingId,
  status,
  label,
  active,
  tone = 'normal',
}: {
  bookingId: string;
  status: 'arrived' | 'no_show' | 'cancelled_by_clinic';
  label: string;
  active?: boolean;
  tone?: 'normal' | 'danger';
}) {
  const classes = active
    ? 'border-brand-700 bg-brand-700 text-white'
    : tone === 'danger'
      ? 'border-line-strong bg-surface text-red-800 hover:border-red-300 hover:bg-red-50'
      : 'border-line-strong bg-surface text-ink-900 hover:border-brand-400 hover:bg-brand-50';

  return (
    <form action={setBookingStatus}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        aria-pressed={active ? true : undefined}
        className={`min-h-[2.5rem] rounded border px-3 py-1.5 text-sm font-semibold ${classes}`}
      >
        {label}
      </button>
    </form>
  );
}

export function StatusBadge({ status }: { status: AdminBooking['status'] }) {
  const map: Record<string, [string, string]> = {
    booked: ['Booked', 'bg-brand-50 text-brand-800 ring-brand-200'],
    arrived: ['Arrived', 'bg-green-50 text-green-900 ring-green-200'],
    no_show: ['Did not come', 'bg-accent-50 text-accent-800 ring-accent-200'],
    cancelled_by_patient: ['Cancelled by patient', 'bg-surface-sunken text-ink-500 ring-line-strong'],
    cancelled_by_clinic: ['Cancelled by clinic', 'bg-surface-sunken text-ink-500 ring-line-strong'],
  };
  const [label, classes] = map[status] ?? ['Unknown', 'bg-surface-sunken text-ink-500 ring-line'];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${classes}`}>
      {label}
    </span>
  );
}
