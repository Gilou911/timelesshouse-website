// ════════════════════════════════════════════════════════════
// 📏  EDGE FUNCTION — measure-storage (SaaS B.3, quotas)
// ════════════════════════════════════════════════════════════
// Mesure l'usage RÉEL du bucket B2 par agence : liste tous les objets
// (ListObjectsV2 paginé), classe chaque clé par agence via la base :
//   media/<id>/…               → media.agency_id
//   weddings/<code>/…          → clients.code → agency_id
//   invoices|documents/<id>/…  → clients.id → agency_id
//   photobooth/…               → TimelessHouse (produit plateforme)
//   clé inconnue / orpheline   → TimelessHouse (plateforme)
// puis met à jour agencies.storage_used_bytes + storage_measured_at.
//
// DÉCLENCHEURS :
//   ▸ cron nocturne 02:30 UTC (header x-cron-key = CRON_SECRET)
//   ▸ propriétaire de la plateforme (JWT — bouton futur dans l'admin)
//
// Jamais de blocage d'upload ici : la mesure alimente la jauge de
// l'admin et l'info quota renvoyée par b2-sign (alerte 80 %).
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { S3Client, ListObjectsV2Command } from "npm:@aws-sdk/client-s3@3.600.0";

const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET    = Deno.env.get("CRON_SECRET") || "";
const B2_ENDPOINT    = Deno.env.get("B2_ENDPOINT")!;
const B2_REGION      = Deno.env.get("B2_REGION")!;
const B2_BUCKET      = Deno.env.get("B2_BUCKET")!;
const B2_KEY_ID      = Deno.env.get("B2_KEY_ID")!;
const B2_APP_KEY     = Deno.env.get("B2_APP_KEY")!;

const sb = createClient(SB_URL, SB_SERVICE_KEY);
const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
});

