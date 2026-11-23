// Uploads a cover made for a site-only article (no Instagram post) to the `media` bucket.
// POST { path, b64, contentType? } with header x-ingest-secret. Returns { url } (public URL),
// to be used as posts.source_media.cover so media-ingest copies it and computes the focus.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

let cachedSecret: string | null = null;
async function ingestSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const { data, error } = await db.rpc("get_private_config");
  if (error) throw error;
  cachedSecret = (data as { key: string; value: string }[]).find((r) => r.key === "ingest_secret")!.value;
  return cachedSecret;
}

// Ingest secret, or a short-lived token whose sha256 was put in private.upload_tokens (max 5 uses, 30 min).
async function authorized(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-ingest-secret");
  if (secret) return secret === (await ingestSecret());
  const token = req.headers.get("x-upload-token");
  if (!token || token.length < 32) return false;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await db.rpc("consume_upload_token", { p_hash: hash });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!(await authorized(req))) return new Response("unauthorized", { status: 401 });

  const { path, b64, contentType = "image/jpeg" } = await req.json();
  if (typeof path !== "string" || !/^[a-z0-9][a-z0-9/_.-]{0,150}\.(jpe?g|png|webp)$/.test(path) || path.includes("..")) {
    return new Response("bad path", { status: 400 });
  }
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) return new Response("bad type", { status: 400 });
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (bytes.length > 8_000_000) return new Response("too big", { status: 413 });

  const key = `site/${path}`;
  const { error } = await db.storage.from("media").upload(key, bytes, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) return new Response(`upload: ${error.message}`, { status: 500 });
  const { data } = db.storage.from("media").getPublicUrl(key);
  return new Response(JSON.stringify({ url: data.publicUrl }), { headers: { "Content-Type": "application/json" } });
});
