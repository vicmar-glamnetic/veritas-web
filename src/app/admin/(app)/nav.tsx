'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isDeskRole, type StaffRole } from '@/lib/admin/roles';

/**
 * `desk` items are for admin and reception. Doctor, laboratory and imaging logins see
 * their room and the waiting room screen, and nothing that edits bookings or prices —
 * the guards on those pages and actions refuse them anyway; this just stops offering it.
 */
const ITEMS = [
  { href: '/admin', label: 'Today', exact: true, desk: true },
  { href: '/admin/station', label: 'My room' },
  { href: '/admin/bookings', label: 'Bookings', desk: true },
  { href: '/admin/schedules', label: 'Schedules', desk: true },
  { href: '/admin/services', label: 'Services and prices', desk: true },
  { href: '/admin/doctors', label: 'Doctors', desk: true },
  { href: '/admin/rooms', label: 'Rooms', desk: true },
  { href: '/admin/promos', label: 'Promos', desk: true },
  // Opens in its own tab: this is the screen that hangs in the waiting room, and the
  // desk should not lose the Today list to go and look at it.
  { href: '/admin/monitor', label: 'Waiting room screen', newTab: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
  { href: '/admin/staff', label: 'Staff users', adminOnly: true },
] as const;

export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {ITEMS.filter(
          (item) =>
            (!('adminOnly' in item && item.adminOnly) || role === 'admin') &&
            (!('desk' in item && item.desk) || isDeskRole(role)),
        ).map(
          (item) => {
            const current =
              'exact' in item && item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const newTab = 'newTab' in item && item.newTab;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className={`block rounded px-3 py-2 text-sm whitespace-nowrap ${
                    current
                      ? 'bg-brand-700 font-semibold text-white'
                      : 'text-ink-700 hover:bg-surface-sunken'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          },
        )}
      </ul>
    </nav>
  );
}
