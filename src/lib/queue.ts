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

export function buildQueueBoard(
  tickets: readonly QueueTicketRow[],
  lastCalledId?: string | null,
): QueueBoard {
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

  const called = panels.map((p) => p.serving).filter((t): t is QueueTicketRow => t !== null);

  return {
    panels,
    lastCalled: called.find((t) => t.id === lastCalledId) ?? called[0] ?? null,
  };
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
