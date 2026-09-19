/**
 * The waiting-room board.
 *
 * Pure shaping of today's bookings into the three category panels. No database and no
 * formatting, so it can be unit tested without a clock or a connection.
 *
 * There is no separate "now serving" status in the schema, and this deliberately does
 * not add one. `arrived` is written the moment the desk taps Arrived on the Today
 * screen, so the arrived booking with the most recent `updatedAt` is, by definition,
 * the last patient the desk moved along. The board derives from that rather than
 * inventing a parallel queue that staff would have to keep in step by hand.
 *
 * Privacy: this screen hangs in a public waiting room, so a patient's full name must
 * never reach it. `shortenName` cuts it to a first name and a surname initial, which is
 * how a clinic calls a patient out loud anyway. The reference code is the patient's own
 * public identifier — it is printed on their confirmation email — and carries no
 * meaning to anyone else in the room.
 */

export const MONITOR_CATEGORIES = [
  { key: 'consultation', label: 'Consultation' },
  { key: 'laboratory', label: 'Laboratory' },
  { key: 'imaging', label: 'Imaging' },
] as const;

export type MonitorCategory = (typeof MONITOR_CATEGORIES)[number]['key'];

/** The minimum a booking has to expose to appear on a public screen. */
export type MonitorRow = {
  id: string;
  referenceCode: string;
  status: string;
  scheduledStart: Date;
  updatedAt: Date;
  patientName: string;
  serviceCategory: MonitorCategory;
  doctorName: string | null;
};

export type MonitorPanel = {
  key: MonitorCategory;
  label: string;
  serving: MonitorRow | null;
  /** Still expected, earliest first. */
  waiting: MonitorRow[];
};

export type MonitorBoard = {
  panels: MonitorPanel[];
  /** The most recent call across every category, for the announcement line. */
  lastCalled: { row: MonitorRow; category: MonitorCategory } | null;
};

/**
 * "Juan Miguel Dela Cruz" -> "Juan C."
 *
 * One name stays whole: shortening "Madonna" to "Madonna" is the honest answer, and
 * producing a bare initial would identify nobody standing in the room.
 */
export function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const surname = parts[parts.length - 1];
  const initial = [...surname][0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export function buildBoard(rows: readonly MonitorRow[]): MonitorBoard {
  const panels: MonitorPanel[] = MONITOR_CATEGORIES.map(({ key, label }) => {
    const mine = rows.filter((row) => row.serviceCategory === key);

    // Most recently moved along wins. `id` breaks a tie so two rows updated in the same
    // millisecond — which a single UPDATE batch can produce — still order the same way
    // on every render, rather than flickering between them every refresh.
    const arrived = mine
      .filter((row) => row.status === 'arrived')
      .sort(
        (a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );

    const waiting = mine
      .filter((row) => row.status === 'booked')
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

    return { key, label, serving: arrived[0] ?? null, waiting };
  });

  const lastCalled = panels
    .filter((panel): panel is MonitorPanel & { serving: MonitorRow } => panel.serving !== null)
    .sort((a, b) => b.serving.updatedAt.getTime() - a.serving.updatedAt.getTime())[0];

  return {
    panels,
    lastCalled: lastCalled ? { row: lastCalled.serving, category: lastCalled.key } : null,
  };
}
