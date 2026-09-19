'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { cancelFromLookup, lookupBooking, type LookupState } from './actions';

const INITIAL: LookupState = { status: 'idle' };

const fieldClasses =
  'mt-1.5 block w-full rounded border bg-surface px-3.5 py-3 text-base text-ink-900 placeholder:text-ink-400';

function Submit({ label, busy, tone = 'primary' }: { label: string; busy: string; tone?: 'primary' | 'danger' }) {
  const { pending } = useFormStatus();
  const tones = {
    primary: 'bg-brand-700 hover:bg-brand-800',
    danger: 'bg-red-700 hover:bg-red-800',
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-[3rem] w-full items-center justify-center rounded px-5 py-3 text-base font-semibold text-white disabled:opacity-60 sm:w-auto ${tones[tone]}`}
    >
      {pending ? busy : label}
    </button>
  );
}

export function BookingLookup({
  reference,
  clinicPhone,
  telHref,
}: {
  reference: string;
  clinicPhone: string;
  telHref: string;
}) {
  const [state, formAction] = useActionState(lookupBooking, INITIAL);

  if (state.status === 'found') {
    return (
      <BookingDetails
        initial={state}
        reference={reference}
        clinicPhone={clinicPhone}
        telHref={telHref}
      />
    );
  }

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.status === 'error' && state.message ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="reference" className="block text-sm font-semibold text-ink-900">
          Reference code
        </label>
        <input
          id="reference"
          name="reference"
          type="text"
          required
          defaultValue={reference}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="VRT-7K4Q"
          aria-invalid={errors.reference ? true : undefined}
          className={`${fieldClasses} font-semibold tracking-wider ${errors.reference ? 'border-red-400' : 'border-line-strong'}`}
        />
        {errors.reference ? (
          <p className="mt-1.5 text-sm font-medium text-red-700">{errors.reference}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="mobile" className="block text-sm font-semibold text-ink-900">
          Mobile number you booked with
        </label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          aria-invalid={errors.mobile ? true : undefined}
          className={`${fieldClasses} ${errors.mobile ? 'border-red-400' : 'border-line-strong'}`}
        />
        {errors.mobile ? (
          <p className="mt-1.5 text-sm font-medium text-red-700">{errors.mobile}</p>
        ) : null}
      </div>

      <Submit label="Find my booking" busy="Looking…" />

      <p className="text-sm leading-relaxed text-ink-500">
        Cannot find your code? It is in your confirmation email. Or ring the clinic on{' '}
        <a className="font-semibold text-brand-700 underline underline-offset-4" href={telHref}>
          {clinicPhone}
        </a>
        .
      </p>
    </form>
  );
}

function BookingDetails({
  initial,
  reference,
  clinicPhone,
  telHref,
}: {
  initial: Extract<LookupState, { status: 'found' }>;
  reference: string;
  clinicPhone: string;
  telHref: string;
}) {
  const [state, formAction] = useActionState(cancelFromLookup, initial);

  const booking = state.status === 'found' ? state.booking : initial.booking;
  const justCancelled = state.status === 'found' ? state.justCancelled : false;
  const errorMessage = state.status === 'error' ? state.message : undefined;

  const start = new Date(booking.scheduledStartIso);
  const when = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(start);

  const canCancel = !booking.isCancelled && !booking.isPast && booking.status !== 'arrived';

  return (
    <div>
      {justCancelled ? (
        <div
          role="status"
          className="mb-5 rounded border border-brand-200 bg-brand-50 px-4 py-3.5 text-sm leading-relaxed text-brand-900"
        >
          <strong className="font-semibold">That is cancelled.</strong> Thank you for
          letting us know, someone else can have the slot now. You do not need to do
          anything else.
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mb-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="font-serif text-xl tracking-wider text-ink-900">
            {booking.referenceCode}
          </p>
          <StatusPill status={booking.status} isPast={booking.isPast} />
        </div>
        <dl className="divide-y divide-line">
          <Row label="Name">{booking.patientFirstName}</Row>
          <Row label="What">{booking.serviceName}</Row>
          {booking.doctorName ? <Row label="Who">{booking.doctorName}</Row> : null}
          <Row label="When">{when}</Row>
        </dl>
      </div>

      {booking.prepInstructions && canCancel ? (
        <div className="mt-5 rounded border border-accent-200 bg-accent-50 px-4 py-3.5">
          <p className="text-sm font-bold text-accent-800">Before you come</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            {booking.prepInstructions}
          </p>
        </div>
      ) : null}

      {canCancel ? (
        <form action={formAction} className="mt-6 rounded border border-line px-4 py-4">
          <h2 className="text-sm font-bold text-ink-900">Cannot make it?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Cancelling frees the slot for someone else. You cannot undo this, but you can
            book again afterwards.
          </p>
          <input type="hidden" name="reference" value={booking.referenceCode} />
          <div className="mt-4">
            <label htmlFor="cancel-mobile" className="block text-sm font-semibold text-ink-900">
              Confirm your mobile number to cancel
            </label>
            <input
              id="cancel-mobile"
              name="mobile"
              type="tel"
              required
              inputMode="tel"
              placeholder="0917 123 4567"
              className={`${fieldClasses} border-line`}
            />
          </div>
          <div className="mt-4">
            <Submit label="Cancel this appointment" busy="Cancelling…" tone="danger" />
          </div>
        </form>
      ) : (
        <div className="mt-6 rounded border border-line bg-surface-sunken px-4 py-4 text-sm leading-relaxed text-ink-700">
          {booking.isCancelled
            ? 'This appointment is cancelled. If you still need to be seen, please book again or ring the clinic.'
            : booking.status === 'arrived'
              ? 'You have already been marked as arrived for this appointment.'
              : 'This appointment has passed.'}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/book"
          className="inline-flex min-h-[3rem] items-center justify-center rounded border border-line bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
        >
          Book another appointment
        </Link>
        <a
          href={telHref}
          className="inline-flex min-h-[3rem] items-center justify-center rounded border border-line bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
        >
          Ring {clinicPhone}
        </a>
      </div>

      <p className="sr-only">Reference {reference}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-ink-900">{children}</dd>
    </div>
  );
}

function StatusPill({ status, isPast }: { status: string; isPast: boolean }) {
  const [label, classes] = status.startsWith('cancelled')
    ? ['Cancelled', 'bg-red-50 text-red-800 ring-red-200']
    : status === 'arrived'
      ? ['Arrived', 'bg-brand-50 text-brand-800 ring-brand-200']
      : status === 'no_show'
        ? ['Missed', 'bg-accent-50 text-accent-800 ring-accent-200']
        : isPast
          ? ['Past', 'bg-surface-sunken text-ink-500 ring-line']
          : ['Booked', 'bg-brand-50 text-brand-800 ring-brand-200'];

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${classes}`}>{label}</span>
  );
}
