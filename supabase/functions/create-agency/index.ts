// ════════════════════════════════════════════════════════════
// 🏢  EDGE FUNCTION — create-agency
// ════════════════════════════════════════════════════════════
// Crée une AGENCE (locataire du SaaS marque blanche) depuis la
// section « Agences » de l'admin :
//   1) ligne dans `agencies` (nom, slug, couleurs, plan…)
//   2) compte Supabase Auth pour le patron (ou réutilisation d'un
//      compte existant avec le même email)
//   3) rattachement owner dans `agency_members`
//
// SÉCURITÉ :
//   ▸ Réservée au PROPRIÉTAIRE DE LA PLATEFORME : le JWT de la
//     session est vérifié, puis le rôle owner sur l'agence racine
//     « timelesshouse » (pas ADMIN_EMAILS : c'est la première garde
//     par rôles de B.3).
//   ▸ Le mot de passe temporaire est généré ici, renvoyé UNE FOIS à
//     l'admin (jamais stocké en clair, jamais loggé).
//
// BODY JSON : { name, owner_email, slug?, contact_email?,
//               accent_color?, bg_color?, logo_url?, plan? }
// RÉPONSE   : { agency, owner: { email, user_id, temp_password|null,
//               existing_account } }
//
// DÉPLOIEMENT :
//   supabase functions deploy create-agency --no-verify-jwt \
//     --project-ref vpbxeqjvaeiytxcpilxf
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "La Loge <service@timelesshouse.org>";
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];
const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Slug sûr : minuscules, chiffres, tirets — utilisé dans les URLs et
// les préfixes B2 (`agencies/<slug>/…` en B.3).
const esc = (v: unknown) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ").trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PLANS = ["fondateur", "decouverte", "essentiel", "studio", "cinema", "prestige"];

