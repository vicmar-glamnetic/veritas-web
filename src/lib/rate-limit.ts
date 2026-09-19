import 'server-only';

import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';

/**
 * Fixed-window rate limiting, counted in the database.
 *
 * An in-memory counter is useless here: Vercel runs many short-lived instances, so a
 * process-local map would let an attacker through simply by being routed elsewhere.
 * One upsert per attempt is cheap at clinic scale.
 */
export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when `ok` is false. */
  retryAfterSeconds: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
        then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
        then now()
        else rate_limits.window_start
      end
    returning count, window_start
  `);

  const row = rows.rows[0];
  if (!row) return { ok: true, retryAfterSeconds: 0 };

  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    ok: row.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}

/**
 * Best-effort client IP. Behind Vercel the left-most entry of `x-forwarded-for` is the
 * real client. This is only used as a rate-limit bucket, never stored against a person.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/** Deletes counters whose window is long past. Called opportunistically, never blocking. */
export async function pruneRateLimits(): Promise<void> {
  await db
    .execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`)
    .catch(() => undefined);
}
