// ════════════════════════════════════════════════════════════
// 🔑  EDGE FUNCTION — account-recovery (SaaS B.3, brique 8)
// ════════════════════════════════════════════════════════════
// « Mot de passe oublié » pour les patrons d'agence : génère un lien
// de récupération Supabase et l'envoie par email AUX COULEURS DE
// L'AGENCE (via Resend, comme notify-client) plutôt qu'avec le
// gabarit par défaut de Supabase.
//
// POST { email, redirect_to? }
//   → toujours 200 { ok: true } : jamais d'énumération de comptes
//     (on ne dit pas si l'email existe).
//
// GARDE-FOUS :
//   ▸ 5 demandes maximum par heure et par email (auth_recovery_log)
//   ▸ redirect_to validé contre une liste d'hôtes autorisés
//   ▸ aucun secret dans la réponse
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
const ALLOWED_HOSTS = [
  "laloge.app", "laloge.house", "timelesshouse.org",
  "app.timelesshouse.org", "localhost:5173",
];
function safeRedirect(raw: unknown): string {
  const fallback = "https://laloge.app/reinitialiser";
  if (typeof raw !== "string") return fallback;
  try {
    const u = new URL(raw);
    const hostOk = ALLOWED_HOSTS.includes(u.host) || /^[a-z0-9-]+\.laloge\.house$/.test(u.host);
    return hostOk ? u.toString() : fallback;
  } catch { return fallback; }
}

// Marque de l'agence de l'utilisateur (pour l'email) — TimelessHouse
// par défaut, La Loge si l'utilisateur n'appartient à aucune agence.
async function brandFor(userId: string | null) {
  const dflt = { name: "La Loge", accent: "#2a2620", email: "service@timelesshouse.org" };
  if (!userId) return dflt;
  const { data } = await sbAdmin
    .from("agency_members")
    .select("agencies(name, accent_color, contact_email)")
    .eq("user_id", userId).limit(1).maybeSingle();
  const a = (data as any)?.agencies;
  return a ? { name: a.name, accent: a.accent_color || dflt.accent, email: a.contact_email || dflt.email } : dflt;
}

function emailHtml(brand: { name: string; accent: string }, link: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
    <div style="background:${esc(brand.accent)};padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">${esc(brand.name)}</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:400;line-height:1.4">Réinitialisation de votre mot de passe</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
        Vous avez demandé un nouveau mot de passe pour votre console. Ce lien est valable
        <strong>1 heure</strong> et ne fonctionne qu'une fois.
      </p>
      <div style="text-align:center">
        <a href="${esc(link)}" style="display:inline-block;margin:24px 0 8px;padding:14px 32px;background:${esc(brand.accent)};color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Choisir un nouveau mot de passe</a>
      </div>
      <p style="font-size:13px;color:#8a8480;line-height:1.6;margin-top:24px">
        Vous n'êtes pas à l'origine de cette demande&nbsp;? Ignorez simplement cet email :
        votre mot de passe actuel reste valable.
      </p>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(400, { error: "Email invalide" });
  const redirectTo = safeRedirect(body.redirect_to);

  // ── Anti-bombardement : 5 demandes / heure / email ──
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sbAdmin.from("auth_recovery_log")
    .select("id", { count: "exact", head: true })
    .eq("email", email).gte("created_at", since);
  if ((count || 0) >= 5) {
    // même réponse que le cas nominal : aucune information divulguée
    return json(200, { ok: true });
  }
  await sbAdmin.from("auth_recovery_log").insert({ email });

  try {
    const { data: userId } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: email });
    if (!userId) return json(200, { ok: true }); // compte inconnu : silence

    const { data: link, error } = await sbAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (error || !link?.properties?.action_link) {
      console.error("[account-recovery] generateLink:", error);
      return json(200, { ok: true });
    }

    const brand = await brandFor(userId as string);
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${brand.name} <${FROM_ADDR}>`,
          to: email,
          reply_to: brand.email,
          subject: `Réinitialisation de votre mot de passe — ${brand.name}`,
          html: emailHtml(brand, link.properties.action_link),
        }),
      });
      if (!res.ok) console.error("[account-recovery] resend:", await res.text());
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("[account-recovery]", err);
    return json(200, { ok: true });
  }
});
