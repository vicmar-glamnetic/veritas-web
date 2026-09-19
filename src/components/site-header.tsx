import Link from 'next/link';

import { getSiteSettings } from '@/lib/queries';
import { telHref } from '@/lib/mobile';

import { NavLinks } from './nav-links';

/**
 * Sticky header. The Book button is present on every page at every width, because the
 * whole point of the site is that someone arriving from Facebook can book in a few taps.
 */
export async function SiteHeader() {
  const settings = await getSiteSettings();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-base font-bold text-white"
            >
              V
            </span>
            <span className="text-base leading-tight font-bold text-ink-900 sm:text-lg">
              {settings.clinicName}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {settings.phonePrimary ? (
              <a
                href={telHref(settings.phonePrimary)}
                className="hidden rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-sunken sm:block"
              >
                Call {settings.phonePrimary}
              </a>
            ) : null}
            <Link
              href="/book"
              className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Book
            </Link>
          </div>
        </div>

        <nav aria-label="Main" className="border-t border-line/70 sm:px-4">
          <NavLinks />
        </nav>
      </div>
    </header>
  );
}
