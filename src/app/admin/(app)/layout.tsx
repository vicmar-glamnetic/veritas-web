import Link from 'next/link';

import { requireStaff } from '@/lib/auth';
import { getSiteSettings } from '@/lib/queries';

import { AdminNav } from './nav';
import { signOut } from './actions';

/**
 * The guarded shell. Everything rendered inside this layout has already passed
 * `requireStaff()`, which redirects to the login page when there is no live session.
 *
 * Server actions repeat the check themselves; see ./actions.ts.
 */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const settings = await getSiteSettings();

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/admin" className="font-serif text-lg text-ink-900">
              {settings.clinicName}
            </Link>
            <span className="text-xs font-semibold tracking-[0.16em] text-brand-600 uppercase">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-ink-500">
              {staff.name}
              <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-700">
                {staff.role === 'admin' ? 'Admin' : 'Reception'}
              </span>
            </span>
            <Link href="/" className="text-ink-500 underline underline-offset-4 hover:text-ink-900">
              Website
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-line-strong px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-surface-sunken"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl gap-8 px-4 py-6 lg:flex">
        <aside className="lg:w-56 lg:shrink-0">
          <AdminNav role={staff.role} />
        </aside>
        <main id="main" className="mt-5 min-w-0 flex-1 lg:mt-0">{children}</main>
      </div>
    </div>
  );
}
