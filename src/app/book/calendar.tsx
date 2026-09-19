import Link from 'next/link';

import { addDays, dateRange, dayOfWeekForDate, DAY_NAMES_SHORT } from '@/lib/time';

/**
 * Month grids covering the booking horizon.
 *
 * Only dates the availability engine returned are links; everything else is rendered
 * as plain, dimmed text. A patient can see at a glance that the clinic runs Mondays,
 * Wednesdays and Fridays without anyone writing that down anywhere.
 *
 * It is a real <table> because that is what a date grid is, and it gives screen
 * readers the row and column structure for free.
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

export function Calendar({
  from,
  days,
  availableDates,
  selected,
  hrefFor,
}: {
  /** First Manila date of the horizon, "YYYY-MM-DD". */
  from: string;
  days: number;
  availableDates: Set<string>;
  selected?: string;
  hrefFor: (date: string) => string;
}) {
  const dates = dateRange(from, days);

  // Split the horizon into calendar months so each grid lines up under one heading.
  const months = new Map<string, string[]>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(date);
    else months.set(key, [date]);
  }

  return (
    <div className="space-y-6">
      {[...months.entries()].map(([key, monthDates]) => {
        const first = monthDates[0]!;
        // Blank cells so the first date lands under the right weekday.
        const leading = dayOfWeekForDate(first);

        return (
          <table key={key} className="w-full border-collapse">
            <caption className="pb-2 text-left text-sm font-bold text-ink-900">
              {monthLabel(first)}
            </caption>
            <thead>
              <tr>
                {DAY_NAMES_SHORT.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="pb-1 text-center text-xs font-semibold text-ink-500"
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
                    if (!date) return <td key={`blank-${j}`} className="p-0.5" />;

                    const dayNumber = Number(date.slice(8));
                    const isAvailable = availableDates.has(date);
                    const isSelected = date === selected;

                    return (
                      <td key={date} className="p-0.5 text-center">
                        {isAvailable ? (
                          <Link
                            href={hrefFor(date)}
                            aria-current={isSelected ? 'date' : undefined}
                            aria-label={`${dayNumber} ${monthLabel(date)}, slots available`}
                            className={`flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold ${
                              isSelected
                                ? 'bg-brand-700 text-white'
                                : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                            }`}
                          >
                            {dayNumber}
                          </Link>
                        ) : (
                          <span
                            aria-label={`${dayNumber} ${monthLabel(date)}, nothing available`}
                            className="flex h-11 w-full items-center justify-center rounded-lg text-sm text-ink-400"
                          >
                            {dayNumber}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {/* Pad the final row so the grid stays rectangular. */}
                  {week.length < 7
                    ? Array.from({ length: 7 - week.length }, (_, k) => (
                        <td key={`pad-${k}`} className="p-0.5" />
                      ))
                    : null}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded bg-brand-50 ring-1 ring-brand-200" />
          Slots available
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded bg-surface-sunken ring-1 ring-line" />
          Full or closed
        </span>
      </p>
    </div>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Re-exported so the page can compute the horizon the same way. */
export { addDays };
