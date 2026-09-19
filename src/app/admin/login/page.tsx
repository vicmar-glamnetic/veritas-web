import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentStaff } from '@/lib/auth';
import { getSiteSettings } from '@/lib/queries';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // Already signed in: go straight through rather than showing a pointless form.
  if (await getCurrentStaff()) redirect('/admin');
  const settings = await getSiteSettings();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded border border-line bg-surface p-7">
        <p className="font-serif text-2xl text-ink-900">{settings.clinicName}</p>
        <p className="mt-0.5 text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
          Staff sign in
        </p>

        <div className="mt-7">
          <LoginForm />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link href="/" className="underline underline-offset-4 hover:text-ink-900">
          Back to the website
        </Link>
      </p>
    </div>
  );
}
