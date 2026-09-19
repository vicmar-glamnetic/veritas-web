import { createDb, type Db } from './client';
import * as schema from './schema';

/**
 * The app's database handle.
 *
 * Cached on globalThis so that Next's dev-mode hot reloading and Vercel's reuse of a
 * warm serverless instance do not open a new connection pool every time this module is
 * re-evaluated.
 */
const globalForDb = globalThis as unknown as { veritasDb?: Db };

export const db: Db = globalForDb.veritasDb ?? createDb().db;

if (process.env.NODE_ENV !== 'production') {
  globalForDb.veritasDb = db;
}

export { schema };
