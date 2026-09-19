'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A fixed call/book bar on phones.
 *
 * Most visitors land here from a Facebook post on a phone and want one of exactly two
 * things: ring the clinic, or get a slot. Making them scroll back to the header to do
 * either is the main thing that loses them. Hidden from `sm` up, where the header
 * already carries both.
 *
 * It is suppressed on the booking pages themselves, where it would duplicate the
 * primary action and cover the form's own submit button.
 */
export function MobileActions({
  phone,
  telHref,
}: {
  phone: string | null;
  telHref: string | null;
}) {
  const pathname = usePathname();
  if (pathname.startsWith('/book')) return null;

  return (
    <div
      role="group"
      aria-label="Quick actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-3 py-2.5 backdrop-blur-sm sm:hidden"
    >
      <div className="flex gap-2.5">
        {phone && telHref ? (
          <a
            href={telHref}
            // The number itself wraps onto two lines at 360px next to Book, so the
            // label stays short and the number goes to screen readers instead.
            aria-label={`Call the clinic on ${phone}`}
            className="flex min-h-[3rem] flex-1 items-center justify-center rounded border border-line-strong bg-surface px-3 text-base font-semibold text-ink-900"
          >
            Call the clinic
          </a>
        ) : null}
        <Link
          href="/book"
          className="flex min-h-[3rem] flex-1 items-center justify-center rounded bg-brand-700 px-3 text-base font-semibold text-white"
        >
          Book
        </Link>
      </div>
    </div>
  );
}
