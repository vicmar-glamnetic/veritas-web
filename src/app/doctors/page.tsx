import type { Metadata } from 'next';

import { ButtonLink, Callout, Container, PageHeader } from '@/components/ui';
import { getActiveDoctorSessions, getActiveDoctors } from '@/lib/queries';
import { formatDays, groupSessionsIntoBlocks } from '@/lib/schedule-display';
import { formatWallClock } from '@/lib/time';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Our doctors',
  description:
    'The doctors at the clinic, their specialties, and which days each of them holds clinic.',
};

export default async function DoctorsPage() {
  const [doctors, consultationSessions] = await Promise.all([
    getActiveDoctors(),
    getActiveDoctorSessions(),
  ]);

  return (
    <>
      <PageHeader
        title="Our doctors"
        lead="These clinic days come from the same schedule the front desk works off, so they are current. Doctors do get called away now and then. Booking ahead is the surest way to be seen."
      />

      <Container className="py-10">
        {doctors.length === 0 ? (
          <Callout>
            The schedule is being updated at the moment. Please ring the clinic and we
            will tell you who is in.
          </Callout>
        ) : (
          <ul className="space-y-4">
            {doctors.map((doctor) => {
              const blocks = groupSessionsIntoBlocks(
                consultationSessions.filter((s) => s.doctorId === doctor.id),
              );

              return (
                <li
                  key={doctor.id}
                  className="rounded-xl border border-line bg-surface p-5 sm:flex sm:gap-5"
                >
                  <div
                    aria-hidden="true"
                    className="mb-4 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-800 sm:mb-0"
                  >
                    {doctor.fullName
                      .replace(/^Dra?\.\s*/, '')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-ink-900">{doctor.fullName}</h2>
                    <p className="text-sm font-semibold text-brand-700">{doctor.specialty}</p>

                    {doctor.bio ? (
                      <p className="mt-3 text-sm leading-relaxed text-ink-500">{doctor.bio}</p>
                    ) : null}

                    <h3 className="mt-4 text-xs font-bold tracking-wide text-ink-700 uppercase">
                      Clinic days
                    </h3>
                    {blocks.length === 0 ? (
                      <p className="mt-1.5 text-sm text-ink-500">
                        No regular clinic day at the moment. Please ring and ask.
                      </p>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {blocks.map((block) => (
                          <li
                            key={`${block.startTime}-${block.days.join(',')}`}
                            className="text-sm text-ink-700"
                          >
                            <span className="font-semibold">{formatDays(block.days)}</span>
                            <span className="text-ink-500">
                              {' · '}
                              {formatWallClock(block.startTime)} to{' '}
                              {formatWallClock(block.endTime)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8">
          <ButtonLink href="/book">Book a consultation</ButtonLink>
        </div>
      </Container>
    </>
  );
}
