import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true, commit: process.env.COMMIT_REF ?? "local", deploy: process.env.DEPLOY_ID ?? null }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
