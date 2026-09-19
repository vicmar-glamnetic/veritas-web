import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared furniture.
 *
 * The guiding decision: a hairline rule instead of a bordered, rounded box wherever a
 * card would be the reflexive choice. Putting everything in an identical card is most
 * of what made the first draft look generated.
 */

/** Standard page heading. Every page has exactly one `h1`. */
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
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <h1 className="text-3xl leading-tight text-ink-900 sm:text-4xl">{title}</h1>
        {lead ? (
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
            {lead}
          </p>
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
  return <div className={`mx-auto max-w-6xl px-4 ${className}`}>{children}</div>;
}

/**
 * A section heading with the small rule above it. Used instead of wrapping the section
 * in a box, which is the difference between a printed page and a dashboard.
 */
export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line-strong pt-4">
      <h2 className="text-xl text-ink-900 sm:text-2xl">{children}</h2>
      {action ? (
        <Link
          href={action.href}
          className="text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-line bg-surface p-5 ${className}`}>{children}</div>
  );
}

/** A tinted aside, for caveats like "prices may change". */
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
    <div className={`rounded border-l-2 px-4 py-3.5 text-sm leading-relaxed ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

/**
 * Tap targets stay at least 44px tall throughout. These are pressed with a thumb, often
 * one-handed, on a bus.
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
    secondary: 'border border-line-strong bg-surface text-ink-900 hover:bg-surface-sunken',
  } as const;

  const classes = `inline-flex min-h-[3rem] items-center justify-center rounded px-5 py-3 text-base font-semibold ${variants[variant]} ${className}`;

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

/** Long-form text: the privacy notice, plain-language explanations. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-2xl space-y-4 text-base leading-relaxed text-ink-700 [&_h2]:mt-9 [&_h2]:text-xl [&_h2]:text-ink-900 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2 [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-4">
      {children}
    </div>
  );
}
