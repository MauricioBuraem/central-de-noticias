import type { APIRoute } from "astro";
import { sitemapRows } from "../lib/db";
import { SITE } from "../lib/config";
import { absolute, escapeXml, postPath } from "../lib/format";

// Google News sitemap: only articles from the last 48 hours.
export const GET: APIRoute = async () => {
  const rows = await sitemapRows(new Date(Date.now() - 48 * 3600_000).toISOString());
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${rows
  .map(
    (r) => `<url><loc>${absolute(postPath(r))}</loc><news:news><news:publication><news:name>${escapeXml(SITE.name)}</news:name><news:language>pt</news:language></news:publication><news:publication_date>${r.published_at}</news:publication_date><news:title>${escapeXml(r.title)}</news:title></news:news></url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=3600", "Netlify-Cache-Tag": "pages" } });
};
