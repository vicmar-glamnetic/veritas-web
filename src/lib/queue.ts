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
  status: 'waiting' | 'called' | 'done' | 'skipped' | 'cancelled';
  /** Null for a walk-in whose name has not been taken. */
  patientName: string | null;
  /** Whose line a consultation is in. Null for "first available doctor", and for L/I. */
  doctorId: string | null;
  doctorName: string | null;
  /** The room that called it. Null until it is called. */
  roomName: string | null;
  /** When staff put this number on the board. Null until it is called. */
  calledAt: Date | null;
  /** Set when a skipped patient was put back at the front of their line. */
  recalledAt: Date | null;
};

/**
 * One line of patients, the unit a room calls from.
 *
 * Each doctor runs their own consultation line. Laboratory and imaging have one line
 * each, shared by however many rooms serve them, because a blood draw is not tied to a
 * particular phlebotomist.
 */
export type QueueLine = { category: QueueCategory; doctorId: string | null };

/**
 * Whether a ticket belongs in a line.
 *
 * A consultation walk-in with no doctor ("first available") sits in every doctor's line
 * at once, and whichever doctor calls first takes them. Booked consultations are only
 * ever in the line of the doctor they booked.
 */
export function isInLine(
  ticket: Pick<QueueTicketRow, 'category' | 'doctorId'>,
  line: QueueLine,
): boolean {
  if (ticket.category !== line.category) return false;
  if (line.category !== 'consultation') return true;
  return ticket.doctorId === null || ticket.doctorId === line.doctorId;
}

/**
 * The order a line is called in.
 *
 * A recalled patient goes to the front — the clinic's rule — ahead of everyone who has
 * not been called yet, and two recalled patients go in the order they came back. After
 * that it is issue order. The database query in queue-service orders the same way
 * (`recalled_at nulls last, number`), and this is the version the tests pin.
 */
export function compareInLine(
  a: Pick<QueueTicketRow, 'number' | 'recalledAt'>,
  b: Pick<QueueTicketRow, 'number' | 'recalledAt'>,
): number {
  if (a.recalledAt && b.recalledAt) {
    return a.recalledAt.getTime() - b.recalledAt.getTime() || a.number - b.number;
  }
  if (a.recalledAt) return -1;
  if (b.recalledAt) return 1;
  return a.number - b.number;
}

/** A skipped patient comes back once. A second no-show needs a new number. */
export function canRecall(ticket: Pick<QueueTicketRow, 'status' | 'recalledAt'>): boolean {
  return ticket.status === 'skipped' && ticket.recalledAt === null;
}

export type QueuePanel = {
  key: QueueCategory;
  label: string;
  /**
   * Every number on the board in this category, one per room, in room order so a room's
   * number stays in the same place on the wall between refreshes.
   */
  serving: QueueTicketRow[];
  /** Issued and not yet called, in the order they will be called. */
  waiting: QueueTicketRow[];
};

export type QueueBoard = {
  panels: QueuePanel[];
  /** The most recent call across every room, for the announcement line. */
  lastCalled: QueueTicketRow | null;
};

export function buildQueueBoard(tickets: readonly QueueTicketRow[]): QueueBoard {
  const panels: QueuePanel[] = QUEUE_CATEGORIES.map(({ key, label }) => {
    const mine = tickets.filter((t) => t.category === key);
    return {
      key,
      label,
      serving: mine
        .filter((t) => t.status === 'called')
        .sort(
          (a, b) =>
            (a.roomName ?? '').localeCompare(b.roomName ?? '', 'en', { numeric: true }) ||
            a.number - b.number,
        ),
      waiting: mine.filter((t) => t.status === 'waiting').sort(compareInLine),
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
  const called = panels.flatMap((p) => p.serving);
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
