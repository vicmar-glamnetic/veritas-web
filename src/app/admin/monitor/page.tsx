import { db } from '@/db';
import { getQueueTickets } from '@/lib/queue-service';
import { todayInManila } from '@/lib/admin/queries';
import { buildQueueBoard, formatTicket, shortenName } from '@/lib/queue';
import { getSiteSettings } from '@/lib/queries';
import { formatManilaDate, formatManilaTime } from '@/lib/time';

import { MonitorBoard } from './board';

/**
 * The screen for the waiting room.
 *
 * Everything is shaped and formatted here, on the server, so the board component never
 * touches a Date, a timezone or the database. The page is always fresh: a board that
 * served a cached answer would call a patient who was seen twenty minutes ago.
 *
 * Nobody calls patients from here any more: each room calls its own line from My room,
 * which is what lets the board say which room to go to. `?display=1` also hides the
 * screen settings, for the screen that actually hangs on the wall.
 */
export const dynamic = 'force-dynamic';

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ display?: string }>;
}) {
  const [{ display }, date] = await Promise.all([searchParams, todayInManila()]);
  const [settings, tickets] = await Promise.all([getSiteSettings(), getQueueTickets(db, date)]);
  const board = buildQueueBoard(tickets);
  const now = new Date();

  const panels = board.panels.map((panel) => ({
    key: panel.key,
    label: panel.label,
    // One entry per room with a number on the board, in room order.
    serving: panel.serving.map((t) => ({
      ticket: formatTicket(t.category, t.number),
      // A walk-in may have no name yet, and the number is the point regardless.
      name: t.patientName ? shortenName(t.patientName) : null,
      room: t.roomName,
    })),
    waitingCount: panel.waiting.length,
    next: panel.waiting.slice(0, 4).map((ticket) => ({
      ticket: formatTicket(ticket.category, ticket.number),
      name: ticket.patientName ? shortenName(ticket.patientName) : null,
    })),
  }));

  return (
    <MonitorBoard
      clinicName={settings.clinicName}
      dateLabel={formatManilaDate(now)}
      initialTime={formatManilaTime(now)}
      panels={panels}
      showControls={display !== '1'}
      announcement={
        board.lastCalled
          ? {
              ticket: formatTicket(board.lastCalled.category, board.lastCalled.number),
              name: board.lastCalled.patientName
                ? shortenName(board.lastCalled.patientName)
                : null,
              // The room is where they go. A number called before rooms existed has
              // none, and falls back to the category.
              destination:
                board.lastCalled.roomName ??
                board.panels.find((p) => p.key === board.lastCalled!.category)?.label ??
                '',
            }
          : null
      }
    />
  );
}
