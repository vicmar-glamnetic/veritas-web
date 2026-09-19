import type { Metadata } from 'next';

import { asc, desc } from 'drizzle-orm';

import { db } from '@/db';
import { promos } from '@/db/schema';
import { requireStaff } from '@/lib/auth';
import { addDays, manilaDateString } from '@/lib/time';

import { savePromo } from '../crud-actions';
import { Button, Checkbox, Field, Flash, Input, PageTitle, Panel, Textarea } from '../ui';

export const metadata: Metadata = { title: 'Promos' };
export const dynamic = 'force-dynamic';

export default async function PromosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string; edit?: string }>;
}) {
  await requireStaff();
  const { done, error, edit } = await searchParams;
  const list = await db.select().from(promos).orderBy(asc(promos.sortOrder), desc(promos.startsOn));
  const editing = edit ? list.find((p) => p.id === edit) : undefined;
  const today = manilaDateString();

  return (
    <div className="space-y-6">
      <Flash done={done} error={error} />
      <PageTitle
        title="Promos"
        lead="A promo appears on the website only between its start and end dates, and comes off by itself afterwards. Nobody has to remember to take it down."
      />

      <Panel title={editing ? `Editing: ${editing.title}` : 'Add a promo'}>
        <form action={savePromo} className="grid gap-4 sm:grid-cols-2">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <Field label="Title" className="sm:col-span-2">
            <Input name="title" defaultValue={editing?.title ?? ''} required maxLength={200} />
          </Field>
          <Field label="What the offer is" className="sm:col-span-2">
            <Textarea name="body" defaultValue={editing?.body ?? ''} rows={4} required maxLength={2000} />
          </Field>
          <Field
            label="Image URL"
            hint="Optional. Paste a link to an image, for example the one from your Facebook post."
            className="sm:col-span-2"
          >
            <Input name="imageUrl" defaultValue={editing?.imageUrl ?? ''} maxLength={500} />
          </Field>
          <Field label="Starts on">
            <Input name="startsOn" type="date" defaultValue={editing?.startsOn ?? today} required />
          </Field>
          <Field label="Ends on">
            <Input
              name="endsOn"
              type="date"
              defaultValue={editing?.endsOn ?? addDays(today, 30)}
              required
            />
          </Field>
          <Field label="Order">
            <Input
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={editing?.sortOrder ?? list.length + 1}
            />
          </Field>
          <div className="flex items-end">
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">{editing ? 'Save changes' : 'Add promo'}</Button>
            {editing ? (
              <a
                href="/admin/promos"
                className="inline-flex min-h-[2.5rem] items-center rounded border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
              >
                Cancel
              </a>
            ) : null}
          </div>
        </form>
      </Panel>

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {list.map((p) => {
          const liveNow = p.isActive && p.startsOn <= today && p.endsOn >= today;
          return (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{p.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {p.startsOn} to {p.endsOn}
                  {liveNow ? (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
                      Showing now
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-ink-400">
                      {!p.isActive ? 'Inactive' : p.endsOn < today ? 'Finished' : 'Not started yet'}
                    </span>
                  )}
                </p>
              </div>
              <a
                href={`/admin/promos?edit=${p.id}`}
                className="font-semibold text-brand-700 underline underline-offset-4"
              >
                Edit
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
