// Turns a raw Instagram post (row in public.ig_inbox) into a published article.
// Called by a database trigger (pg_net) with header x-ingest-secret.
// If the inbox row carries an `article` (written by the Claude newsroom task), its
// fields override the automatic caption conversion.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { type Article, captionToArticle, type IgPayload, slugify } from "./convert.ts";

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

async function uniqueSlug(base: string, mediaId: string): Promise<string> {
  const slug = base || `noticia-${mediaId.slice(-8)}`;
  const { data } = await db.from("posts").select("id").eq("slug", slug).maybeSingle();
  if (!data) return slug;
  return `${slug}-${mediaId.slice(-6)}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (req.headers.get("x-ingest-secret") !== (await ingestSecret())) return new Response("unauthorized", { status: 401 });

  const { media_id } = await req.json();
  const { data: row, error } = await db.from("ig_inbox").select("*").eq("media_id", media_id).single();
  if (error || !row) return new Response("inbox row not found", { status: 404 });

  try {
    const p = row.payload as IgPayload;
    const auto = captionToArticle(p.media_caption ?? "");
    const a: Article = { ...auto, ...((row.article ?? {}) as Partial<Article>) };

    const isVideo = /REEL|VIDEO/i.test(`${p.media_type} ${p.media_product_type}`);
    const coverSrc = isVideo ? (p.media_thumbnail_url ?? p.media_url) : (p.media_url ?? p.media_thumbnail_url);

    const { data: existing } = await db
      .from("posts")
      .select("id, slug, cover_path, status")
      .eq("ig_media_id", media_id)
      .maybeSingle();

    const fields = {
      title: a.title,
      subtitle: a.subtitle,
      excerpt: a.excerpt,
      body_html: a.body_html,
      city: a.city,
      category: a.category,
      tags: a.tags,
      seo_title: a.seo_title,
      seo_description: a.seo_description,
      cover_alt: a.cover_alt,
      is_breaking: a.is_breaking,
      ig_permalink: p.media_permalink ?? null,
      ig_media_type: isVideo ? "VIDEO" : (p.media_type ?? "IMAGE"),
    };

    let postId: string;
    if (existing) {
      const upd: Record<string, unknown> = { ...fields };
      if (!existing.cover_path && coverSrc) {
        upd.source_media = { cover: coverSrc };
        upd.media_status = "pending";
      }
      const { error: e } = await db.from("posts").update(upd).eq("id", existing.id);
      if (e) throw e;
      postId = existing.id;
    } else {
      const slug = await uniqueSlug(slugify(a.title), media_id);
      const { data: ins, error: e } = await db
        .from("posts")
        .insert({
          ...fields,
          slug,
          ig_media_id: media_id,
          published_at: p.timestamp,
          status: "published",
          source_media: coverSrc ? { cover: coverSrc } : {},
          media_status: coverSrc ? "pending" : "none",
        })
        .select("id")
        .single();
      if (e) throw e;
      postId = ins.id;
    }

    await db.from("ig_inbox").update({ processed_at: new Date().toISOString(), post_id: postId, error: null }).eq("media_id", media_id);
    return new Response(JSON.stringify({ ok: true, post_id: postId }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    await db.from("ig_inbox").update({ error: msg.slice(0, 500) }).eq("media_id", media_id);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
});
