import Link from 'next/link';

import { ButtonLink, Callout, Card, Container } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getActiveDoctors, getActivePromos, getSiteSettings } from '@/lib/queries';

// Clinic content changes rarely; serve it prerendered and refresh in the background.
export const revalidate = 300;

const CATEGORY_CARDS = [
  {
    title: 'Consultations',
    body: 'Family medicine, internal medicine, cardiology and pediatrics. See a doctor for a check-up, an illness, or follow-up on maintenance medicines.',
  },
  {
    title: 'Laboratory',
    body: 'Blood tests, urinalysis, fecalysis and the usual check-up panels. Most results are ready the same day.',
  },
  {
    title: 'X-ray, ultrasound and heart tests',
    body: 'Chest X-ray, ultrasound scans, 12-lead ECG and 2D echocardiogram, read by our own doctors.',
  },
] as const;

export default async function HomePage() {
  const [settings, doctors, promos] = await Promise.all([
    getSiteSettings(),
    getActiveDoctors(),
    getActivePromos(),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-surface">
        <Container className="py-10 sm:py-16">
          <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
            {settings.clinicName}
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-ink-900 sm:text-4xl">
            See a doctor without the long wait.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-700">
            Consultations, laboratory tests, X-ray, ultrasound, ECG and 2D echo — under
            one roof. Pick a time that suits you and we will be ready for you.
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

          <p className="mt-5 text-sm text-ink-500">
            Booking is free and takes about a minute. There is nothing to pay online —{' '}
            <strong className="font-semibold text-ink-700">you pay at the clinic.</strong>
          </p>
        </Container>
      </section>

      {/* At a glance */}
      <Container className="py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">
              Clinic hours
            </h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-500">
              {settings.openingHoursText || 'Please call to confirm our hours.'}
            </p>
          </Card>

          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">Where we are</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{settings.address}</p>
            <Link
              href="/contact"
              className="mt-3 inline-block text-sm font-semibold text-brand-700 underline underline-offset-2"
            >
              Directions and map
            </Link>
          </Card>

          <Card>
            <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">Call us</h2>
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
            <h2 className="text-xl font-bold text-ink-900">What&rsquo;s on now</h2>
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

      {/* What we offer */}
      <section className="border-y border-line bg-surface-sunken">
        <Container className="py-10">
          <h2 className="text-xl font-bold text-ink-900">What we offer</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {CATEGORY_CARDS.map((card) => (
              <li key={card.title}>
                <Card className="h-full">
                  <h3 className="font-bold text-ink-900">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{card.body}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/services" variant="secondary">
              See all services
            </ButtonLink>
            <ButtonLink href="/prices" variant="secondary">
              Laboratory and imaging prices
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* Doctors */}
      {doctors.length > 0 ? (
        <Container className="py-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-ink-900">Our doctors</h2>
            <Link
              href="/doctors"
              className="text-sm font-semibold text-brand-700 underline underline-offset-2"
            >
              Clinic days
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {doctors.map((doctor) => (
              <li
                key={doctor.id}
                className="rounded-xl border border-line px-4 py-3.5"
              >
                <p className="font-semibold text-ink-900">{doctor.fullName}</p>
                <p className="text-sm text-ink-500">{doctor.specialty}</p>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {/* Map */}
      {settings.mapEmbedUrl ? (
        <Container className="pb-12">
          <h2 className="text-xl font-bold text-ink-900">Find us</h2>
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
