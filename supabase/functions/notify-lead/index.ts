// ════════════════════════════════════════════════════════════
// 📨 notify-lead — mise en relation depuis un espace portfolio
// ════════════════════════════════════════════════════════════
// Appelée par portfolio-public.jsx (clé anon) quand un visiteur
// remplit le formulaire de contact d'un espace prospect/ambassadeur.
//
// Pipeline :
//   1. Valide le token → l'espace doit être publié + partage activé.
//   2. Insère le lead (clé service-role → contourne la RLS).
//   3. Envoie une alerte email à service@timelesshouse.org (Resend),
//      avec reply_to = l'email du prospect (réponse directe en 1 clic).
//
// Déploiement : supabase functions deploy notify-lead
//   Secrets attendus (déjà présents pour notify-client) :
//     RESEND_API_KEY            (supabase secrets set RESEND_API_KEY=...)
//     SUPABASE_URL              (auto-injecté)
//     SUPABASE_SERVICE_ROLE_KEY (auto-injecté)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Adresse d'envoi vérifiée (identique à notify-client) + destinataire des alertes.
const FROM        = "TimelessHouse <service@noreply.timelesshouse.org>";
const ALERT_TO    = "service@timelesshouse.org";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "Méthode non autorisée" }, 405);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }

  const token   = (body.token   || "").trim();
  const name    = (body.name    || "").trim();
  const email   = (body.email   || "").trim();
  const phone   = (body.phone   || "").trim();
  const message = (body.message || "").trim();

  if (!token)            return json({ error: "Token manquant" }, 400);
  if (!name)             return json({ error: "Nom requis" }, 400);
  if (!email && !phone)  return json({ error: "Un email ou un téléphone est requis" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 1) Valider l'espace via le token (publié + partage activé)
  const { data: space, error: spaceErr } = await sb
    .from("portfolio_spaces")
    .select("id, kind, recipient_name, status, share_enabled")
    .eq("share_token", token)
    .maybeSingle();

  if (spaceErr) return json({ error: "Erreur base : " + spaceErr.message }, 500);
  if (!space || !space.share_enabled || space.status !== "published") {
    return json({ error: "Espace introuvable ou indisponible" }, 404);
  }

  // 2) Insérer le lead (service-role → bypass RLS)
  const { error: insErr } = await sb.from("portfolio_leads").insert({
    space_id:    space.id,
    space_token: token,
    kind:        space.kind,
    name, email, phone, message,
  });
  if (insErr) return json({ error: "Enregistrement impossible : " + insErr.message }, 500);

  // 3) Alerte email (best-effort : un échec d'email ne perd pas le lead)
  let emailSent = false;
  if (RESEND_API_KEY) {
    const who   = space.recipient_name ? ` — ${esc(space.recipient_name)}` : "";
    const label = space.kind === "ambassador" ? "Recommandation (ambassadeur)" : "Prospect";
    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;color:#1c1d21">
        <div style="text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:#9ca3af">
          ${label}${who}
        </div>
        <h2 style="font-weight:400;margin:6px 0 18px">Nouvelle demande de mise en relation</h2>
        <table style="font-size:14px;line-height:1.6;border-collapse:collapse">
          <tr><td style="color:#6b7280;padding-right:14px">Nom</td><td><strong>${esc(name)}</strong></td></tr>
          ${email ? `<tr><td style="color:#6b7280;padding-right:14px">Email</td><td><a href="mailto:${esc(email)}" style="color:#1c1d21">${esc(email)}</a></td></tr>` : ""}
          ${phone ? `<tr><td style="color:#6b7280;padding-right:14px">Téléphone</td><td><a href="tel:${esc(phone)}" style="color:#1c1d21">${esc(phone)}</a></td></tr>` : ""}
        </table>
        ${message ? `<div style="margin:18px 0;padding:14px 16px;background:#f4f1ea;border-radius:12px;font-size:14px;line-height:1.55">${esc(message).replace(/\n/g, "<br>")}</div>` : ""}
        ${email ? `<p style="margin:24px 0">
          <a href="mailto:${esc(email)}"
             style="background:#1c1d21;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;display:inline-block">
            Répondre à ${esc(name)}
          </a>
        </p>` : ""}
        <p style="color:#9ca3af;font-size:12px;margin-top:28px">
          Demande reçue via l'espace portfolio (token ${esc(token.slice(0, 8))}…).
        </p>
      </div>`;

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [ALERT_TO],
          reply_to: email || undefined,
          subject: `Nouvelle demande${who ? " —" + who : ""} (${label})`,
          html,
        }),
      });
      emailSent = r.ok;
    } catch (_e) {
      emailSent = false;
    }
  }

  return json({ ok: true, emailSent });
});
