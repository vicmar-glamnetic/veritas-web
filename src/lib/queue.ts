/**
 * Queue tickets: the clinic's order of service.
 *
 * Pure. No database and no clock, so the shaping and the formatting can be unit tested
 * without either.
 *
 * The board used to infer "now serving" from whichever booking was most recently marked
 * arrived. That is the last person to walk through the door, not the person in front of
 * a doctor, and it labelled them with their booking reference — a code that carries no
 * order. A queue number is created at reception and advances only when staff call it.
 */

export const QUEUE_CATEGORIES = [
  { key: 'consultation', label: 'Consultation', prefix: 'C' },
  { key: 'laboratory', label: 'Laboratory', prefix: 'L' },
  { key: 'imaging', label: 'Imaging', prefix: 'I' },
] as const;

export type QueueCategory = (typeof QUEUE_CATEGORIES)[number]['key'];

const PREFIX: Record<QueueCategory, string> = {
  consultation: 'C',
  laboratory: 'L',
  imaging: 'I',
};

/**
 * "C-014". Never stored — rendered from the category and the number every time, so
 * ordering and uniqueness stay numeric and changing the format cannot orphan old rows.
 *
 * Padded to three digits and allowed to grow past them: a clinic that somehow reaches
 * 1000 in a day gets C-1000 rather than a number silently cut short.
 */
export function formatTicket(category: QueueCategory, n: number): string {
  return `${PREFIX[category]}-${String(n).padStart(3, '0')}`;
}

export type QueueTicketRow = {
  id: string;
  category: QueueCategory;
  number: number;
  status: 'waiting' | 'called' | 'done' | 'skipped';
  /** Null for a walk-in whose name has not been taken. */
  patientName: string | null;
  doctorName: string | null;
  /** When staff put this number on the board. Null until it is called. */
  calledAt: Date | null;
};

export type QueuePanel = {
  key: QueueCategory;
  label: string;
  /** The one ticket on the board. At most one per category is ever `called`. */
  serving: QueueTicketRow | null;
  /** Issued and not yet called, in the order they were issued. */
  waiting: QueueTicketRow[];
};

export type QueueBoard = {
  panels: QueuePanel[];
  /** The most recent call across every category, for the announcement line. */
  lastCalled: QueueTicketRow | null;
};

export function buildQueueBoard(tickets: readonly QueueTicketRow[]): QueueBoard {
  const panels: QueuePanel[] = QUEUE_CATEGORIES.map(({ key, label }) => {
    const mine = tickets.filter((t) => t.category === key);
    return {
      key,
      label,
      // Highest number wins if two were somehow left called at once, so the board can
      // never go backwards in front of the room.
      serving:
        mine
          .filter((t) => t.status === 'called')
          .sort((a, b) => b.number - a.number)[0] ?? null,
      waiting: mine.filter((t) => t.status === 'waiting').sort((a, b) => a.number - b.number),
    };
  });

  /*
   * The announcement is whichever number was called most recently, by the clock.
   *
   * This used to take the first category that had anything on its board, which is
   * consultation whenever consultation is busy — so calling a laboratory or imaging
   * number changed nothing on the announcement line, and the spoken announcement, which
   * fires on that line changing, never said them at all.
   *
   * `id` breaks a tie so two calls in the same millisecond cannot make the line flicker
   * between them on every refresh.
   */
  const called = panels.map((p) => p.serving).filter((t): t is QueueTicketRow => t !== null);
  const byMostRecent = [...called].sort(
    (a, b) =>
      (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );

  return { panels, lastCalled: byMostRecent[0] ?? null };
}

/**
 * "Juan Miguel Dela Cruz" -> "Juan C."
 *
 * The board hangs in a public waiting room, so a full name must never reach it. One
 * name stays whole: shortening "Madonna" to "Madonna" is the honest answer, and a bare
 * initial would identify nobody standing in the room.
 */
export function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  const initial = [...parts[parts.length - 1]][0];
  return initial ? `${parts[0]} ${initial.toUpperCase()}.` : parts[0];
}

/**
 * Which category Auto should call next.
 *
 * Round-robin over the categories that actually have somebody waiting, starting after
 * whichever was called last. Rotating rather than advancing everything at once keeps one
 * number changing at a time, which is what a board in a room should look like, and it
 * stops a busy consultation list starving laboratory and imaging.
 *
 * Returns null when nobody at all is waiting, so the timer has nothing to do rather than
 * firing pointlessly into an empty clinic.
 */
export function nextAutoCategory(
  panels: readonly { key: QueueCategory; waitingCount: number }[],
  previous: QueueCategory | null,
): QueueCategory | null {
  const withPeople = panels.filter((p) => p.waitingCount > 0);
  if (withPeople.length === 0) return null;

  const order = QUEUE_CATEGORIES.map((c) => c.key);
  const start = previous ? order.indexOf(previous) + 1 : 0;

  for (let step = 0; step < order.length; step++) {
    const candidate = order[(start + step) % order.length];
    if (withPeople.some((p) => p.key === candidate)) return candidate;
  }

  return null;
}
