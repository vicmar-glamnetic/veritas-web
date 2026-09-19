import { MobileActions } from '@/components/mobile-actions';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { telHref } from '@/lib/mobile';
import { getSiteSettings } from '@/lib/queries';

/**
 * The patient-facing shell: header, the one <main> landmark, footer, and the fixed
 * call/book bar on phones. Deliberately separate from the admin area, which has its own.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileActions
        phone={settings.phonePrimary || null}
        telHref={settings.phonePrimary ? telHref(settings.phonePrimary) : null}
      />
    </>
  );
}
