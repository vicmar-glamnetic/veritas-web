import type { Metadata } from 'next';
import Link from 'next/link';

import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db';
import { doctors, rooms, staffUsers } from '@/db/schema';
import { isDeskRole, mayWorkRoom } from '@/lib/admin/roles';
import { requireStaff } from '@/lib/auth';
import {
  canRecall,
  compareInLine,
  formatTicket,
  QUEUE_CATEGORIES,
  type QueueCategory,
} from '@/lib/queue';
import { getLineTickets, getReferrals, type StationTicket } from '@/lib/queue-service';
import { formatManilaTime, manilaDateString } from '@/lib/time';

import { Field, Flash, Input, PageTitle, Panel, Select } from '../ui';
import {
  callNext,
  chooseStation,
  finish,
  leaveStation,
  recall,
  sendOn,
  skip,
  start,
  undo,
} from './actions';
import { AutoRefresh, SubmitButton } from './station-ui';

export const metadata: Metadata = { title: 'My room' };
// A room working its line must never see a cached list.
export const dynamic = 'force-dynamic';

const CATEGORY_LABEL = Object.fromEntries(QUEUE_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  QueueCategory,
  string
>;

/**
 * The screen for whoever is working a room: a doctor on a tablet, the phlebotomist, the
 * X-ray technician, or the desk covering a room.
 *
 * Choose a room once per sign-in. After that it is one patient at a time: Call puts the
 * next number on the waiting room screen with this room's name, Start says they came in,
 * Finish frees the room. Skip is for a number nobody answered; they can be recalled to
 * the front once.
 *
 * Patient names are shown in full here because this is a staff screen in a room. The
 * wall gets a shortened name and never the service.
 */
export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; change?: string }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;

  const [roomList, doctorList, ownedRooms] = await Promise.all([
    db
      .select({ id: rooms.id, name: rooms.name, category: rooms.category })
      .from(rooms)
      .where(eq(rooms.isActive, true))
      .orderBy(asc(rooms.category), asc(rooms.sortOrder), asc(rooms.name)),
    db
      .select({ id: doctors.id, fullName: doctors.fullName })
      .from(doctors)
      .where(eq(doctors.isActive, true))
      .orderBy(asc(doctors.sortOrder), asc(doctors.fullName)),
    // Rooms that have their own room account, which nobody else may pick.
    db
      .select({ roomId: staffUsers.roomId })
      .from(staffUsers)
      .where(and(isNotNull(staffUsers.roomId), eq(staffUsers.isActive, true))),
  ]);
  const owned = new Set(ownedRooms.map((r) => r.roomId));

  // A room account sees only its own room; everyone else the rooms their role may work.
  const allowed = staff.roomFixed
    ? roomList.filter((r) => r.id === staff.roomId)
    : roomList.filter(
        (r) => mayWorkRoom(staff.role, r.category as QueueCategory) && !owned.has(r.id),
      );
  // A room chosen before it got its own room account no longer counts.
  const room =
    staff.roomId && (staff.roomFixed || !owned.has(staff.roomId))
      ? roomList.find((r) => r.id === staff.roomId)
      : undefined;
  const lineDoctorId = staff.role === 'doctor' ? staff.doctorId : staff.stationDoctorId;
  const needsDoctor = room?.category === 'consultation' && !lineDoctorId;
  // A room account never changes room. In a consultation room it still says whose patients.
  const canChangeDoctor = room?.category === 'consultation' && staff.role !== 'doctor';
  const canChange = !staff.roomFixed || canChangeDoctor;

  if (!room || needsDoctor || (params.change === '1' && canChange)) {
    return (
      <div className="space-y-6">
        <Flash done={params.done} error={params.error} />
        <PageTitle
          title={
            staff.roomFixed ? 'Whose patients is this room calling?' : 'Which room are you in?'
          }
          lead={
            staff.roomFixed
              ? 'This is a room account, fixed to its room. Pick the doctor working here today.'
              : 'Patients you call will be sent to this room on the waiting room screen. You choose once each time you sign in.'
          }
        />
        <Panel>
          {allowed.length === 0 ? (
            <p className="text-sm text-ink-500">
              {roomList.some(
                (r) => owned.has(r.id) && mayWorkRoom(staff.role, r.category as QueueCategory),
              )
                ? 'Every room you could work has its own room account. Use the screen in that room. '
                : 'There are no rooms you can work yet. '}
              {isDeskRole(staff.role) ? (
                <Link href="/admin/rooms" className="text-brand-700 underline underline-offset-4">
                  Add the clinic’s rooms
                </Link>
              ) : (
                'Ask the front desk to add the clinic’s rooms.'
              )}
            </p>
          ) : (
            <form action={chooseStation} className="grid max-w-xl gap-4">
              <Field label="Room">
                <Select name="roomId" defaultValue={room?.id ?? allowed[0].id} required>
                  {QUEUE_CATEGORIES.map((c) => {
                    const mine = allowed.filter((r) => r.category === c.key);
                    return mine.length ? (
                      <optgroup key={c.key} label={c.label}>
                        {mine.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </Select>
              </Field>

              {staff.role === 'doctor' ? (
                <p className="text-sm text-ink-500">You will call your own patients.</p>
              ) : allowed.some((r) => r.category === 'consultation') ? (
                <Field
                  label="Whose patients"
                  hint="For a consultation room only. Each doctor has their own line; laboratory and imaging rooms ignore this."
                >
                  <Select name="doctorId" defaultValue={staff.stationDoctorId ?? ''}>
                    <option value="">Not a consultation room</option>
                    {doctorList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <div className="flex flex-wrap items-center gap-4">
                <SubmitButton pendingLabel="Saving…">Use this room</SubmitButton>
                {room && !needsDoctor ? (
                  <Link
                    href="/admin/station"
                    className="text-sm text-brand-700 underline underline-offset-4"
                  >
                    Stay in {room.name}
                  </Link>
                ) : null}
              </div>
            </form>
          )}
        </Panel>
      </div>
    );
  }

  const category = room.category as QueueCategory;
  const doctorName = lineDoctorId ? doctorList.find((d) => d.id === lineDoctorId)?.fullName : null;
  const view = await loadLine(category, category === 'consultation' ? lineDoctorId : null, room.id);
  const { current, waiting, skipped, elsewhere } = view;
  const sentOn = current?.startedAt ? await getReferrals(db, current.id) : [];
  // Where this room can send a patient: every other department.
  const onward = QUEUE_CATEGORIES.filter((c) => c.key !== category);
  const upNext = waiting[0];

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <Flash done={params.done} error={params.error} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-brand-600 uppercase">
            {CATEGORY_LABEL[category]}
          </p>
          <h1 className="mt-1 font-serif text-2xl text-ink-900">{room.name}</h1>
          {doctorName ? (
            <p className="mt-0.5 text-sm text-ink-500">Calling {doctorName}’s patients</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {canChange ? (
            <Link
              href="/admin/station?change=1"
              className="rounded border border-line-strong bg-surface px-3 py-2 font-medium text-ink-900 hover:bg-surface-sunken"
            >
              {staff.roomFixed ? 'Change doctor' : 'Change room'}
            </Link>
          ) : null}
          {staff.roomFixed ? (
            <span className="text-ink-500">Room account</span>
          ) : (
            <form action={leaveStation}>
              <SubmitButton tone="quiet" pendingLabel="Leaving…">
                Leave room
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {/* The one patient this room is dealing with, and what can happen to them next. */}
      <section aria-label="In this room" className="rounded border border-line bg-surface p-5">
        {current ? (
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="font-mono text-5xl font-semibold tracking-tight text-ink-900 tabular-nums">
                {formatTicket(current.category, current.number)}
              </p>
              <p className="mt-2 text-lg text-ink-900">{current.patientName ?? 'No name taken'}</p>
              <p className="text-sm text-ink-500">
                {describe(current)}
                {current.recalledAt ? ' · back after being skipped' : ''}
              </p>
              <p className="mt-2 text-sm font-medium text-ink-700">
                {current.startedAt
                  ? `With you since ${current.startedLabel}`
                  : `Called at ${current.calledLabel}. Waiting for them to come in.`}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:min-w-56">
              {current.startedAt ? (
                <form action={finish}>
                  <SubmitButton size="large" pendingLabel="Finishing…">
                    Finish
                  </SubmitButton>
                </form>
              ) : (
                <>
                  <form action={start} className="flex">
                    <SubmitButton size="large" pendingLabel="Starting…">
                      Start: they are here
                    </SubmitButton>
                  </form>
                  <form action={skip} className="flex">
                    <SubmitButton tone="secondary" pendingLabel="Skipping…">
                      Skip: they did not come
                    </SubmitButton>
                  </form>
                  <form action={undo} className="flex">
                    <SubmitButton
                      tone="quiet"
                      pendingLabel="Undoing…"
                      ariaLabel={`Undo call: put ${formatTicket(current.category, current.number)} back in the line`}
                    >
                      Undo call
                    </SubmitButton>
                  </form>
                </>
              )}
            </div>

            {/*
             * Sending on. Only once they are in the room, because only somebody who has
             * been seen can be sent for tests. Each department gives its own number.
             */}
            {current.startedAt ? (
              <div className="w-full border-t border-line pt-4">
                <h2 className="text-sm font-semibold text-ink-900">Send them on</h2>
                <p className="mt-0.5 text-sm text-ink-500">
                  A new number in that department, for the same patient. Tell them the number before
                  they leave.
                </p>
                {sentOn.length > 0 ? (
                  <p className="mt-2 text-sm font-medium text-brand-800">
                    Already given:{' '}
                    {sentOn.map((t) => (
                      <span key={t.id} className="mr-2 font-mono tabular-nums">
                        {formatTicket(t.category, t.number)}
                      </span>
                    ))}
                  </p>
                ) : null}
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {onward
                    .filter((c) => !sentOn.some((t) => t.category === c.key))
                    .map((c) => (
                      <form key={c.key} action={sendOn} className="flex flex-col gap-2">
                        <input type="hidden" name="category" value={c.key} />
                        <Field
                          label={`For ${c.label.toLowerCase()}`}
                          hint="Optional. What it is for, e.g. CBC, FBS."
                        >
                          <Input name="note" maxLength={200} autoComplete="off" />
                        </Field>
                        <SubmitButton tone="secondary" pendingLabel="Issuing…">
                          Send to {c.label.toLowerCase()}
                        </SubmitButton>
                      </form>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-lg text-ink-900">The room is free.</p>
              <p className="text-sm text-ink-500">
                {waiting.length === 0
                  ? 'Nobody is waiting. New arrivals appear here by themselves.'
                  : `${waiting.length} waiting.`}
              </p>
            </div>
            <form action={callNext}>
              <SubmitButton
                size="large"
                pendingLabel="Calling…"
                disabled={!upNext}
                ariaLabel={
                  upNext
                    ? `Call ${formatTicket(upNext.category, upNext.number)}, ${upNext.patientName ?? 'no name'}`
                    : 'No one waiting'
                }
              >
                {upNext ? (
                  <>
                    Call{' '}
                    <span className="font-mono tabular-nums">
                      {formatTicket(upNext.category, upNext.number)}
                    </span>
                  </>
                ) : (
                  'No one waiting'
                )}
              </SubmitButton>
            </form>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={`Waiting (${waiting.length})`}
          description="In the order they will be called."
        >
          {waiting.length === 0 ? (
            <p className="text-sm text-ink-500">Nobody waiting.</p>
          ) : (
            <ol className="divide-y divide-line">
              {waiting.map((t, i) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="w-5 text-right text-xs text-ink-400 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="font-mono font-semibold text-ink-900 tabular-nums">
                      {formatTicket(t.category, t.number)}
                    </span>
                    <span className="text-ink-900">{t.patientName ?? 'No name taken'}</span>
                  </span>
                  <span className="text-sm text-ink-500">
                    {t.recalledAt ? (
                      <span className="mr-2 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-800 ring-1 ring-accent-200">
                        Back from skip
                      </span>
                    ) : null}
                    {describe(t)}
                    {category === 'consultation' && t.isWalkIn && !t.doctorId
                      ? ' · any doctor'
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title={`Skipped (${skipped.length})`}
            description="Called and did not come. If they turn up, recall them to the front. Once only."
          >
            {skipped.length === 0 ? (
              <p className="text-sm text-ink-500">Nobody skipped.</p>
            ) : (
              <ul className="divide-y divide-line">
                {skipped.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <span>
                      <span className="font-mono font-semibold text-ink-900 tabular-nums">
                        {formatTicket(t.category, t.number)}
                      </span>{' '}
                      <span className="text-ink-900">{t.patientName ?? 'No name taken'}</span>
                    </span>
                    {canRecall(t) ? (
                      <form action={recall}>
                        <input type="hidden" name="ticketId" value={t.id} />
                        <SubmitButton
                          tone="secondary"
                          pendingLabel="Recalling…"
                          ariaLabel={`Recall ${formatTicket(t.category, t.number)} to the front of the line`}
                        >
                          Recall to front
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-ink-500">
                        Skipped twice. New number at reception.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {elsewhere.length > 0 ? (
            <Panel title="Other rooms on this line">
              <ul className="space-y-1.5 text-sm">
                {elsewhere.map((t) => (
                  <li key={t.id} className="text-ink-700">
                    <span className="font-mono font-semibold tabular-nums">
                      {formatTicket(t.category, t.number)}
                    </span>{' '}
                    is in {t.roomName ?? 'another room'}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Shown = StationTicket & { calledLabel: string; startedLabel: string };

/**
 * Fetch and shape the line. Kept out of the component, as the Today page does, because
 * reading the clock during render is the impurity the React lint rules exist to catch.
 */
async function loadLine(category: QueueCategory, doctorId: string | null, roomId: string) {
  const tickets = await getLineTickets(db, manilaDateString(), category, doctorId);
  const label = (t: StationTicket): Shown => ({
    ...t,
    calledLabel: t.calledAt ? formatManilaTime(t.calledAt) : '',
    startedLabel: t.startedAt ? formatManilaTime(t.startedAt) : '',
  });

  return {
    current: (() => {
      const mine = tickets.find((t) => t.status === 'called' && t.roomId === roomId);
      return mine ? label(mine) : null;
    })(),
    waiting: tickets
      .filter((t) => t.status === 'waiting')
      .sort(compareInLine)
      .map(label),
    skipped: tickets.filter((t) => t.status === 'skipped').map(label),
    elsewhere: tickets.filter((t) => t.status === 'called' && t.roomId !== roomId),
  };
}

/** What a ticket is for: the booked service, where it was sent from and why, or walk-in. */
function describe(t: StationTicket): string {
  if (t.referredFrom) {
    const from = `From ${formatTicket(t.referredFrom.category, t.referredFrom.number)}`;
    return t.referralNote ? `${from} · ${t.referralNote}` : from;
  }
  return t.serviceName ?? (t.isWalkIn ? 'Walk-in' : '');
}
