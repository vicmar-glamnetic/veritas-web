import Link from 'next/link';

import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

/**
 * Set like the foot of a letterhead: the name in the serif, then the address, numbers
 * and hours in three plain columns. No cards, no icons.
 */
export async function SiteFooter() {
  const settings = await getSiteSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-line-strong bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="font-serif text-2xl text-ink-900">{settings.clinicName}</p>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
              Where
            </h2>
            {settings.address ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-700">{settings.address}</p>
            ) : null}
            {settings.facebookUrl ? (
              <a
                href={settings.facebookUrl}
                className="mt-3 inline-block text-sm text-brand-700 underline underline-offset-4 hover:text-brand-800"
                rel="noopener noreferrer"
                target="_blank"
              >
                Find us on Facebook
              </a>
            ) : null}
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
              Contact
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
              {settings.phonePrimary ? (
                <li>
                  <a
                    className="text-brand-700 underline underline-offset-4"
                    href={telHref(settings.phonePrimary)}
                  >
                    {settings.phonePrimary}
                  </a>
                </li>
              ) : null}
              {settings.phoneSecondary ? (
                <li>
                  <a
                    className="text-brand-700 underline underline-offset-4"
                    href={telHref(settings.phoneSecondary)}
                  >
                    {settings.phoneSecondary}
                  </a>
                </li>
              ) : null}
              {settings.email ? (
                <li>
                  <a
                    className="text-brand-700 underline underline-offset-4"
                    href={`mailto:${settings.email}`}
                  >
                    {settings.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
              Open
            </h2>
            {settings.openingHoursText ? (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-700">
                {settings.openingHoursText}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.clinicName}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link className="underline underline-offset-4 hover:text-ink-700" href="/privacy">
                Privacy notice
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-4 hover:text-ink-700" href="/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-4 hover:text-ink-700" href="/booking">
                Find your booking
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
