/**
 * Whether search engines may index this deployment.
 *
 * Off unless explicitly switched on, because the seeded demo content is fabricated: an
 * invented street address, invented phone numbers that may well belong to somebody, and
 * invented doctors. A search result sending a real patient to a made-up clinic address,
 * or ringing a stranger's number, is a genuine harm and not one worth risking for a
 * staging link.
 *
 * At launch, once the clinic's real details are in, set ALLOW_SEARCH_INDEXING=true in
 * the Vercel project. Nothing else needs to change.
 */
export const ALLOW_INDEXING = process.env.ALLOW_SEARCH_INDEXING === 'true';
