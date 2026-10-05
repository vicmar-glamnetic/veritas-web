/**
 * Staff roles, for display. Kept out of `auth.ts`, which is server-only, so the nav and
 * the staff list can import the same names.
 */

export type StaffRole = 'admin' | 'reception' | 'doctor' | 'laboratory' | 'imaging' | 'room';

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  reception: 'Reception',
  doctor: 'Doctor',
  laboratory: 'Laboratory',
  imaging: 'Imaging',
  room: 'Room account',
};

/** Admin and reception run the desk; the other roles work a room. */
export function isDeskRole(role: StaffRole): boolean {
  return role === 'admin' || role === 'reception';
}

/** Which rooms a role may work. The desk can cover any room; the others their own kind. */
export function mayWorkRoom(
  role: StaffRole,
  category: 'consultation' | 'laboratory' | 'imaging',
): boolean {
  // A room account is fixed to its own room, which the session enforces.
  if (isDeskRole(role) || role === 'room') return true;
  return (
    (role === 'doctor' && category === 'consultation') ||
    (role === 'laboratory' && category === 'laboratory') ||
    (role === 'imaging' && category === 'imaging')
  );
}
