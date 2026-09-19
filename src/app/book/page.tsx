import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Book an appointment',
  description:
    'Book a consultation, blood test or scan. Nothing to pay online; you settle it at the clinic on the day.',
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
        lead="We are still wiring up online booking. Until it is live, ring the clinic and the front desk will put you in the book."
      />

      <Container className="py-10">
        <Callout title="Not switched on yet">
          The booking system is nearly finished. For now the quickest way to get a slot
          is to ring us during clinic hours, and we will write you in.
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
              When we are open
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
