// Local preview data (only used when MOCK_DB=1, never in production builds).
import raw from "./mock-posts.json";
import type { Card, Post } from "./db";

const all = (raw as unknown as Post[]).slice().sort((a, b) => b.published_at.localeCompare(a.published_at));
export const mock = {
  latest: (limit: number, offset: number, f?: { city?: string; category?: string }) =>
    all.filter((p) => (!f?.city || p.city === f.city) && (!f?.category || p.category === f.category)).slice(offset, offset + limit) as Card[],
  pinned: () => all.filter((p) => p.pinned_until && p.pinned_until > new Date().toISOString()) as Card[],
  breaking: () => all.filter((p) => p.is_breaking).slice(0, 1) as Card[],
  mostRead: (_d: number, lim: number) => [...all].sort((a, b) => b.views - a.views).slice(0, lim) as Card[],
  videos: (lim: number) => all.filter((p) => p.ig_media_type === "VIDEO").slice(0, lim) as Card[],
  bySlug: (s: string) => all.find((p) => p.slug === s) ?? null,
  related: (post: Post, lim: number) => all.filter((p) => p.id !== post.id).sort((a, b) => Number(b.city === post.city) - Number(a.city === post.city)).slice(0, lim) as Card[],
  search: (q: string, lim: number) => all.filter((p) => (p.title + p.body_html).toLowerCase().includes(q.toLowerCase())).slice(0, lim) as Card[],
  sitemap: () => all,
};
