// ════════════════════════════════════════════════════════════
// 🔗  EDGE FUNCTION — social-oauth
// ════════════════════════════════════════════════════════════
// Connexion des comptes Instagram / TikTok des clients (OAuth).
//
// ROUTES (GET) :
//   /social-oauth/start/instagram?code=<code client>   → redirige vers Meta
//   /social-oauth/start/tiktok?code=<code client>      → redirige vers TikTok
//   /social-oauth/callback/instagram?code&state        → échange + stockage
//   /social-oauth/callback/tiktok?code&state           → échange + stockage
//
// Le « code client » est le code d'accès TimelessHouse (clients.code) : il
// identifie quel client connecte son compte. L'état OAuth est signé (HMAC)
// pour empêcher toute falsification au retour.
// Tokens stockés CHIFFRÉS (AES-GCM) dans social_accounts — la lecture
// publique de cette table a été révoquée (vue v_social_accounts_public).
//
// SECRETS : META_APP_ID, META_APP_SECRET, TIKTOK_CLIENT_KEY,
//   TIKTOK_CLIENT_SECRET, SOCIAL_CRYPTO_KEY, PORTAL_URL (retour portail)
//
// REDIRECT URIs à déclarer dans les consoles développeur :
//   https://<ref>.supabase.co/functions/v1/social-oauth/callback/instagram
//   https://<ref>.supabase.co/functions/v1/social-oauth/callback/tiktok
//
// DÉPLOIEMENT : supabase functions deploy social-oauth --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, signState, verifyState } from "../_shared/social.ts";

const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_ID     = Deno.env.get("META_APP_ID") || "";
const META_SECRET = Deno.env.get("META_APP_SECRET") || "";
const TT_KEY      = Deno.env.get("TIKTOK_CLIENT_KEY") || "";
const TT_SECRET   = Deno.env.get("TIKTOK_CLIENT_SECRET") || "";
// Retour après OAuth : le DASHBOARD client (le code d'accès est encore en
// sessionStorage dans l'onglet) — pas la page de connexion.
const PORTAL = (Deno.env.get("SOCIAL_RETURN_URL")
  || (Deno.env.get("PORTAL_URL") || "").replace("communication.html", "communication-dashboard.html")
  || "https://timelesshouse.org/communication-dashboard.html").split("?")[0];

const sb = createClient(SB_URL, SB_SERVICE);
const FN_BASE = `${SB_URL}/functions/v1/social-oauth`;
const redirectUri = (platform: string) => `${FN_BASE}/callback/${platform}`;

const IG_SCOPES = "instagram_business_basic,instagram_business_manage_insights";
const TT_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list";

