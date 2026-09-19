import type { MetadataRoute } from 'next';

import { ALLOW_INDEXING } from '@/lib/indexing';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // Until the clinic's real details replace the demo content, keep the whole site out
  // of search results. See src/lib/indexing.ts.
  if (!ALLOW_INDEXING) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The admin area and individual booking lookups must never be indexed.
      disallow: ['/admin', '/admin/', '/booking/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
