import type { Metadata } from 'next';

import { ButtonLink, Callout, Card, Container, PageHeader } from '@/components/ui';
import { formatPhp } from '@/lib/money';
import { getActiveServices, type Service } from '@/lib/queries';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Consultations, laboratory tests, chest X-ray, ultrasound, 12-lead ECG and 2D echocardiogram, explained in plain language.',
};

/** Plain-language explanations of what each kind of test is actually like. */
const EXPLAINERS = [
  {
    title: 'Consultations',
    body: 'You sit down with a doctor, they listen to what is bothering you, examine you, and explain what they think is going on. You leave with a plan — a prescription, a test to take, or a date to come back. Bring any medicines you are already taking and any previous results.',
  },
  {
    title: 'Laboratory tests',
    body: 'Most of these need a small blood sample from your arm, or a urine or stool sample you provide here. The needle part takes under a minute. Some tests need you to skip breakfast — we will tell you which when you book, and it is written on your confirmation.',
  },
  {
    title: 'X-ray',
    body: 'You stand against a plate for a few seconds while a picture is taken of your chest or another part of the body. It does not hurt and you feel nothing at all. Wear a top without metal buttons, zips or an underwire if you can. Tell us before the test if you are pregnant or think you might be.',
  },
  {
    title: 'Ultrasound',
    body: 'A gel is put on your skin and a small handheld probe is moved over the area to make a picture using sound, not radiation. It is painless and safe in pregnancy. Some scans need you to skip breakfast, or to drink water and hold a full bladder — this is the part people forget, so please read your confirmation.',
  },
  {
    title: 'ECG (electrocardiogram)',
    body: 'Small stickers are placed on your chest, arms and legs, and a machine records your heartbeat for a few seconds. Nothing is passed into you; the machine only listens. It takes about ten minutes including getting ready.',
  },
  {
    title: '2D echocardiogram',
    body: 'An ultrasound of the heart. You lie on your side while the doctor moves a probe over your chest and watches your heart valves and chambers moving on screen. It takes around 45 minutes and is painless. A two-piece outfit makes it easier.',
  },
] as const;

const CATEGORY_SECTIONS = [
  {
    key: 'consultation' as const,
    heading: 'Consultations',
    note: 'Doctor’s fees are confirmed at the clinic. Choose a doctor when you book.',
  },
  {
    key: 'laboratory' as const,
    heading: 'Laboratory tests',
    note: null,
  },
  {
    key: 'imaging' as const,
    heading: 'X-ray, ultrasound and heart tests',
    note: null,
  },
];

function ServiceList({ items }: { items: Service[] }) {
  return (
    <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
      {items.map((service) => (
        <li key={service.id} className="px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold text-ink-900">{service.name}</p>
            {service.isListedOnline ? (
              <p className="text-base font-bold text-brand-700 tabular-nums">
                {formatPhp(service.pricePhp)}
              </p>
            ) : null}
          </div>
          {service.prepInstructions ? (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              <span className="font-semibold text-ink-700">Before you come: </span>
              {service.prepInstructions}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function ServicesPage() {
  const services = await getActiveServices();

  return (
    <>
      <PageHeader
        title="Services"
        lead="Everything we offer, and what each test is actually like. If you are not sure which test you need, book a consultation and the doctor will tell you."
      />

      <Container className="py-10">
        <section aria-labelledby="explainers">
          <h2 id="explainers" className="text-xl font-bold text-ink-900">
            What to expect
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {EXPLAINERS.map((item) => (
              <li key={item.title}>
                <Card className="h-full">
                  <h3 className="font-bold text-ink-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{item.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {CATEGORY_SECTIONS.map((section) => {
          const items = services.filter((s) => s.category === section.key);
          if (items.length === 0) return null;
          return (
            <section key={section.key} className="mt-12" aria-labelledby={`cat-${section.key}`}>
              <h2 id={`cat-${section.key}`} className="text-xl font-bold text-ink-900">
                {section.heading}
              </h2>
              {section.note ? (
                <p className="mt-2 text-sm text-ink-500">{section.note}</p>
              ) : null}
              <ServiceList items={items} />
            </section>
          );
        })}

        <div className="mt-10 space-y-5">
          <Callout>
            Prices shown are our usual rates and may change. The amount is always
            confirmed at the clinic before your test is done. There is nothing to pay
            online.
          </Callout>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/book">Book an appointment</ButtonLink>
            <ButtonLink href="/prices" variant="secondary">
              See the full price list
            </ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
