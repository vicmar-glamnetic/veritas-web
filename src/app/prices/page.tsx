import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader } from '@/components/ui';
import { getListedServices } from '@/lib/queries';

import { PriceList, type PriceItem } from './price-list';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Prices',
  description:
    'Laboratory and imaging prices in Philippine pesos — CBC, urinalysis, lipid profile, chest X-ray, ultrasound, ECG, 2D echo and more. Search the full list.',
};

export default async function PricesPage() {
  const services = await getListedServices();

  const items: PriceItem[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    pricePhp: service.pricePhp,
    prepInstructions: service.prepInstructions,
  }));

  return (
    <>
      <PageHeader
        title="Prices"
        lead="Our laboratory and imaging rates. Type in the box to find a test quickly."
      />

      <Container className="py-10">
        <Callout title="Please read">
          These are our usual rates and they may change. The amount is confirmed at the
          clinic before your test is done, and you pay there — nothing is collected
          online. If a doctor asks for a test you cannot find here, call us and we will
          tell you the price.
        </Callout>

        <div className="mt-6">
          <PriceList items={items} />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/book">Book an appointment</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Ask about a test
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
