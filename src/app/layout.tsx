import type { Metadata } from 'next';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getSiteSettings } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';

import './globals.css';

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
    robots: { index: true, follow: true },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e6058',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-PH" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink-900">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
