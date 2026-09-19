import type { Metadata } from 'next';

import { requireStaff } from '@/lib/auth';

/**
 * The waiting-room board sits outside the (app) route group so it gets the full screen:
 * no admin header, no sidebar, no sign-out button behind a patient's head.
 *
 * It still guards itself. `requireStaff()` is repeated here because the (app) layout's
 * guard does not reach this branch of the tree, and the board shows patient names —
 * shortened, but names. In practice a staff member signs the screen in once when the
 * clinic opens and the session cookie carries it through the day.
 */
export const metadata: Metadata = {
  title: 'Waiting room screen',
  robots: { index: false, follow: false },
};

export default async function MonitorLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return children;
}
