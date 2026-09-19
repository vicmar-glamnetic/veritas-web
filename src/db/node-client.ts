/**
 * TCP Postgres client, for code that runs outside the Next.js request path: the seed
 * script and the test suite.
 *
 * The deployed app uses the HTTP driver in ./index.ts, which is what Neon recommends
 * for serverless. Both are Drizzle over the same schema, so queries are written once
 * and behave the same; only the transport differs. This one also speaks to a plain
 * local Postgres, which is what lets the availability tests run without a network.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export function createNodeDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }
  const pool = new Pool({
    connectionString,
    // Neon requires TLS; a local cluster does not offer it.
    ssl: /neon\.tech|sslmode=require/.test(connectionString)
      ? { rejectUnauthorized: false }
      : false,
    max: 5,
  });
  return { db: drizzle(pool, { schema }), pool };
}
