import type { Metadata } from 'next';
import Link from 'next/link';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { staffUsers } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { formatManilaDateTime } from '@/lib/time';

import { saveStaff } from '../crud-actions';
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
  const list = await db.select().from(staffUsers).orderBy(asc(staffUsers.name));
  const editing = edit ? list.find((u) => u.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === '1';

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Staff users"
        lead="Admin accounts can change settings and manage staff. Reception accounts can do everything else. Deactivating someone signs them out immediately."
        actions={
          !showForm ? (
            <Link
              href="/admin/staff?new=1"
              className="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Add a staff member
            </Link>
          ) : undefined
        }
      />

      {showForm ? (
        <Panel title={editing ? `Editing ${editing.name}` : 'Add a staff member'}>
          <form action={saveStaff} className="grid gap-4 sm:grid-cols-2">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Name">
              <Input name="name" defaultValue={editing?.name ?? ''} required maxLength={120} />
            </Field>
            <Field label="Email address" hint="This is what they sign in with.">
              <Input name="email" type="email" defaultValue={editing?.email ?? ''} required maxLength={200} />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue={editing?.role ?? 'reception'}>
                <option value="reception">Reception</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field
              label="Password"
              hint={editing ? 'Leave blank to keep the current one. At least 10 characters.' : 'At least 10 characters.'}
            >
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                required={!editing}
                minLength={editing ? undefined : 10}
                maxLength={200}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
              <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
              <div className="flex gap-2">
                <Link
                  href="/admin/staff"
                  className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
                >
                  Cancel
                </Link>
                <Button type="submit">{editing ? 'Save changes' : 'Add staff member'}</Button>
              </div>
            </div>
          </form>
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
                  {user.role === 'admin' ? 'Admin' : 'Reception'}
                </span>
                {user.id === me.id ? <span className="ml-2 text-xs text-ink-400">This is you</span> : null}
                {!user.isActive ? <span className="ml-2 text-xs font-semibold text-ink-500">Not active</span> : null}
              </p>
              <p className="text-sm text-ink-500">
                {user.email}
                <span className="mx-2 text-line-strong">|</span>
                {user.lastLoginAt ? `Last signed in ${formatManilaDateTime(user.lastLoginAt)}` : 'Never signed in'}
              </p>
            </div>
            <Link
              href={`/admin/staff?edit=${user.id}`}
              className="text-sm font-semibold text-brand-700 underline underline-offset-4"
            >
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
