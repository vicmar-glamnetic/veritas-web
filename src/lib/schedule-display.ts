import { DAY_NAMES_SHORT } from './time';

import type { ClinicSession } from './queries';

export type ClinicDayBlock = {
  /** Day-of-week numbers, ascending, that share this time range. */
  days: number[];
  startTime: string;
  endTime: string;
};

/**
 * Collapses a doctor's weekly sessions into readable blocks: three separate Monday,
 * Wednesday and Friday rows that all run 09:00–12:00 become one "Mon, Wed, Fri" block.
 *
 * This is why /doctors never needs its clinic days typed in by hand — they fall out of
 * whatever Schedules says.
 */
export function groupSessionsIntoBlocks(doctorSessions: ClinicSession[]): ClinicDayBlock[] {
  const byTimeRange = new Map<string, ClinicDayBlock>();

  for (const s of doctorSessions) {
    const key = `${s.startTime}-${s.endTime}`;
    const existing = byTimeRange.get(key);
    if (existing) {
      if (!existing.days.includes(s.dayOfWeek)) existing.days.push(s.dayOfWeek);
    } else {
      byTimeRange.set(key, { days: [s.dayOfWeek], startTime: s.startTime, endTime: s.endTime });
    }
  }

  return [...byTimeRange.values()]
    .map((block) => ({ ...block, days: block.days.sort((a, b) => a - b) }))
    .sort((a, b) => (a.days[0] ?? 0) - (b.days[0] ?? 0) || a.startTime.localeCompare(b.startTime));
}

/** [1,3,5] -> "Mon, Wed, Fri";  [1,2,3,4,5] -> "Mon to Fri" */
export function formatDays(days: number[]): string {
  if (days.length === 0) return '';
  const isRun = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (isRun) return `${DAY_NAMES_SHORT[days[0]]} to ${DAY_NAMES_SHORT[days[days.length - 1]]}`;
  return days.map((d) => DAY_NAMES_SHORT[d]).join(', ');
}
