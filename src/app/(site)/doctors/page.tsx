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
          <ul className="divide-y divide-line border-t border-line">
            {doctors.map((doctor) => {
              const blocks = groupSessionsIntoBlocks(
                consultationSessions.filter((s) => s.doctorId === doctor.id),
              );

              return (
                <li key={doctor.id} className="py-7 sm:grid sm:grid-cols-[1fr_15rem] sm:gap-10">
                  <div className="max-w-2xl">
                    <h2 className="font-serif text-xl text-ink-900">{doctor.fullName}</h2>
                    <p className="mt-0.5 text-sm font-medium text-brand-600">
                      {doctor.specialty}
                    </p>
                    {doctor.bio ? (
                      <p className="mt-3 text-sm leading-relaxed text-ink-500">{doctor.bio}</p>
                    ) : null}
                  </div>

                  <div className="mt-5 sm:mt-0">
                    <h3 className="text-xs font-semibold tracking-[0.14em] text-ink-400 uppercase">
                      Clinic days
                    </h3>
                    {blocks.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-500">
                        No regular clinic day at the moment. Please ring and ask.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {blocks.map((block) => (
                          <li
                            key={`${block.startTime}-${block.days.join(',')}`}
                            className="text-sm text-ink-700"
                          >
                            <span className="font-semibold">{formatDays(block.days)}</span>
                            <span className="text-ink-500">
                              {' '}
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

        <div className="mt-10">
          <ButtonLink href="/book">Book a consultation</ButtonLink>
        </div>
      </Container>
    </>
  );
}
