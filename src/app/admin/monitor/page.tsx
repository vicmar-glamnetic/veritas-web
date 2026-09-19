import { getMonitorRows, todayInManila } from '@/lib/admin/queries';
import { buildBoard, shortenName } from '@/lib/monitor';
import { getSiteSettings } from '@/lib/queries';
import { formatManilaDate, formatManilaTime } from '@/lib/time';

import { MonitorBoard } from './board';

/**
 * The screen for the waiting room.
 *
 * Everything is shaped and formatted here, on the server, so the board component never
 * touches a Date, a timezone or the database. The page is always fresh: a board that
 * served a cached answer would call a patient who was seen twenty minutes ago.
 */
export const dynamic = 'force-dynamic';

export default async function MonitorPage() {
  const date = todayInManila();
  const [settings, rows] = await Promise.all([getSiteSettings(), getMonitorRows(date)]);
  const board = buildBoard(rows);
  const now = new Date();

  const panels = board.panels.map((panel) => ({
    key: panel.key,
    label: panel.label,
    serving: panel.serving
      ? {
          referenceCode: panel.serving.referenceCode,
          name: shortenName(panel.serving.patientName),
          // The doctor is the useful second line for a consultation; for laboratory and
          // imaging there is no doctor, and the appointment time tells the room what it
          // needs. Naming the service would put a diagnosis hint on a public wall.
          detail: panel.serving.doctorName ?? formatManilaTime(panel.serving.scheduledStart),
        }
      : null,
    waitingCount: panel.waiting.length,
    next: panel.waiting.slice(0, 4).map((row) => ({
      referenceCode: row.referenceCode,
      time: formatManilaTime(row.scheduledStart),
    })),
  }));

  return (
    <MonitorBoard
      clinicName={settings.clinicName}
      dateLabel={formatManilaDate(now)}
      initialTime={formatManilaTime(now)}
      panels={panels}
      announcement={
        board.lastCalled
          ? {
              referenceCode: board.lastCalled.row.referenceCode,
              name: shortenName(board.lastCalled.row.patientName),
              categoryLabel:
                board.panels.find((p) => p.key === board.lastCalled!.category)?.label ?? '',
            }
          : null
      }
    />
  );
}
