import type { APIRoute } from "astro";
import { absolute } from "../lib/format";

export const GET: APIRoute = ({ url }) => {
  // Keep the temporary netlify.app address out of Google; only the real domain is indexed.
  const preview = url.hostname.endsWith(".netlify.app");
  const body = preview
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /busca\n\nSitemap: ${absolute("/sitemap.xml")}\nSitemap: ${absolute("/news-sitemap.xml")}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
