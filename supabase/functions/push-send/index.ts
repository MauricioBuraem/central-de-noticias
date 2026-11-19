// Sends a browser push alert for a newly published post to every subscriber.
// Called by a database trigger (pg_net) with header x-ingest-secret.
// Rules: only posts published in the last 3 hours, once per post, and at most one
// regular alert every 20 minutes (breaking news always goes out).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await db.rpc("get_private_config");
  if (error) throw error;
  cfg = Object.fromEntries((data as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

function postPath(slug: string, iso: string) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso))
    .split("-");
  return `/${y}/${m}/${d}/${slug}/`;
}

Deno.serve(async (req) => {
  const c = await config();
  if (req.headers.get("x-ingest-secret") !== c.ingest_secret) return new Response("unauthorized", { status: 401 });
  const { post_id } = await req.json();

  const { data: post } = await db
    .from("posts")
    .select("id, slug, title, excerpt, cover_path, published_at, is_breaking, notified_at, status")
    .eq("id", post_id)
    .single();
  if (!post || post.status !== "published" || post.notified_at) return new Response("skip", { status: 200 });
  if (Date.now() - new Date(post.published_at).getTime() > 3 * 3600_000) return new Response("too old", { status: 200 });

  if (!post.is_breaking) {
    const since = new Date(Date.now() - 20 * 60_000).toISOString();
    const { count } = await db.from("posts").select("id", { count: "exact", head: true }).gte("notified_at", since);
    if ((count ?? 0) > 0) return new Response("rate limited", { status: 200 });
  }

  // Claim the post atomically so two triggers never send twice
  const { data: claimed } = await db.from("posts").update({ notified_at: new Date().toISOString() }).eq("id", post.id).is("notified_at", null).select("id");
  if (!claimed?.length) return new Response("already sent", { status: 200 });

  const site = c.site_url.replace(/\/$/, "");
  const image = post.cover_path
    ? `${site}/.netlify/images?url=${encodeURIComponent(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/media/${post.cover_path}`)}&w=720&h=405&fit=cover&fm=jpg&q=70`
    : undefined;
  const title = post.title.replace(/^(urgente|exclusivo)\s*[:!-]\s*/i, "");
  const payload = JSON.stringify({
    title: post.is_breaking ? `URGENTE: ${title}` : title,
    body: (post.excerpt ?? "").slice(0, 140),
    url: postPath(post.slug, post.published_at),
    image,
    tag: post.slug,
  });

  let sent = 0;
  let removed = 0;
  let from = 0;
  for (;;) {
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").range(from, from + 499);
    if (!subs?.length) break;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: post.is_breaking ? "high" : "normal" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await db.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          } else {
            await db.from("push_subscriptions").update({ last_error: String(e).slice(0, 200) }).eq("id", s.id);
          }
        }
      }),
    );
    if (subs.length < 500) break;
    from += 500;
  }
  return new Response(JSON.stringify({ ok: true, sent, removed }), { headers: { "Content-Type": "application/json" } });
});
