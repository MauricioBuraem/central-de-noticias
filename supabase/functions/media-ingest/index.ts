// Downloads a post's source media (Instagram CDN URLs, which expire) into the public
// `media` bucket, records dimensions, finds where the headline balloon sits on the
// cover (so cards can crop around it), and marks the post ready.
// Called by a database trigger (pg_net) with header x-ingest-secret.
// Body: { post_id } to ingest, or { post_id, only_focus: true } to recompute the focus.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { imageSize } from "npm:image-size@1.2.1";
import { decode } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await db.rpc("get_private_config");
  if (error) throw error;
  cfg = Object.fromEntries((data as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return cfg;
}

const UA = "Mozilla/5.0 (compatible; CentralDeNoticiasBot/1.0; +https://centraldenoticias24h.com)";

function extFor(contentType: string, fallback: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("mp4") || contentType.includes("video")) return "mp4";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return fallback;
}

async function download(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status} for ${url.slice(0, 120)}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

async function store(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await db.storage.from("media").upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

function dims(bytes: Uint8Array): { width?: number; height?: number } {
  try {
    const d = imageSize(bytes);
    return { width: d.width, height: d.height };
  } catch {
    return {};
  }
}

/**
 * Finds the vertical center (0..1) of the headline balloon: the wide red or green
 * box with white text that the Central stamps on every cover.
 * Works on a 120px-wide copy rendered by Netlify Image CDN, so it stays cheap.
 */
async function balloonFocus(coverPath: string): Promise<{ focus: number | null; debug: string }> {
  const c = await config();
  const src = `${SUPABASE_URL}/storage/v1/object/public/media/${coverPath.split("/").map(encodeURIComponent).join("/")}`;
  const url = `${c.site_url.replace(/\/$/, "")}/.netlify/images?url=${encodeURIComponent(src)}&w=120&fm=png`;
  const res = await fetch(url);
  if (!res.ok) return { focus: null, debug: `thumb ${res.status}` };
  const img = await decode(new Uint8Array(await res.arrayBuffer()));
  const W = img.width;
  const H = img.height;

  // share of balloon-colored pixels per row (white letters and anti-aliasing excluded)
  const frac: number[] = [];
  for (let y = 1; y <= H; y++) {
    let colored = 0;
    for (let x = 1; x <= W; x++) {
      const [r, g, b] = Image_rgba(img.getPixelAt(x, y));
      const red = r > 130 && g < 90 && b < 90 && r - g > 75;
      const green = g > 50 && g - r > 30 && g - b > 15 && r < 100;
      if (red || green) colored++;
    }
    frac.push(colored / W);
  }
  // smooth over 7 rows so the lines of text inside the balloon don't split it
  const rowScore = frac.map((_, y) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, y - 3); k <= Math.min(H - 1, y + 3); k++) {
      sum += frac[k];
      n++;
    }
    return sum / n >= 0.3 ? 1 : 0;
  });

  // largest band of balloon rows, tolerating gaps of up to 3 rows (lines of text)
  let bestStart = -1, bestLen = 0, start = -1, gap = 0, lastOk = -1;
  for (let y = 0; y < H; y++) {
    if (rowScore[y]) {
      if (start === -1 || gap > 3) start = y;
      gap = 0;
      lastOk = y;
      const len = lastOk - start + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = start;
      }
    } else if (start !== -1) {
      gap++;
    }
  }
  const maxFrac = Math.max(...frac).toFixed(2);
  const mid = Image_rgba(img.getPixelAt(Math.ceil(W / 2), Math.ceil(H / 2))).join(",");
  if (bestLen < H * 0.04) return { focus: null, debug: `no balloon (band ${bestLen}/${H}, max ${maxFrac}, mid ${mid}, ${res.headers.get("content-type")})` };
  const center = (bestStart + bestLen / 2) / H;
  return { focus: Math.round(center * 1000) / 1000, debug: `band ${bestStart}-${bestStart + bestLen} of ${H}` };
}

// imagescript packs pixels as 0xRRGGBBAA numbers
function Image_rgba(v: number): [number, number, number, number] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const c = await config();
  if (req.headers.get("x-ingest-secret") !== c.ingest_secret) return new Response("unauthorized", { status: 401 });

  const { post_id, only_focus } = await req.json();
  const { data: post, error } = await db.from("posts").select("id, slug, published_at, source_media, cover_path").eq("id", post_id).single();
  if (error || !post) return new Response("post not found", { status: 404 });

  if (only_focus) {
    if (!post.cover_path) return new Response("no cover", { status: 200 });
    const f = await balloonFocus(post.cover_path);
    await db.from("posts").update({ cover_focus: f.focus }).eq("id", post.id);
    return new Response(JSON.stringify({ ok: true, ...f }), { headers: { "Content-Type": "application/json" } });
  }

  const src = (post.source_media ?? {}) as { cover?: string; video?: string; gallery?: string[] };
  const d = new Date(post.published_at);
  const base = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${post.slug}`;
  const update: Record<string, unknown> = { media_status: "ready", media_error: null };

  try {
    if (src.cover) {
      const { bytes, contentType } = await download(src.cover);
      const path = await store(`${base}/capa.${extFor(contentType, "jpg")}`, bytes, contentType);
      const { width, height } = dims(bytes);
      Object.assign(update, { cover_path: path, cover_width: width ?? null, cover_height: height ?? null });
    }
    if (src.video) {
      const { bytes, contentType } = await download(src.video);
      update.video_path = await store(`${base}/video.${extFor(contentType, "mp4")}`, bytes, contentType.includes("video") ? contentType : "video/mp4");
    }
    if (Array.isArray(src.gallery) && src.gallery.length) {
      const gallery: { path: string; width?: number; height?: number }[] = [];
      for (let i = 0; i < src.gallery.length && i < 10; i++) {
        try {
          const { bytes, contentType } = await download(src.gallery[i]);
          const path = await store(`${base}/foto-${i + 1}.${extFor(contentType, "jpg")}`, bytes, contentType);
          gallery.push({ path, ...dims(bytes) });
        } catch (e) {
          console.error("gallery item failed", i, String(e));
        }
      }
      update.gallery = gallery;
    }
  } catch (e) {
    console.error("ingest failed", post.slug, String(e));
    await db.from("posts").update({ media_status: "error", media_error: String(e).slice(0, 500) }).eq("id", post.id);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }

  if (update.cover_path) {
    try {
      update.cover_focus = (await balloonFocus(update.cover_path as string)).focus;
    } catch (e) {
      console.error("focus failed", String(e));
    }
  }

  const { error: upErr } = await db.from("posts").update(update).eq("id", post.id);
  if (upErr) return new Response(upErr.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true, ...update }), { headers: { "Content-Type": "application/json" } });
});
