import type { Metadata } from 'next';

import { getSiteSettings } from '@/lib/queries';
import { ALLOW_INDEXING } from '@/lib/indexing';
import { SITE_URL } from '@/lib/site';

import './globals.css';

/**
 * The document shell, and nothing else.
 *
 * The public site's header, footer and mobile action bar live in `(site)/layout.tsx`,
 * not here. Having them here meant the admin area rendered the whole patient-facing
 * chrome around itself: two nested <main> landmarks, the public navigation, and a
 * fixed "Call the clinic / Book" bar over the front desk's screen.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const description =
    'Consultations, blood tests, X-ray, ultrasound, ECG and 2D echo, all in the same ' +
    'building. Book a slot online in about a minute. You pay at the clinic, on the day.';

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${settings.clinicName} | Book an appointment`,
      template: `%s | ${settings.clinicName}`,
    },
    description,
    applicationName: settings.clinicName,
    openGraph: {
      type: 'website',
      siteName: settings.clinicName,
      locale: 'en_PH',
      title: `${settings.clinicName} | Book an appointment`,
      description,
      url: SITE_URL,
    },
    twitter: { card: 'summary_large_image' },
    robots: ALLOW_INDEXING
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a4064',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-PH" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink-900">{children}</body>
    </html>
  );
}
