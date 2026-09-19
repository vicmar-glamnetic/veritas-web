'use client';

import { useEffect, useRef } from 'react';

/**
 * A confirmation step that appears as a modal when JavaScript is available, and
 * disappears entirely when it is not.
 *
 * The trick is that the visible button is a real `type="submit"` in the markup. With no
 * JavaScript, pressing it submits the form exactly as before. Once mounted, the click
 * handler intercepts and opens a native `<dialog>` instead, whose own button carries
 * `form="..."` so it submits the same form from outside it.
 *
 * `<dialog>.showModal()` brings the focus trap, the Escape key and the inert background
 * with it, which is why this is a dialog element rather than a div pretending to be one.
 */
export function ConfirmSubmit({
  formId,
  label,
  pendingLabel,
  pending,
  title,
  confirmLabel,
  cancelLabel = 'Go back',
  tone = 'primary',
  children,
}: {
  tone?: 'primary' | 'danger';
  formId: string;
  label: string;
  pendingLabel: string;
  pending: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** The summary shown inside the dialog. */
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Close the dialog once the submission is under way, so the pending state is visible.
  useEffect(() => {
    if (pending) dialogRef.current?.close();
  }, [pending]);

  const tones = {
    primary: 'bg-brand-700 hover:bg-brand-800',
    danger: 'bg-red-700 hover:bg-red-800',
  } as const;

  return (
    <>
      <button
        type="submit"
        form={formId}
        disabled={pending}
        onClick={(event) => {
          // With no JavaScript this never runs and the button submits normally. On an
          // old browser without <dialog>, showModal is missing and it does the same.
          const dialog = dialogRef.current;
          if (typeof dialog?.showModal !== 'function') return;
          event.preventDefault();
          dialog.showModal();
        }}
        className={`inline-flex min-h-[3.25rem] w-full items-center justify-center rounded px-5 py-3 text-base font-semibold text-white disabled:opacity-60 ${tones[tone]}`}
      >
        {pending ? pendingLabel : label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${formId}-confirm-title`}
        // m-auto because Tailwind's reset strips the auto margins a modal <dialog>
        // relies on to centre itself.
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded border border-line-strong bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
      >
        <div className="p-6">
          <h2 id={`${formId}-confirm-title`} className="font-serif text-xl text-ink-900">
            {title}
          </h2>
          <div className="mt-4">{children}</div>

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row-reverse">
            <button
              type="submit"
              form={formId}
              className={`inline-flex min-h-[3rem] flex-1 items-center justify-center rounded px-5 py-3 text-base font-semibold text-white ${tones[tone]}`}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-[3rem] flex-1 items-center justify-center rounded border border-line-strong bg-surface px-5 py-3 text-base font-semibold text-ink-900 hover:bg-surface-sunken"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
