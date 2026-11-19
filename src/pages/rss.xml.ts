import type { APIRoute } from "astro";
import { supabase } from "../lib/db";
import { SITE } from "../lib/config";
import { absolute, escapeXml, ogImage, postPath } from "../lib/format";

export const GET: APIRoute = async () => {
  const { data } = await supabase
    .from("posts")
    .select("slug, title, excerpt, body_html, published_at, cover_path, category")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);
  const items = (data ?? [])
    .map((p) => {
      const url = absolute(postPath(p));
      return `<item><title>${escapeXml(p.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${escapeXml(p.excerpt ?? "")}</description>${
        p.cover_path ? `<enclosure url="${escapeXml(ogImage(p.cover_path))}" type="image/jpeg" length="0"/>` : ""
      }<content:encoded><![CDATA[${p.body_html.replace(/]]>/g, "]]&gt;")}]]></content:encoded></item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel><title>${escapeXml(SITE.name)}</title><link>${absolute("/")}</link><description>${escapeXml(SITE.description)}</description><language>pt-BR</language>
<atom:link href="${absolute("/rss.xml")}" rel="self" type="application/rss+xml"/>
${items}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=3600", "Netlify-Cache-Tag": "pages" } });
};
