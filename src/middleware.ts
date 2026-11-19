import { defineMiddleware } from "astro:middleware";

// Every HTML page is rendered on demand from the database and then cached on
// Netlify's CDN. New posts purge the cache (see /api/revalidate), so pages stay
// fast and the server is only hit when something changes.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next();
  const path = ctx.url.pathname;
  if (path.startsWith("/api/") || res.headers.has("Netlify-CDN-Cache-Control")) return res;
  if (res.status === 200 || res.status === 404) {
    const ttl = path.startsWith("/busca") ? 60 : 600;
    res.headers.set("Netlify-CDN-Cache-Control", `public, durable, s-maxage=${ttl}, stale-while-revalidate=86400`);
    res.headers.set("Netlify-Cache-Tag", "pages");
    res.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    if (path.startsWith("/busca")) res.headers.set("Netlify-Vary", "query=q|pagina");
    else res.headers.set("Netlify-Vary", "query=pagina");
  }
  return res;
});
