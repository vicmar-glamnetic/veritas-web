import type { Metadata } from 'next';

import { Container, PageHeader } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

import { BookingLookup } from './[reference]/lookup';

/** The same lookup, reached without a reference code in the path. */
export const metadata: Metadata = {
  title: 'Find your booking',
  description: 'Look up or cancel an appointment using your reference code.',
  robots: { index: false, follow: false },
};

export default async function FindBookingPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <PageHeader
        title="Find your booking"
        lead="Your reference code is in the confirmation email we sent you. It looks like VRT-7K4Q."
      />
      <Container className="py-10">
        <div className="max-w-lg">
          <BookingLookup
            reference=""
            clinicPhone={settings.phonePrimary}
            telHref={telHref(settings.phonePrimary)}
          />
        </div>
      </Container>
    </>
  );
}
