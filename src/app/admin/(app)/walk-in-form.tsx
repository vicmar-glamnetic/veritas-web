'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { QUEUE_CATEGORIES } from '@/lib/queue';

import { Field, Input, Select } from './ui';
import { addWalkIn, type WalkInState } from './walk-in-actions';

const INITIAL: WalkInState = { status: 'idle' };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[2.5rem] items-center justify-center rounded border border-brand-700 bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? 'Adding…' : 'Give them a number'}
    </button>
  );
}

/**
 * Somebody at the desk with no appointment. Name and mobile make a walk-in patient
 * record, so the clinic knows afterwards who held the number.
 *
 * The doctor select is always present rather than revealed by script, so the form works
 * with JavaScript off; the server ignores it for laboratory and imaging.
 */
export function WalkInForm({ doctors }: { doctors: { id: string; fullName: string }[] }) {
  const [state, action] = useActionState(addWalkIn, INITIAL);
  const values = state.status === 'error' ? state.values : null;

  return (
    // Folded away until needed, and open again whenever there is a result to read — with
    // JavaScript off the page comes back from the server, and a closed <details> would
    // hide the number that was just issued.
    <details open={state.status !== 'idle'} className="mt-5 rounded border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-900">
        Add a walk-in
        <span className="ml-2 font-normal text-ink-500">
          Somebody at the desk with no appointment
        </span>
      </summary>
      <div className="border-t border-line p-4">
        <form
          action={action}
          // A fresh form after each success, so the next walk-in starts empty.
          key={state.status === 'success' ? state.message : 'form'}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {state.status !== 'idle' ? (
            <p
              role={state.status === 'error' ? 'alert' : 'status'}
              className={`rounded border px-4 py-3 text-sm font-medium sm:col-span-2 lg:col-span-4 ${
                state.status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-brand-200 bg-brand-50 text-brand-900'
              }`}
            >
              {state.message}
            </p>
          ) : null}

          <Field label="Name">
            <Input
              name="fullName"
              defaultValue={values?.fullName ?? ''}
              required
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Field label="Mobile">
            <Input
              name="mobile"
              type="tel"
              inputMode="tel"
              defaultValue={values?.mobile ?? ''}
              required
              placeholder="0917 123 4567"
              autoComplete="off"
            />
          </Field>
          <Field label="Here for">
            <Select name="category" defaultValue={values?.category ?? 'consultation'}>
              {QUEUE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Doctor" hint="Consultations only.">
            <Select name="doctorId" defaultValue={values?.doctorId ?? ''}>
              <option value="">First available</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <AddButton />
          </div>
        </form>
      </div>
    </details>
  );
}
