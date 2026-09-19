/**
 * Clears the rate-limit counters.
 *
 * Repeated end-to-end runs exhaust the login limit (10 per IP per hour) and every later
 * sign-in then fails with a message that looks nothing like a rate limit, which is
 * confusing to debug. Run this between test passes.
 *
 *   npx tsx scripts-clear-rate-limits.mts
 */
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });

const { createDb } = await import('@/db/client');
const { pool } = createDb();
const result = await pool.query('delete from rate_limits');
console.log(`cleared ${result.rowCount} rate-limit counter(s)`);
await pool.end();
