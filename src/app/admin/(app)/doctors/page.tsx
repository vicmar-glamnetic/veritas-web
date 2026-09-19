import type { Metadata } from 'next';
import Link from 'next/link';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { doctors } from '@/db/schema';
import { requireStaff } from '@/lib/auth';

import { deleteDoctor, saveDoctor } from '../crud-actions';
import { DeleteZone, RowDialog } from '../row-dialog';
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
            <RowDialog
              href="/admin/doctors?new=1"
              title="Add a doctor"
              trigger="Add a doctor"
              triggerClassName="inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <DoctorForm nextOrder={list.length + 1} />
            </RowDialog>
          ) : undefined
        }
      />

      {showForm ? (
        <Panel title={editing ? `Editing ${editing.fullName}` : 'Add a doctor'}>
          <DoctorForm doctor={editing} nextOrder={list.length + 1} />
          <p className="mt-4 text-sm">
            <Link href="/admin/doctors" className="text-brand-700 underline underline-offset-4">
              Back to the list
            </Link>
          </p>
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
            <RowDialog
              href={`/admin/doctors?edit=${doctor.id}`}
              title={`Editing ${doctor.fullName}`}
              trigger="Edit"
              triggerClassName="rounded border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
            >
              <DoctorForm doctor={doctor} nextOrder={list.length + 1} />
              <DeleteZone
                action={deleteDoctor}
                id={doctor.id}
                formId={`delete-doctor-${doctor.id}`}
                label="Delete doctor"
                title={`Delete ${doctor.fullName}?`}
                warning={
                  <p className="text-sm leading-relaxed text-ink-700">
                    This removes {doctor.fullName} and any clinic sessions they hold. It is
                    refused if they appear on any booking, because that would break the
                    record.
                  </p>
                }
              />
            </RowDialog>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared by the dialog and the no-JavaScript fallback panel. */
function DoctorForm({
  doctor,
  nextOrder,
}: {
  doctor?: typeof doctors.$inferSelect;
  nextOrder: number;
}) {
  return (
    <form action={saveDoctor} className="grid gap-4 sm:grid-cols-2">
      {doctor ? <input type="hidden" name="id" value={doctor.id} /> : null}
      <Field label="Full name">
        <Input name="fullName" defaultValue={doctor?.fullName ?? ''} required maxLength={120} placeholder="Dra. Juana Dela Cruz" />
      </Field>
      <Field label="Specialty">
        <Input name="specialty" defaultValue={doctor?.specialty ?? ''} required maxLength={120} placeholder="Family Medicine" />
      </Field>
      <Field label="Short biography" className="sm:col-span-2">
        <Textarea name="bio" defaultValue={doctor?.bio ?? ''} rows={3} maxLength={1000} />
      </Field>
      <Field label="Photo URL" hint="Optional.">
        <Input name="photoUrl" defaultValue={doctor?.photoUrl ?? ''} maxLength={500} />
      </Field>
      <Field label="Order on the website">
        <Input name="sortOrder" type="number" min={0} max={999} defaultValue={doctor?.sortOrder ?? nextOrder} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
        <Checkbox name="isActive" label="Active on the website" defaultChecked={doctor?.isActive ?? true} />
        <Button type="submit">{doctor ? 'Save changes' : 'Add doctor'}</Button>
      </div>
      {doctor?.isActive ? (
        <p className="text-xs text-ink-500 sm:col-span-2">
          Unticking Active removes this doctor from the website and the booking form.
          Existing bookings are not affected.
        </p>
      ) : null}
    </form>
  );
}
