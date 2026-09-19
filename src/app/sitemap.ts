import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

const PAGES = [
  { path: '/', priority: 1 },
  { path: '/book', priority: 0.9 },
  { path: '/services', priority: 0.8 },
  { path: '/prices', priority: 0.8 },
  { path: '/doctors', priority: 0.7 },
  { path: '/promos', priority: 0.6 },
  { path: '/contact', priority: 0.6 },
  { path: '/privacy', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: page.priority,
  }));
}
