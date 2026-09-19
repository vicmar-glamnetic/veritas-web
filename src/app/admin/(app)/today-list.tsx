'use client';

import { useMemo, useState } from 'react';

import { setBookingStatus } from './actions';

/**
 * Today's list, with a filter box.
 *
 * Everything is pre-formatted on the server, so no timezone maths happens here. The
 * filter is client-side because the commonest moment at a front desk is a patient
 * standing there while you find them; a round trip per keystroke is the wrong feel.
 * With no JavaScript the filter simply does nothing and the full list is still there.
 */

export type TodayBooking = {
  id: string;
  referenceCode: string;
  /** The queue number issued at check-in, e.g. "C-014". Null until marked arrived. */
  ticket: string | null;
  status: string;
  time: string;
  patientName: string;
  mobileDisplay: string;
  mobileHref: string;
  serviceName: string;
  doctorName: string | null;
  notes: string | null;
  prepInstructions: string | null;
  /** Already started, in Manila. Used to dim the morning as the day goes on. */
  isPast: boolean;
};

export function TodayList({
  bookings,
  cancelId,
  dateParam,
}: {
  bookings: TodayBooking[];
  cancelId?: string;
  dateParam: string;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!term) return bookings;
    const digits = term.replace(/\D/g, '');
    return bookings.filter(
      (b) =>
        b.patientName.toLowerCase().includes(term) ||
        b.referenceCode.toLowerCase().includes(term) ||
        (b.ticket?.toLowerCase().includes(term) ?? false) ||
        b.serviceName.toLowerCase().includes(term) ||
        (digits.length >= 3 && b.mobileDisplay.replace(/\D/g, '').includes(digits)),
    );
  }, [bookings, term]);

  // The next patient who has not been seen yet, so the desk knows who to call.
  const nextUpId = shown.find((b) => b.status === 'booked' && !b.isPast)?.id;

  return (
    <div>
      <div className="mb-4">
        <label className="block">
          <span className="block text-sm font-semibold text-ink-900">Find someone on this list</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, reference code or mobile number"
            className="mt-1.5 block w-full max-w-md rounded border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400"
          />
        </label>
        {term ? (
          <p aria-live="polite" className="mt-1.5 text-sm text-ink-500">
            {shown.length} of {bookings.length} shown
          </p>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="rounded border border-line bg-surface px-5 py-10 text-center text-ink-500">
          Nobody on this list matches that.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {shown.map((b) => (
            <Row
              key={b.id}
              booking={b}
              isNextUp={b.id === nextUpId}
              confirmingCancel={cancelId === b.id}
              dateParam={dateParam}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  booking: b,
  isNextUp,
  confirmingCancel,
  dateParam,
}: {
  booking: TodayBooking;
  isNextUp: boolean;
  confirmingCancel: boolean;
  dateParam: string;
}) {
  const cancelled = b.status.startsWith('cancelled');
  const settled = b.status === 'arrived' || b.status === 'no_show';

  return (
    <li
      className={`relative px-4 py-3.5 ${cancelled ? 'opacity-55' : ''} ${
        isNextUp ? 'bg-brand-50/60' : b.isPast && !settled ? 'bg-accent-50/40' : ''
      }`}
    >
      {isNextUp ? (
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0 w-1 bg-brand-600"
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-serif text-lg text-ink-900 tabular-nums">{b.time}</span>
            {/* The queue number, loud, because it is what reception reads out to the
                patient the moment they are checked in. */}
            {b.ticket ? (
              <span className="mr-2 rounded bg-brand-700 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-white">
                {b.ticket}
              </span>
            ) : null}
            <span className="font-semibold text-ink-900">{b.patientName}</span>
            <StatusBadge status={b.status} />
            {isNextUp ? (
              <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
                Next up
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-ink-700">
            {b.serviceName}
            {b.doctorName ? ` · ${b.doctorName}` : ''}
          </p>

          <p className="mt-0.5 text-sm text-ink-500">
            <a href={b.mobileHref} className="underline underline-offset-4 hover:text-ink-900">
              {b.mobileDisplay}
            </a>
            <span className="mx-2 text-line-strong">|</span>
            <span className="font-mono text-xs tracking-wider">{b.referenceCode}</span>
          </p>

          {b.prepInstructions && !settled && !cancelled ? (
            <p className="mt-1.5 rounded border-l-2 border-accent-200 bg-accent-50 px-3 py-1.5 text-sm text-accent-800">
              <span className="font-semibold">Ask before the test: </span>
              {b.prepInstructions}
            </p>
          ) : null}

          {b.notes ? (
            <p className="mt-1.5 rounded border-l-2 border-line-strong bg-surface-sunken px-3 py-1.5 text-sm text-ink-700">
              <span className="font-semibold">Patient wrote: </span>
              {b.notes}
            </p>
          ) : null}
        </div>

        {!cancelled ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Arrived is what happens to nearly every row, so it is the loud one. */}
            <StatusForm
              id={b.id}
              dateParam={dateParam}
              status="arrived"
              label={b.status === 'arrived' ? 'Arrived ✓' : 'Arrived'}
              variant={b.status === 'arrived' ? 'done' : 'primary'}
            />
            <StatusForm
              id={b.id}
              dateParam={dateParam}
              status="no_show"
              label={b.status === 'no_show' ? 'Did not come ✓' : 'Did not come'}
              variant={b.status === 'no_show' ? 'done' : 'quiet'}
            />
            <a
              href={`/admin?date=${dateParam}&cancel=${b.id}#b-${b.id}`}
              className="min-h-[2.5rem] rounded border border-transparent px-2 py-1.5 text-sm text-ink-500 underline underline-offset-4 hover:text-red-800"
            >
              Cancel
            </a>
          </div>
        ) : null}
      </div>

      {confirmingCancel ? (
        <form
          id={`b-${b.id}`}
          action={setBookingStatus}
          className="mt-4 rounded border border-red-200 bg-red-50 p-4"
        >
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="status" value="cancelled_by_clinic" />
          <input type="hidden" name="date" value={dateParam} />
          <p className="text-sm font-semibold text-red-800">
            Cancel {b.patientName}&rsquo;s {b.serviceName} at {b.time}?
          </p>
          <label className="mt-3 block">
            <span className="block text-sm font-medium text-ink-900">
              Why? (optional, kept on the record)
            </span>
            <input
              name="reason"
              maxLength={300}
              placeholder="Doctor called to an emergency"
              className="mt-1 block w-full max-w-md rounded border border-line-strong bg-surface px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              className="min-h-[2.5rem] rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
            >
              Yes, cancel it
            </button>
            <a
              href={`/admin?date=${dateParam}`}
              className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
            >
              Keep it
            </a>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function StatusForm({
  id,
  status,
  label,
  variant,
  dateParam,
}: {
  id: string;
  status: 'arrived' | 'no_show';
  label: string;
  variant: 'primary' | 'quiet' | 'done';
  dateParam: string;
}) {
  const classes = {
    primary: 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800',
    quiet: 'border-line-strong bg-surface text-ink-700 hover:bg-surface-sunken',
    done: 'border-brand-200 bg-brand-50 text-brand-800',
  }[variant];

  return (
    <form action={setBookingStatus}>
      <input type="hidden" name="bookingId" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="date" value={dateParam} />
      <button
        type="submit"
        className={`min-h-[2.5rem] rounded border px-3.5 py-1.5 text-sm font-semibold ${classes}`}
      >
        {label}
      </button>
    </form>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    booked: ['Expected', 'bg-surface-sunken text-ink-700 ring-line-strong'],
    arrived: ['Arrived', 'bg-brand-50 text-brand-800 ring-brand-200'],
    no_show: ['Did not come', 'bg-accent-50 text-accent-800 ring-accent-200'],
    cancelled_by_patient: ['Cancelled by patient', 'bg-surface-sunken text-ink-500 ring-line'],
    cancelled_by_clinic: ['Cancelled by clinic', 'bg-surface-sunken text-ink-500 ring-line'],
  };
  const [label, classes] = map[status] ?? ['Unknown', 'bg-surface-sunken text-ink-500 ring-line'];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${classes}`}>
      {label}
    </span>
  );
}
