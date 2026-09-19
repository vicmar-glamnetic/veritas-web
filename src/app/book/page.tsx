import type { Metadata } from 'next';
import Link from 'next/link';

import { Callout, Container, PageHeader } from '@/components/ui';
import { db } from '@/db';
import {
  computeAvailability,
  resolveChosenSlot,
  type AvailabilityDay,
} from '@/lib/availability';
import { formatPhp } from '@/lib/money';
import { telHref } from '@/lib/mobile';
import {
  getBookableServices,
  getDoctorsForService,
  getServiceById,
  getSiteSettings,
} from '@/lib/queries';
import {
  formatManilaDate,
  formatManilaDateTime,
  formatManilaTime,
  manilaDateString,
} from '@/lib/time';

import { BookingForm, type BookingSlotDetails } from './booking-form';
import { Calendar } from './calendar';

export const metadata: Metadata = {
  title: 'Book an appointment',
  description:
    'Book a consultation, blood test or scan. Takes about a minute. Nothing to pay online; you settle it at the clinic on the day.',
};

/**
 * The booking flow.
 *
 * Four steps on one page. Which step you are on is held in the URL, not in component
 * state, which buys three things at once: the whole flow works with JavaScript off, the
 * browser back button behaves exactly as people expect, and a half-finished booking can
 * be reloaded without losing the choices already made.
 *
 * Only the first two steps put anything in the URL, and none of it is personal: a
 * service, a doctor, a date and a slot. Name, mobile and email are POSTed in step 3 and
 * never appear in a query string, browser history or an access log.
 */

type SearchParams = {
  service?: string;
  doctor?: string;
  date?: string;
  session?: string;
  start?: string;
};

const CATEGORY_HEADINGS = [
  { key: 'consultation' as const, label: 'See a doctor' },
  { key: 'laboratory' as const, label: 'Blood and urine tests' },
  { key: 'imaging' as const, label: 'X-ray, ultrasound and heart tests' },
];