// ── Alertes stockage 80 % / 100 % (22/07/2026) ──────────────
// La jauge n'existait que dans la console : un locataire qui ne s'y
// connecte pas découvrait le problème trop tard. L'alerte part au
// FRANCHISSEMENT du seuil (avant/après mesure) : aucun état à stocker,
// pas de doublon tant qu'on ne retraverse pas le seuil, et un
// changement d'offre (quota plus grand) réarme naturellement.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "La Loge <noreply@laloge.house>";
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];
const go = (b: number) => (b / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function alerteStockageHtml(agName: string, slug: string, pct: number, usedB: number, quotaB: number) {
  const plein = pct >= 100;
  const consoleUrl = `https://${slug}.laloge.house/communication-admin`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620">
<div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(42,38,32,.10)">
  <div style="background:#2a2620;padding:32px 40px;text-align:center">
    <h1 style="margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;text-transform:uppercase;font-weight:400;font-family:sans-serif">La Loge</h1>
  </div>
  <div style="padding:40px">
    <h2 style="margin:0 0 20px;font-size:22px;font-weight:400;line-height:1.4">${plein ? "Votre stockage est plein" : `Votre stockage atteint ${pct} %`}</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">
      Bonjour ${agName},<br/>votre loge utilise <strong>${go(usedB)} Go</strong> sur les <strong>${go(quotaB)} Go</strong> de votre offre.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540">${plein
      ? "Rassurez-vous : vos uploads continuent de fonctionner (dépassement souple), et rien n'est supprimé. Pour rester serein, passez au palier supérieur — le quota suit immédiatement."
      : "Rien d'urgent — c'est le bon moment pour y penser. Le passage au palier supérieur se fait en deux clics, sans engagement."}</p>
    <div style="text-align:center">
      <a href="${consoleUrl}" style="display:inline-block;margin:24px 0 8px;padding:14px 32px;background:#2a2620;color:#e8d8be;text-decoration:none;border-radius:32px;font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Ouvrir ma console</a>
    </div>
    <p style="font-size:13px;color:#8a8480;line-height:1.6">Paramètres → Abonnement, dans votre console.</p>
  </div>
  <div style="padding:24px 40px;border-top:1px solid #f0ece4;text-align:center;font-size:11px;font-family:sans-serif;color:#a09890">
    La Loge &nbsp;·&nbsp; <a href="https://laloge.app" style="color:#a09890;text-decoration:none">laloge.app</a>
  </div>
</div></body></html>`;
}

/** Envoi best effort — une alerte ratée ne doit jamais casser la mesure. */
function envoyerAlerte(to: string, sujet: string, html: string) {
  if (!RESEND_API_KEY) return;
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `La Loge <${FROM_ADDR}>`, to, subject: sujet, html }),
  }).catch(() => {});
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function allowed(req: Request): Promise<boolean> {
  if (CRON_SECRET && req.headers.get("x-cron-key") === CRON_SECRET) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return false;
  const { data: rows } = await sb
    .from("agency_members")
    .select("role, agencies!inner(slug)")
    .eq("user_id", data.user.id).eq("role", "owner").eq("agencies.slug", "timelesshouse");
  return !!rows && rows.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });
  if (!(await allowed(req))) return json(401, { error: "Non autorisé" });

  try {
    // ── Cartes de classification (tables petites : quelques centaines de lignes)
    const [{ data: agencies }, { data: medias }, { data: clients }] = await Promise.all([
      sb.from("agencies").select("id, slug, name, contact_email, plan, storage_used_bytes"),
      sb.from("media").select("id, agency_id"),
      sb.from("clients").select("id, code, agency_id"),
    ]);
    if (!agencies?.length) return json(500, { error: "Aucune agence" });
    const th = agencies.find((a) => a.slug === "timelesshouse")?.id ?? agencies[0].id;
    const byMediaId  = new Map((medias  || []).map((m) => [m.id, m.agency_id]));
    const byCode     = new Map((clients || []).map((c) => [c.code, c.agency_id]));
    const byClientId = new Map((clients || []).map((c) => [c.id, c.agency_id]));

    const classify = (key: string): string => {
      const [prefix, second] = key.split("/");
      if (prefix === "media")     return byMediaId.get(second)  ?? th;
      if (prefix === "weddings")  return byCode.get(second)     ?? th;
      if (prefix === "invoices" || prefix === "documents") return byClientId.get(second) ?? th;
      return th; // photobooth/ et tout le reste = plateforme
    };

    // ── Parcours du bucket ──
    const used = new Map<string, number>();
    const counts = new Map<string, number>();
    let token: string | undefined = undefined;
    let objects = 0;
    do {
      const page = await s3.send(new ListObjectsV2Command({
        Bucket: B2_BUCKET, MaxKeys: 1000, ContinuationToken: token,
      }));
      for (const o of page.Contents || []) {
        if (!o.Key) continue;
        const ag = classify(o.Key);
        used.set(ag, (used.get(ag) || 0) + (o.Size || 0));
        counts.set(ag, (counts.get(ag) || 0) + 1);
        objects++;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    // ── Mise à jour de TOUTES les agences (0 pour celles sans objet) ──
    const now = new Date().toISOString();
    const summary: Record<string, unknown>[] = [];
    // Quota par offre (RPC plan_quota_bytes), mis en cache par plan
    const quotaParPlan = new Map<string, number>();
    for (const a of agencies) {
      const bytes = used.get(a.id) || 0;
      await sb.from("agencies")
        .update({ storage_used_bytes: bytes, storage_measured_at: now })
        .eq("id", a.id);

      // Alerte au FRANCHISSEMENT de 80 % ou 100 % (jamais la plateforme)
      let alerte: string | null = null;
      if (a.slug !== "timelesshouse" && a.contact_email) {
        let quota = quotaParPlan.get(a.plan || "");
        if (quota === undefined) {
          const { data: q } = await sb.rpc("plan_quota_bytes", { p_plan: a.plan || "" });
          quota = Number(q) || 0;
          quotaParPlan.set(a.plan || "", quota);
        }
        if (quota > 0) {
          const avant = ((a.storage_used_bytes || 0) / quota) * 100;
          const apres = (bytes / quota) * 100;
          if (avant < 100 && apres >= 100) alerte = "100";
          else if (avant < 80 && apres >= 80 && apres < 100) alerte = "80";
          if (alerte) {
            const pct = Math.round(apres);
            await envoyerAlerte(
              a.contact_email,
              alerte === "100"
                ? "Votre stockage est plein — vos uploads continuent, pensez au palier supérieur"
                : `Votre stockage atteint ${pct} % — La Loge`,
              alerteStockageHtml(a.name || a.slug, a.slug, pct, bytes, quota),
            );
          }
        }
      }
      summary.push({ slug: a.slug, used_bytes: bytes, objects: counts.get(a.id) || 0, ...(alerte ? { alerte } : {}) });
    }
    return json(200, { ok: true, objects, agencies: summary });
  } catch (err) {
    console.error("[measure-storage]", err);
    return json(500, { error: err instanceof Error ? err.message : "Erreur mesure" });
  }
});
