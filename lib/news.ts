import { orchestrator } from './orchestrator/boot';
import type { NewsItem } from './orchestrator/providers/news';

// Recent news mentions for a company's detail page. Best-effort — returns []
// on any failure so the page just omits the section.
export async function getCompanyNews(name: string, limit = 5): Promise<NewsItem[]> {
  if (!orchestrator.hasProvider('news')) return [];
  const res = await orchestrator.callTool<NewsItem[]>('news.search', { query: name, limit }, 10_000);
  return res.ok ? res.data : [];
}

export type { NewsItem } from './orchestrator/providers/news';
