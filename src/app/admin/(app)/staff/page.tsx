import type { Metadata } from 'next';

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
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const me = await requireAdmin();
  const { done, error } = await searchParams;
  const list = await db.select().from(staffUsers).orderBy(asc(staffUsers.name));

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Staff users"
        lead="Admin accounts can change settings and manage staff. Reception accounts can do everything else. Deactivating someone signs them out immediately."
      />

      <div className="space-y-4">
        {list.map((user) => (
          <Panel key={user.id}>
            <form action={saveStaff} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={user.id} />
              <Field label="Name">
                <Input name="name" defaultValue={user.name} required maxLength={120} />
              </Field>
              <Field label="Email address">
                <Input name="email" type="email" defaultValue={user.email} required maxLength={200} />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue={user.role}>
                  <option value="reception">Reception</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
              <Field
                label="New password"
                hint="Leave blank to keep the current one. At least 10 characters."
              >
                <Input name="password" type="password" autoComplete="new-password" maxLength={200} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
                <div className="flex items-center gap-4">
                  <Checkbox name="isActive" label="Active" defaultChecked={user.isActive} />
                  {user.id === me.id ? (
                    <span className="text-xs text-ink-400">This is you.</span>
                  ) : null}
                  <span className="text-xs text-ink-400">
                    {user.lastLoginAt
                      ? `Last signed in ${formatManilaDateTime(user.lastLoginAt)}`
                      : 'Never signed in'}
                  </span>
                </div>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Panel>
        ))}
      </div>

      <Panel title="Add a staff member">
        <form action={saveStaff} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required maxLength={120} />
          </Field>
          <Field label="Email address">
            <Input name="email" type="email" required maxLength={200} />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="reception">
              <option value="reception">Reception</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Password" hint="At least 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <Checkbox name="isActive" label="Active" defaultChecked />
            <Button type="submit">Add staff member</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
