'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { login, type LoginState } from './actions';

const INITIAL: LoginState = { status: 'idle' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[3rem] w-full items-center justify-center rounded bg-brand-700 px-5 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(login, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === 'error' && state.message ? (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-ink-900">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={state.email ?? ''}
          className="mt-1.5 block w-full rounded border border-line-strong bg-surface px-3.5 py-3 text-base text-ink-900"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-ink-900">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 block w-full rounded border border-line-strong bg-surface px-3.5 py-3 text-base text-ink-900"
        />
      </div>

      <Submit />
    </form>
  );
}