function back(params: Record<string, string>): Response {
  const u = new URL(PORTAL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}
const fail = (reason: string, platform: string) => back({ social: "error", platform, reason });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // [functions?, v1?, social-oauth, action, platform]
  const action = parts[parts.length - 2];
  const platform = parts[parts.length - 1];
  if (!["instagram", "tiktok"].includes(platform)) return new Response("plateforme inconnue", { status: 400 });

  // ── DÉMARRAGE ─────────────────────────────────────────────
  if (action === "start") {
    const clientCode = url.searchParams.get("code") || "";
    const { data: client } = await sb.from("clients")
      .select("id, name").eq("code", clientCode).eq("active", true).maybeSingle();
    if (!client) return new Response("Code client invalide", { status: 403 });

    const state = await signState({ c: client.id, p: platform });
    let auth: string;
    if (platform === "instagram") {
      if (!META_ID) return new Response("META_APP_ID non configuré — voir SOCIAL-SETUP.md", { status: 500 });
      auth = `https://www.instagram.com/oauth/authorize?client_id=${META_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri("instagram"))}` +
        `&response_type=code&scope=${encodeURIComponent(IG_SCOPES)}&state=${encodeURIComponent(state)}`;
    } else {
      if (!TT_KEY) return new Response("TIKTOK_CLIENT_KEY non configuré — voir SOCIAL-SETUP.md", { status: 500 });
      auth = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TT_KEY}` +
        `&redirect_uri=${encodeURIComponent(redirectUri("tiktok"))}` +
        `&response_type=code&scope=${encodeURIComponent(TT_SCOPES)}&state=${encodeURIComponent(state)}`;
    }
    return new Response(null, { status: 302, headers: { Location: auth } });
  }

  // ── CALLBACK ──────────────────────────────────────────────
  if (action !== "callback") return new Response("action inconnue", { status: 400 });
  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") || url.searchParams.get("error") || "refus", platform);
  }
  const st = await verifyState(url.searchParams.get("state") || "");
  if (!st || st.p !== platform) return fail("etat_invalide", platform);
  const clientId = st.c as string;
  const code = url.searchParams.get("code") || "";
  if (!code) return fail("code_manquant", platform);

  try {
    let accessToken = "", refreshToken: string | null = null, expiresAt: Date | null = null;
    let profile: Record<string, unknown> = {};
    let externalId = "", scopes: string[] = [];

    if (platform === "instagram") {
      // 1) code → token court
      const tokRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: META_ID, client_secret: META_SECRET,
          grant_type: "authorization_code", redirect_uri: redirectUri("instagram"), code,
        }),
      });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok.access_token) throw new Error(`échange IG: ${JSON.stringify(tok).slice(0, 180)}`);
      // 2) token court → longue durée (60 j, rafraîchissable)
      const llRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${META_SECRET}&access_token=${tok.access_token}`);
      const ll = await llRes.json();
      if (!llRes.ok || !ll.access_token) throw new Error(`token long IG: ${JSON.stringify(ll).slice(0, 180)}`);
      accessToken = ll.access_token;
      expiresAt = new Date(Date.now() + (ll.expires_in || 5184000) * 1000);
      scopes = IG_SCOPES.split(",");
      // 3) profil
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${accessToken}`);
      const me = await meRes.json();
      if (!meRes.ok) throw new Error(`profil IG: ${JSON.stringify(me).slice(0, 180)}`);
      externalId = String(me.user_id || me.id);
      profile = {
        account_name: me.username, profile_pic_url: me.profile_picture_url || null,
        follower_count: me.followers_count ?? null, following_count: me.follows_count ?? null,
        total_posts: me.media_count ?? null,
      };
    } else {
      const tokRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: TT_KEY, client_secret: TT_SECRET,
          grant_type: "authorization_code", redirect_uri: redirectUri("tiktok"), code,
        }),
      });
      const tok = await tokRes.json();
      if (!tokRes.ok || !tok.access_token) throw new Error(`échange TikTok: ${JSON.stringify(tok).slice(0, 180)}`);
      accessToken = tok.access_token;
      refreshToken = tok.refresh_token || null;
      expiresAt = new Date(Date.now() + (tok.expires_in || 86400) * 1000);
      externalId = tok.open_id;
      scopes = String(tok.scope || TT_SCOPES).split(",");
      const uRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,bio_description,follower_count,following_count,likes_count,video_count",
        { headers: { Authorization: `Bearer ${accessToken}` } });
      const u = (await uRes.json())?.data?.user || {};
      profile = {
        account_name: u.display_name || "TikTok", profile_pic_url: u.avatar_url || null,
        bio: u.bio_description || null,
        follower_count: u.follower_count ?? null, following_count: u.following_count ?? null,
        total_posts: u.video_count ?? null,
      };
    }

    // ── Upsert du compte (un par client × plateforme × id externe) ──
    const row = {
      client_id: clientId, platform, account_id_external: externalId,
      ...profile,
      access_token_encrypted: await encryptToken(accessToken),
      refresh_token_encrypted: refreshToken ? await encryptToken(refreshToken) : null,
      token_expires_at: expiresAt?.toISOString() || null,
      oauth_scope: scopes, active: true,
      sync_status: "connected", sync_error: null, updated_at: new Date().toISOString(),
    };
    const { data: existing } = await sb.from("social_accounts").select("id")
      .eq("client_id", clientId).eq("platform", platform).eq("account_id_external", externalId).maybeSingle();
    const res = existing
      ? await sb.from("social_accounts").update(row).eq("id", existing.id)
      : await sb.from("social_accounts").insert(row);
    if (res.error) throw new Error(`stockage: ${res.error.message}`);

    // Première sync immédiate (meilleure première impression), sans bloquer le retour
    fetch(`${SB_URL}/functions/v1/sync-social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-key": Deno.env.get("CRON_SECRET") || "" },
      body: JSON.stringify({ client_id: clientId }),
    }).catch(() => {});

    return back({ social: "connected", platform, account: String(profile.account_name || "") });
  } catch (err) {
    console.error(`[social-oauth] ${platform}:`, err);
    return fail(err instanceof Error ? err.message.slice(0, 120) : "erreur", platform);
  }
});
