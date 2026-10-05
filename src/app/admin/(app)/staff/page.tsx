import type { Metadata } from 'next';
import Link from 'next/link';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { doctors, rooms, staffUsers } from '@/db/schema';
import { ROLE_LABEL } from '@/lib/admin/roles';
import { requireAdmin } from '@/lib/auth';
import { formatManilaDateTime } from '@/lib/time';

import { deleteStaff, saveStaff } from '../crud-actions';
import { DeleteZone, RowDialog } from '../row-dialog';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Select } from '../ui';

export const metadata: Metadata = { title: 'Staff users' };
export const dynamic = 'force-dynamic';

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string; new?: string }>;
}) {
  const me = await requireAdmin();
  const { done, error, edit, new: isNew } = await searchParams;
  const [list, doctorList, roomList] = await Promise.all([
    db.select().from(staffUsers).orderBy(asc(staffUsers.name)),
    db
      .select({ id: doctors.id, fullName: doctors.fullName })
      .from(doctors)
      .orderBy(asc(doctors.sortOrder), asc(doctors.fullName)),
    db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .orderBy(asc(rooms.category), asc(rooms.sortOrder), asc(rooms.name)),
  ]);
  const doctorName = new Map(doctorList.map((d) => [d.id, d.fullName]));
  const roomName = new Map(roomList.map((r) => [r.id, r.name]));
  const editing = edit ? list.find((u) => u.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === '1';

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Staff users"
        lead="Admin and reception run the desk; only admin changes settings and staff. Doctor, laboratory and imaging accounts see their room and the waiting room screen, nothing else. A room account belongs to one room — the tablet or PC in it — and can never be in another. Deactivating someone signs them out immediately."
        actions={
          !showForm ? (
            <RowDialog
              href="/admin/staff?new=1"
              title="Add a staff member"
              trigger="Add a staff member"
              triggerClassName="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <StaffForm doctors={doctorList} rooms={roomList} />
            </RowDialog>
          ) : undefined
        }
      />

      {showForm ? (
        <Panel title={editing ? `Editing ${editing.name}` : 'Add a staff member'}>
          <StaffForm user={editing} doctors={doctorList} rooms={roomList} />
          <p className="mt-4 text-sm">
            <Link href="/admin/staff" className="text-brand-700 underline underline-offset-4">
              Back to the list
            </Link>
          </p>
        </Panel>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {list.map((user) => (
          <li
            key={user.id}
            className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 ${user.isActive ? '' : 'opacity-55'}`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">
                {user.name}
                <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-700 ring-1 ring-line-strong">
                  {ROLE_LABEL[user.role]}
                </span>
                {user.doctorId || user.roomId ? (
                  <span className="ml-2 text-sm font-normal text-ink-500">
                    {user.doctorId ? doctorName.get(user.doctorId) : roomName.get(user.roomId!)}
                  </span>
                ) : null}
                {user.id === me.id ? <span className="ml-2 text-xs text-ink-400">This is you</span> : null}
                {!user.isActive ? <span className="ml-2 text-xs font-semibold text-ink-500">Not active</span> : null}
              </p>
              <p className="text-sm text-ink-500">
                {user.email}
                <span className="mx-2 text-line-strong">|</span>
                {user.lastLoginAt ? `Last signed in ${formatManilaDateTime(user.lastLoginAt)}` : 'Never signed in'}
              </p>
            </div>
            <RowDialog
              href={`/admin/staff?edit=${user.id}`}
              title={`Editing ${user.name}`}
              trigger="Edit"
              triggerClassName="rounded border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
            >
              <StaffForm user={user} doctors={doctorList} rooms={roomList} />
              {user.id !== me.id ? (
                <DeleteZone
                  action={deleteStaff}
                  id={user.id}
                  formId={`delete-staff-${user.id}`}
                  label="Delete account"
                  title={`Delete ${user.name}?`}
                  warning={
                    <p className="text-sm leading-relaxed text-ink-700">
                      This removes the account entirely. It is refused if they have ever
                      changed a booking, because their name is on that history.
                    </p>
                  }
                />
              ) : null}
            </RowDialog>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared by the dialog and the no-JavaScript fallback panel. */
function StaffForm({
  user,
  doctors,
  rooms,
}: {
  user?: typeof staffUsers.$inferSelect;
  doctors: { id: string; fullName: string }[];
  rooms: { id: string; name: string }[];
}) {
  return (
    <form action={saveStaff} className="grid gap-4 sm:grid-cols-2">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <Field label="Name">
        <Input name="name" defaultValue={user?.name ?? ''} required maxLength={120} />
      </Field>
      <Field label="Email address" hint="This is what they sign in with.">
        <Input name="email" type="email" defaultValue={user?.email ?? ''} required maxLength={200} />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={user?.role ?? 'reception'}>
          <option value="reception">Reception</option>
          <option value="admin">Admin</option>
          <option value="doctor">Doctor</option>
          <option value="laboratory">Laboratory</option>
          <option value="imaging">Imaging</option>
          <option value="room">Room account</option>
        </Select>
      </Field>
      {/* Always shown rather than revealed by script, so it works with JavaScript off.
          The server ignores it for every role but Doctor. */}
      <Field label="Doctor" hint="For doctor accounts only: whose patients this login calls.">
        <Select name="doctorId" defaultValue={user?.doctorId ?? ''}>
          <option value="">Not a doctor account</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Room" hint="For room accounts only: the one room this login always works.">
        <Select name="roomId" defaultValue={user?.roomId ?? ''}>
          <option value="">Not a room account</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Password"
        hint={user ? 'Leave blank to keep the current one. At least 10 characters.' : 'At least 10 characters.'}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required={!user}
          minLength={user ? undefined : 10}
          maxLength={200}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
        <Checkbox name="isActive" label="Active" defaultChecked={user?.isActive ?? true} />
        <Button type="submit">{user ? 'Save changes' : 'Add staff member'}</Button>
      </div>
      {user?.isActive ? (
        <p className="text-xs text-ink-500 sm:col-span-2">
          Unticking Active signs this person out straight away and stops them signing back in.
        </p>
      ) : null}
    </form>
  );
}
