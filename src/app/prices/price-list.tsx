'use client';

import { useMemo, useState } from 'react';

import { formatPhp } from '@/lib/money';

export type PriceItem = {
  id: string;
  name: string;
  category: 'consultation' | 'laboratory' | 'imaging';
  pricePhp: string;
  prepInstructions: string | null;
};

const GROUPS = [
  { key: 'laboratory' as const, heading: 'Laboratory tests' },
  { key: 'imaging' as const, heading: 'X-ray, ultrasound and heart tests' },
  { key: 'consultation' as const, heading: 'Consultations' },
];

/**
 * Filtering happens in the browser over the full list, which is a few dozen rows — far
 * cheaper than a round trip per keystroke on mobile data, and it keeps working if the
 * connection drops mid-visit.
 */
export function PriceList({ items }: { items: PriceItem[] }) {
  const [query, setQuery] = useState('');

  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(
    () => (trimmed ? items.filter((item) => item.name.toLowerCase().includes(trimmed)) : items),
    [items, trimmed],
  );

  return (
    <div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <label htmlFor="price-search" className="block text-sm font-semibold text-ink-900">
          Search for a test
        </label>
        <input
          id="price-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. CBC, urinalysis, ultrasound"
          autoComplete="off"
          className="mt-2 block w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-base text-ink-900 placeholder:text-ink-400"
        />
        <p aria-live="polite" className="mt-2 text-sm text-ink-500">
          {trimmed
            ? `${matches.length} ${matches.length === 1 ? 'test matches' : 'tests match'} “${query.trim()}”`
            : `${items.length} tests and services listed`}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface-sunken px-5 py-8 text-center">
          <p className="font-semibold text-ink-900">Nothing matched that search.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            We may still offer it — not every test is listed here. Please call the clinic
            and ask.
          </p>
        </div>
      ) : (
        GROUPS.map((group) => {
          const groupItems = matches.filter((item) => item.category === group.key);
          if (groupItems.length === 0) return null;

          return (
            <section key={group.key} className="mt-8" aria-labelledby={`price-${group.key}`}>
              <h2 id={`price-${group.key}`} className="text-lg font-bold text-ink-900">
                {group.heading}
              </h2>
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {groupItems.map((item) => (
                  <li key={item.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-medium text-ink-900">{item.name}</p>
                      <p className="text-base font-bold text-brand-700 tabular-nums">
                        {formatPhp(item.pricePhp)}
                      </p>
                    </div>
                    {item.prepInstructions ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                        <span className="font-semibold text-ink-700">Before you come: </span>
                        {item.prepInstructions}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
