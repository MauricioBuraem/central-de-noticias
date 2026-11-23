import type { APIRoute } from "astro";
import { purgeCache } from "@netlify/functions";
import { bySlug } from "../../lib/db";
import { absolute, postPath } from "../../lib/format";

// IndexNow (Bing, Yandex, Seznam...): the key is public by design and is served at /<key>.txt.
const INDEXNOW_KEY = "095b498347005b36015ba2a6635f8757";

async function pingIndexNow(slug: unknown) {
  if (typeof slug !== "string") return;
  const post = await bySlug(slug);
  if (!post) return; // not published
  await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(absolute("/")).host,
      key: INDEXNOW_KEY,
      keyLocation: absolute(`/${INDEXNOW_KEY}.txt`),
      urlList: [absolute(postPath(post))],
    }),
    signal: AbortSignal.timeout(5000),
  });
}

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
  // Best effort: a failed ping must not fail the cache purge.
  const body = await request.json().catch(() => ({}));
  await pingIndexNow(body?.slug).catch(() => {});
  return new Response(JSON.stringify({ ok: true, purged: "pages" }), { status: 202, headers: { "Content-Type": "application/json" } });
};
