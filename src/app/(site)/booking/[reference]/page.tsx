import type { Metadata } from 'next';

import { Container, PageHeader } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

import { BookingLookup } from './lookup';

/**
 * Your booking.
 *
 * The reference code is in the path so the link in the confirmation email works, but on
 * its own it reveals nothing: the page renders a form and only shows the booking once
 * the mobile number it was made with is POSTed back. There is no patient login, and this
 * pair is what stands in for one.
 */
export const metadata: Metadata = {
  title: 'Your booking',
  description: 'Look up or cancel an appointment using your reference code.',
  // A booking reference must never end up in a search index.
  robots: { index: false, follow: false },
};

export default async function BookingLookupPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const settings = await getSiteSettings();

  const normalised = decodeURIComponent(reference).toUpperCase().replace(/\s+/g, '').slice(0, 20);

  return (
    <>
      <PageHeader
        title="Your booking"
        lead="Enter the mobile number you booked with and we will show you the details. You can cancel from here too."
      />

      <Container className="py-10">
        <div className="max-w-lg">
          <BookingLookup
            reference={normalised}
            clinicPhone={settings.phonePrimary}
            telHref={telHref(settings.phonePrimary)}
          />
        </div>
      </Container>
    </>
  );
}
