import type { Metadata } from 'next';
import Link from 'next/link';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { doctors } from '@/db/schema';
import { requireStaff } from '@/lib/auth';

import { saveDoctor } from '../crud-actions';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Textarea } from '../ui';

export const metadata: Metadata = { title: 'Doctors' };
export const dynamic = 'force-dynamic';

/**
 * A list, plus one open form at a time.
 *
 * Rendering every doctor as an expanded form made the page a wall of forty inputs where
 * it was easy to type into the wrong one and not notice.
 */
export default async function DoctorsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string; new?: string }>;
}) {
  await requireStaff();
  const { done, error, edit, new: isNew } = await searchParams;
  const list = await db.select().from(doctors).orderBy(asc(doctors.sortOrder), asc(doctors.fullName));
  const editing = edit ? list.find((d) => d.id === edit) : undefined;
  const showForm = Boolean(editing) || isNew === '1';

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Doctors"
        lead="Doctors are never deleted, because bookings point at them. Untick Active to take someone off the website and out of the booking form."
        actions={
          !showForm ? (
            <Link
              href="/admin/doctors?new=1"
              className="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Add a doctor
            </Link>
          ) : undefined
        }
      />

      {showForm ? (
        <Panel title={editing ? `Editing ${editing.fullName}` : 'Add a doctor'}>
          <form action={saveDoctor} className="grid gap-4 sm:grid-cols-2">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field label="Full name">
              <Input name="fullName" defaultValue={editing?.fullName ?? ''} required maxLength={120} placeholder="Dra. Juana Dela Cruz" />
            </Field>
            <Field label="Specialty">
              <Input name="specialty" defaultValue={editing?.specialty ?? ''} required maxLength={120} placeholder="Family Medicine" />
            </Field>
            <Field label="Short biography" className="sm:col-span-2">
              <Textarea name="bio" defaultValue={editing?.bio ?? ''} rows={3} maxLength={1000} />
            </Field>
            <Field label="Photo URL" hint="Optional.">
              <Input name="photoUrl" defaultValue={editing?.photoUrl ?? ''} maxLength={500} />
            </Field>
            <Field label="Order on the website">
              <Input name="sortOrder" type="number" min={0} max={999} defaultValue={editing?.sortOrder ?? list.length + 1} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
              <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
              <div className="flex gap-2">
                <Link
                  href="/admin/doctors"
                  className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
                >
                  Cancel
                </Link>
                <Button type="submit">{editing ? 'Save changes' : 'Add doctor'}</Button>
              </div>
            </div>
          </form>
        </Panel>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {list.map((doctor) => (
          <li
            key={doctor.id}
            className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 ${doctor.isActive ? '' : 'opacity-55'}`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">
                {doctor.fullName}
                {!doctor.isActive ? (
                  <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-500 ring-1 ring-line-strong">
                    Not active
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-ink-500">{doctor.specialty}</p>
            </div>
            <Link
              href={`/admin/doctors?edit=${doctor.id}`}
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
