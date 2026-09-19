import type { Metadata } from 'next';

import { ButtonLink, Container, PageHeader } from '@/components/ui';
import { getActivePromos } from '@/lib/queries';
import { formatManilaDate, manilaToUtc } from '@/lib/time';

// Shorter window than the other pages: a promo that has ended should drop off quickly.
export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Promos',
  description:
    'Package offers and promos running at the clinic right now. Anything that has finished comes off this page by itself.',
};

export default async function PromosPage() {
  const promos = await getActivePromos();

  return (
    <>
      <PageHeader
        title="Promos"
        lead="Only what is running today. When a promo finishes it comes off this page by itself, so nothing you see here has expired."
      />

      <Container className="py-10">
        {promos.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-sunken px-5 py-10 text-center">
            <p className="font-semibold text-ink-900">Nothing running just now.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
              New offers go up on our Facebook page first, so follow us there and you
              will hear about the next one.
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
                    Runs until {formatManilaDate(manilaToUtc(promo.endsOn, '12:00'))}
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
