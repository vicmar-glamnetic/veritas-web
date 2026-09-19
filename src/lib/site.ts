/**
 * Where the site is served from.
 *
 * Used for canonical URLs, Open Graph tags and the absolute links in confirmation
 * emails, none of which can be derived from the incoming request at build time.
 *
 * This resolution is deliberately forgiving, because getting it wrong breaks the build
 * rather than degrading. It once used `??`, which only falls back on null or undefined:
 * an environment variable that exists but is *blank* (a Vercel dashboard field left
 * empty, or `NEXT_PUBLIC_SITE_URL=` in a .env file) passed straight through, and
 * `new URL('')` threw during prerender and failed the whole deployment.
 */

const LOCAL_FALLBACK = 'http://localhost:3000';

/** Blank, whitespace-only and unset all mean "not configured". */
function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Turn a configured value into a usable origin, or null if it cannot be one.
 *
 * Accepts a bare host ("veritas-web.vercel.app") as well as a full origin, because
 * pasting the domain without a scheme is the obvious mistake to make in a dashboard
 * field, and Vercel's own VERCEL_PROJECT_PRODUCTION_URL has no scheme by design.
 */
function toOrigin(value: string | null): string | null {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

type SiteEnv = Record<string, string | undefined>;

export function resolveSiteUrl(env: SiteEnv = process.env): string {
  return (
    toOrigin(present(env.NEXT_PUBLIC_SITE_URL)) ??
    toOrigin(present(env.VERCEL_PROJECT_PRODUCTION_URL)) ??
    LOCAL_FALLBACK
  );
}

export const SITE_URL = resolveSiteUrl();

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
