import Link from 'next/link';
import type { ReactNode } from 'react';

/** Standard page heading block. Every page has exactly one `h1`. */
export function PageHeader({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-surface-sunken">
      <div className="mx-auto max-w-5xl px-4 py-9 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {lead ? (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">{lead}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto max-w-5xl px-4 ${className}`}>{children}</div>;
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</div>
  );
}

/** A tinted aside — used for caveats like "prices may change". */
export function Callout({
  tone = 'brand',
  title,
  children,
}: {
  tone?: 'brand' | 'accent';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    brand: 'border-brand-200 bg-brand-50 text-brand-900',
    accent: 'border-accent-200 bg-accent-50 text-accent-800',
  } as const;

  return (
    <div className={`rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

/**
 * Primary call to action. Tap targets are at least 44px tall throughout — these are
 * pressed with a thumb, often one-handed.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  children,
  className = '',
}: {
  href: string;
  variant?: 'primary' | 'secondary';
  children: ReactNode;
  className?: string;
}) {
  const variants = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    secondary: 'border border-line bg-surface text-ink-900 hover:bg-surface-sunken',
  } as const;

  const classes = `inline-flex min-h-[3rem] items-center justify-center rounded-xl px-5 py-3 text-base font-semibold ${variants[variant]} ${className}`;

  return href.startsWith('/') ? (
    <Link href={href} className={classes}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

/** Long-form text (privacy notice, plain-language explanations). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-2xl space-y-4 text-base leading-relaxed text-ink-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink-900 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2 [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2">
      {children}
    </div>
  );
}
