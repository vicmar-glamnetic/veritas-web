import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader, SectionHeading } from '@/components/ui';
import { formatPhp } from '@/lib/money';
import { getActiveServices, type Service } from '@/lib/queries';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Services',
  description:
    'What we offer and what each test is actually like: consultations, blood and urine tests, chest X-ray, ultrasound, 12-lead ECG and 2D echo.',
};

/** Plain-language explanations of what each kind of test is actually like. */
const EXPLAINERS = [
  {
    title: 'Seeing a doctor',
    body: 'You sit down, the doctor listens, examines you and tells you what they think is going on. You leave with something: a prescription, a test, or a date to come back. Bring whatever medicines you are already taking, in the box, and any results from before.',
  },
  {
    title: 'Blood and urine tests',
    body: 'A small sample of blood is taken from your arm. The needle part is over in less than a minute. Urine and stool samples you provide here, in the toilet by the laboratory. Several tests want you to skip breakfast first; we will say so when you book.',
  },
  {
    title: 'X-ray',
    body: 'You stand against a plate, hold your breath, and it is done in seconds. You feel nothing. Wear a top with no metal buttons, zips or underwire if you can, otherwise you will be asked to change. Tell the staff first if you are pregnant or think you might be.',
  },
  {
    title: 'Ultrasound',
    body: 'Gel on the skin, a small probe moved over the area, a picture built from sound rather than radiation. It does not hurt and it is safe in pregnancy. Some scans need an empty stomach, others need a full bladder, which is the bit people forget. Your confirmation will tell you which.',
  },
  {
    title: 'ECG',
    body: 'Stickers on your chest, arms and ankles, then the machine records your heartbeat for about ten seconds. Nothing goes into you; the machine only listens. Counting the getting-ready, allow ten minutes.',
  },
  {
    title: '2D echo',
    body: 'An ultrasound of the heart itself. You lie on your left side while the doctor watches your valves and chambers moving on the screen. It takes around 45 minutes, so do not book it on a tight schedule. A two-piece outfit is easier than a dress.',
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
    heading: 'Blood and urine tests',
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
    <ul className="mt-5 divide-y divide-line border-t border-line">
      {items.map((service) => (
        <li key={service.id} className="py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-ink-900">{service.name}</p>
            {service.isListedOnline ? (
              <p className="font-semibold text-brand-700 tabular-nums">
                {formatPhp(service.pricePhp)}
              </p>
            ) : null}
          </div>
          {service.prepInstructions ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
              <span className="font-medium text-ink-700">Prepare: </span>
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
        lead="What we offer, and what each test is actually like to have done. Not sure which one you need? Book a consultation and let the doctor decide."
      />

      <Container className="py-10">
        <section aria-labelledby="explainers">
          <h2 id="explainers" className="text-xl text-ink-900 sm:text-2xl">
            What actually happens
          </h2>
          <dl className="mt-6 space-y-6 border-t border-line pt-6">
            {EXPLAINERS.map((item) => (
              <div key={item.title} className="sm:grid sm:grid-cols-[13rem_1fr] sm:gap-8">
                <dt className="font-serif text-lg text-ink-900">{item.title}</dt>
                <dd className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500 sm:mt-0">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {CATEGORY_SECTIONS.map((section) => {
          const items = services.filter((s) => s.category === section.key);
          if (items.length === 0) return null;
          return (
            <section key={section.key} className="mt-14" aria-labelledby={`cat-${section.key}`}>
              <SectionHeading>{section.heading}</SectionHeading>
              {section.note ? (
                <p className="mt-2 text-sm text-ink-500">{section.note}</p>
              ) : null}
              <ServiceList items={items} />
            </section>
          );
        })}

        <div className="mt-10 space-y-5">
          <Callout>
            The prices here are our usual rates and they do change from time to time. You
            will be told the amount at the desk before anything is done, and you pay
            there. Nothing is collected through this website.
          </Callout>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/book">Book an appointment</ButtonLink>
            <ButtonLink href="/prices" variant="secondary">
              What things cost
            </ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
