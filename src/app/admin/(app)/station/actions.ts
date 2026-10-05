'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { doctors, queueTickets, rooms, staffUsers } from '@/db/schema';
import { stationSchema } from '@/lib/admin/schemas';
import { mayWorkRoom } from '@/lib/admin/roles';
import { requireStaff, setStation, type Staff } from '@/lib/auth';
import { formatTicket, type QueueCategory } from '@/lib/queue';
import {
  callNextForRoom,
  finishTicket,
  recallSkipped,
  referTicket,
  skipTicket,
  startTicket,
  undoCall,
} from '@/lib/queue-service';
import { manilaDateString } from '@/lib/time';

/**
 * The station screen's controls.
 *
 * Every action calls `requireStaff()` for itself, as everywhere in the admin: an action
 * is its own endpoint. And every one reads the room from the signed-in session, never
 * from the form, so nobody can call patients into a room they are not working in by
 * editing a hidden field.
 *
 * Plain form posts with a redirect back, so the whole screen works with JavaScript off.
 */

function back(message: string, isError = false): never {
  redirect(`/admin/station?${isError ? 'error' : 'done'}=${encodeURIComponent(message)}`);
}

function refresh() {
  revalidatePath('/admin/station');
  revalidatePath('/admin/monitor');
}


/** Whose line this session calls: a doctor always their own, anyone else their pick. */
function lineDoctor(staff: Staff): string | null {
  return staff.role === 'doctor' ? staff.doctorId : staff.stationDoctorId;
}

/** Someone still on the board in this room must be dealt with before the room changes. */
async function roomHasPatient(roomId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: queueTickets.id })
    .from(queueTickets)
    .where(and(eq(queueTickets.roomId, roomId), eq(queueTickets.status, 'called')))
    .limit(1);
  return Boolean(row);
}

export async function chooseStation(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const parsed = stationSchema.safeParse({
    roomId: formData.get('roomId') ?? '',
    doctorId: formData.get('doctorId') ?? '',
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? 'Pick a room.', true);

  // A room account only ever chooses whose patients, never the room.
  if (staff.roomFixed && parsed.data.roomId !== staff.roomId) {
    back('This is a room account. It always works its own room.', true);
  }

  if (staff.roomId && staff.roomId !== parsed.data.roomId && (await roomHasPatient(staff.roomId))) {
    back('Finish, skip or undo the patient in your current room before moving.', true);
  }

  const [room] = await db
    .select({ category: rooms.category, isActive: rooms.isActive })
    .from(rooms)
    .where(eq(rooms.id, parsed.data.roomId))
    .limit(1);

  if (!room || !room.isActive) back('That room is not in use any more. Pick another.', true);
  const category = room.category as QueueCategory;
  if (!mayWorkRoom(staff.role, category)) back('Your account cannot work that kind of room.', true);

  // A room with its own room account is that account's alone, so two screens never
  // work one room. Deactivating the room account frees it.
  if (!staff.roomFixed) {
    const [owner] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.roomId, parsed.data.roomId), eq(staffUsers.isActive, true)))
      .limit(1);
    if (owner) back('That room has its own room account. Use the screen in that room.', true);
  }

  let stationDoctorId: string | null = null;
  if (category === 'consultation' && staff.role !== 'doctor') {
    if (!parsed.data.doctorId) back('A consultation room calls one doctor’s patients. Pick the doctor.', true);

    const [doctor] = await db
      .select({ isActive: doctors.isActive })
      .from(doctors)
      .where(eq(doctors.id, parsed.data.doctorId))
      .limit(1);
    if (!doctor?.isActive) back('That doctor is not active.', true);
    stationDoctorId = parsed.data.doctorId;
  }

  await setStation(staff.sessionId, { roomId: parsed.data.roomId, stationDoctorId });
  refresh();
  back('Room set. Patients called from here will be sent to this room.');
}

export async function leaveStation(): Promise<void> {
  const staff = await requireStaff();
  if (staff.roomFixed) back('This is a room account. It always works its own room.', true);
  if (staff.roomId && (await roomHasPatient(staff.roomId))) {
    back('Finish, skip or undo the patient in your room before leaving it.', true);
  }
  await setStation(staff.sessionId, { roomId: null, stationDoctorId: null });
  redirect('/admin/station');
}

