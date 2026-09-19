'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/doctors', label: 'Doctors' },
  { href: '/prices', label: 'Prices' },
  { href: '/promos', label: 'Promos' },
  { href: '/contact', label: 'Contact' },
] as const;

/**
 * The only client component in the header. It exists solely to mark the current page
 * with `aria-current`, which screen readers announce and sighted users see as the
 * underlined item.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1 overflow-x-auto px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV_ITEMS.map((item) => {
        const isCurrent =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={`block rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isCurrent
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-ink-700 hover:bg-surface-sunken hover:text-ink-900'
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
