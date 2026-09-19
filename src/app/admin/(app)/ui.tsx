import type { ReactNode } from 'react';

/** Shared furniture for the admin forms, so seven screens do not drift apart. */

export function PageTitle({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">{title}</h1>
        {lead ? <p className="mt-1 max-w-2xl text-sm text-ink-500">{lead}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-line bg-surface">
      {title ? (
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-serif text-lg text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const inputClasses =
  'mt-1.5 block w-full rounded border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400';

/**
 * A labelled control.
 *
 * The control is WRAPPED by the <label>, not linked to it by id. These screens repeat
 * the same form once per row, so any id derived from the field name is duplicated
 * across the page: `htmlFor` then points at whichever one the browser found first, or
 * at nothing, and the label stops working. Nesting cannot come apart that way.
 */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-semibold text-ink-900">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      {children}
    </label>
  );
}

/** `id` is optional and only for anchors or tests; labelling comes from the wrapper. */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  return <input {...props} className={`${inputClasses} ${props.className ?? ''}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string },
) {
  return <textarea {...props} className={`${inputClasses} ${props.className ?? ''}`} />;
}

export function Select({
  name,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; children: ReactNode }) {
  return (
    <select name={name} {...rest} className={inputClasses}>
      {children}
    </select>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink-900">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4.5 w-4.5 rounded border-line-strong accent-brand-700"
      />
      {label}
    </label>
  );
}

export function Button({
  children,
  tone = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger' }) {
  const tones = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 border-brand-700',
    secondary: 'bg-surface text-ink-900 hover:bg-surface-sunken border-line-strong',
    danger: 'bg-surface text-red-800 hover:bg-red-50 border-line-strong hover:border-red-300',
  } as const;
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[2.5rem] items-center justify-center rounded border px-4 py-2 text-sm font-semibold ${tones[tone]} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** Flash message driven by a `?done=` or `?error=` search param. */
export function Flash({ done, error }: { done?: string; error?: string }) {
  if (!done && !error) return null;
  return (
    <p
      role="status"
      className={`mb-5 rounded border px-4 py-3 text-sm font-medium ${
        error
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-brand-200 bg-brand-50 text-brand-900'
      }`}
    >
      {error ?? done}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-line bg-surface px-5 py-10 text-center text-ink-500">
      {children}
    </p>
  );
}
