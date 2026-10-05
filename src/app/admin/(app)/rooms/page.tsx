import type { Metadata } from 'next';
import Link from 'next/link';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { rooms } from '@/db/schema';
import { requireDesk } from '@/lib/auth';
import { QUEUE_CATEGORIES } from '@/lib/queue';

import { deleteRoom, saveRoom } from '../crud-actions';
import { DeleteZone, RowDialog } from '../row-dialog';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Select } from '../ui';

export const metadata: Metadata = { title: 'Rooms' };
export const dynamic = 'force-dynamic';

const CATEGORY_LABEL = Object.fromEntries(QUEUE_CATEGORIES.map((c) => [c.key, c.label]));

/**
 * The places a patient is sent to. A room's name is what the waiting room screen says
 * after "please proceed to", so it is written for patients, not for staff.
 *
 * Few rows, so each gets its own dialog, as doctors and promos do.
 */
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string; new?: string }>;
}) {
  await requireDesk();
  const { done, error, edit, new: isNew } = await searchParams;
  const list = await db
    .select()
    .from(rooms)
    .orderBy(asc(rooms.category), asc(rooms.sortOrder), asc(rooms.name));
  const editing = edit ? list.find((r) => r.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === '1';

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Rooms"
        lead="Each room serves one kind of visit. Staff pick their room when they open My room, and the waiting room screen tells the patient which room to go to."
        actions={
          !showForm ? (
            <RowDialog
              href="/admin/rooms?new=1"
              title="Add a room"
              trigger="Add a room"
              triggerClassName="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <RoomForm nextOrder={list.length + 1} />
            </RowDialog>
          ) : undefined
        }
      />

      {showForm ? (
        <Panel title={editing ? `Editing ${editing.name}` : 'Add a room'}>
          <RoomForm room={editing} nextOrder={list.length + 1} />
          <p className="mt-4 text-sm">
            <Link href="/admin/rooms" className="text-brand-700 underline underline-offset-4">
              Back to the list
            </Link>
          </p>
        </Panel>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded border border-line bg-surface px-5 py-10 text-center text-ink-500">
          No rooms yet. Add one for each consultation room, the laboratory and each imaging
          room, so staff have somewhere to call patients to.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {list.map((room) => (
            <li
              key={room.id}
              className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 ${room.isActive ? '' : 'opacity-55'}`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">
                  {room.name}
                  {!room.isActive ? (
                    <span className="ml-2 text-xs font-semibold text-ink-500">Not active</span>
                  ) : null}
                </p>
                <p className="text-sm text-ink-500">{CATEGORY_LABEL[room.category]}</p>
              </div>
              <RowDialog
                href={`/admin/rooms?edit=${room.id}`}
                title={`Editing ${room.name}`}
                trigger="Edit"
                triggerClassName="rounded border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
              >
                <RoomForm room={room} nextOrder={list.length + 1} />
                <DeleteZone
                  action={deleteRoom}
                  id={room.id}
                  formId={`delete-room-${room.id}`}
                  label="Delete room"
                  title={`Delete ${room.name}?`}
                  warning={
                    <p className="text-sm leading-relaxed text-ink-700">
                      This is refused once any patient has been called to the room, because
                      the record says where they went. Untick Active instead.
                    </p>
                  }
                />
              </RowDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shared by the dialog and the no-JavaScript fallback panel. */
function RoomForm({ room, nextOrder }: { room?: typeof rooms.$inferSelect; nextOrder: number }) {
  return (
    <form action={saveRoom} className="grid gap-4 sm:grid-cols-2">
      {room ? <input type="hidden" name="id" value={room.id} /> : null}
      <Field
        label="Name"
        hint="As patients will see it: “Consultation Room 2”, “Phlebotomy”, “X-ray Room”."
        className="sm:col-span-2"
      >
        <Input name="name" defaultValue={room?.name ?? ''} required maxLength={80} />
      </Field>
      <Field label="Serves">
        <Select name="category" defaultValue={room?.category ?? 'consultation'}>
          {QUEUE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Order">
        <Input
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          defaultValue={room?.sortOrder ?? nextOrder}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
        <Checkbox name="isActive" label="Active" defaultChecked={room?.isActive ?? true} />
        <Button type="submit">{room ? 'Save changes' : 'Add room'}</Button>
      </div>
    </form>
  );
}
