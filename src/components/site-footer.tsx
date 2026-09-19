import Link from 'next/link';

import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

export async function SiteFooter() {
  const settings = await getSiteSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line bg-surface-sunken">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
            {settings.clinicName}
          </h2>
          {settings.address ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-500">{settings.address}</p>
          ) : null}
          {settings.facebookUrl ? (
            <a
              href={settings.facebookUrl}
              className="mt-3 inline-block text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              rel="noopener noreferrer"
              target="_blank"
            >
              Follow us on Facebook
            </a>
          ) : null}
        </div>

        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">Contact</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            {settings.phonePrimary ? (
              <li>
                <a
                  className="font-medium text-brand-700 underline underline-offset-2"
                  href={telHref(settings.phonePrimary)}
                >
                  {settings.phonePrimary}
                </a>
              </li>
            ) : null}
            {settings.phoneSecondary ? (
              <li>
                <a
                  className="font-medium text-brand-700 underline underline-offset-2"
                  href={telHref(settings.phoneSecondary)}
                >
                  {settings.phoneSecondary}
                </a>
              </li>
            ) : null}
            {settings.email ? (
              <li>
                <a
                  className="font-medium text-brand-700 underline underline-offset-2"
                  href={`mailto:${settings.email}`}
                >
                  {settings.email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
            Clinic hours
          </h2>
          {settings.openingHoursText ? (
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-500">
              {settings.openingHoursText}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.clinicName}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link className="underline underline-offset-2 hover:text-ink-700" href="/privacy">
                Privacy notice
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2 hover:text-ink-700" href="/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2 hover:text-ink-700" href="/book">
                Book an appointment
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
