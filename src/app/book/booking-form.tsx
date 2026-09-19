'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { submitBooking, type BookingState } from './actions';

const INITIAL: BookingState = { status: 'idle' };

const fieldClasses =
  'mt-1.5 block w-full rounded border bg-surface px-3.5 py-3 text-base text-ink-900 placeholder:text-ink-400';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded bg-brand-700 px-5 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? 'Booking your slot…' : 'Confirm booking'}
    </button>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-900">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type BookingSlotDetails = {
  serviceId: string;
  doctorId: string | null;
  sessionId: string;
  startIso: string;
  serviceName: string;
  doctorName: string | null;
  /** Pre-rendered on the server so the client never does timezone maths. */
  whenLabel: string;
  prepInstructions: string | null;
};

export function BookingForm({
  slot,
  clinicName,
}: {
  slot: BookingSlotDetails;
  clinicName: string;
}) {
  const [state, formAction] = useActionState(submitBooking, INITIAL);

  if (state.status === 'booked') {
    return <Confirmation state={state} whenLabel={slot.whenLabel} />;
  }

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const message = state.status === 'error' ? state.message : undefined;
  // Put back what was typed, so a rejected form does not have to be filled in twice.
  const prior = state.status === 'error' ? state.values : undefined;

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="serviceId" value={slot.serviceId} />
      <input type="hidden" name="doctorId" value={slot.doctorId ?? ''} />
      <input type="hidden" name="sessionId" value={slot.sessionId} />
      <input type="hidden" name="start" value={slot.startIso} />

      {message ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {message}
        </div>
      ) : null}

      <Field id="fullName" label="Your full name" error={errors.fullName}>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          defaultValue={prior?.fullName ?? ''}
          autoComplete="name"
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          className={`${fieldClasses} ${errors.fullName ? 'border-red-400' : 'border-line-strong'}`}
        />
      </Field>

      <Field
        id="mobile"
        label="Mobile number"
        error={errors.mobile}
        hint="So we can reach you if the doctor is called away."
      >
        <input
          id="mobile"
          name="mobile"
          type="tel"
          required
          defaultValue={prior?.mobile ?? ''}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          aria-invalid={errors.mobile ? true : undefined}
          aria-describedby={errors.mobile ? 'mobile-error' : 'mobile-hint'}
          className={`${fieldClasses} ${errors.mobile ? 'border-red-400' : 'border-line-strong'}`}
        />
      </Field>

      <Field
        id="email"
        label="Email address"
        error={errors.email}
        hint="Your reference code is sent here."
      >
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={prior?.email ?? ''}
          inputMode="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : 'email-hint'}
          className={`${fieldClasses} ${errors.email ? 'border-red-400' : 'border-line-strong'}`}
        />
      </Field>

      <Field
        id="notes"
        label="Anything we should know? (optional)"
        error={errors.notes}
        hint="Keep it short. This is not a medical record and no doctor reads it before you arrive."
      >
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={prior?.notes ?? ''}
          aria-describedby="notes-hint"
          className={`${fieldClasses} ${errors.notes ? 'border-red-400' : 'border-line-strong'}`}
        />
      </Field>

      {/* Honeypot. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div
        className={`rounded border px-4 py-3.5 ${
          errors.consent ? 'border-red-300 bg-red-50' : 'border-line bg-surface-sunken'
        }`}
      >
        <div className="flex gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            defaultChecked={prior?.consent ?? false}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? 'consent-error' : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-brand-700"
          />
          <label htmlFor="consent" className="text-sm leading-relaxed text-ink-700">
            I agree to {clinicName} holding the details above so it can book and manage
            this appointment, as described in the{' '}
            <Link
              href="/privacy"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              privacy notice
            </Link>
            .
          </label>
        </div>
        {errors.consent ? (
          <p id="consent-error" className="mt-2 text-sm font-medium text-red-700">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      <p className="text-sm leading-relaxed text-ink-500">
        Nothing is charged now. You pay at the clinic on the day.
      </p>
    </form>
  );
}

function Confirmation({
  state,
  whenLabel,
}: {
  state: Extract<BookingState, { status: 'booked' }>;
  whenLabel: string;
}) {
  return (
    <div>
      <div
        role="status"
        className="rounded border border-brand-200 bg-brand-50 px-5 py-6 text-center"
      >
        <p className="text-xs font-semibold tracking-[0.16em] text-brand-700 uppercase">
          You are booked
        </p>
        <p className="mt-3 text-xs font-bold tracking-widest text-brand-700 uppercase">
          Reference code
        </p>
        <p className="mt-1 font-serif text-4xl tracking-wider text-brand-900">
          {state.referenceCode}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-700">
          Write this down or take a screenshot. Give it at the front desk when you arrive.
        </p>
      </div>

      <dl className="mt-6 divide-y divide-line rounded border border-line">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ink-500">What</dt>
          <dd className="text-sm font-semibold text-ink-900">{state.serviceName}</dd>
        </div>
        {state.doctorName ? (
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-ink-500">Who</dt>
            <dd className="text-sm font-semibold text-ink-900">{state.doctorName}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ink-500">When</dt>
          <dd className="text-right text-sm font-semibold text-ink-900">{whenLabel}</dd>
        </div>
      </dl>

      {state.prepInstructions ? (
        <div className="mt-5 rounded border border-accent-200 bg-accent-50 px-4 py-3.5">
          <p className="text-sm font-bold text-accent-800">Before you come</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{state.prepInstructions}</p>
        </div>
      ) : null}

      <div
        className={`mt-5 rounded border px-4 py-3.5 text-sm leading-relaxed ${
          state.emailSent
            ? 'border-line bg-surface-sunken text-ink-700'
            : 'border-accent-200 bg-accent-50 text-accent-800'
        }`}
      >
        {state.emailSent ? (
          <>
            We have emailed the details and a cancellation link to{' '}
            <strong className="font-semibold">{state.emailAddress}</strong>. If it is not
            there in a few minutes, check your spam folder.
          </>
        ) : (
          <>
            <strong className="font-semibold">
              Your booking is confirmed, but we could not send the email.
            </strong>{' '}
            That does not affect your appointment. The reference code above is the part
            that matters, so please write it down. Ring the clinic if you need to cancel.
          </>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex min-h-[3rem] items-center justify-center rounded border border-line bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
        >
          Back to the home page
        </Link>
        <Link
          href={`/booking/${state.referenceCode}`}
          className="inline-flex min-h-[3rem] items-center justify-center rounded border border-line bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
        >
          View or cancel this booking
        </Link>
      </div>
    </div>
  );
}
