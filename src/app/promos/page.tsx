import type { Metadata } from 'next';

import { ButtonLink, Container, PageHeader } from '@/components/ui';
import { getActivePromos } from '@/lib/queries';
import { formatManilaDate, manilaToUtc } from '@/lib/time';

// Shorter window than the other pages: a promo that has ended should drop off quickly.
export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Promos',
  description:
    'Current promos and package offers at the clinic. Only offers running right now are shown.',
};

export default async function PromosPage() {
  const promos = await getActivePromos();

  return (
    <>
      <PageHeader
        title="Promos"
        lead="Only offers running right now appear here — once a promo ends it comes off the page automatically, so nothing you see is expired."
      />

      <Container className="py-10">
        {promos.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-sunken px-5 py-10 text-center">
            <p className="font-semibold text-ink-900">No promos running at the moment.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
              Check back soon, or follow our Facebook page — new offers are posted there
              first.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {promos.map((promo) => (
              <li
                key={promo.id}
                className="overflow-hidden rounded-xl border border-accent-200 bg-accent-50"
              >
                {promo.imageUrl ? (
                  /* Staff-uploaded promo images are arbitrary URLs of unknown size.
                     next/image would need every possible host allow-listed in
                     next.config, so a plain img with lazy loading is the right call. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={promo.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-44 w-full bg-surface-sunken object-cover"
                  />
                ) : null}
                <div className="p-5">
                  <h2 className="text-lg font-bold text-accent-800">{promo.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-700">
                    {promo.body}
                  </p>
                  <p className="mt-4 text-xs font-semibold text-ink-500">
                    Until {formatManilaDate(manilaToUtc(promo.endsOn, '12:00'))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <ButtonLink href="/book">Book an appointment</ButtonLink>
        </div>
      </Container>
    </>
  );
}
