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

type Filter = 'all' | PriceItem['category'];

/**
 * Filtering happens in the browser over the whole list, which is a few dozen rows. Far
 * cheaper than a round trip per keystroke on mobile data, and it keeps working if the
 * connection drops mid-visit.
 *
 * The category filter earns its place because the full list is long enough that someone
 * looking for an ultrasound price should not have to scroll past thirty blood tests.
 * The search box stays stuck to the top of the viewport while scrolling for the same
 * reason.
 */
export function PriceList({ items }: { items: PriceItem[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const trimmed = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === 'all' || item.category === filter) &&
          (!trimmed || item.name.toLowerCase().includes(trimmed)),
      ),
    [items, trimmed, filter],
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      laboratory: items.filter((i) => i.category === 'laboratory').length,
      imaging: items.filter((i) => i.category === 'imaging').length,
      consultation: items.filter((i) => i.category === 'consultation').length,
    }),
    [items],
  );

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Everything' },
    { key: 'laboratory', label: 'Blood and urine' },
    { key: 'imaging', label: 'X-ray and scans' },
    ...(counts.consultation > 0
      ? [{ key: 'consultation' as Filter, label: 'Consultations' }]
      : []),
  ];

  return (
    <div>
      <div className="sticky top-[6.5rem] z-20 -mx-4 border-b border-line-strong bg-paper/95 px-4 pt-1 pb-4 backdrop-blur-sm sm:top-[7rem]">
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

        <div
          role="group"
          aria-label="Filter by kind of test"
          className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
                  active
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-line-strong bg-surface text-ink-700 hover:border-brand-400'
                }`}
              >
                {tab.label}
                <span className={active ? 'text-brand-100' : 'text-ink-400'}>
                  {' '}
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        <p aria-live="polite" className="mt-2.5 text-sm text-ink-500">
          {trimmed
            ? `${matches.length} ${matches.length === 1 ? 'test matches' : 'tests match'} “${query.trim()}”`
            : `Showing ${matches.length} of ${items.length} tests`}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="mt-10 border-l-2 border-line-strong py-2 pl-5">
          <p className="font-serif text-lg text-ink-900">Nothing here matches that.</p>
          <p className="mt-2 max-w-md text-sm text-ink-500">
            We may still do it. Not every test we offer is on this list, so ring the
            clinic and ask.
          </p>
          {(trimmed || filter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
              className="mt-4 rounded border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-surface-sunken"
            >
              Show everything again
            </button>
          )}
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
