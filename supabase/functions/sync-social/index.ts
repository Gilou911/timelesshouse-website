// ════════════════════════════════════════════════════════════
// 📡  EDGE FUNCTION — sync-social
// ════════════════════════════════════════════════════════════
// Synchronise les comptes Instagram / TikTok connectés :
//   ▸ rafraîchit les tokens (TikTok : 24 h ; Instagram : < 10 j restants)
//   ▸ profil (abonnés, posts…) → social_accounts + snapshot quotidien
//   ▸ posts récents + insights → upsert social_posts
//
// DÉCLENCHEURS :
//   ▸ cron pg_cron toutes les 6 h (header x-cron-key = CRON_SECRET)
//   ▸ admin (JWT Supabase, emails ADMIN_EMAILS) — body { client_id? }
//   ▸ social-oauth juste après une connexion (première sync)
//
// DÉPLOIEMENT : supabase functions deploy sync-social --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, decryptToken } from "../_shared/social.ts";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_SECRET = Deno.env.get("META_APP_SECRET") || "";
const TT_KEY     = Deno.env.get("TIKTOK_CLIENT_KEY") || "";
const TT_SECRET  = Deno.env.get("TIKTOK_CLIENT_SECRET") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const sb = createClient(SB_URL, SB_SERVICE);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function allowed(req: Request): Promise<boolean> {
  if (CRON_SECRET && req.headers.get("x-cron-key") === CRON_SECRET) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  const email = (data?.user?.email || "").toLowerCase();
  return !!data?.user && (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(email));
}

const rate = (num: number, base: number) => (base > 0 ? Math.round((num / base) * 10000) / 100 : null);

