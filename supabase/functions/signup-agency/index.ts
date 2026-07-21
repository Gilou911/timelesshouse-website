// ════════════════════════════════════════════════════════════
// 🚪  EDGE FUNCTION — signup-agency (SaaS B.3, brique 9)
// ════════════════════════════════════════════════════════════
// Inscription SELF-SERVE d'une agence sur La Loge (offre gratuite
// Découverte). Endpoint PUBLIC : c'est la porte d'entrée du produit.
//
// POST { studio_name, email, password, slug? }
//   → crée le compte Supabase Auth, l'agence (plan « decouverte »,
//     fonctionnalités plateforme désactivées) et l'appartenance owner,
//     puis envoie un email de bienvenue.
//   → { ok: true, slug, space_url }
//
// GARDE-FOUS :
//   ▸ 3 inscriptions par heure et par IP (signup_log)
//   ▸ slug validé + liste de mots réservés (app, www, admin, api…)
//   ▸ plan FORCÉ à « decouverte » : jamais choisi par le client
//   ▸ email déjà connu → message clair, aucun écrasement de compte
//   ▸ rollback best-effort si une étape échoue
//
// SECRETS : RESEND_API_KEY, FROM_EMAIL (optionnel),
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "La Loge <service@timelesshouse.org>";
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];
// Destinataire des notifications de la plateforme (Gil)
const PLATFORM_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "service@timelesshouse.org";
// Au-delà de ce nombre d'agences locataires, les inscriptions passent
// en file d'attente : le compte est créé mais l'agence reste inactive
// jusqu'à validation manuelle depuis la section « Agences ».
const SIGNUP_AUTO_LIMIT = 10;

const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Échappement HTML : le nom du studio est libre et se retrouve dans l'email
// de bienvenue ET dans la notification à la plateforme — jamais de balisage
// injecté (slug/email sont déjà validés par regex, mais on échappe par sûreté).
const esc = (v: unknown) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
// Réservés : hôtes techniques, marques maison, mots trompeurs
const RESERVED = new Set([
  "www", "app", "admin", "api", "mail", "smtp", "ftp", "cdn", "static", "assets",
  "laloge", "la-loge", "timelesshouse", "timeless", "support", "aide", "help",
  "compte", "account", "billing", "facturation", "stripe", "test", "demo",
  "espace", "client", "clients", "agence", "agences", "media", "medias",
]);

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ").trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Envoi best effort : une inscription ne doit jamais échouer parce
// qu'un email n'est pas parti.
function sendMail(to: string, subject: string, html: string, replyTo?: string) {
  if (!RESEND_API_KEY) return;
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `La Loge <${FROM_ADDR}>`, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  }).catch(() => {});
}

