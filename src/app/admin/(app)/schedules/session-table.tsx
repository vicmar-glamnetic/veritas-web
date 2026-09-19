'use client';

import { useEffect, useRef, useState } from 'react';

import { deleteSession, saveSession } from '../crud-actions';
import { DeleteZone } from '../row-dialog';
import { Button, Checkbox, Field, Input, Select } from '../ui';

export type SessionRow = {
  id: string;
  doctorId: string | null;
  doctorName: string | null;
  serviceCategory: 'consultation' | 'laboratory' | 'imaging';
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  startLabel: string;
  endLabel: string;
  slotMinutes: number;
  slotCount: number;
  offeredSlots: number;
  capacity: number;
  onlineCapacity: number;
  bookingCutoffHours: number;
  isActive: boolean;
};

/**
 * The weekly schedule, with editing in one shared dialog.
 *
 * Giving every row its own dialog put thirty full forms in the document: 525KB of HTML
 * and 442 inputs on a page that should be a table. One dialog, re-keyed per row, is 53KB.
 */
export function SessionTable({
  rows,
  doctors,
  dayNames,
}: {
  rows: SessionRow[];
  doctors: { id: string; fullName: string }[];
  dayNames: readonly string[];
}) {
  const [editing, setEditing] = useState<SessionRow | 'new' | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  const open = (row: SessionRow | 'new') => (event: React.MouseEvent) => {
    if (typeof dialogRef.current?.showModal !== 'function') return;
    event.preventDefault();
    setEditing(row);
  };

  const current = editing === 'new' ? null : editing;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <a
          href="/admin/schedules?new=1"
          onClick={open('new')}
          className="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Add a session
        </a>
      </div>

      <div className="overflow-x-auto rounded border border-line bg-surface">
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
            {rows.map((s) => (
              <tr key={s.id} className={s.isActive ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5">{s.dayName}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {s.startLabel} to {s.endLabel}
                </td>
                <td className="px-4 py-2.5">
                  {s.doctorName}
                  <span className="text-ink-500 capitalize">
                    {s.doctorName ? ` · ${s.serviceCategory}` : s.serviceCategory}
                  </span>
                  {!s.isActive ? <span className="ml-2 text-xs text-ink-400">(inactive)</span> : null}
                </td>
                <td className="px-4 py-2.5 text-ink-500 tabular-nums">
                  {s.slotCount} × {s.slotMinutes}m
                  <span className="ml-1 text-xs text-ink-400">({s.offeredSlots} offered)</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {s.onlineCapacity} / {s.capacity}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <a
                    href={`/admin/schedules?edit=${s.id}`}
                    onClick={open(s)}
                    className="rounded border border-line-strong px-3 py-1.5 font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
                  >
                    Edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        // React bubbles onClose, so without this the nested delete confirmation closing
        // would close the edit dialog around it.
        onClose={(event) => {
          if (event.target === dialogRef.current) setEditing(null);
        }}
        aria-label={current ? 'Editing a session' : 'Add a session'}
        className="m-auto w-[min(48rem,calc(100vw-2rem))] rounded border border-line-strong bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
      >
        {editing ? (
          <div key={current?.id ?? 'new'} className="max-h-[85vh] overflow-y-auto p-6">
            <h2 className="font-serif text-xl text-ink-900">
              {current ? `${current.dayName} ${current.startLabel}` : 'Add a session'}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Capacity is how many patients the whole session takes, not per slot. Online
              places are how many of those the website may give away; the rest are kept for
              walk-ins.
            </p>
            <div className="mt-5">
              <SessionFields session={current} doctors={doctors} dayNames={dayNames} />
            </div>
            {current ? (
              <DeleteZone
                action={deleteSession}
                id={current.id}
                formId={`delete-session-${current.id}`}
                label="Delete session"
                title="Delete this session?"
                warning={
                  <p className="text-sm leading-relaxed text-ink-700">
                    This removes the recurring {current.dayName} {current.startLabel} session.
                    It is refused if anyone has booked into it, because that would break the
                    record.
                  </p>
                }
              />
            ) : null}
            <div className="mt-5 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-sm text-ink-500 underline underline-offset-4 hover:text-ink-900"
              >
                Close without saving
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function SessionFields({
  session,
  doctors,
  dayNames,
}: {
  session: SessionRow | null;
  doctors: { id: string; fullName: string }[];
  dayNames: readonly string[];
}) {
  return (
    <form action={saveSession} className="grid gap-4 sm:grid-cols-3">
      {session ? <input type="hidden" name="id" value={session.id} /> : null}
      <Field label="Kind">
        <Select name="serviceCategory" defaultValue={session?.serviceCategory ?? 'consultation'}>
          <option value="consultation">Consultation</option>
          <option value="laboratory">Laboratory</option>
          <option value="imaging">Imaging</option>
        </Select>
      </Field>
      <Field label="Doctor" hint="Consultations only. Leave blank for lab and imaging.">
        <Select name="doctorId" defaultValue={session?.doctorId ?? ''}>
          <option value="">No doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Day">
        <Select name="dayOfWeek" defaultValue={String(session?.dayOfWeek ?? 1)}>
          {dayNames.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Starts">
        <Input name="startTime" type="time" defaultValue={(session?.startTime ?? '09:00:00').slice(0, 5)} required />
      </Field>
      <Field label="Ends">
        <Input name="endTime" type="time" defaultValue={(session?.endTime ?? '12:00:00').slice(0, 5)} required />
      </Field>
      <Field label="Slot length (minutes)">
        <Input name="slotMinutes" type="number" min={5} max={240} defaultValue={session?.slotMinutes ?? 20} required />
      </Field>
      <Field label="Total patients">
        <Input name="capacity" type="number" min={1} max={500} defaultValue={session?.capacity ?? 9} required />
      </Field>
      <Field label="Of those, bookable online">
        <Input name="onlineCapacity" type="number" min={0} max={500} defaultValue={session?.onlineCapacity ?? 6} required />
      </Field>
      <Field label="Cut-off (hours before)" hint="Online booking closes this long before the slot.">
        <Input name="bookingCutoffHours" type="number" min={0} max={336} defaultValue={session?.bookingCutoffHours ?? 2} required />
      </Field>
      <div className="flex items-center justify-between gap-4 sm:col-span-3">
        <Checkbox name="isActive" label="Active" defaultChecked={session?.isActive ?? true} />
        <Button type="submit">{session ? 'Save session' : 'Add session'}</Button>
      </div>
    </form>
  );
}
