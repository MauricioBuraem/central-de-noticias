import type { APIRoute } from "astro";
import { sitemapRows } from "../lib/db";
import { CATEGORIES, CITIES } from "../lib/config";
import { absolute, escapeXml, ogImage, postPath } from "../lib/format";

export const GET: APIRoute = async () => {
  const rows = await sitemapRows();
  const statics = ["/", "/ultimas/", ...Object.values(CITIES).map((c) => c.path), ...Object.keys(CATEGORIES).map((k) => `/editoria/${k}/`), "/envie-sua-noticia/", "/anuncie/", "/sobre/", "/contato/"];
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${statics.map((p) => `<url><loc>${absolute(p)}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq></url>`).join("\n")}
${rows
  .map(
    (r) =>
      `<url><loc>${absolute(postPath(r))}</loc><lastmod>${r.updated_at}</lastmod>${
        r.cover_path ? `<image:image><image:loc>${escapeXml(ogImage(r.cover_path))}</image:loc></image:image>` : ""
      }</url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=900, stale-while-revalidate=86400", "Netlify-Cache-Tag": "pages" } });
};
