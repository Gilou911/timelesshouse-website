// ════════════════════════════════════════════════════════════
// 📓  EDGE FUNCTION — perso-invite (Espace perso)
// ════════════════════════════════════════════════════════════
// Les deux gestes d'accès de perso.timelesshouse.org :
//
// POST { action: "lien", email, redirect_to? }
//   L'écran de connexion — ANONYME. Si l'adresse appartient au
//   propriétaire ou à un invité, un lien magique part par email.
//   → toujours 200 { ok: true } : jamais d'énumération (on ne dit
//     pas qui a accès).
//
// POST { action: "inviter", email, racine_id, role, redirect_to? }
//   La modale Partage — RÉSERVÉ AU PROPRIÉTAIRE (le JWT de
//   l'appelant est rejoué contre perso_est_proprietaire(), même
//   garde qu'admin-mfa-reset). Résout l'email vers un compte (le
//   crée sans mot de passe au besoin), pose la ligne perso_membres
//   — c'est la SEULE porte d'écriture de cette table — puis envoie
//   l'email d'invitation avec un lien magique.
//
// GARDE-FOUS :
//   ▸ « lien » : 5 envois maximum par heure et par email
//     (perso_lien_log, budget séparé d'auth_recovery_log)
//   ▸ redirect_to validé contre une liste FERMÉE d'origines perso
//   ▸ la clé service ne sert qu'après les contrôles
//
// SECRETS : RESEND_API_KEY, FROM_EMAIL (optionnel),
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto)
//
// DÉPLOIEMENT :
//   supabase functions deploy perso-invite --project-ref vpbxeqjvaeiytxcpilxf --no-verify-jwt
//   (le contrôle d'identité est DANS le code, comme admin-mfa-reset)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aalSatisfait } from "../_shared/aal.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "TimelessHouse <service@timelesshouse.org>";
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];

const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (v: unknown) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Liste FERMÉE : l'espace perso ne vit qu'à ces adresses. Un
// redirect_to inconnu retombe sur la production — jamais d'hôte
// arbitraire dans un lien signé.
const PERSO_ORIGINS = [
  "https://perso.timelesshouse.org",
  "https://timelesshouse-perso.pages.dev",
  "http://localhost:4175",
];
function safeRedirect(raw: unknown): string {
  const fallback = "https://perso.timelesshouse.org/";
  if (typeof raw !== "string") return fallback;
  try {
    const u = new URL(raw);
    return PERSO_ORIGINS.includes(u.origin) ? `${u.origin}/` : fallback;
  } catch {
    return fallback;
  }
}

// ── Anti-bombardement : 5 liens / heure / email ──
// (motif account-recovery, table dédiée pour ne pas consommer le
// budget des récupérations de mot de passe)
async function rateLimited(email: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sbAdmin.from("perso_lien_log")
    .select("id", { count: "exact", head: true })
    .eq("email", email).gte("created_at", since);
  if ((count || 0) >= 5) return true;
  await sbAdmin.from("perso_lien_log").insert({ email });
  return false;
}

