import type { Metadata } from 'next';

import { Callout, Container, PageHeader } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

import { InquiryForm } from './inquiry-form';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Contact and directions',
  description:
    'Where the clinic is, our phone numbers and Facebook page, and a form for questions we can answer by email.',
};

export default async function ContactPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader
        title="Contact us"
        lead="Ringing is always fastest, especially if it is urgent. For anything that can wait, the form below reaches the same desk and we will reply by email."
      />

      <Container className="py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Details */}
          <div className="divide-y divide-line border-t border-line">
            <div className="py-6 first:pt-0">
              <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                Phone
              </h2>
              {settings.phonePrimary ? (
                <a
                  href={telHref(settings.phonePrimary)}
                  className="mt-2 block font-serif text-2xl text-brand-700 underline underline-offset-4"
                >
                  {settings.phonePrimary}
                </a>
              ) : null}
              {settings.phoneSecondary ? (
                <a
                  href={telHref(settings.phoneSecondary)}
                  className="mt-1 block text-brand-700 underline underline-offset-4"
                >
                  {settings.phoneSecondary}
                </a>
              ) : null}
              {settings.openingHoursText ? (
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-500">
                  {settings.openingHoursText}
                </p>
              ) : null}
            </div>

            <div className="py-6">
              <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                Address
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{settings.address}</p>
              {settings.address ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-brand-700 underline underline-offset-4"
                >
                  Open in Google Maps
                </a>
              ) : null}
            </div>

            {settings.facebookUrl || settings.email ? (
              <div className="py-6">
                <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                  Or message us
                </h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {settings.facebookUrl ? (
                    <li>
                      <a
                        href={settings.facebookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 underline underline-offset-4"
                      >
                        Our Facebook page
                      </a>
                    </li>
                  ) : null}
                  {settings.email ? (
                    <li>
                      <a
                        href={`mailto:${settings.email}`}
                        className="text-brand-700 underline underline-offset-4"
                      >
                        {settings.email}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Form */}
          <div>
            <h2 className="text-xl text-ink-900 sm:text-2xl">Send us a question</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Good for things like opening hours, whether we do a particular test, or how
              to prepare for one. Please do not use it to ask for medical advice or
              results; we cannot give either by email.
            </p>
            <div className="mt-5">
              <InquiryForm />
            </div>
          </div>
        </div>

        {settings.mapEmbedUrl ? (
          <section className="mt-12" aria-labelledby="map-heading">
            <h2 id="map-heading" className="border-t border-line-strong pt-4 text-xl text-ink-900 sm:text-2xl">
              Getting here
            </h2>
            <div className="mt-6 overflow-hidden rounded border border-line">
              <iframe
                src={settings.mapEmbedUrl}
                title={`Map showing the location of ${settings.clinicName}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-80 w-full border-0"
              />
            </div>
          </section>
        ) : null}

        <div className="mt-10">
          <Callout tone="accent" title="If it is an emergency">
            Please do not wait for us. Go straight to the nearest hospital emergency room,
            or call 911.
          </Callout>
        </div>
      </Container>
    </>
  );
}
