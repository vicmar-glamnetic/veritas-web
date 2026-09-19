import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Callout, Container, PageHeader } from '@/components/ui';
import { findBookingByCancelToken } from '@/lib/booking-lookup';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';
import { formatManilaDateTime } from '@/lib/time';

import { CancelPanel } from './cancel-panel';

/**
 * The link in the confirmation email.
 *
 * The token sits in the path rather than a query string, so it does not leak through
 * Referer headers the way `?token=` would. It is single-purpose: it identifies one
 * booking for cancellation and grants nothing else.
 */
export const metadata: Metadata = {
  title: 'Cancel your appointment',
  robots: { index: false, follow: false },
};

export default async function CancelBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const settings = await getSiteSettings();
  const booking = await findBookingByCancelToken(decodeURIComponent(token));

  if (!booking) notFound();

  return (
    <>
      <PageHeader
        title="Cancel your appointment"
        lead={`Hello ${booking.patientFirstName}, please check this is the right appointment before you cancel.`}
      />

      <Container className="py-10">
        <div className="max-w-lg">
          <div className="rounded border border-line">
            <div className="border-b border-line px-4 py-3">
              <p className="font-serif text-xl tracking-wider text-ink-900">
                {booking.referenceCode}
              </p>
            </div>
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-ink-500">What</dt>
                <dd className="text-right text-sm font-semibold text-ink-900">
                  {booking.serviceName}
                </dd>
              </div>
              {booking.doctorName ? (
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-ink-500">Who</dt>
                  <dd className="text-right text-sm font-semibold text-ink-900">
                    {booking.doctorName}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-ink-500">When</dt>
                <dd className="text-right text-sm font-semibold text-ink-900">
                  {formatManilaDateTime(booking.scheduledStart)}
                </dd>
              </div>
            </dl>
          </div>

          {booking.isPast && !booking.isCancelled ? (
            <div className="mt-6">
              <Callout tone="accent">
                This appointment has already passed, so there is nothing to cancel.
              </Callout>
            </div>
          ) : (
            <div className="mt-6">
              <CancelPanel
                token={decodeURIComponent(token)}
                alreadyCancelled={booking.isCancelled}
                clinicPhone={settings.phonePrimary}
                telHref={telHref(settings.phonePrimary)}
              />
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
