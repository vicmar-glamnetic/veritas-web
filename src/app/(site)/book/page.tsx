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
  kind?: string;
  service?: string;
  doctor?: string;
  date?: string;
  session?: string;
  start?: string;
};

/**
 * The first thing a patient picks is one of three, not one of thirty-eight. Dropping the
 * whole price list on someone as step one is the fastest way to make them close the tab
 * and ring instead.
 */
const KINDS = [
  {
    key: 'consultation' as const,
    label: 'See a doctor',
    blurb: 'A check-up, an illness, a medical certificate, or following up on your maintenance medicines.',
  },
  {
    key: 'laboratory' as const,
    label: 'Blood or urine test',
    blurb: 'CBC, blood sugar, cholesterol, liver and kidney panels, thyroid, dengue and the rest.',
  },
  {
    key: 'imaging' as const,
    label: 'X-ray, scan or heart test',
    blurb: 'Chest X-ray, ultrasound, 12-lead ECG and 2D echo.',
  },
] as const;

const KIND_BY_KEY = new Map(KINDS.map((k) => [k.key as string, k]));

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

  const kind = params.kind && KIND_BY_KEY.has(params.kind) ? params.kind : null;
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
  // The earliest bookable slot, offered as a one-tap shortcut: most patients want the
  // first thing going rather than a particular date.
  const soonest = days[0]?.slots[0] ?? null;
  const soonestDate = days[0]?.date;
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
    kind: kind ?? undefined,
    service: bookable?.id,
    doctor: doctor?.id,
  };

  // Which of the three sub-stages of step 1 to render.
  const stepOneStage = !kind
    ? 'kind'
    : !bookable
      ? 'service'
      : needsDoctor && !doctor
        ? 'doctor'
        : 'done';

  const currentStep = !stepOneDone ? 1 : !chosenSlot ? 2 : 3;

  return (
    <>
      <PageHeader
        title="Book an appointment"
        lead="Four short steps. Nothing to pay now, and we will email your reference code."
      >
        <ProgressBar current={currentStep} />
      </PageHeader>

      <Container className="py-10">
        <ol className="space-y-2">
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
            {stepOneStage === 'kind' ? (
              <KindPicker />
            ) : stepOneStage === 'service' ? (
              <ServicePicker kind={kind!} />
            ) : stepOneStage === 'doctor' ? (
              <DoctorPicker
                kind={kind!}
                serviceId={bookable!.id}
                doctors={doctorOptions}
                serviceName={bookable!.name}
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
                <div className="space-y-7">
                  {soonest ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-200 bg-brand-50 px-4 py-3.5">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
                          Soonest we can see you
                        </p>
                        <p className="mt-1 font-serif text-lg text-brand-900">
                          {formatManilaDateTime(soonest.start)}
                        </p>
                      </div>
                      <Link
                        href={`${buildHref({
                          ...base,
                          date: soonestDate,
                          session: soonest.sessionId,
                          start: soonest.start.toISOString(),
                        })}#your-details`}
                        className="inline-flex min-h-[2.75rem] items-center justify-center rounded bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
                      >
                        Take this time
                      </Link>
                    </div>
                  ) : null}

                  <Calendar
                    from={manilaDateString()}
                    days={settings.bookingHorizonDays}
                    availableDates={availableDates}
                    selected={params.date}
                    hrefFor={(date) => `${buildHref({ ...base, date })}#times`}
                  />

                  {chosenDay ? (
                    <div id="times" className="scroll-mt-32">
                      <h3 className="font-serif text-lg text-ink-900">
                        Times on {formatManilaDate(chosenDay.slots[0]!.start)}
                      </h3>
                      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {chosenDay.slots.map((slot) => (
                          <li key={slot.start.toISOString()}>
                            <Link
                              href={`${buildHref({
                                ...base,
                                date: chosenDay.date,
                                session: slot.sessionId,
                                start: slot.start.toISOString(),
                              })}#your-details`}
                              className="flex min-h-[3rem] items-center justify-center rounded border border-line-strong bg-surface px-2 text-sm font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
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
            id="your-details"
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

        <div className="mt-8 border-t border-line pt-6">
          <h2 className="font-serif text-lg text-ink-900">Would rather just ring us?</h2>
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

/** "Step 2 of 4", plus a bar. Tells people how much is left, which is most of what
 * makes a multi-step form feel short rather than endless. */
function ProgressBar({ current }: { current: number }) {
  const labels = ['What you need', 'When', 'Your details', 'Done'];
  return (
    <div className="mt-8 max-w-md">
      <p className="text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
        Step {current} of 4 · {labels[current - 1]}
      </p>
      <ol className="mt-2.5 flex gap-1.5" aria-hidden="true">
        {labels.map((label, i) => (
          <li
            key={label}
            className={`h-1.5 flex-1 rounded-full ${
              i < current ? 'bg-brand-700' : 'bg-line-strong'
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

function Step({
  number,
  title,
  children,
  done,
  disabled,
  summary,
  changeHref,
  hideChange,
  id,
}: {
  number: number;
  title: string;
  children?: React.ReactNode;
  done?: boolean;
  disabled?: boolean;
  summary?: string;
  changeHref: string;
  hideChange?: boolean;
  id?: string;
}) {
  return (
    <li
      id={id}
      className={`scroll-mt-32 border-t border-line-strong pt-5 ${disabled ? 'opacity-50' : ''}`}
      aria-current={!disabled && !done ? 'step' : undefined}
    >
      <div className="flex items-baseline gap-4">
        <span
          aria-hidden="true"
          className={`w-6 shrink-0 font-serif text-lg ${
            done ? 'text-brand-600' : 'text-brand-400'
          }`}
        >
          {done ? '\u2713' : String(number).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="font-serif text-xl text-ink-900">
              <span className="sr-only">Step {number}: </span>
              {title}
            </h2>
            {done && !hideChange ? (
              <Link
                href={changeHref}
                className="text-sm text-brand-700 underline underline-offset-4"
              >
                Change
              </Link>
            ) : null}
          </div>
          {summary ? <p className="mt-1 text-sm text-ink-500">{summary}</p> : null}
        </div>
      </div>
      {children ? <div className="mt-6 pb-8 sm:pl-10">{children}</div> : null}
    </li>
  );
}

function KindPicker() {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
        What kind of visit?
      </h3>
      <ul className="mt-4 grid gap-3">
        {KINDS.map((kind) => (
          <li key={kind.key}>
            <Link
              href={buildHref({ kind: kind.key })}
              className="group flex items-start gap-4 rounded border border-line-strong bg-surface p-4 hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg text-ink-900">{kind.label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-500">
                  {kind.blurb}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="mt-1 shrink-0 text-lg text-brand-400 group-hover:text-brand-700"
              >
                &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ServicePicker({ kind }: { kind: string }) {
  const services = await getBookableServices();
  const items = services.filter((s) => s.category === kind);
  const heading = KIND_BY_KEY.get(kind)?.label ?? 'Choose a service';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
          {heading}: choose one
        </h3>
        <Link href="/book" className="text-sm text-brand-700 underline underline-offset-4">
          Not this
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          Nothing in this group can be booked online at the moment. Please ring the clinic.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={buildHref({ kind, service: item.id })}
                className="flex min-h-[3.25rem] items-center justify-between gap-4 py-3 text-ink-900 hover:text-brand-700"
              >
                <span>{item.name}</span>
                {item.isListedOnline ? (
                  <span className="shrink-0 text-sm font-semibold text-brand-700 tabular-nums">
                    {formatPhp(item.pricePhp)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DoctorPicker({
  kind,
  serviceId,
  doctors,
  serviceName,
}: {
  kind: string;
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
          Which doctor?
        </h3>
        <Link
          href={buildHref({ kind })}
          className="text-sm text-brand-700 underline underline-offset-4"
        >
          Change service
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {doctors.map((doc) => (
          <li key={doc.id}>
            <Link
              href={buildHref({ kind, service: serviceId, doctor: doc.id })}
              className="block py-3.5 hover:text-brand-700"
            >
              <span className="block font-serif text-lg text-ink-900">{doc.fullName}</span>
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
      <dl className="divide-y divide-line rounded border border-line bg-surface">
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
        <div className="mt-4 rounded border-l-2 border-accent-200 bg-accent-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-accent-800">Before you come</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{prep}</p>
        </div>
      ) : null}
    </div>
  );
}
