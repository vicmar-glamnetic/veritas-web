import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { db } from '@/db';
import { staffSessions, staffUsers } from '@/db/schema';
import { isDeskRole, type StaffRole } from '@/lib/admin/roles';

/**
 * Staff authentication.
 *
 * Database-backed sessions rather than a self-contained signed cookie, because the
 * clinic needs to be able to revoke access the moment someone leaves: deactivating a
 * staff user kills every session they hold on the next request. A stateless token
 * would stay valid until it expired.
 *
 * The cookie carries an opaque random token. What is stored is its HMAC, keyed with
 * SESSION_SECRET, so a database leak alone does not hand over live sessions and the
 * lookup is still a single indexed equality.
 */

const COOKIE_NAME = 'veritas_staff';
const SESSION_HOURS = 12; // one clinic day; staff log in each morning


export type Staff = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  /** A doctor account's own doctor record; null for every other role. */
  doctorId: string | null;
  /** This sign-in session, so the station screen can record which room it is in. */
  sessionId: string;
  /**
   * The room this person is working: a room account's fixed room, otherwise the one
   * chosen on the station screen for this session, if any.
   */
  roomId: string | null;
  /** True for a room account, whose room cannot be changed. */
  roomFixed: boolean;
  /** Whose consultation line this session calls, for a consultation room. */
  stationDoctorId: string | null;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short. See .env.example.');
  }
  return value;
}

function hashToken(token: string): string {
  return createHmac('sha256', secret()).update(token).digest('base64url');
}

/** Creates a session and sets the cookie. Returns nothing the caller should log. */
export async function createSession(staffUserId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await db.insert(staffSessions).values({
    staffUserId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * The signed-in staff member, or null.
 *
 * Wrapped in React `cache` so the layout, the page and any server action in the same
 * request share one lookup.
 */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      email: staffUsers.email,
      role: staffUsers.role,
      doctorId: staffUsers.doctorId,
      fixedRoomId: staffUsers.roomId,
      isActive: staffUsers.isActive,
      sessionId: staffSessions.id,
      roomId: staffSessions.roomId,
      stationDoctorId: staffSessions.stationDoctorId,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffUserId))
    .where(
      and(
        eq(staffSessions.tokenHash, hashToken(token)),
        isNull(staffSessions.revokedAt),
        gt(staffSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  // Deactivating a staff member locks them out immediately, without hunting sessions.
  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    doctorId: row.doctorId,
    sessionId: row.sessionId,
    roomId: row.fixedRoomId ?? row.roomId,
    roomFixed: row.fixedRoomId !== null,
    stationDoctorId: row.stationDoctorId,
  };
});

/**
 * Guards a page. **Every server action must call this too** — an action is its own
 * endpoint and is reachable without ever rendering the layout that protects the page.
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  return staff;
}

/**
 * The front desk's screens and actions: Today, bookings, schedules, prices, doctors,
 * promos, rooms. A doctor, laboratory or imaging login works a room and is sent to its
 * station instead — the proposal's "access limited to their role".
 */
export async function requireDesk(): Promise<Staff> {
  const staff = await requireStaff();
  if (!isDeskRole(staff.role)) redirect('/admin/station');
  return staff;
}

/** Admin-only areas: staff accounts, settings. */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'admin') redirect('/admin?denied=1');
  return staff;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    await db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(staffSessions.tokenHash, hashToken(token)));
  }

  jar.delete(COOKIE_NAME);
}

/**
 * Record which room this sign-in is working in. Lives on the session, so tomorrow's
 * sign-in asks again and nobody has to remember to clear yesterday's room.
 */
export async function setStation(
  sessionId: string,
  station: { roomId: string | null; stationDoctorId: string | null },
): Promise<void> {
  await db.update(staffSessions).set(station).where(eq(staffSessions.id, sessionId));
}

/** Revokes every session a staff member holds, e.g. when they are deactivated. */
export async function revokeAllSessions(staffUserId: string): Promise<void> {
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.staffUserId, staffUserId), isNull(staffSessions.revokedAt)));
}

/**
 * Compares two secrets without leaking their relationship through timing. Used for the
 * login lookup, which must take the same time whether or not the email exists.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
