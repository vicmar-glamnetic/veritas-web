'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { ConfirmSubmit } from '@/components/confirm-dialog';

/**
 * A trigger that opens a dialog holding whatever form is passed to it.
 *
 * The trigger is a real link to a server-rendered URL (`?edit=<id>`, `?new=1`), so with
 * JavaScript off it navigates and the page renders the same form inline. The click
 * handler only takes over once a native `<dialog>` exists.
 *
 * These lists are short, so each row carries its own dialog. The services table has
 * thirty-eight rows and builds one shared dialog instead.
 */
export function RowDialog({
  href,
  trigger,
  title,
  triggerClassName,
  children,
}: {
  href: string;
  trigger: React.ReactNode;
  title: string;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <a
        href={href}
        onClick={(event) => {
          if (typeof dialogRef.current?.showModal !== 'function') return;
          event.preventDefault();
          setOpen(true);
        }}
        className={triggerClassName}
      >
        {trigger}
      </a>

      <dialog
        ref={dialogRef}
        // Only react to THIS dialog closing. React treats onClose as a bubbling event,
        // so without the guard the nested delete confirmation closing also tore down the
        // edit dialog around it, losing whatever had been typed.
        onClose={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        aria-label={title}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded border border-line-strong bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="font-serif text-xl text-ink-900">{title}</h2>
          <div className="mt-5">{children}</div>
          <div className="mt-5 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-ink-500 underline underline-offset-4 hover:text-ink-900"
            >
              Close without saving
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * A submit button that asks first. Use inside the form it submits, so it can read the
 * pending state.
 */
export function ConfirmDeleteButton({
  formId,
  label,
  title,
  confirmLabel,
  children,
}: {
  formId: string;
  label: string;
  title: string;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <ConfirmSubmit
      formId={formId}
      pending={pending}
      tone="danger"
      label={label}
      pendingLabel="Removing…"
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel="Keep it"
    >
      {children}
    </ConfirmSubmit>
  );
}

/**
 * The delete control inside an edit dialog.
 *
 * Its own form, because a form cannot be nested inside the save form. Set apart visually
 * so it is never the button you hit by accident while saving.
 */
export function DeleteZone({
  action,
  id,
  formId,
  label,
  title,
  warning,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  formId: string;
  label: string;
  title: string;
  warning: React.ReactNode;
}) {
  return (
    <form action={action} id={formId} className="mt-6 border-t border-line pt-5">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Deleting is permanent. If it has ever been used, deactivate it instead.
        </p>
        <DeleteButton formId={formId} label={label} title={title} warning={warning} />
      </div>
    </form>
  );
}

function DeleteButton({
  formId,
  label,
  title,
  warning,
}: {
  formId: string;
  label: string;
  title: string;
  warning: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <ConfirmSubmit
      formId={formId}
      pending={pending}
      tone="danger"
      label={label}
      pendingLabel="Deleting…"
      title={title}
      confirmLabel="Yes, delete it"
      cancelLabel="Keep it"
    >
      {warning}
    </ConfirmSubmit>
  );
}
