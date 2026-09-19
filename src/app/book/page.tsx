import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Book an appointment',
  description:
    'Book a consultation, laboratory test or scan online. No payment needed — you pay at the clinic.',
};

/**
 * PLACEHOLDER — the real four-step booking flow is milestone 4.
 *
 * This page exists now so that the Book button in the header, the footer and every
 * call to action lead somewhere sensible during client demos, rather than a 404.
 * Replace this file wholesale when the booking flow is built.
 */
export default async function BookPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader
        title="Book an appointment"
        lead="Online booking is being set up right now. In the meantime, please call the clinic and we will book you in."
      />

      <Container className="py-10">
        <Callout title="Online booking is coming shortly">
          We are finishing the online booking system. Until it is switched on, the
          fastest way to get a slot is to call us during clinic hours.
        </Callout>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {settings.phonePrimary ? (
            <ButtonLink href={telHref(settings.phonePrimary)}>
              Call {settings.phonePrimary}
            </ButtonLink>
          ) : null}
          {settings.facebookUrl ? (
            <ButtonLink href={settings.facebookUrl} variant="secondary">
              Message us on Facebook
            </ButtonLink>
          ) : null}
        </div>

        {settings.openingHoursText ? (
          <div className="mt-8">
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
              Clinic hours
            </h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-500">
              {settings.openingHoursText}
            </p>
          </div>
        ) : null}
      </Container>
    </>
  );
}
