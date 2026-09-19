import type { Metadata } from 'next';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { doctors } from '@/db/schema';
import { requireStaff } from '@/lib/auth';

import { saveDoctor } from '../crud-actions';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Textarea } from '../ui';

export const metadata: Metadata = { title: 'Doctors' };
export const dynamic = 'force-dynamic';

export default async function DoctorsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireStaff();
  const { done, error } = await searchParams;
  const list = await db.select().from(doctors).orderBy(asc(doctors.sortOrder), asc(doctors.fullName));

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Doctors"
        lead="Doctors are never deleted, because bookings point at them. Untick Active to take someone off the website and out of the booking form."
      />

      <div className="space-y-4">
        {list.map((doctor) => (
          <Panel key={doctor.id}>
            <form action={saveDoctor} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={doctor.id} />
              <Field label="Full name">
                <Input name="fullName" defaultValue={doctor.fullName} required maxLength={120} />
              </Field>
              <Field label="Specialty">
                <Input name="specialty" defaultValue={doctor.specialty} required maxLength={120} />
              </Field>
              <Field label="Short biography" className="sm:col-span-2">
                <Textarea name="bio" defaultValue={doctor.bio ?? ''} rows={3} maxLength={1000} />
              </Field>
              <Field label="Photo URL" hint="Optional.">
                <Input name="photoUrl" defaultValue={doctor.photoUrl ?? ''} maxLength={500} />
              </Field>
              <Field label="Order on the website">
                <Input name="sortOrder" type="number" min={0} max={999} defaultValue={doctor.sortOrder} />
              </Field>
              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <Checkbox name="isActive" label="Active" defaultChecked={doctor.isActive} />
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Panel>
        ))}
      </div>

      <Panel title="Add a doctor">
        <form action={saveDoctor} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="fullName" required maxLength={120} placeholder="Dra. Juana Dela Cruz" />
          </Field>
          <Field label="Specialty">
            <Input name="specialty" required maxLength={120} placeholder="Family Medicine" />
          </Field>
          <Field label="Short biography" className="sm:col-span-2">
            <Textarea name="bio" rows={3} maxLength={1000} />
          </Field>
          <Field label="Photo URL" hint="Optional.">
            <Input name="photoUrl" maxLength={500} />
          </Field>
          <Field label="Order on the website">
            <Input name="sortOrder" type="number" min={0} max={999} defaultValue={list.length + 1} />
          </Field>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <Checkbox name="isActive" label="Active" defaultChecked />
            <Button type="submit">Add doctor</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
