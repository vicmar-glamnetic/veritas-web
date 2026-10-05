import Image from 'next/image';
import Link from 'next/link';

import { ButtonLink, Container, Monogram, SectionHeading } from '@/components/ui';
import { telHref } from '@/lib/mobile';
import { getActiveDoctors, getActivePromos, getSiteSettings } from '@/lib/queries';

export const revalidate = 300;

const WHAT_WE_DO = [
  {
    title: 'Seeing a doctor',
    image: '/images/consultation.svg',
    body: 'Family medicine, internal medicine, cardiology and pediatrics. Coughs and fevers, blood pressure and sugar checks, medical certificates, and following up on maintenance medicines.',
  },
  {
    title: 'Blood and urine tests',
    image: '/images/laboratory.svg',
    body: 'CBC, urinalysis, fasting blood sugar, lipid profile, liver and kidney panels, thyroid, dengue. Most results are ready the same day.',
  },
  {
    title: 'X-ray and scans',
    image: '/images/xray.svg',
    body: 'Chest X-ray, ultrasound, 12-lead ECG and 2D echo. Our own doctors read them, so you are not waiting on an outside radiologist.',
  },
] as const;

const BEFORE_YOU_COME = [
  ['Bring a valid ID.', 'Any government ID is fine.'],
  [
    'Senior citizen or PWD?',
    'Bring your booklet or ID and you get the 20% discount the law provides.',
  ],
  ['PhilHealth or an HMO?', 'Bring the card and ask at the desk before your test.'],
  [
    'Some tests need an empty stomach.',
    'If yours does, it will say so on your confirmation. Water is fine.',
  ],
] as const;

export default async function HomePage() {
  const [settings, doctors, promos] = await Promise.all([
    getSiteSettings(),
    getActiveDoctors(),
    getActivePromos(),
  ]);

  return (
    <>
      {/*
        Hero: the headline and a picture of the clinic, side by side and centred on each
        other, so neither column trails off into empty space. The practical facts sit in
        a strip directly beneath: hours, address and phone are what most visitors came
        for, so they stay above the fold on a laptop and right after the buttons on a
        phone.
      */}
      <section className="border-b border-line bg-surface">
        <Container className="py-12 sm:py-16">
          <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-14">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
                Consultations · Laboratory · X-ray · Ultrasound
              </p>
              <h1 className="mt-5 text-[2.1rem] leading-[1.15] text-ink-900 sm:text-5xl">
                Book your slot, then come at that time.
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-ink-700">
                A clinic, a laboratory and an X-ray room in the same building. Booking
                takes about a minute and costs nothing. You pay here, on the day.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/book" className="sm:min-w-52">
                  Book an appointment
                </ButtonLink>
                {settings.phonePrimary ? (
                  <ButtonLink href={telHref(settings.phonePrimary)} variant="secondary">
                    Call {settings.phonePrimary}
                  </ButtonLink>
                ) : null}
              </div>

              <p className="mt-8 max-w-xl border-l-2 border-brand-200 pl-4 text-sm leading-relaxed text-ink-500">
                Walk-ins are still welcome. We hold back places in every session for
                people who just turn up, so booking online never takes a slot away from
                someone at the door.
              </p>
            </div>

            {/*
              Placeholder illustration, a few KB of SVG. Swap it for a photograph of the
              real shopfront once the clinic sends one: that is what helps somebody
              recognise the door from across the street.
            */}
            <Image
              src="/images/clinic-front.svg"
              alt="Illustration of the clinic's shopfront"
              width={740}
              height={510}
              preload
              className="mt-10 h-auto w-full rounded border border-line lg:mt-0"
            />
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-paper">
        <Container className="py-8">
          <h2 className="sr-only">Clinic details</h2>
          <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="pb-5 sm:pr-8 sm:pb-0">
              <dt className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                When we are open
              </dt>
              <dd className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-700">
                {settings.openingHoursText || 'Please call to check our hours.'}
              </dd>
            </div>
            <div className="py-5 sm:px-8 sm:py-0">
              <dt className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                Where to find us
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-700">
                {settings.address}
                <Link
                  href="/contact"
                  className="mt-2 block text-brand-700 underline underline-offset-4"
                >
                  Directions and map
                </Link>
              </dd>
            </div>
            <div className="pt-5 sm:pt-0 sm:pl-8">
              <dt className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                Ring the clinic
              </dt>
              <dd className="mt-2">
                {settings.phonePrimary ? (
                  <a
                    href={telHref(settings.phonePrimary)}
                    className="block font-serif text-2xl text-brand-700 underline underline-offset-4"
                  >
                    {settings.phonePrimary}
                  </a>
                ) : null}
                {settings.phoneSecondary ? (
                  <a
                    href={telHref(settings.phoneSecondary)}
                    className="mt-1 block text-sm text-brand-700 underline underline-offset-4"
                  >
                    {settings.phoneSecondary}
                  </a>
                ) : null}
              </dd>
            </div>
          </dl>
        </Container>
      </section>

      {/* Promos: a tinted strip, not two matching cards. */}
      {promos.length > 0 ? (
        <section className="border-y border-accent-200 bg-accent-50">
          <Container className="py-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="text-xl text-accent-800 sm:text-2xl">Running at the moment</h2>
              <Link
                href="/promos"
                className="text-sm font-medium text-accent-800 underline underline-offset-4"
              >
                All promos
              </Link>
            </div>
            <ul className="mt-6 divide-y divide-accent-200">
              {promos.slice(0, 2).map((promo) => (
                <li key={promo.id} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="font-serif text-lg text-accent-800">{promo.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-700">
                    {promo.body}
                  </p>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* What we do: a list with a picture per row, not a card grid. */}
      <Container className="py-12">
        <SectionHeading action={{ href: '/services', label: 'All services' }}>
          What we do
        </SectionHeading>
        <ol className="mt-6 space-y-7">
          {WHAT_WE_DO.map((item) => (
            <li key={item.title} className="flex items-start gap-4 sm:gap-6">
              <Image
                src={item.image}
                alt=""
                width={400}
                height={300}
                className="h-auto w-24 shrink-0 rounded border border-line sm:w-44"
              />
              <div className="max-w-2xl">
                <h3 className="font-serif text-lg text-ink-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <ButtonLink href="/prices" variant="secondary">
            What things cost
          </ButtonLink>
        </div>
      </Container>

      {/* Before you come: a definition list, like a notice pinned by the door. */}
      <section className="border-y border-line bg-surface">
        <Container className="py-12">
          <h2 className="text-xl text-ink-900 sm:text-2xl">Before you come</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {BEFORE_YOU_COME.map(([term, detail]) => (
              <div key={term}>
                <dt className="text-sm font-semibold text-ink-900">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-500">{detail}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Doctors: rows with serif names and a hairline between. */}
      {doctors.length > 0 ? (
        <Container className="py-12">
          <SectionHeading action={{ href: '/doctors', label: 'Clinic days' }}>
            Who you will see
          </SectionHeading>
          <ul className="mt-6 divide-y divide-line">
            {doctors.map((doctor) => (
              <li
                key={doctor.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3.5"
              >
                <p className="flex items-center gap-3 font-serif text-lg text-ink-900">
                  <Monogram name={doctor.fullName} className="size-10 text-sm" />
                  {doctor.fullName}
                </p>
                <p className="text-sm text-ink-500">{doctor.specialty}</p>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      {settings.mapEmbedUrl ? (
        <Container className="pb-14">
          <SectionHeading>Getting here</SectionHeading>
          <div className="mt-6 overflow-hidden rounded border border-line">
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