/** Read the session's room or send them to choose one. */
async function myRoom(): Promise<{ staff: Staff; roomId: string }> {
  const staff = await requireStaff();
  if (!staff.roomId) back('Choose your room first.', true);

  // Picked before the room got its own room account: that account has it now.
  if (!staff.roomFixed) {
    const [owner] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.roomId, staff.roomId), eq(staffUsers.isActive, true)))
      .limit(1);
    if (owner) back('That room now has its own room account. Use the screen in that room.', true);
  }
  return { staff, roomId: staff.roomId };
}

export async function callNext(): Promise<void> {
  const { staff, roomId } = await myRoom();

  const result = await callNextForRoom(db, {
    serviceDate: manilaDateString(),
    roomId,
    doctorId: lineDoctor(staff),
    staffId: staff.id,
  });
  refresh();

  if (result.ok) back(`${formatTicket(result.ticket.category, result.ticket.number)} is on the screen.`);
  back(
    {
      nobody_waiting: 'Nobody is waiting.',
      room_busy: 'This room already has a patient on the screen. Finish or skip them first.',
      no_room: 'This room is not in use any more. Choose another.',
      no_doctor: 'Pick whose patients this room is calling.',
    }[result.reason],
    true,
  );
}

export async function start(): Promise<void> {
  const { roomId } = await myRoom();
  const ok = await startTicket(db, roomId);
  refresh();
  back(ok ? 'Started.' : 'Nobody to start. The screen may have changed.', !ok);
}

export async function finish(): Promise<void> {
  const { roomId } = await myRoom();
  const ok = await finishTicket(db, roomId);
  refresh();
  back(ok ? 'Done. The room is free to call the next patient.' : 'Nobody to finish.', !ok);
}

export async function skip(): Promise<void> {
  const { roomId } = await myRoom();
  const ok = await skipTicket(db, roomId);
  refresh();
  back(
    ok
      ? 'Skipped. If they come back, recall them from the list below and they go to the front.'
      : 'Nobody to skip. Someone already started is not a no-show.',
    !ok,
  );
}

export async function undo(): Promise<void> {
  const { roomId } = await myRoom();
  const ok = await undoCall(db, roomId);
  refresh();
  back(ok ? 'Call undone. The number is back in its place in the line.' : 'Nothing to undo.', !ok);
}

const sendOnSchema = z.object({
  category: z.enum(['consultation', 'laboratory', 'imaging']),
  note: z
    .string()
    .trim()
    .max(200, 'Keep the note under 200 characters.')
    .transform((v) => (v === '' ? null : v)),
});

const DEPARTMENT: Record<QueueCategory, string> = {
  consultation: 'Consultation',
  laboratory: 'the laboratory',
  imaging: 'imaging',
};

/**
 * The doctor (or the laboratory) sends the patient on: a new number in that department,
 * same patient, same visit. Tell the patient the new number before they leave the room.
 */
export async function sendOn(formData: FormData): Promise<void> {
  const { staff, roomId } = await myRoom();
  const parsed = sendOnSchema.safeParse({
    category: formData.get('category') ?? '',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? 'Pick where to send them.', true);

  const result = await referTicket(db, {
    roomId,
    serviceDate: manilaDateString(),
    category: parsed.data.category,
    note: parsed.data.note,
    staffId: staff.id,
  });
  refresh();

  if (result.ok) {
    back(
      `${formatTicket(result.ticket.category, result.ticket.number)} issued for ${DEPARTMENT[parsed.data.category]}. Give the patient this number; they can go there when you finish.`,
    );
  }
  back(
    {
      nobody_in_room: 'Start the patient first. Only somebody you have seen can be sent on.',
      same_department: 'They are already in this department.',
      already_sent: `They already have a number for ${DEPARTMENT[parsed.data.category]}.`,
    }[result.reason],
    true,
  );
}

const recallSchema = z.object({ ticketId: z.uuid() });

export async function recall(formData: FormData): Promise<void> {
  await myRoom();
  const parsed = recallSchema.safeParse({ ticketId: formData.get('ticketId') ?? '' });
  if (!parsed.success) back('Nothing to recall.', true);

  const ok = await recallSkipped(db, parsed.data.ticketId);
  refresh();
  back(
    ok
      ? 'Recalled. They are at the front of the line.'
      : 'They have already been recalled once. They need a new number from reception.',
    !ok,
  );
}
