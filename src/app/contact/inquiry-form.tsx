'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { submitInquiry, type InquiryState } from './actions';

const INITIAL: InquiryState = { status: 'idle' };

const fieldClasses =
  'mt-1.5 block w-full rounded-lg border bg-surface px-3.5 py-3 text-base text-ink-900 placeholder:text-ink-400';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-brand-700 px-5 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Sending…' : 'Send message'}
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

export function InquiryForm() {
  const [state, formAction] = useActionState(submitInquiry, INITIAL);
  const errors = state.fieldErrors ?? {};

  if (state.status === 'success') {
    return (
      <div
        role="status"
        className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-6 text-brand-900"
      >
        <p className="text-lg font-bold">That has reached us</p>
        <p className="mt-2 text-sm leading-relaxed">{state.message}</p>
        <p className="mt-4 text-sm leading-relaxed">
          If it turns out to be urgent, please ring the clinic instead of waiting on our
          reply.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.status === 'error' && state.message ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {state.message}
        </div>
      ) : null}

      <Field id="name" label="Your name" error={errors.name}>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={`${fieldClasses} ${errors.name ? 'border-red-400' : 'border-line'}`}
        />
      </Field>

      <Field id="email" label="Email address" error={errors.email} hint="This is where our reply goes.">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : 'email-hint'}
          className={`${fieldClasses} ${errors.email ? 'border-red-400' : 'border-line'}`}
        />
      </Field>

      <Field
        id="mobile"
        label="Mobile number (optional)"
        error={errors.mobile}
        hint="Only if you would rather we rang or texted you."
      >
        <input
          id="mobile"
          name="mobile"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0917 123 4567"
          aria-describedby="mobile-hint"
          className={`${fieldClasses} ${errors.mobile ? 'border-red-400' : 'border-line'}`}
        />
      </Field>

      <Field id="message" label="Your message" error={errors.message}>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'message-error' : undefined}
          className={`${fieldClasses} ${errors.message ? 'border-red-400' : 'border-line'}`}
        />
      </Field>

      {/* Honeypot. Hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-sm leading-relaxed text-ink-500">
        We use what you write here only to answer you, and nothing else. Please keep
        medical details and test results out of it. More in our{' '}
        <Link href="/privacy" className="font-medium text-brand-700 underline underline-offset-2">
          privacy notice
        </Link>
        .
      </p>

      <SubmitButton />
    </form>
  );
}