function buildHref(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/book?${qs}` : '/book';
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const settings = await getSiteSettings();

  const service = params.service ? await getServiceById(params.service) : null;
  const bookable = service && service.isActive && service.isBookableOnline ? service : null;
  const needsDoctor = bookable?.category === 'consultation';

  const doctorOptions = bookable && needsDoctor ? await getDoctorsForService(bookable.id) : [];
  const doctor =
    needsDoctor && params.doctor
      ? (doctorOptions.find((d) => d.id === params.doctor) ?? null)
      : null;

  const stepOneDone = Boolean(bookable) && (!needsDoctor || Boolean(doctor));

  // Availability is only worth computing once a service (and doctor) is settled.
  let days: AvailabilityDay[] = [];
  if (stepOneDone && bookable) {
    days = await computeAvailability(db, {
      serviceId: bookable.id,
      doctorId: doctor?.id ?? null,
      horizonDays: settings.bookingHorizonDays,
    });
  }

  const availableDates = new Set(days.map((d) => d.date));
  const chosenDay = params.date ? days.find((d) => d.date === params.date) : undefined;

  /*
   * The chosen slot is resolved from the URL, not looked up in `days`. Once the booking
   * succeeds the slot is taken and drops out of availability; if step 3 depended on that
   * list it would vanish along with the confirmation the patient needs to read.
   */
  const chosenSlot =
    stepOneDone && params.session && params.start
      ? await resolveChosenSlot(db, params.session, params.start)
      : null;

  const base: SearchParams = {
    service: bookable?.id,
    doctor: doctor?.id,
  };

  return (
    <>
      <PageHeader
        title="Book an appointment"
        lead="Four short steps. Nothing to pay now, and we will email your reference code."
      />

      <Container className="py-10">
        <ol className="space-y-6">
          {/* ---------------- Step 1: service, then doctor ---------------- */}
          <Step
            number={1}
            title="What do you need?"
            done={stepOneDone}
            summary={
              stepOneDone && bookable
                ? [bookable.name, doctor?.fullName].filter(Boolean).join(' · ')
                : undefined
            }
            changeHref="/book"
          >
            {!bookable ? (
              <ServicePicker />
            ) : needsDoctor && !doctor ? (
              <DoctorPicker
                serviceId={bookable.id}
                doctors={doctorOptions}
                serviceName={bookable.name}
              />
            ) : null}
          </Step>

          {/* ---------------- Step 2: date, then time ---------------- */}
          <Step
            number={2}
            title="When suits you?"
            disabled={!stepOneDone}
            done={Boolean(chosenSlot)}
            summary={chosenSlot ? formatManilaDateTime(chosenSlot.start) : undefined}
            changeHref={buildHref(base)}
          >
            {stepOneDone && !chosenSlot ? (
              days.length === 0 ? (
                <Callout tone="accent" title="Nothing free in the next few weeks">
                  <p>
                    There are no online slots for this at the moment. Please ring the
                    clinic on{' '}
                    <a
                      className="font-semibold underline underline-offset-2"
                      href={telHref(settings.phonePrimary)}
                    >
                      {settings.phonePrimary}
                    </a>{' '}
                    and we will find you a time.
                  </p>
                </Callout>
              ) : (
                <div className="space-y-6">
                  <Calendar
                    from={manilaDateString()}
                    days={settings.bookingHorizonDays}
                    availableDates={availableDates}
                    selected={params.date}
                    hrefFor={(date) => buildHref({ ...base, date })}
                  />

                  {chosenDay ? (
                    <div>
                      <h3 className="text-sm font-bold text-ink-900">
                        Times on {formatManilaDate(chosenDay.slots[0]!.start)}
                      </h3>
                      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {chosenDay.slots.map((slot) => (
                          <li key={slot.start.toISOString()}>
                            <Link
                              href={buildHref({
                                ...base,
                                date: chosenDay.date,
                                session: slot.sessionId,
                                start: slot.start.toISOString(),
                              })}
                              className="flex min-h-[3rem] items-center justify-center rounded-lg border border-line bg-surface px-2 text-sm font-semibold text-ink-900 hover:border-brand-300 hover:bg-brand-50"
                            >
                              {formatManilaTime(slot.start)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-500">
                      Pick a highlighted date to see the times available.
                    </p>
                  )}
                </div>
              )
            ) : null}
          </Step>

          {/* ---------------- Steps 3 and 4: details, then confirm ---------------- */}
          <Step
            number={3}
            title="Your details"
            disabled={!chosenSlot}
            changeHref={buildHref(base)}
            hideChange
          >
            {chosenSlot && bookable ? (
              <>
                <SlotSummary
                  serviceName={bookable.name}
                  price={bookable.pricePhp}
                  doctorName={doctor?.fullName ?? null}
                  when={formatManilaDateTime(chosenSlot.start)}
                  prep={bookable.prepInstructions}
                />
                <div className="mt-6">
                  <BookingForm
                    clinicName={settings.clinicName}
                    slot={
                      {
                        serviceId: bookable.id,
                        doctorId: doctor?.id ?? null,
                        sessionId: chosenSlot.sessionId,
                        startIso: chosenSlot.start.toISOString(),
                        serviceName: bookable.name,
                        doctorName: doctor?.fullName ?? null,
                        whenLabel: formatManilaDateTime(chosenSlot.start),
                        prepInstructions: bookable.prepInstructions,
                      } satisfies BookingSlotDetails
                    }
                  />
                </div>
              </>
            ) : null}
          </Step>
        </ol>

        <div className="mt-10 rounded-xl border border-line bg-surface-sunken px-5 py-4">
          <h2 className="text-sm font-bold text-ink-900">Would rather just ring us?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Call{' '}
            <a
              className="font-semibold text-brand-700 underline underline-offset-2"
              href={telHref(settings.phonePrimary)}
            >
              {settings.phonePrimary}
            </a>{' '}
            during clinic hours and the front desk will book you in.
          </p>
        </div>
      </Container>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Step({
  number,
  title,
  children,
  done,
  disabled,
  summary,
  changeHref,
  hideChange,
}: {
  number: number;
  title: string;
  children?: React.ReactNode;
  done?: boolean;
  disabled?: boolean;
  summary?: string;
  changeHref: string;
  hideChange?: boolean;
}) {
  return (
    <li
      className={`rounded-xl border bg-surface ${
        disabled ? 'border-line opacity-55' : 'border-line'
      }`}
      aria-current={!disabled && !done ? 'step' : undefined}
    >
      <div className="flex items-start gap-3 px-5 py-4">
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
            done ? 'bg-brand-700 text-white' : 'bg-surface-sunken text-ink-500'
          }`}
        >
          {done ? '✓' : number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-bold text-ink-900">
              <span className="sr-only">Step {number}: </span>
              {title}
            </h2>
            {done && !hideChange ? (
              <Link
                href={changeHref}
                className="text-sm font-semibold text-brand-700 underline underline-offset-2"
              >
                Change
              </Link>
            ) : null}
          </div>
          {summary ? <p className="mt-1 text-sm text-ink-500">{summary}</p> : null}
        </div>
      </div>
      {children ? <div className="border-t border-line px-5 py-5">{children}</div> : null}
    </li>
  );
}