// ─── Instagram ──────────────────────────────────────────────
async function syncInstagram(acct: Record<string, any>): Promise<number> {
  let token = await decryptToken(acct.access_token_encrypted);

  // Refresh si < 10 jours restants (token longue durée : 60 j)
  if (acct.token_expires_at && new Date(acct.token_expires_at).getTime() - Date.now() < 10 * 86400e3) {
    const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`)).json();
    if (r.access_token) {
      token = r.access_token;
      await sb.from("social_accounts").update({
        access_token_encrypted: await encryptToken(token),
        token_expires_at: new Date(Date.now() + (r.expires_in || 5184000) * 1000).toISOString(),
      }).eq("id", acct.id);
    }
  }

  const me = await (await fetch(
    `https://graph.instagram.com/v21.0/me?fields=username,profile_picture_url,followers_count,follows_count,media_count&access_token=${token}`)).json();
  if (me.error) throw new Error(me.error.message || "profil IG");

  await sb.from("social_accounts").update({
    account_name: me.username, profile_pic_url: me.profile_picture_url || null,
    follower_count: me.followers_count ?? null, following_count: me.follows_count ?? null,
    total_posts: me.media_count ?? null,
  }).eq("id", acct.id);
  await sb.from("social_stat_snapshots").upsert({
    account_id: acct.id, client_id: acct.client_id, platform: "instagram",
    captured_on: new Date().toISOString().slice(0, 10),
    follower_count: me.followers_count ?? null, following_count: me.follows_count ?? null,
    total_posts: me.media_count ?? null,
  }, { onConflict: "account_id,captured_on" });

  const media = await (await fetch(
    `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${token}`)).json();
  if (media.error) throw new Error(media.error.message || "media IG");

  let saved = 0;
  for (const m of media.data || []) {
    // Insights par post — best effort (métriques selon le type ; "views" = métrique unifiée récente)
    let ins: Record<string, number> = {};
    for (const metrics of ["views,reach,saved,shares", "reach,saved", "reach"]) {
      const r = await (await fetch(`https://graph.instagram.com/v21.0/${m.id}/insights?metric=${metrics}&access_token=${token}`)).json();
      if (!r.error) { for (const d of r.data || []) ins[d.name] = d.values?.[0]?.value ?? null; break; }
    }
    const likes = m.like_count ?? 0, comments = m.comments_count ?? 0;
    const views = ins.views ?? null, reach = ins.reach ?? null;
    const base = views || reach || me.followers_count || 0;
    const type = m.media_product_type === "REELS" ? "reel"
      : m.media_type === "CAROUSEL_ALBUM" ? "carousel"
      : m.media_type === "VIDEO" ? "video" : "image";
    const { error } = await sb.from("social_posts").upsert({
      account_id: acct.id, client_id: acct.client_id, platform: "instagram",
      post_id_external: String(m.id), post_type: type,
      caption: m.caption || null, media_url: m.media_url || null,
      thumbnail_url: m.thumbnail_url || m.media_url || null, permalink: m.permalink || null,
      published_at: m.timestamp, views, reach,
      likes, comments, saves: ins.saved ?? null, shares: ins.shares ?? null,
      engagement_rate: rate(likes + comments + (ins.saved || 0) + (ins.shares || 0), base),
      save_rate: ins.saved != null ? rate(ins.saved, base) : null,
      last_fetched_at: new Date().toISOString(), raw_payload: { media: m, insights: ins },
    }, { onConflict: "client_id,platform,post_id_external" });
    if (!error) saved++;
  }
  return saved;
}

// ─── TikTok ─────────────────────────────────────────────────
async function syncTiktok(acct: Record<string, any>): Promise<number> {
  // Le token d'accès TikTok dure 24 h → refresh à chaque sync
  let token = "";
  const refresh = acct.refresh_token_encrypted ? await decryptToken(acct.refresh_token_encrypted) : null;
  if (!refresh) throw new Error("refresh token absent — reconnecter le compte");
  const t = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: TT_KEY, client_secret: TT_SECRET, grant_type: "refresh_token", refresh_token: refresh }),
  })).json();
  if (!t.access_token) throw new Error(`refresh TikTok: ${JSON.stringify(t).slice(0, 150)}`);
  token = t.access_token;
  await sb.from("social_accounts").update({
    access_token_encrypted: await encryptToken(token),
    refresh_token_encrypted: t.refresh_token ? await encryptToken(t.refresh_token) : acct.refresh_token_encrypted,
    token_expires_at: new Date(Date.now() + (t.expires_in || 86400) * 1000).toISOString(),
  }).eq("id", acct.id);

  const u = (await (await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,bio_description,follower_count,following_count,likes_count,video_count",
    { headers: { Authorization: `Bearer ${token}` } })).json())?.data?.user;
  if (!u) throw new Error("profil TikTok illisible");

  await sb.from("social_accounts").update({
    account_name: u.display_name, profile_pic_url: u.avatar_url || null, bio: u.bio_description || null,
    follower_count: u.follower_count ?? null, following_count: u.following_count ?? null,
    total_posts: u.video_count ?? null,
  }).eq("id", acct.id);
  await sb.from("social_stat_snapshots").upsert({
    account_id: acct.id, client_id: acct.client_id, platform: "tiktok",
    captured_on: new Date().toISOString().slice(0, 10),
    follower_count: u.follower_count ?? null, following_count: u.following_count ?? null,
    total_posts: u.video_count ?? null, likes_total: u.likes_count ?? null,
  }, { onConflict: "account_id,captured_on" });

  const v = await (await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20 }) })).json();
  let saved = 0;
  for (const vid of v?.data?.videos || []) {
    const views = vid.view_count ?? 0;
    const eng = (vid.like_count || 0) + (vid.comment_count || 0) + (vid.share_count || 0);
    const { error } = await sb.from("social_posts").upsert({
      account_id: acct.id, client_id: acct.client_id, platform: "tiktok",
      post_id_external: String(vid.id), post_type: "tiktok_video",
      caption: vid.title || null, thumbnail_url: vid.cover_image_url || null, permalink: vid.share_url || null,
      duration_seconds: vid.duration ?? null,
      published_at: vid.create_time ? new Date(vid.create_time * 1000).toISOString() : null,
      views, plays: views, likes: vid.like_count ?? null, comments: vid.comment_count ?? null,
      shares: vid.share_count ?? null,
      engagement_rate: rate(eng, views || u.follower_count || 0),
      share_rate: views ? rate(vid.share_count || 0, views) : null,
      last_fetched_at: new Date().toISOString(), raw_payload: vid,
    }, { onConflict: "client_id,platform,post_id_external" });
    if (!error) saved++;
  }
  return saved;
}

// ─── Handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });
  if (!(await allowed(req))) return json(401, { error: "Non autorisé" });

  const body = await req.json().catch(() => ({}));
  let q = sb.from("social_accounts").select("*").eq("active", true).not("access_token_encrypted", "is", null);
  if (body.client_id) q = q.eq("client_id", body.client_id);
  const { data: accounts, error } = await q;
  if (error) return json(500, { error: error.message });

  const results: Record<string, unknown>[] = [];
  for (const acct of accounts || []) {
    try {
      const posts = acct.platform === "instagram" ? await syncInstagram(acct)
        : acct.platform === "tiktok" ? await syncTiktok(acct)
        : 0;
      await sb.from("social_accounts").update({
        last_sync_at: new Date().toISOString(), sync_status: "ok", sync_error: null,
      }).eq("id", acct.id);
      results.push({ account: acct.account_name, platform: acct.platform, ok: true, posts });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 300) : "erreur";
      await sb.from("social_accounts").update({
        last_sync_at: new Date().toISOString(), sync_status: "error", sync_error: msg,
      }).eq("id", acct.id);
      results.push({ account: acct.account_name, platform: acct.platform, ok: false, error: msg });
      console.error(`[sync-social] ${acct.platform}/${acct.account_name}:`, msg);
    }
  }
  return json(200, { synced: results.length, results });
});
