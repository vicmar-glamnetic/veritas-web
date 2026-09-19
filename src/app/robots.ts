import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
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