// Mot de passe temporaire lisible mais fort (~77 bits) : 4 blocs de 4
// caractères sans ambiguïté (pas de 0/O, 1/l/I).
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12).join("")}`;
}

// Le demandeur doit être owner de l'agence plateforme « timelesshouse ».
async function requirePlatformOwner(req: Request): Promise<{ id: string } | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await sbAdmin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: rows } = await sbAdmin
    .from("agency_members")
    .select("role, agencies!inner(slug)")
    .eq("user_id", data.user.id)
    .eq("role", "owner")
    .eq("agencies.slug", "timelesshouse");
  return rows && rows.length ? { id: data.user.id } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });

  const caller = await requirePlatformOwner(req);
  if (!caller) return json(403, { error: "Réservé au propriétaire de la plateforme." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  // ── Changement d'offre d'une loge (upgrade/downgrade manuel) ──
  // Depuis la console fondateur : deals spéciaux, offres offertes, tests.
  // ⚠️ Si la loge a un abonnement Stripe ACTIF, le prochain webhook
  // customer.subscription.updated réalignera le plan sur Stripe — le
  // changement manuel est fait pour les loges SANS abonnement payant.
  if (body.action === "set-plan") {
    const agencyId = String(body.agency_id || "");
    const plan = String(body.plan || "");
    if (!agencyId) return json(400, { error: "agency_id manquant" });
    if (!PLANS.includes(plan)) return json(400, { error: "Plan inconnu." });
    const { data: ag, error } = await sbAdmin.from("agencies")
      .update({ plan }).eq("id", agencyId).select().single();
    if (error || !ag) return json(500, { error: error?.message || "Agence introuvable" });
    return json(200, { ok: true, agency: ag });
  }

  // ── Validation / suspension d'une loge en attente (SaaS B.3) ──
  if (body.action === "approve" || body.action === "suspend") {
    const agencyId = String(body.agency_id || "");
    if (!agencyId) return json(400, { error: "agency_id manquant" });
    const activate = body.action === "approve";
    const { data: ag, error } = await sbAdmin.from("agencies")
      .update({ active: activate, status: activate ? "active" : "suspended" })
      .eq("id", agencyId).select().single();
    if (error || !ag) return json(500, { error: error?.message || "Agence introuvable" });

    // À l'ouverture, le studio reçoit enfin son email de bienvenue
    if (activate && RESEND_API_KEY && ag.contact_email) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `La Loge <${FROM_ADDR}>`, to: ag.contact_email,
          subject: "Votre loge est ouverte 🎭",
          html: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
    <div style="background:#2a2620;padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">La Loge</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:400">Votre loge est ouverte, ${esc(ag.name)}&nbsp;!</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
        Votre demande est validée. Vos clients vous retrouveront ici&nbsp;:
      </p>
      <div style="text-align:center;margin:18px 0">
        <div style="display:inline-block;padding:12px 24px;background:#f5f0e8;border:1px solid #e0dbd0;border-radius:10px;font-family:monospace;font-size:15px">${esc(ag.slug)}.laloge.house</div>
      </div>
      <div style="text-align:center">
        <a href="https://${esc(ag.slug)}.laloge.house/communication-admin" style="display:inline-block;margin:20px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Ouvrir ma console</a>
      </div>
    </div>
  </div>
</body></html>`,
        }),
      }).catch(() => {});
    }
    return json(200, { ok: true, agency: ag });
  }

  // ─── Validation ───────────────────────────────────────────
  const name = String(body.name || "").trim().slice(0, 80);
  const ownerEmail = String(body.owner_email || "").trim().toLowerCase();
  const slug = String(body.slug || "").trim() || slugify(name);
  const contactEmail = String(body.contact_email || "").trim().toLowerCase() || ownerEmail;
  const accentColor = String(body.accent_color || "#2a2620").trim();
  const bgColor = String(body.bg_color || "#e9e4d9").trim();
  const logoUrl = String(body.logo_url || "").trim().slice(0, 500) || null;
  const plan = String(body.plan || "fondateur").trim();

  if (name.length < 2) return json(400, { error: "Nom d'agence trop court." });
  if (!EMAIL_RE.test(ownerEmail)) return json(400, { error: "Email du propriétaire invalide." });
  if (!SLUG_RE.test(slug)) return json(400, { error: "Slug invalide (minuscules, chiffres, tirets)." });
  if (!COLOR_RE.test(accentColor) || !COLOR_RE.test(bgColor)) return json(400, { error: "Couleur invalide (format #rrggbb)." });
  if (!PLANS.includes(plan)) return json(400, { error: "Plan inconnu." });
  if (logoUrl && !/^https:\/\//.test(logoUrl)) return json(400, { error: "Le logo doit être une URL https." });

  const { data: slugTaken } = await sbAdmin.from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (slugTaken) return json(409, { error: `Le slug « ${slug} » est déjà pris.` });

  // ─── Compte du patron : réutilisé s'il existe, sinon créé ─
  let ownerId: string | null = null;
  let temp: string | null = null;
  let existing = false;

  const { data: existingId } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: ownerEmail });
  if (existingId) {
    ownerId = existingId as string;
    existing = true;
  } else {
    temp = tempPassword();
    const { data: created, error: cErr } = await sbAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: temp,
      email_confirm: true,
    });
    if (cErr || !created?.user) return json(500, { error: `Création du compte impossible : ${cErr?.message || "?"}` });
    ownerId = created.user.id;
  }

  // ─── Agence + rattachement owner ──────────────────────────
  const { data: agency, error: aErr } = await sbAdmin.from("agencies").insert({
    name, slug, contact_email: contactEmail, logo_url: logoUrl,
    accent_color: accentColor, bg_color: bgColor, plan,
  }).select().single();
  if (aErr || !agency) {
    // rollback best-effort : ne pas laisser un compte orphelin qu'on vient de créer
    if (!existing && ownerId) await sbAdmin.auth.admin.deleteUser(ownerId).catch(() => {});
    return json(500, { error: `Création de l'agence impossible : ${aErr?.message || "?"}` });
  }

  const { error: mErr } = await sbAdmin.from("agency_members").insert({
    agency_id: agency.id, user_id: ownerId, role: "owner",
  });
  if (mErr) {
    await sbAdmin.from("agencies").delete().eq("id", agency.id).catch(() => {});
    if (!existing && ownerId) await sbAdmin.auth.admin.deleteUser(ownerId).catch(() => {});
    return json(500, { error: `Rattachement du propriétaire impossible : ${mErr.message}` });
  }

  return json(200, {
    agency,
    owner: { email: ownerEmail, user_id: ownerId, temp_password: temp, existing_account: existing },
  });
});
