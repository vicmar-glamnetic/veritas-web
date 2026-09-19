import Link from 'next/link';

import { addDays, dateRange, dayOfWeekForDate, DAY_NAMES, DAY_NAMES_SHORT } from '@/lib/time';

/**
 * Month grids covering the booking horizon.
 *
 * Only dates the availability engine returned are links; the rest are plain, dimmed
 * text. A patient can see at a glance that the clinic runs Mondays, Wednesdays and
 * Fridays without anyone writing that down anywhere.
 *
 * It is a real <table> because that is what a date grid is, and it gives screen readers
 * the row and column structure for free. Each cell also carries how many times are left
 * that day, which is the difference between "there is something" and "there is one slot
 * at 4pm".
 */

const MONTH_LABEL = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

function monthLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, d)));
}

function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAY_NAMES[dayOfWeekForDate(date)]} ${d} ${MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, d)))}`;
}

export function Calendar({
  from,
  days,
  available,
  selected,
  today,
  hrefFor,
}: {
  /** First Manila date of the horizon, "YYYY-MM-DD". */
  from: string;
  days: number;
  /** Date -> how many places are left that day. */
  available: Map<string, number>;
  selected?: string;
  today: string;
  hrefFor: (date: string) => string;
}) {
  const dates = dateRange(from, days);

  const months = new Map<string, string[]>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(date);
    else months.set(key, [date]);
  }

  return (
    <div>
      <p className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-500">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rounded border border-brand-300 bg-surface"
          />
          Tap a date with places left
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-5 w-5 rounded bg-surface-sunken" />
          Closed or full
        </span>
      </p>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {[...months.entries()].map(([key, monthDates]) => {
          const first = monthDates[0]!;
          const leading = dayOfWeekForDate(first);

          return (
            <table key={key} className="w-full max-w-md table-fixed border-collapse">
              <caption className="pb-3 text-left font-serif text-lg text-ink-900">
                {monthLabel(first)}
              </caption>
              <thead>
                <tr>
                  {DAY_NAMES_SHORT.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="pb-2 text-center text-xs font-semibold text-ink-400"
                    >
                      <span aria-hidden="true">{day.slice(0, 2)}</span>
                      <span className="sr-only">{day}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chunk([...Array(leading).fill(null), ...monthDates], 7).map((week, i) => (
                  <tr key={i}>
                    {week.map((date, j) => {
                      if (!date) return <td key={`blank-${j}`} className="p-1" />;

                      const dayNumber = Number(date.slice(8));
                      const openCount = available.get(date) ?? 0;
                      const isSelected = date === selected;
                      const isToday = date === today;

                      return (
                        <td key={date} className="p-1 align-top">
                          {openCount > 0 ? (
                            <Link
                              href={hrefFor(date)}
                              aria-current={isSelected ? 'date' : undefined}
                              aria-label={`${longDate(date)}, ${openCount} ${openCount === 1 ? 'time' : 'times'} available`}
                              className={`flex min-h-[4.25rem] w-full flex-col items-center justify-center rounded border px-0.5 py-1.5 text-center transition-colors ${
                                isSelected
                                  ? 'border-brand-700 bg-brand-700 text-white'
                                  : 'border-brand-300 bg-surface text-brand-800 hover:border-brand-600 hover:bg-brand-50 active:bg-brand-100'
                              }`}
                            >
                              <span className="text-base leading-none font-semibold tabular-nums">
                                {dayNumber}
                              </span>
                              <span
                                className={`mt-1 text-[0.625rem] leading-[1.15] ${
                                  isSelected ? 'text-brand-100' : 'text-brand-600'
                                }`}
                              >
                                {openCount}
                                {/* Spelled out where there is room; a phone gets the short form. */}
                                <span className="hidden sm:inline"> slots available</span>
                                <span className="sm:hidden"> left</span>
                              </span>
                              {isToday ? <span className="sr-only">(today)</span> : null}
                            </Link>
                          ) : (
                            <span
                              aria-label={`${longDate(date)}, nothing available`}
                              className={`flex min-h-[4.25rem] w-full items-center justify-center rounded bg-surface-sunken text-sm tabular-nums ${
                                isToday ? 'font-semibold text-ink-500 ring-1 ring-line-strong' : 'text-ink-400'
                              }`}
                            >
                              {dayNumber}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {week.length < 7
                      ? Array.from({ length: 7 - week.length }, (_, k) => (
                          <td key={`pad-${k}`} className="p-1" />
                        ))
                      : null}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>

    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export { addDays };
