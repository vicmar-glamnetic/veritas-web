'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Today', exact: true },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/schedules', label: 'Schedules' },
  { href: '/admin/services', label: 'Services and prices' },
  { href: '/admin/doctors', label: 'Doctors' },
  { href: '/admin/promos', label: 'Promos' },
  // Opens in its own tab: this is the screen that hangs in the waiting room, and the
  // desk should not lose the Today list to go and look at it.
  { href: '/admin/monitor', label: 'Waiting room screen', newTab: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
  { href: '/admin/staff', label: 'Staff users', adminOnly: true },
] as const;

export function AdminNav({ role }: { role: 'admin' | 'reception' }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {ITEMS.filter((item) => !('adminOnly' in item && item.adminOnly) || role === 'admin').map(
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
