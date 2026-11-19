import { CATEGORIES, CITIES, SITE, SUPABASE, type CityKey } from "./config";

const TZ = "America/Sao_Paulo";

function parts(iso: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = f.format(new Date(iso)).split("-");
  return { y, m, d };
}

/** Article URL, same pattern as the old WordPress site: /AAAA/MM/DD/slug/ */
export function postPath(p: { slug: string; published_at: string }): string {
  const { y, m, d } = parts(p.published_at);
  return `/${y}/${m}/${d}/${p.slug}/`;
}
export const absolute = (path: string) => new URL(path, SITE.url).toString();

export function cityOf(key: string) {
  return CITIES[(key as CityKey) in CITIES ? (key as CityKey) : "regiao"];
}
export const categoryName = (key: string) => CATEGORIES[key] ?? "Notícias";

export function storageUrl(path: string): string {
  return `${SUPABASE.url}/storage/v1/object/public/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Resized image through Netlify Image CDN (WebP/AVIF negotiated automatically). */
export function img(path: string | null | undefined, w: number, h?: number, q = 70): string {
  if (!path) return "/og-default.png";
  if (path.startsWith("mock/")) return `/${path}`;
  const src = storageUrl(path);
  const p = new URLSearchParams({ url: src, w: String(w), q: String(q) });
  if (h) {
    p.set("h", String(h));
    p.set("fit", "cover");
  }
  return `/.netlify/images?${p.toString()}`;
}

export function srcset(path: string | null | undefined, widths: number[], ratio?: number): string {
  if (!path) return "";
  return widths.map((w) => `${img(path, w, ratio ? Math.round(w / ratio) : undefined)} ${w}w`).join(", ");
}

/** Absolute JPEG URL for social previews (WhatsApp/Facebook don't like WebP). */
export function ogImage(path: string | null | undefined): string {
  if (!path) return absolute("/og-default.png");
  const p = new URLSearchParams({ url: storageUrl(path), w: "1200", h: "630", fit: "cover", position: "top", fm: "jpg", q: "80" });
  return absolute(`/.netlify/images?${p.toString()}`);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `há ${h} hora${h > 1 ? "s" : ""}`;
  }
  if (diff < 7 * 86400) {
    const d = Math.floor(diff / 86400);
    return `há ${d} dia${d > 1 ? "s" : ""}`;
  }
  return shortDate(iso);
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} às ${time.replace(":", "h")}`;
}

export function todayLong(): string {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function readingMinutes(html: string): number {
  return Math.max(1, Math.round(stripTags(html).split(" ").length / 200));
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Insert a node after the Nth paragraph of article HTML (for the in-article ad and CTA). */
export function splitAfterParagraph(html: string, n: number): [string, string] {
  let idx = -1;
  let from = 0;
  for (let i = 0; i < n; i++) {
    idx = html.indexOf("</p>", from);
    if (idx === -1) return [html, ""];
    from = idx + 4;
  }
  return [html.slice(0, from), html.slice(from)];
}
