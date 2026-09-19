'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { saveService } from '../crud-actions';
import { Button, Checkbox, Field, Input, Select, Textarea } from '../ui';

export type ServiceRow = {
  id: string;
  name: string;
  category: 'consultation' | 'laboratory' | 'imaging';
  priceLabel: string;
  pricePhp: string;
  durationMinutes: number;
  prepInstructions: string | null;
  sortOrder: number;
  bookable: boolean;
  listed: boolean;
  active: boolean;
};

/**
 * The price list, with editing in a dialog.
 *
 * Editing used to swap the page for a form at the top, which meant clicking Edit on the
 * thirtieth row threw you to the top of the page and you had to find your place again
 * afterwards. The dialog keeps the row you were working on right where it was.
 *
 * The Edit control is a real link to `?edit=<id>`, so with JavaScript off it still works
 * exactly as before and the server renders the form inline. The click handler only takes
 * over once a native <dialog> is available.
 */
export function ServiceTable({ rows }: { rows: ServiceRow[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (category === 'all' || r.category === category) &&
          (!term || r.name.toLowerCase().includes(term)),
      ),
    [rows, term, category],
  );

  const open = (row: ServiceRow | 'new') => (event: React.MouseEvent) => {
    if (typeof dialogRef.current?.showModal !== 'function') return; // no JS or no <dialog>
    event.preventDefault();
    setEditing(row);
  };

  const current = editing === 'new' ? null : editing;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-sm font-semibold text-ink-900">Find a service</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CBC, ultrasound…"
            className="mt-1.5 block w-64 rounded border border-line-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-ink-900">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1.5 block rounded border border-line-strong bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="consultation">Consultation</option>
            <option value="laboratory">Laboratory</option>
            <option value="imaging">Imaging</option>
          </select>
        </label>
        <p aria-live="polite" className="pb-2 text-sm text-ink-500">
          {shown.length} of {rows.length}
        </p>
        <a
          href="/admin/services?new=1"
          onClick={open('new')}
          className="mb-0.5 ml-auto inline-flex min-h-[2.5rem] items-center rounded border border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Add a service
        </a>
      </div>

      <div className="overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-sunken text-left">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Name</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Category</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Online</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Listed</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5">
                  {s.name}
                  {!s.active ? <span className="ml-2 text-xs text-ink-400">(inactive)</span> : null}
                </td>
                <td className="px-4 py-2.5 text-ink-500 capitalize">{s.category}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s.priceLabel}</td>
                <td className="px-4 py-2.5">
                  <YesNo on={s.bookable} />
                </td>
                <td className="px-4 py-2.5">
                  <YesNo on={s.listed} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <a
                    href={`/admin/services?edit=${s.id}`}
                    onClick={open(s)}
                    className="rounded border border-line-strong px-3 py-1.5 font-semibold text-ink-900 hover:border-brand-400 hover:bg-brand-50"
                  >
                    Edit
                  </a>
                </td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  Nothing matches that.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setEditing(null)}
        aria-labelledby="service-dialog-title"
        className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded border border-line-strong bg-surface p-0 text-ink-900 shadow-xl backdrop:bg-ink-900/50"
      >
        {editing ? (
          // Re-keyed per row so the browser resets the defaults when you switch rows.
          <ServiceForm key={current?.id ?? 'new'} row={current} onCancel={() => setEditing(null)} />
        ) : null}
      </dialog>
    </div>
  );
}

function ServiceForm({ row, onCancel }: { row: ServiceRow | null; onCancel: () => void }) {
  return (
    <form action={saveService} className="max-h-[85vh] overflow-y-auto p-6">
      <h2 id="service-dialog-title" className="font-serif text-xl text-ink-900">
        {row ? row.name : 'Add a service'}
      </h2>

      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={row?.name ?? ''} required maxLength={200} />
        </Field>
        <Field label="Category">
          <Select name="category" defaultValue={row?.category ?? 'laboratory'}>
            <option value="consultation">Consultation</option>
            <option value="laboratory">Laboratory</option>
            <option value="imaging">Imaging</option>
          </Select>
        </Field>
        <Field label="Price in pesos" hint="Numbers only, e.g. 450 or 450.50">
          <Input name="pricePhp" defaultValue={row?.pricePhp ?? ''} required inputMode="decimal" />
        </Field>
        <Field label="Minutes needed">
          <Input
            name="durationMinutes"
            type="number"
            min={1}
            max={480}
            defaultValue={row?.durationMinutes ?? 15}
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
            defaultValue={row?.prepInstructions ?? ''}
            rows={2}
            maxLength={1000}
          />
        </Field>
        <Field label="Order in the list">
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={row?.sortOrder ?? 0} />
        </Field>
        <div className="flex flex-wrap items-end gap-5">
          <Checkbox name="isBookableOnline" label="Bookable online" defaultChecked={row?.bookable ?? false} />
          <Checkbox name="isListedOnline" label="Shown on prices" defaultChecked={row?.listed ?? true} />
          <Checkbox name="isActive" label="Active" defaultChecked={row?.active ?? true} />
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row-reverse">
        <Button type="submit" className="flex-1 sm:flex-none">
          {row ? 'Save changes' : 'Add service'}
        </Button>
        <Button type="button" tone="secondary" onClick={onCancel} className="flex-1 sm:flex-none">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function YesNo({ on }: { on: boolean }) {
  return (
    <span className={on ? 'font-semibold text-brand-700' : 'text-ink-400'}>{on ? 'Yes' : 'No'}</span>
  );
}
