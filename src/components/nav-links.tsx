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
 * The only client component in the header. It exists to mark the current page with
 * `aria-current`, which screen readers announce and sighted users see as the underlined
 * item. An underline rather than a filled pill: closer to a printed index, and it does
 * not turn the nav into a row of buttons.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-5 overflow-x-auto px-4 [scrollbar-width:none] sm:gap-7 [&::-webkit-scrollbar]:hidden">
      {NAV_ITEMS.map((item) => {
        const isCurrent =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={`block border-b-2 py-2.5 text-sm whitespace-nowrap transition-colors ${
                isCurrent
                  ? 'border-brand-600 font-semibold text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-900'
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
