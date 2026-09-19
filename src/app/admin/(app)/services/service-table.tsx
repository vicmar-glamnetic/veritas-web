'use client';

import { useMemo, useState } from 'react';

export type ServiceRow = {
  id: string;
  name: string;
  category: string;
  price: string;
  bookable: boolean;
  listed: boolean;
  active: boolean;
};

/**
 * The price list is long enough that scrolling it to find one test is a chore, so it
 * gets the same filter the public page has. Filtering in the browser keeps it instant.
 */
export function ServiceTable({ rows }: { rows: ServiceRow[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

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
                <td className="px-4 py-2.5 text-right tabular-nums">{s.price}</td>
                <td className="px-4 py-2.5">
                  <Dot on={s.bookable} />
                </td>
                <td className="px-4 py-2.5">
                  <Dot on={s.listed} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <a
                    href={`/admin/services?edit=${s.id}`}
                    className="font-semibold text-brand-700 underline underline-offset-4"
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
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className={on ? 'font-semibold text-brand-700' : 'text-ink-400'}>
      {on ? 'Yes' : 'No'}
    </span>
  );
}
