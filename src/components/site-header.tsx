import Link from 'next/link';

import { getSiteSettings } from '@/lib/queries';
import { telHref } from '@/lib/mobile';

import { NavLinks } from './nav-links';

/**
 * The masthead, set like a clinic's sign rather than an app bar: the name in the serif,
 * the word CLINIC letterspaced beneath it. No monogram tile, which is the single most
 * template-looking element a site can have.
 *
 * The Book button is present at every width, because the whole point of the site is that
 * someone arriving from Facebook can book in a few taps.
 */
export async function SiteHeader() {
  const settings = await getSiteSettings();
  const [firstWord, ...rest] = settings.clinicName.split(' ');

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/" className="group -my-1 block rounded py-1">
            <span className="block font-serif text-xl leading-none font-semibold text-ink-900 sm:text-2xl">
              {firstWord}
            </span>
            <span className="mt-1 block text-[0.68rem] leading-none font-semibold tracking-[0.22em] text-brand-600 uppercase">
              {rest.join(' ') || 'Clinic'}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            {settings.phonePrimary ? (
              <a
                href={telHref(settings.phonePrimary)}
                className="hidden text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 sm:block"
              >
                {settings.phonePrimary}
              </a>
            ) : null}
            <Link
              href="/book"
              className="rounded bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Book
            </Link>
          </div>
        </div>

        <nav aria-label="Main" className="border-t border-line/80">
          <NavLinks />
        </nav>
      </div>
    </header>
  );
}
