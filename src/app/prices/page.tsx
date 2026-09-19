import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader } from '@/components/ui';
import { getListedServices } from '@/lib/queries';

import { PriceList, type PriceItem } from './price-list';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Prices',
  description:
    'What our laboratory and imaging tests cost, in pesos. CBC, urinalysis, lipid profile, chest X-ray, ultrasound, ECG, 2D echo and the rest. Search the list.',
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
        lead="What our laboratory and imaging tests cost. Type in the box to jump straight to one."
      />

      <Container className="py-10">
        <Callout title="Two things worth knowing">
          These are our usual rates and they do change. You will be told the amount at
          the desk before anything is done, and you pay there. Nothing is collected
          through this website. Senior citizens and persons with disability get the 20%
          discount the law provides, so bring your booklet or ID.
        </Callout>

        <div className="mt-6">
          <PriceList items={items} />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/book">Book an appointment</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Ask us about a test
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
