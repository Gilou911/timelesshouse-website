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
      sb.from("agencies").select("id, slug"),
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
    for (const a of agencies) {
      const bytes = used.get(a.id) || 0;
      await sb.from("agencies")
        .update({ storage_used_bytes: bytes, storage_measured_at: now })
        .eq("id", a.id);
      summary.push({ slug: a.slug, used_bytes: bytes, objects: counts.get(a.id) || 0 });
    }
    return json(200, { ok: true, objects, agencies: summary });
  } catch (err) {
    console.error("[measure-storage]", err);
    return json(500, { error: err instanceof Error ? err.message : "Erreur mesure" });
  }
});
