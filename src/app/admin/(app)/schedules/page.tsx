import type { Metadata } from 'next';

import { asc, eq, gte } from 'drizzle-orm';

import { db } from '@/db';
import { doctors, sessionBlackouts, sessions } from '@/db/schema';
import { getBookingsAffectedByBlackout } from '@/lib/admin/queries';
import { requireStaff } from '@/lib/auth';
import { formatMobile } from '@/lib/mobile';
import { DAY_NAMES, formatManilaTime, formatWallClock, manilaDateString } from '@/lib/time';
import { slotStartTimes, distributeOnlineCapacity } from '@/lib/availability';

import { addBlackout, removeBlackout, saveSession } from '../crud-actions';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Select } from '../ui';

export const metadata: Metadata = { title: 'Schedules' };
export const dynamic = 'force-dynamic';

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string }>;
}) {
  await requireStaff();
  const { done, error, edit } = await searchParams;
  const today = manilaDateString();

  const [sessionList, doctorList, blackouts] = await Promise.all([
    db.select().from(sessions).orderBy(asc(sessions.dayOfWeek), asc(sessions.startTime)),
    db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.fullName)),
    db
      .select()
      .from(sessionBlackouts)
      .where(gte(sessionBlackouts.date, today))
      .orderBy(asc(sessionBlackouts.date)),
  ]);

  const doctorName = new Map(doctorList.map((d) => [d.id, d.fullName]));
  const editing = edit ? sessionList.find((s) => s.id === edit) : undefined;

  // Who is caught by each upcoming closed day, so the desk knows who to ring.
  const affected = await Promise.all(
    blackouts.map((b) =>
      getBookingsAffectedByBlackout(b.date, {
        sessionId: b.sessionId ?? undefined,
        doctorId: b.doctorId ?? undefined,
      }),
    ),
  );

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Schedules"
        lead="Sessions are the recurring weekly clinic times. The booking calendar is worked out from these, so there is no separate list of open slots to keep up to date."
      />

      <Panel
        title={editing ? 'Editing a session' : 'Add a session'}
        description="Capacity is how many patients the whole session takes, not per slot. Online places are how many of those the website may give away; the rest are kept for walk-ins."
      >
        <form action={saveSession} className="grid gap-4 sm:grid-cols-3">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <Field label="Kind">
            <Select name="serviceCategory" defaultValue={editing?.serviceCategory ?? 'consultation'}>
              <option value="consultation">Consultation</option>
              <option value="laboratory">Laboratory</option>
              <option value="imaging">Imaging</option>
            </Select>
          </Field>
          <Field label="Doctor" hint="Consultations only. Leave blank for lab and imaging.">
            <Select name="doctorId" defaultValue={editing?.doctorId ?? ''}>
              <option value="">No doctor</option>
              {doctorList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day">
            <Select name="dayOfWeek" defaultValue={String(editing?.dayOfWeek ?? 1)}>
              {DAY_NAMES.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starts">
            <Input name="startTime" type="time" defaultValue={(editing?.startTime ?? '09:00:00').slice(0, 5)} required />
          </Field>
          <Field label="Ends">
            <Input name="endTime" type="time" defaultValue={(editing?.endTime ?? '12:00:00').slice(0, 5)} required />
          </Field>
          <Field label="Slot length (minutes)">
            <Input name="slotMinutes" type="number" min={5} max={240} defaultValue={editing?.slotMinutes ?? 20} required />
          </Field>
          <Field label="Total patients">
            <Input name="capacity" type="number" min={1} max={500} defaultValue={editing?.capacity ?? 9} required />
          </Field>
          <Field label="Of those, bookable online">
            <Input name="onlineCapacity" type="number" min={0} max={500} defaultValue={editing?.onlineCapacity ?? 6} required />
          </Field>
          <Field label="Cut-off (hours before)" hint="Online booking closes this long before the slot.">
            <Input name="bookingCutoffHours" type="number" min={0} max={336} defaultValue={editing?.bookingCutoffHours ?? 2} required />
          </Field>
          <div className="flex items-end">
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit">{editing ? 'Save session' : 'Add session'}</Button>
            {editing ? (
              <a href="/admin/schedules" className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken">
                Cancel
              </a>
            ) : null}
          </div>
        </form>
      </Panel>

      <div className="overflow-hidden rounded border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-sunken text-left">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Day</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Time</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Who / what</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Slots</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Online / total</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sessionList.map((s) => {
              const slots = slotStartTimes(s.startTime, s.endTime, s.slotMinutes);
              const spread = distributeOnlineCapacity(s.onlineCapacity, slots.length);
              const bookableSlots = spread.filter((n) => n > 0).length;
              return (
                <tr key={s.id} className={s.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5">{DAY_NAMES[s.dayOfWeek]}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {formatWallClock(s.startTime)} to {formatWallClock(s.endTime)}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.doctorId ? doctorName.get(s.doctorId) ?? 'Unknown doctor' : null}
                    <span className="text-ink-500 capitalize">
                      {s.doctorId ? ` · ${s.serviceCategory}` : s.serviceCategory}
                    </span>
                    {!s.isActive ? <span className="ml-2 text-xs text-ink-400">(inactive)</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-ink-500 tabular-nums">
                    {slots.length} × {s.slotMinutes}m
                    <span className="ml-1 text-xs text-ink-400">({bookableSlots} offered)</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {s.onlineCapacity} / {s.capacity}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a href={`/admin/schedules?edit=${s.id}`} className="font-semibold text-brand-700 underline underline-offset-4">
                      Edit
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Panel
        title="Closed days"
        description="Blocks a date so nothing can be booked. Leave the target blank to close the whole clinic, for a holiday."
      >
        <form action={addBlackout} className="grid gap-4 sm:grid-cols-4">
          <Field label="Date">
            <Input name="date" type="date" defaultValue={today} required />
          </Field>
          <Field label="What is closed" className="sm:col-span-2">
            <Select name="target" defaultValue="">
              <option value="">The whole clinic</option>
              {doctorList.map((d) => (
                <option key={d.id} value={`doctor:${d.id}`}>
                  {d.fullName} is away
                </option>
              ))}
              {sessionList
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={`session:${s.id}`}>
                    {DAY_NAMES[s.dayOfWeek]} {formatWallClock(s.startTime)}{' '}
                    {s.doctorId ? doctorName.get(s.doctorId) : s.serviceCategory}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Reason" hint="Staff will read this out to patients.">
            <Input name="reason" required maxLength={300} placeholder="Public holiday" />
          </Field>
          <div className="sm:col-span-4">
            <Button type="submit">Add closed day</Button>
          </div>
        </form>

        {blackouts.length > 0 ? (
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {blackouts.map((b, i) => {
              const hit = affected[i] ?? [];
              return (
                <li key={b.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink-900">
                        {b.date}
                        <span className="ml-2 font-normal text-ink-500">
                          {b.sessionId
                            ? 'one session'
                            : b.doctorId
                              ? `${doctorName.get(b.doctorId) ?? 'a doctor'} away`
                              : 'whole clinic'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-ink-500">{b.reason}</p>
                    </div>
                    <form action={removeBlackout}>
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" tone="danger">
                        Remove
                      </Button>
                    </form>
                  </div>

                  {hit.length > 0 ? (
                    <div className="mt-3 rounded border border-accent-200 bg-accent-50 px-4 py-3">
                      <p className="text-sm font-semibold text-accent-800">
                        {hit.length} {hit.length === 1 ? 'patient has' : 'patients have'} a booking
                        that day. Please ring them.
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-ink-700">
                        {hit.map((booking) => (
                          <li key={booking.id}>
                            {formatManilaTime(booking.scheduledStart)} · {booking.patientName} ·{' '}
                            <a
                              href={`tel:${booking.patientMobile}`}
                              className="underline underline-offset-4"
                            >
                              {formatMobile(booking.patientMobile)}
                            </a>{' '}
                            · {booking.serviceName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ink-500">No bookings affected.</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 border-t border-line pt-4 text-sm text-ink-500">
            No closed days coming up.
          </p>
        )}
      </Panel>
    </div>
  );
}
