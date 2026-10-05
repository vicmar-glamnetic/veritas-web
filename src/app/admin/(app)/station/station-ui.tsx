'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

const REFRESH_MS = 15_000;

/**
 * Keeps the line current as reception marks people arrived, without the page flashing.
 * With JavaScript off the <noscript> meta refresh does the same job. React 19 hoists a
 * bare <meta> into <head>, so it goes in as raw HTML, exactly as the board does it.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return <noscript dangerouslySetInnerHTML={{ __html: '<meta http-equiv="refresh" content="30">' }} />;
}

const TONES = {
  primary:
    'border-brand-700 bg-brand-700 text-white hover:bg-brand-800 disabled:border-line-strong disabled:bg-surface-sunken disabled:text-ink-400',
  secondary:
    'border-line-strong bg-surface text-ink-900 hover:bg-surface-sunken disabled:text-ink-400',
  quiet: 'border-transparent bg-transparent text-brand-700 underline underline-offset-4 hover:text-brand-800 disabled:text-ink-400',
} as const;

/**
 * Disables itself while its form is posting. A second tap on a slow connection would
 * otherwise call a second patient, and the room would see a number nobody was ready for.
 * A component rather than markup because useFormStatus only reports on the form it sits
 * inside.
 */
export function SubmitButton({
  children,
  pendingLabel,
  tone = 'primary',
  size = 'normal',
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
  tone?: keyof typeof TONES;
  size?: 'normal' | 'large';
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const sizing =
    tone === 'quiet'
      ? 'px-1 py-2 text-sm'
      : size === 'large'
        ? 'min-h-14 px-6 py-3 text-lg'
        : 'min-h-11 px-4 py-2 text-sm';

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded border font-semibold disabled:cursor-not-allowed ${sizing} ${TONES[tone]}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
