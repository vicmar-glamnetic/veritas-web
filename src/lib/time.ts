/**
 * Timezone helpers.
 *
 * The clinic is in Asia/Manila (UTC+8, no daylight saving). Every instant in the
 * database is UTC; every instant a human reads is Manila. These helpers are the only
 * sanctioned crossing between the two — never use the server's local time, because on
 * Vercel that is UTC and on a developer laptop it is anything at all.
 */

export const MANILA_TZ = 'Asia/Manila';

/** 0 = Sunday .. 6 = Saturday, matching JS getDay() and Postgres extract(dow). */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function manilaParts(instant: Date): Parts {
  const out: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  // Intl renders midnight as hour 24 in some engines.
  if (out.hour === 24) out.hour = 0;
  return out as Parts;
}

/** Minutes that Manila is ahead of UTC at the given instant. */
function manilaOffsetMinutes(instant: Date): number {
  const p = manilaParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * Combine a Manila calendar date and a Manila wall-clock time into a UTC instant.
 *
 * @param date "YYYY-MM-DD"
 * @param time "HH:MM" or "HH:MM:SS"
 */
export function manilaToUtc(date: string, time: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const naive = Date.parse(`${date}T${hhmmss}Z`);
  if (Number.isNaN(naive)) {
    throw new Error(`Invalid Manila date/time: ${date} ${time}`);
  }
  // Two passes converge even if the offset were ever to change mid-day.
  let guess = naive - 8 * 60 * 60_000;
  for (let i = 0; i < 2; i++) {
    guess = naive - manilaOffsetMinutes(new Date(guess)) * 60_000;
  }
  return new Date(guess);
}

/** The Manila calendar date of a UTC instant, as "YYYY-MM-DD". */
export function manilaDateString(instant: Date = new Date()): string {
  const p = manilaParts(instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The Manila wall-clock time of a UTC instant, as "HH:MM". */
export function manilaTimeString(instant: Date): string {
  const p = manilaParts(instant);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** 0 = Sunday .. 6 = Saturday, for the Manila calendar date of this instant. */
export function manilaDayOfWeek(instant: Date): number {
  const p = manilaParts(instant);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Day of week of a "YYYY-MM-DD" Manila calendar date. */
export function dayOfWeekForDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Add whole days to a "YYYY-MM-DD" string, staying in calendar-date space. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Inclusive list of "YYYY-MM-DD" dates, `count` long, starting at `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** "Tue, 23 Sep 2026" */
export function formatManilaDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(instant);
}

/** "9:20 AM" */
export function formatManilaTime(instant: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant);
}

/** "Tue, 23 Sep 2026 at 9:20 AM" */
export function formatManilaDateTime(instant: Date): string {
  return `${formatManilaDate(instant)} at ${formatManilaTime(instant)}`;
}

/** Format a "HH:MM:SS" wall-clock string as "9:20 AM", with no timezone maths. */
export function formatWallClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
