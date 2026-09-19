import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Builds a Drizzle client over a node-postgres pool.
 *
 * We use the TCP driver rather than Neon's HTTP driver for two reasons:
 *
 *  1. It supports interactive transactions, which the booking insert needs so that
 *     the booking row and its `booking_events` row are written atomically.
 *  2. It speaks to any Postgres, so the seed and the test suite run against a local
 *     cluster with no network.
 *
 * Neon accepts ordinary Postgres connections on its pooled (`-pooler`) endpoint, which
 * is what the deployed app uses.
 */
export function createDb(
  connectionString = process.env.DATABASE_URL,
  options: { max?: number } = {},
) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }

  // Neon requires TLS and presents a publicly-trusted certificate, so verify it
  // properly. Turning verification off would leave the connection open to a
  // man-in-the-middle, which is not a trade worth making for patient data. A local
  // cluster offers no TLS at all, hence the split.
  const needsTls = /neon\.tech|sslmode=require/.test(connectionString);

  const pool = new Pool({
    connectionString,
    ssl: needsTls ? { rejectUnauthorized: true } : false,
    // The concurrency test raises this so its parallel attempts really do overlap.
    max: options.max ?? 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>['db'];