function shell(title: string, body: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
    <div style="background:#2a2620;padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">La Loge</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:400;line-height:1.4">${title}</h2>
      ${body}
    </div>
    <div style="padding:24px 40px;border-top:1px solid #f0ece4;text-align:center;font-size:11px;font-family:sans-serif;color:#a09890">
      La Loge &nbsp;·&nbsp; <a href="https://laloge.app" style="color:#a09890;text-decoration:none">laloge.app</a>
    </div>
  </div>
</body></html>`;
}

// Notification à la plateforme (Gil) à CHAQUE inscription
function notifyPlatform(name: string, slug: string, email: string, total: number, pending: boolean) {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
      <strong>${esc(name)}</strong> vient de ${pending ? "demander" : "créer"} une loge.
    </p>
    <div style="margin:18px 0;padding:18px 22px;background:#f9f7f3;border-left:3px solid #e8d8be;border-radius:0 10px 10px 0;font-family:sans-serif;font-size:13.5px;line-height:1.9;color:#4a4540">
      <strong>Studio&nbsp;:</strong> ${esc(name)}<br/>
      <strong>Adresse&nbsp;:</strong> ${esc(slug)}.laloge.house<br/>
      <strong>Contact&nbsp;:</strong> ${esc(email)}<br/>
      <strong>Agences locataires&nbsp;:</strong> ${total}
    </div>
    ${pending
      ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
           Au-delà de ${SIGNUP_AUTO_LIMIT} agences, les inscriptions attendent votre validation :
           cette loge est <strong>en attente</strong> et ne peut rien publier pour l'instant.
         </p>
         <div style="text-align:center">
           <a href="https://laloge.app/communication-admin.html" style="display:inline-block;margin:20px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Valider dans la console</a>
         </div>`
      : `<div style="text-align:center">
           <a href="https://laloge.app/communication-admin.html" style="display:inline-block;margin:20px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Voir mes agences</a>
         </div>`}`;
  sendMail(PLATFORM_EMAIL, `${pending ? "⏳ Demande" : "🎭 Nouvelle loge"} — ${name}`, shell(pending ? "Une loge attend votre validation" : "Nouvelle inscription", body), email);
}

// Accusé de réception quand l'inscription part en file d'attente
function pendingHtml(name: string) {
  return shell("Votre demande est enregistrée", `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
      Merci ${esc(name)} ! Votre compte est créé. Chaque nouvelle loge étant désormais
      validée à la main, nous vérifions votre demande et vous ouvrons l'accès
      très vite — en général sous 24&nbsp;heures.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
      Vous pouvez déjà vous connecter : votre console vous confirmera l'état de
      votre demande.
    </p>
    <div style="text-align:center">
      <a href="https://laloge.app/communication-admin.html" style="display:inline-block;margin:20px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Voir ma console</a>
    </div>`);
}

function welcomeHtml(name: string, slug: string) {
  const space = `https://${slug}.laloge.house`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
    <div style="background:#2a2620;padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">La Loge</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:400;line-height:1.4">Bienvenue, ${esc(name)}&nbsp;!</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
        Votre loge est ouverte. Voici l'adresse que verront vos clients&nbsp;:
      </p>
      <div style="text-align:center;margin:18px 0">
        <div style="display:inline-block;padding:12px 24px;background:#f5f0e8;border:1px solid #e0dbd0;border-radius:10px;font-family:monospace;font-size:15px">${slug}.laloge.house</div>
      </div>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
        Pour démarrer&nbsp;: connectez-vous à votre console, ajoutez votre logo et vos
        couleurs, puis créez votre premier espace client. Il recevra un code d'accès
        personnel — et découvrira ses films à VOTRE marque.
      </p>
      <div style="text-align:center">
        <a href="https://laloge.app/communication-admin.html" style="display:inline-block;margin:24px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Ouvrir ma console</a>
      </div>
      <p style="font-size:13px;color:#8a8480;line-height:1.6;margin-top:24px">
        Vous êtes sur l'offre Découverte (3 Go, offerte). Vous pourrez passer à un palier
        supérieur à tout moment depuis votre console, sans engagement.
      </p>
    </div>
    <div style="padding:24px 40px;border-top:1px solid #f0ece4;text-align:center;font-size:11px;font-family:sans-serif;color:#a09890">
      La Loge &nbsp;·&nbsp; <a href="https://laloge.app" style="color:#a09890;text-decoration:none">laloge.app</a>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const name = String(body.studio_name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const slug = String(body.slug || "").trim().toLowerCase() || slugify(name);

  // ── Validations ──
  if (name.length < 2) return json(400, { error: "Indiquez le nom de votre studio." });
  if (!EMAIL_RE.test(email)) return json(400, { error: "Email invalide." });
  if (password.length < 8) return json(400, { error: "Le mot de passe doit faire au moins 8 caractères." });
  if (!SLUG_RE.test(slug)) return json(400, { error: "Adresse invalide (minuscules, chiffres et tirets)." });
  if (RESERVED.has(slug)) return json(409, { error: `L'adresse « ${slug} » est réservée. Choisissez-en une autre.` });

  // ── Anti-abus : 3 inscriptions / heure / IP ──
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "inconnue";
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sbAdmin.from("signup_log")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("created_at", since);
  if ((count || 0) >= 3) {
    return json(429, { error: "Trop de créations depuis cette connexion. Réessayez dans une heure." });
  }

  // ── Disponibilité ──
  const { data: slugTaken } = await sbAdmin.from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (slugTaken) return json(409, { error: `L'adresse « ${slug}.laloge.house » est déjà prise.` });
  const { data: existingUser } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: email });
  if (existingUser) {
    return json(409, { error: "Un compte existe déjà avec cet email. Connectez-vous ou utilisez « Mot de passe oublié ? »." });
  }

  await sbAdmin.from("signup_log").insert({ email, ip });

  // ── Création : compte → agence → appartenance ──
  let userId: string | null = null;
  try {
    const { data: created, error: uErr } = await sbAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { studio_name: name, source: "laloge-signup" },
    });
    if (uErr || !created?.user) {
      return json(500, { error: "Création du compte impossible. Réessayez dans un instant." });
    }
    userId = created.user.id;

    // File d'attente : au-delà de SIGNUP_AUTO_LIMIT agences locataires,
    // l'agence est créée INACTIVE (my_agency_ids la filtre → aucune
    // écriture possible) jusqu'à validation depuis la section Agences.
    const { count: tenantCount } = await sbAdmin.from("agencies")
      .select("id", { count: "exact", head: true }).neq("slug", "timelesshouse");
    const pending = (tenantCount || 0) >= SIGNUP_AUTO_LIMIT;

    const { data: agency, error: aErr } = await sbAdmin.from("agencies").insert({
      name, slug, contact_email: email, plan: "decouverte",
      features_analytics: false, features_portfolio: false,
      active: !pending, status: pending ? "pending" : "active",
    }).select().single();
    if (aErr || !agency) {
      await sbAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: "Création de l'agence impossible. Réessayez dans un instant." });
    }

    const { error: mErr } = await sbAdmin.from("agency_members").insert({
      agency_id: agency.id, user_id: userId, role: "owner",
    });
    if (mErr) {
      await sbAdmin.from("agencies").delete().eq("id", agency.id).catch(() => {});
      await sbAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: "Rattachement impossible. Réessayez dans un instant." });
    }

    // Emails (best effort) : accusé au studio + notification plateforme
    if (pending) {
      sendMail(email, "Votre demande est bien reçue — La Loge", pendingHtml(name));
    } else {
      sendMail(email, "Votre loge est ouverte 🎭", welcomeHtml(name, slug));
    }
    notifyPlatform(name, slug, email, (tenantCount || 0) + 1, pending);

    return json(200, {
      ok: true, slug, pending,
      space_url: `https://${slug}.laloge.house`,
      message: pending
        ? "Votre compte est créé. Votre loge sera ouverte dès validation (sous 24 h en général)."
        : undefined,
    });
  } catch (err) {
    console.error("[signup-agency]", err);
    if (userId) await sbAdmin.auth.admin.deleteUser(userId).catch(() => {});
    return json(500, { error: "Inscription impossible. Réessayez dans un instant." });
  }
});
