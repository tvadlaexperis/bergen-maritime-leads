import type { MetadataRoute } from 'next';

// Internal tool — keep it out of search indexes (docs/09-security.md §8).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
