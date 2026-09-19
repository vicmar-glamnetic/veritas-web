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
  { key: 'laboratory' as const, heading: 'Blood and urine tests' },
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
      <div className="border-b border-line-strong pb-5">
        <label htmlFor="price-search" className="block text-sm font-semibold text-ink-900">
          Look for a test
        </label>
        <input
          id="price-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. CBC, urinalysis, ultrasound"
          autoComplete="off"
          className="mt-2 block w-full rounded border border-line-strong bg-surface px-3.5 py-3 text-base text-ink-900 placeholder:text-ink-400"
        />
        <p aria-live="polite" className="mt-2 text-sm text-ink-500">
          {trimmed
            ? `${matches.length} ${matches.length === 1 ? 'test matches' : 'tests match'} “${query.trim()}”`
            : `${items.length} tests listed`}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="mt-10 border-l-2 border-line-strong py-2 pl-5">
          <p className="font-serif text-lg text-ink-900">Nothing here matches that.</p>
          <p className="mt-2 max-w-md text-sm text-ink-500">
            We may still do it. Not every test we offer is on this list, so ring the
            clinic and ask.
          </p>
        </div>
      ) : (
        GROUPS.map((group) => {
          const groupItems = matches.filter((item) => item.category === group.key);
          if (groupItems.length === 0) return null;

          return (
            <section key={group.key} className="mt-10" aria-labelledby={`price-${group.key}`}>
              <h2
                id={`price-${group.key}`}
                className="border-t border-line-strong pt-4 text-xl text-ink-900"
              >
                {group.heading}
              </h2>
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {groupItems.map((item) => (
                  <li key={item.id} className="py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <p className="text-ink-900">{item.name}</p>
                      <p className="font-semibold text-brand-700 tabular-nums">
                        {formatPhp(item.pricePhp)}
                      </p>
                    </div>
                    {item.prepInstructions ? (
                      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
                        <span className="font-medium text-ink-700">Prepare: </span>
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
