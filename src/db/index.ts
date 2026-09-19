import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

/**
 * HTTP-based Neon client. Fine for reads and single-statement writes, which is
 * almost everything here.
 *
 * Note: neon-http cannot run interactive transactions. The booking insert relies on
 * the partial unique index `bookings_slot_seat_key` for its concurrency guarantee
 * rather than a transaction with a row lock, which is why that index exists. If a
 * future feature genuinely needs a multi-statement transaction, add a pooled
 * `drizzle-orm/neon-serverless` client alongside this one.
 */
export const db = drizzle(neon(connectionString), { schema });

export { schema };