async function ServicePicker() {
  const services = await getBookableServices();

  return (
    <div className="space-y-6">
      {CATEGORY_HEADINGS.map((category) => {
        const items = services.filter((s) => s.category === category.key);
        if (items.length === 0) return null;

        return (
          <div key={category.key}>
            <h3 className="text-sm font-bold tracking-wide text-ink-700 uppercase">
              {category.label}
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={buildHref({ service: item.id })}
                    className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink-900 hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span>{item.name}</span>
                    {item.isListedOnline ? (
                      <span className="shrink-0 text-sm font-bold text-brand-700 tabular-nums">
                        {formatPhp(item.pricePhp)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DoctorPicker({
  serviceId,
  doctors,
  serviceName,
}: {
  serviceId: string;
  doctors: { id: string; fullName: string; specialty: string }[];
  serviceName: string;
}) {
  if (doctors.length === 0) {
    return (
      <Callout tone="accent">
        No doctor is currently listed for {serviceName}. Please ring the clinic.
      </Callout>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-bold tracking-wide text-ink-700 uppercase">
        Which doctor?
      </h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {doctors.map((doc) => (
          <li key={doc.id}>
            <Link
              href={buildHref({ service: serviceId, doctor: doc.id })}
              className="block min-h-[3.25rem] rounded-lg border border-line bg-surface px-4 py-3 hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="block text-sm font-semibold text-ink-900">{doc.fullName}</span>
              <span className="block text-sm text-ink-500">{doc.specialty}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlotSummary({
  serviceName,
  price,
  doctorName,
  when,
  prep,
}: {
  serviceName: string;
  price: string;
  doctorName: string | null;
  when: string;
  prep: string | null;
}) {
  return (
    <div>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface-sunken">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ink-500">What</dt>
          <dd className="text-right text-sm font-semibold text-ink-900">{serviceName}</dd>
        </div>
        {doctorName ? (
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-ink-500">Who</dt>
            <dd className="text-right text-sm font-semibold text-ink-900">{doctorName}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ink-500">When</dt>
          <dd className="text-right text-sm font-semibold text-ink-900">{when}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-ink-500">Usual charge</dt>
          <dd className="text-right text-sm font-semibold text-ink-900">
            {formatPhp(price)}{' '}
            <span className="font-normal text-ink-500">confirmed at the desk</span>
          </dd>
        </div>
      </dl>

      {prep ? (
        <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3.5">
          <p className="text-sm font-bold text-accent-800">Before you come</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{prep}</p>
        </div>
      ) : null}
    </div>
  );
}