function emailHtml(link: string, invitation: boolean) {
  const titre = invitation
    ? "Un espace vous a été ouvert"
    : "Votre lien de connexion";
  const corps = invitation
    ? "Gil vous a invité·e à consulter des pages de son espace personnel. Le bouton ci-dessous vous connecte directement — sans mot de passe."
    : "Voici le lien d'accès à l'espace perso que vous avez demandé.";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
    <div style="background:#2a2620;padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">Espace perso</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:400;line-height:1.4">${esc(titre)}</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
        ${esc(corps)} Ce lien est valable <strong>1&nbsp;heure</strong> et ne fonctionne
        qu'une fois — vous pourrez en redemander un depuis la page de connexion.
      </p>
      <div style="text-align:center">
        <a href="${esc(link)}" style="display:inline-block;margin:24px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Ouvrir l'espace</a>
      </div>
      <p style="font-size:13px;color:#8a8480;line-height:1.6;margin-top:24px">
        Vous n'êtes pas à l'origine de cette demande&nbsp;? Ignorez simplement cet email :
        personne d'autre que vous ne peut utiliser ce lien depuis votre boîte.
      </p>
    </div>
  </div>
</body></html>`;
}

async function envoyerLien(email: string, redirectTo: string, invitation: boolean) {
  const { data: link, error } = await sbAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error || !link?.properties?.hashed_token) {
    console.error("[perso-invite] generateLink:", error);
    return;
  }
  // L'email ne porte PAS le lien /verify de Supabase : les scanners de
  // boîtes mail (Outlook SafeLinks, antivirus…) pré-visitent les liens,
  // et ce lien-là est à usage unique — le jeton était grillé avant le
  // clic humain (constaté le 29/07/2026, boucle de connexion chez Gil).
  // On envoie ?lm=<token_hash> vers l'app, qui l'échange elle-même via
  // verifyOtp : un GET de robot n'exécute pas ce JavaScript.
  const lien = `${redirectTo}?lm=${encodeURIComponent(link.properties.hashed_token)}`;
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Espace perso <${FROM_ADDR}>`,
        to: email,
        subject: invitation
          ? "Vous êtes invité·e — Espace perso"
          : "Votre lien de connexion — Espace perso",
        html: emailHtml(lien, invitation),
      }),
    });
    if (!res.ok) console.error("[perso-invite] resend:", await res.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  // ── « lien » : l'écran de connexion (anonyme, silence absolu) ──
  if (body.action === "lien") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Email invalide" });
    const redirectTo = safeRedirect(body.redirect_to);

    try {
      if (await rateLimited(email)) return json(200, { ok: true });

      const { data: userId } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: email });
      if (!userId) return json(200, { ok: true }); // compte inconnu : silence

      // A-t-il seulement accès à quelque chose ? (membre ou propriétaire)
      const [{ count: membre }, { count: proprio }] = await Promise.all([
        sbAdmin.from("perso_membres").select("racine_id", { count: "exact", head: true })
          .eq("user_id", userId),
        sbAdmin.from("perso_proprietaires").select("user_id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      if ((membre || 0) + (proprio || 0) > 0) {
        await envoyerLien(email, redirectTo, false);
      }
      return json(200, { ok: true });
    } catch (err) {
      console.error("[perso-invite] lien:", err);
      return json(200, { ok: true });
    }
  }

  // ── « inviter » : la modale Partage (propriétaire seulement) ──
  if (body.action === "inviter") {
    // ① L'appelant est-il LE propriétaire ? Son JWT est rejoué contre
    //    la base — même garde qu'admin-mfa-reset.
    const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jeton) return json(401, { error: "Session requise." });
    const sbAppelant = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jeton}` } },
    });
    // Le verrou 2FA vaut ici aussi (audit du 07/08) : cette fonction crée
    // des comptes et accorde le rang éditeur.
    if (!(await aalSatisfait(jeton))) {
      return json(403, {
        error: "Double vérification requise : reconnectez-vous avec votre code à 6 chiffres.",
        code: "aal2_requis",
      });
    }
    const { data: estProprio, error: eProprio } = await sbAppelant.rpc("perso_est_proprietaire");
    if (eProprio || estProprio !== true) {
      return json(403, { error: "Réservé au propriétaire." });
    }

    // ② Les entrées.
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Email invalide" });
    const role = String(body.role || "");
    if (!["lecteur", "editeur"].includes(role)) return json(400, { error: "Rôle inconnu" });
    const racineId = String(body.racine_id || "");
    if (!UUID_RE.test(racineId)) return json(400, { error: "Page racine invalide" });
    const { data: racine } = await sbAdmin.from("perso_pages")
      .select("id").eq("id", racineId).is("parent_id", null).maybeSingle();
    if (!racine) return json(400, { error: "Page racine introuvable" });

    try {
      // ③ Le compte de l'invité — existant, sinon créé SANS mot de
      //    passe (motif signup-agency : email_confirm, l'identité est
      //    prouvée par la possession de la boîte mail).
      let userId: string | null = null;
      const { data: existant } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: email });
      if (existant) {
        userId = existant as string;
      } else {
        const { data: cree, error: eCree } = await sbAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (eCree || !cree?.user?.id) {
          console.error("[perso-invite] createUser:", eCree);
          return json(502, { error: "Création du compte impossible." });
        }
        userId = cree.user.id;
      }

      // ④ La ligne membre — la seule écriture de cette table.
      const { error: eMembre } = await sbAdmin.from("perso_membres").upsert(
        { racine_id: racineId, user_id: userId, email, role },
        { onConflict: "racine_id,user_id" },
      );
      if (eMembre) {
        console.error("[perso-invite] membre:", eMembre);
        return json(502, { error: "Invitation impossible." });
      }

      // ⑤ L'email d'invitation (lien magique).
      await envoyerLien(email, safeRedirect(body.redirect_to), true);
      return json(200, { ok: true, user_id: userId });
    } catch (err) {
      console.error("[perso-invite] inviter:", err);
      return json(502, { error: "Invitation impossible." });
    }
  }

  return json(400, { error: "Action inconnue." });
});
