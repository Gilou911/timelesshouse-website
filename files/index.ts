// ════════════════════════════════════════════════════════════
// 📧  EDGE FUNCTION — notify-client
// ════════════════════════════════════════════════════════════
// Envoie un email au client via Resend quand l'admin livre un
// nouveau média. Appelée depuis l'admin (bouton 🔔).
//
// VARIABLES D'ENVIRONNEMENT REQUISES (Supabase Dashboard > Settings > Edge Functions > Secrets) :
//   RESEND_API_KEY         → clé API Resend (re_xxxxxxxxxxxx)
//   FROM_EMAIL             → ex : "TimelessHouse <noreply@timelesshouse.org>"
//   PORTAL_URL             → ex : "https://timelesshouse.org/clients/communication.html"
//   SUPABASE_URL           → fourni automatiquement
//   SUPABASE_SERVICE_ROLE_KEY → fourni automatiquement
//
// DÉPLOIEMENT :
//   supabase functions deploy notify-client --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") || "TimelessHouse <onboarding@resend.dev>";
const PORTAL_URL     = Deno.env.get("PORTAL_URL") || "https://timelesshouse.org/clients/communication.html";
const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SB_URL, SB_SERVICE_KEY);

// ─── Template HTML email (style TimelessHouse) ─────────────
function buildEmailHtml({ greeting, clientName, mediaTitle, mediaType, portalUrl, agencyName }) {
  const isVideo = mediaType === "video";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agencyName} — Nouvelle livraison</title>
</head>
<body style="margin:0;padding:0;background:#f5ecdf;font-family:Georgia,'Cormorant Garamond',serif;color:#1a1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5ecdf;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(26,20,16,0.08);">

        <!-- Header -->
        <tr><td style="background:#1a1410;padding:42px 40px;text-align:center;">
          <div style="font-family:Georgia,serif;font-style:italic;color:#f5ecdf;font-size:30px;letter-spacing:-0.01em;">${agencyName}<span style="color:#b08968;">.</span></div>
          <div style="color:#b08968;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin-top:8px;font-family:Arial,sans-serif;">Communication & Marketing</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:48px 40px 32px;">
          <div style="color:#b08968;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:600;">Nouvelle livraison</div>
          <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;margin:14px 0 0;color:#1a1410;font-weight:400;">Bonjour ${greeting || clientName},</h1>
          <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#3a3530;margin:22px 0 0;">
            Une nouvelle ${isVideo ? "vidéo" : "photo"} vient d'être ajoutée à votre espace client&nbsp;:
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
            <tr><td style="background:#f5ecdf;border-left:3px solid #b08968;padding:20px 24px;border-radius:6px;">
              <div style="font-family:Arial,sans-serif;font-size:11px;color:#b08968;text-transform:uppercase;letter-spacing:0.2em;font-weight:600;">${isVideo ? "🎥 Vidéo" : "📸 Photo"}</div>
              <div style="font-family:Georgia,serif;font-size:22px;color:#1a1410;margin-top:6px;line-height:1.25;">${mediaTitle}</div>
            </td></tr>
          </table>

          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:#3a3530;margin:0 0 28px;">
            Connectez-vous à votre espace pour la visualiser, la télécharger, laisser un commentaire ou la valider pour publication.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr><td style="background:#1a1410;border-radius:999px;">
              <a href="${portalUrl}" style="display:inline-block;padding:14px 36px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:#f5ecdf;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;">Accéder à mon espace →</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#faf5ed;padding:24px 40px;text-align:center;border-top:1px solid #e8dfd0;">
          <div style="font-family:Arial,sans-serif;font-size:11px;color:#8a807a;line-height:1.6;">
            ${agencyName} — Création de contenu sur mesure<br>
            <a href="${PORTAL_URL.replace(/\/clients.*$/,'')}" style="color:#b08968;text-decoration:none;">timelesshouse.org</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id, media_id, kind } = await req.json();
    if (!client_id || !media_id) {
      return new Response(JSON.stringify({ error: "client_id et media_id requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) Récupérer le client (avec service role → bypass RLS)
    const { data: client, error: cErr } = await sb.from("clients").select("*").eq("id", client_id).maybeSingle();
    if (cErr || !client) return new Response(JSON.stringify({ error: "Client introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!client.client_email) return new Response(JSON.stringify({ error: "Le client n'a pas d'email enregistré." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 2) Récupérer le média
    const { data: media, error: mErr } = await sb.from("media").select("*").eq("id", media_id).maybeSingle();
    if (mErr || !media) return new Response(JSON.stringify({ error: "Média introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 3) Construire l'email
    const html = buildEmailHtml({
      greeting:   client.greeting || (client.name || "").split(" ")[0],
      clientName: client.name,
      mediaTitle: media.title,
      mediaType:  media.type,
      portalUrl:  PORTAL_URL,
      agencyName: client.agency_name || "TimelessHouse",
    });

    const subject = (media.type === "video" ? "🎥" : "📸") + ` Nouvelle livraison — ${media.title}`;

    // 4) Envoyer via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: FROM_EMAIL, to: [client.client_email], subject, html }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Erreur Resend", details: resendData }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5) Logger dans la table notifications
    await sb.from("notifications").insert({
      client_id, kind: kind || "new_media",
      payload: { media_id, media_title: media.title, to: client.client_email, resend_id: resendData.id },
      sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, id: resendData.id, to: client.client_email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Function error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
