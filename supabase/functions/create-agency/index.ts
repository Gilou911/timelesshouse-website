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
const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Slug sûr : minuscules, chiffres, tirets — utilisé dans les URLs et
// les préfixes B2 (`agencies/<slug>/…` en B.3).
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
