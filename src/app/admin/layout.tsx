import type { Metadata } from 'next';

/**
 * Everything under /admin, including the login page.
 *
 * The authorisation guard is NOT here: it lives in the (app) route group's layout, so
 * that /admin/login can render without it. `noindex` is set for the whole area either
 * way.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: { default: 'Clinic admin', template: '%s · Clinic admin' },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-surface-sunken">{children}</div>;
}
