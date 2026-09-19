import Link from 'next/link';

import { ButtonLink, Callout, Card, Container } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getActiveDoctors, getActivePromos, getSiteSettings } from '@/lib/queries';

// Clinic content changes rarely; serve it prerendered and refresh in the background.
export const revalidate = 300;

const WHAT_WE_DO = [
  {
    title: 'Seeing a doctor',
    body: 'Family medicine, internal medicine, cardiology and pediatrics. Coughs and fevers, blood pressure and sugar checks, medical certificates, and following up on maintenance medicines.',
  },
  {
    title: 'Blood and urine tests',
    body: 'CBC, urinalysis, fasting blood sugar, lipid profile, liver and kidney panels, thyroid, dengue. Most results are ready the same day.',
  },
  {
    title: 'X-ray and scans',
    body: 'Chest X-ray, ultrasound, 12-lead ECG and 2D echo. Our own doctors read them, so you are not waiting on an outside radiologist.',
  },
] as const;

/** Things patients ring up to ask, answered before they have to. */
const BEFORE_YOU_COME = [
  'Bring a valid ID.',
  'Senior citizens and persons with disability get the 20% discount the law provides. Bring your booklet or ID.',
  'If you have PhilHealth or an HMO, bring the card and ask at the desk before your test.',
  'Some tests need you to skip breakfast. If yours does, it will say so on your confirmation.',
];

export default async function HomePage() {
  const [settings, doctors, promos] = await Promise.all([
    getSiteSettings(),
    getActiveDoctors(),
    getActivePromos(),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-brand-50">
        <Container className="py-10 sm:py-14">
          <h1 className="max-w-2xl text-3xl leading-tight font-bold tracking-tight text-ink-900 sm:text-4xl">
            Book your slot, then come at that time.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-700">
            Consultations, blood tests, X-ray, ultrasound, ECG and 2D echo, all in the
            same building. Booking takes about a minute and costs nothing. You pay here,
            on the day.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/book" className="sm:min-w-56">
              Book an appointment
            </ButtonLink>
            {settings.phonePrimary ? (
              <ButtonLink href={telHref(settings.phonePrimary)} variant="secondary">
                Call {settings.phonePrimary}
              </ButtonLink>
            ) : null}
          </div>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-700">
            Walk-ins are still welcome. We hold back slots in every session for people who
            just turn up, so booking online never takes a place away from someone at the
            door.
          </p>
        </Container>
      </section>

      {/* Practical details */}
      <Container className="py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
              When we are open
            </h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-500">
              {settings.openingHoursText || 'Please call to check our hours.'}
            </p>
          </Card>

          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
              Where to find us
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{settings.address}</p>
            <Link
              href="/contact"
              className="mt-3 inline-block text-sm font-semibold text-brand-700 underline underline-offset-2"
            >
              Directions and map
            </Link>
          </Card>

          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
              Ring the clinic
            </h2>
            {settings.phonePrimary ? (
              <a
                href={telHref(settings.phonePrimary)}
                className="mt-2 block text-xl font-bold text-brand-700 underline underline-offset-4"
              >
                {settings.phonePrimary}
              </a>
            ) : null}
            {settings.phoneSecondary ? (
              <a
                href={telHref(settings.phoneSecondary)}
                className="mt-1 block text-base font-semibold text-brand-700 underline underline-offset-4"
              >
                {settings.phoneSecondary}
              </a>
            ) : null}
          </Card>
        </div>
      </Container>

      {/* Promos */}
      {promos.length > 0 ? (
        <Container className="pb-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-ink-900">Running at the moment</h2>
            <Link
              href="/promos"
              className="text-sm font-semibold text-brand-700 underline underline-offset-2"
            >
              All promos
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {promos.slice(0, 2).map((promo) => (
              <li key={promo.id}>
                <Callout tone="accent" title={promo.title}>
                  <p className="line-clamp-3">{promo.body}</p>
                </Callout>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {/* What we do */}
      <section className="border-y border-line bg-surface-sunken">
        <Container className="py-10">
          <h2 className="text-xl font-bold text-ink-900">What we do</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {WHAT_WE_DO.map((item) => (
              <li key={item.title}>
                <Card className="h-full">
                  <h3 className="font-bold text-ink-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{item.body}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/services" variant="secondary">
              All our services
            </ButtonLink>
            <ButtonLink href="/prices" variant="secondary">
              What things cost
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* Before you come */}
      <Container className="py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-ink-900">Before you come</h2>
            <ul className="mt-4 space-y-3">
              {BEFORE_YOU_COME.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-700">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {doctors.length > 0 ? (
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-bold text-ink-900">Who you will see</h2>
                <Link
                  href="/doctors"
                  className="text-sm font-semibold text-brand-700 underline underline-offset-2"
                >
                  Clinic days
                </Link>
              </div>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {doctors.map((doctor) => (
                  <li key={doctor.id} className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{doctor.fullName}</p>
                    <p className="text-sm text-ink-500">{doctor.specialty}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Container>

      {/* Map */}
      {settings.mapEmbedUrl ? (
        <Container className="pb-12">
          <h2 className="text-xl font-bold text-ink-900">Getting here</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <iframe
              src={settings.mapEmbedUrl}
              title={`Map showing the location of ${settings.clinicName}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0"
            />
          </div>
        </Container>
      ) : null}
    </>
  );
}
