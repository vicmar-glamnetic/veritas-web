'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { cancelByToken, type CancelState } from './actions';

const INITIAL: CancelState = { status: 'idle' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[3rem] w-full items-center justify-center rounded bg-red-700 px-5 py-3 text-base font-semibold text-white hover:bg-red-800 disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Cancelling…' : 'Yes, cancel this appointment'}
    </button>
  );
}

export function CancelPanel({
  token,
  alreadyCancelled,
  clinicPhone,
  telHref,
}: {
  token: string;
  alreadyCancelled: boolean;
  clinicPhone: string;
  telHref: string;
}) {
  const [state, formAction] = useActionState(cancelByToken, INITIAL);

  if (alreadyCancelled || state.status === 'cancelled' || state.status === 'already_cancelled') {
    const isFresh = state.status === 'cancelled';
    return (
      <div
        role="status"
        className="rounded border border-brand-200 bg-brand-50 px-5 py-6"
      >
        <p className="font-serif text-xl text-brand-900">
          {isFresh ? 'That is cancelled' : 'This appointment is already cancelled'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          {isFresh
            ? 'Thank you for letting us know. Someone else can have the slot now, and you do not need to do anything else.'
            : 'Nothing further to do. If you still need to be seen, please book again.'}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/book"
            className="inline-flex min-h-[3rem] items-center justify-center rounded bg-brand-700 px-5 py-3 text-base font-semibold text-white hover:bg-brand-800"
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
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.status === 'error' ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {state.message}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <p className="text-sm leading-relaxed text-ink-700">
        This frees the slot for another patient. You cannot undo it, but you are welcome
        to book again afterwards.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Submit />
        <Link
          href="/"
          className="inline-flex min-h-[3rem] items-center justify-center rounded border border-line bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
        >
          Keep my appointment
        </Link>
      </div>
    </form>
  );
}
