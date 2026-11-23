import { createClient } from "@supabase/supabase-js";
import { SUPABASE, type CityKey } from "./config";

export const supabase = createClient(SUPABASE.url, SUPABASE.key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});

const MOCK = import.meta.env.MOCK_DB === "1" || (typeof process !== "undefined" && process.env.MOCK_DB === "1");
const M = MOCK ? (await import("./mock")).mock : null;

export type Post = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  body_html: string;
  city: CityKey;
  category: string;
  tags: string[];
  author: string;
  cover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_focus: number | null;
  cover_alt: string | null;
  gallery: { path: string; width?: number; height?: number }[];
  ig_permalink: string | null;
  ig_media_type: string | null;
  is_breaking: boolean;
  pinned_until: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
  updated_at: string;
  views: number;
};

const CARD = "id, slug, title, subtitle, excerpt, city, category, cover_path, cover_width, cover_height, cover_focus, cover_alt, ig_media_type, is_breaking, pinned_until, published_at, updated_at, views";
export type Card = Pick<
  Post,
  | "id" | "slug" | "title" | "subtitle" | "excerpt" | "city" | "category" | "cover_path" | "cover_width" | "cover_height" | "cover_focus"
  | "cover_alt" | "ig_media_type" | "is_breaking" | "pinned_until" | "published_at" | "updated_at" | "views"
>;

function published() {
  return supabase.from("posts").select(CARD).eq("status", "published").lte("published_at", new Date().toISOString());
}

export async function latest(limit = 20, offset = 0, filter?: { city?: string; category?: string }): Promise<Card[]> {
  if (M) return M.latest(limit, offset, filter);
  let q = published();
  if (filter?.city) q = q.eq("city", filter.city);
  if (filter?.category) q = q.eq("category", filter.category);
  const { data, error } = await q.order("published_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function countPosts(filter?: { city?: string; category?: string }): Promise<number> {
  let q = supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "published");
  if (filter?.city) q = q.eq("city", filter.city);
  if (filter?.category) q = q.eq("category", filter.category);
  const { count } = await q;
  return count ?? 0;
}

export async function pinned(): Promise<Card[]> {
  if (M) return M.pinned();
  const { data } = await published().gt("pinned_until", new Date().toISOString()).order("published_at", { ascending: false }).limit(3);
  return (data ?? []) as Card[];
}

export async function breaking(hours = 6): Promise<Card[]> {
  if (M) return M.breaking();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data } = await published().eq("is_breaking", true).gte("published_at", since).order("published_at", { ascending: false }).limit(3);
  return (data ?? []) as Card[];
}

export async function mostRead(days = 3, limit = 5): Promise<Card[]> {
  if (M) return M.mostRead(days, limit);
  const { data } = await supabase.rpc("most_read", { days, lim: limit });
  let rows = (data ?? []) as Card[];
  if (rows.length < limit) {
    // Not enough recent traffic yet: fall back to a wider window
    const { data: more } = await supabase.rpc("most_read", { days: 30, lim: limit });
    const seen = new Set(rows.map((r) => r.id));
    rows = rows.concat(((more ?? []) as Card[]).filter((r) => !seen.has(r.id))).slice(0, limit);
  }
  return rows;
}

export async function videos(limit = 8): Promise<Card[]> {
  if (M) return M.videos(limit);
  const { data } = await published().eq("ig_media_type", "VIDEO").not("cover_path", "is", null).order("published_at", { ascending: false }).limit(limit);
  return (data ?? []) as Card[];
}

export async function bySlug(slug: string): Promise<Post | null> {
  if (M) return M.bySlug(slug);
  const { data } = await supabase.from("posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  return (data as Post) ?? null;
}

export async function related(post: Post, limit = 6): Promise<Card[]> {
  if (M) return M.related(post, limit);
  const { data } = await published().eq("city", post.city).neq("id", post.id).order("published_at", { ascending: false }).limit(limit);
  let rows = (data ?? []) as Card[];
  if (rows.length < limit) {
    const { data: more } = await published().neq("id", post.id).neq("city", post.city).order("published_at", { ascending: false }).limit(limit - rows.length);
    rows = rows.concat((more ?? []) as Card[]);
  }
  return rows;
}

export async function search(q: string, limit = 20, offset = 0): Promise<Card[]> {
  if (M) return M.search(q, limit);
  const { data, error } = await supabase.rpc("search_posts", { q, lim: limit, off: offset });
  if (error) return [];
  return (data ?? []) as Card[];
}

export async function sitemapRows(sinceIso?: string) {
  let q = supabase.from("posts").select("slug, title, seo_title, published_at, updated_at, cover_path, city").eq("status", "published");
  if (sinceIso) q = q.gte("published_at", sinceIso);
  const { data } = await q.order("published_at", { ascending: false }).limit(5000);
  return (data ?? []) as Pick<Post, "slug" | "title" | "seo_title" | "published_at" | "updated_at" | "cover_path" | "city">[];
}
