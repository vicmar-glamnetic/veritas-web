import type { Metadata } from 'next';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { services } from '@/db/schema';
import { requireStaff } from '@/lib/auth';
import { formatPhp } from '@/lib/money';

import { saveService } from '../crud-actions';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Select, Textarea } from '../ui';
import { ServiceTable } from './service-table';

export const metadata: Metadata = { title: 'Services and prices' };
export const dynamic = 'force-dynamic';

const CATEGORIES = [
  ['consultation', 'Consultation'],
  ['laboratory', 'Laboratory'],
  ['imaging', 'Imaging'],
] as const;

export default async function ServicesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string }>;
}) {
  await requireStaff();
  const { done, error, edit } = await searchParams;
  const list = await db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name));
  const editing = edit ? list.find((s) => s.id === edit) : undefined;

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Services and prices"
        lead="This is the only price list. The public prices page reads these rows, and so will the cashier when that is built."
      />

      <Panel title={editing ? `Editing: ${editing.name}` : 'Add a service'}>
        <form action={saveService} className="grid gap-4 sm:grid-cols-2">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <Field label="Name">
            <Input name="name" defaultValue={editing?.name ?? ''} required maxLength={200} />
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={editing?.category ?? 'laboratory'}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price in pesos" hint="Numbers only, e.g. 450 or 450.50">
            <Input name="pricePhp" defaultValue={editing?.pricePhp ?? ''} required inputMode="decimal" />
          </Field>
          <Field label="Minutes needed">
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              max={480}
              defaultValue={editing?.durationMinutes ?? 15}
              required
            />
          </Field>
          <Field
            label="Preparation instructions"
            hint="Repeated in the confirmation email. Say plainly what the patient must do."
            className="sm:col-span-2"
          >
            <Textarea
              name="prepInstructions"
              defaultValue={editing?.prepInstructions ?? ''}
              rows={2}
              maxLength={1000}
            />
          </Field>
          <Field label="Order in the list">
            <Input
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={editing?.sortOrder ?? list.length}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-5">
            <Checkbox
              name="isBookableOnline"
              label="Bookable online"
              defaultChecked={editing?.isBookableOnline ?? false}
            />
            <Checkbox
              name="isListedOnline"
              label="Shown on the prices page"
              defaultChecked={editing?.isListedOnline ?? true}
            />
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">{editing ? 'Save changes' : 'Add service'}</Button>
            {editing ? (
              <a
                href="/admin/services"
                className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
              >
                Cancel
              </a>
            ) : null}
          </div>
        </form>
      </Panel>

      <ServiceTable
        rows={list.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          price: formatPhp(s.pricePhp),
          bookable: s.isBookableOnline,
          listed: s.isListedOnline,
          active: s.isActive,
        }))}
      />
    </div>
  );
}
