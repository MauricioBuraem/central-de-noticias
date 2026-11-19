import type { APIRoute } from "astro";
import { purgeCache } from "@netlify/cache";

// Called by the database (pg_net) whenever a post is created or changed.
// Purges the CDN copy of every page so readers see the new story immediately.
export const POST: APIRoute = async ({ request }) => {
  const expected = process.env.REVALIDATE_SECRET ?? import.meta.env.REVALIDATE_SECRET;
  if (!expected || request.headers.get("x-revalidate-secret") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    await purgeCache({ tags: ["pages"] });
  } catch (e) {
    return new Response(`purge failed: ${e}`, { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true, purged: "pages" }), { status: 202, headers: { "Content-Type": "application/json" } });
};
