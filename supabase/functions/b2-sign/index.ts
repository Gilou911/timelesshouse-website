// ════════════════════════════════════════════════════════════
// 🔏  EDGE FUNCTION — b2-sign
// ════════════════════════════════════════════════════════════
// Signe des URLs d'upload vers Backblaze B2 (API compatible S3)
// pour que l'admin uploade les vidéos/vignettes DIRECTEMENT depuis
// le navigateur (aucun fichier ne transite par Supabase).
//
// Même modèle que ylvfeet : le navigateur demande une URL signée,
// puis fait un PUT direct vers B2. Ici la signature vit dans une
// Edge Function car le site TimelessHouse est statique (pas de
// serveur Next.js).
//
// SÉCURITÉ :
//   ▸ Réservée aux MEMBRES D'AGENCE (agency_members — SaaS B.3) :
//     le JWT Supabase de la session est vérifié via auth.getUser(),
//     puis chaque chemin est contrôlé contre le périmètre de
//     l'agence de l'appelant (aucune signature cross-agence).
//   ▸ Les clés B2 ne quittent JAMAIS cette fonction.
//   ▸ Les chemins (key) sont validés : pas de "..", pas de "/",
//     préfixes autorisés uniquement (media/, weddings/, invoices/,
//     documents/, photobooth/, agencies/).
//
// ACTIONS (body JSON { action, ... }) :
//   sign-put       { key, contentType }            → { url, publicUrl }
//   sign-delete    { key }                         → { url }
//                  (suppression définitive — mêmes gardes de périmètre que
//                   sign-put ; utilisé par la photothèque du photobooth)
//   mpu-create     { key, contentType }            → { uploadId }
//   mpu-sign-parts { key, uploadId, partNumbers[] }→ { urls: { [n]: url } }
//   mpu-complete   { key, uploadId, parts[] }      → { publicUrl }
//   mpu-abort      { key, uploadId }               → { ok }
// (mpu-* = multipart, pour les fichiers > 4 Go — films de mariage)
//
// VARIABLES D'ENVIRONNEMENT REQUISES (Dashboard > Edge Functions > Secrets) :
//   B2_ENDPOINT            → ex : "https://s3.eu-central-003.backblazeb2.com"
//   B2_REGION              → ex : "eu-central-003"
//   B2_BUCKET              → ex : "timelesshouse-media"
//   B2_KEY_ID              → keyID de la clé d'application B2
//   B2_APP_KEY             → applicationKey B2
//   B2_PUBLIC_BASE_URL     → base des URLs publiques SANS slash final.
//                            ex : "https://media.timelesshouse.org"
//                            ou  "https://f003.backblazeb2.com/file/timelesshouse-media"
//   SUPABASE_URL           → fourni automatiquement
//   SUPABASE_SERVICE_ROLE_KEY → fourni automatiquement
//
// DÉPLOIEMENT :
//   supabase functions deploy b2-sign --no-verify-jwt
//   (la vérification d'identité est faite DANS le code — le flag
//    évite seulement que le preflight CORS soit bloqué)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "npm:@aws-sdk/client-s3@3.600.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.600.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const B2_ENDPOINT    = Deno.env.get("B2_ENDPOINT")!;
const B2_REGION      = Deno.env.get("B2_REGION")!;
const B2_BUCKET      = Deno.env.get("B2_BUCKET")!;
const B2_KEY_ID      = Deno.env.get("B2_KEY_ID")!;
const B2_APP_KEY     = Deno.env.get("B2_APP_KEY")!;
const PUBLIC_BASE    = (Deno.env.get("B2_PUBLIC_BASE_URL") || "").replace(/\/+$/, "");

const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
});

// ─── Helpers ────────────────────────────────────────────────
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Un chemin B2 valide : préfixe connu, segments sûrs, pas de traversée.
// photobooth/ : photos d'événement poussées par l'app locale (compte machine
// photobooth@timelesshouse.org, listé dans ADMIN_EMAILS).
// agencies/<slug>/ : identité de l'agence (logo de l'écran « Ma marque »).
const KEY_RE = /^(media|weddings|invoices|documents|photobooth|agencies)\/[a-zA-Z0-9._\-/]{1,400}$/;
function validKey(key: unknown): key is string {
  return typeof key === "string" && KEY_RE.test(key) && !key.includes("..") && !key.includes("//");
}

function publicUrl(key: string): string {
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : "";
}

// Les originaux (media/<id>/original/…, weddings/<code>/<clé>/original/…) sont
// faits pour être TÉLÉCHARGÉS par le client : on leur pose un
// Content-Disposition: attachment dès l'upload. Sans lui, le navigateur ouvre
// la vidéo dans un onglet au lieu de l'enregistrer (et le portail devait
// charger plusieurs Go en mémoire pour contourner ça).
// Nom assaini côté serveur : jamais d'injection d'en-tête depuis le client.
function dispositionFor(key: string): string | undefined {
  // `/original/…` (vidéos) ET `…/original.jpg` (photos de galerie) : tout
  // fichier « original » est destiné au téléchargement, pas à l'affichage.
  if (!/\/original[./]/.test(key)) return undefined;
  const name = (key.split("/").pop() || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `attachment; filename="${name}"`;
}

// ─── Garde par rôles (SaaS B.3 — remplace ADMIN_EMAILS) ─────
// L'appelant doit être MEMBRE D'UNE AGENCE (`agency_members`), et
// chaque chemin signé est vérifié : un admin ne signe QUE dans le
// périmètre de SON agence (media/<id> à elle, weddings/<code> d'un de
// SES clients, invoices|documents/<clientId> idem ; photobooth/ est
// réservé aux membres TimelessHouse — le compte machine photobooth
// est membre admin de l'agence).
type Caller = { userId: string; email: string; agencyIds: string[] };

async function requireAgencyMember(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: rows } = await sbAdmin
    .from("agency_members").select("agency_id").eq("user_id", data.user.id);
  if (!rows || rows.length === 0) return null;
  return {
    userId: data.user.id,
    email: (data.user.email || "").toLowerCase(),
    agencyIds: rows.map((r) => r.agency_id as string),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le chemin demandé appartient-il au périmètre de l'agence de l'appelant ?
// Renvoie l'agency_id du chemin (pour l'info quota), ou null = refusé.
async function keyAgencyScope(caller: Caller, key: string): Promise<string | null> {
  const [prefix, second] = key.split("/");
  if (prefix === "media") {
    // media/<id>/… : la fiche média est créée AVANT l'upload → vérifiable
    if (!UUID_RE.test(second || "")) return null;
    const { data } = await sbAdmin.from("media").select("agency_id")
      .eq("id", second).in("agency_id", caller.agencyIds).maybeSingle();
    return data?.agency_id ?? null;
  }
  if (prefix === "weddings") {
    // weddings/<code client>/…
    if (!second) return null;
    const { data } = await sbAdmin.from("clients").select("agency_id")
      .eq("code", second).in("agency_id", caller.agencyIds).maybeSingle();
    return data?.agency_id ?? null;
  }
  if (prefix === "invoices" || prefix === "documents") {
    // invoices|documents/<id client>/…
    if (!UUID_RE.test(second || "")) return null;
    const { data } = await sbAdmin.from("clients").select("agency_id")
      .eq("id", second).in("agency_id", caller.agencyIds).maybeSingle();
    return data?.agency_id ?? null;
  }
  if (prefix === "photobooth") {
    const { data } = await sbAdmin.from("agencies").select("id")
      .eq("slug", "timelesshouse").in("id", caller.agencyIds).maybeSingle();
    return data?.id ?? null;
  }
  if (prefix === "agencies") {
    // agencies/<slug>/… : logo « Ma marque » — le slug doit être une
    // agence dont l'appelant est membre (aucun dépôt chez le voisin).
    if (!second) return null;
    const { data } = await sbAdmin.from("agencies").select("id")
      .eq("slug", second).in("id", caller.agencyIds).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

// État du quota de l'agence (SaaS B.3) : joint aux réponses sign-put /
// mpu-create pour la jauge et l'alerte 80 % côté admin — INFORMATIF
// uniquement, aucun upload n'est jamais bloqué (dépassement souple).
async function storageInfo(agencyId: string) {
  const { data } = await sbAdmin.from("agencies")
    .select("storage_used_bytes, plan").eq("id", agencyId).single();
  if (!data) return null;
  const { data: quota } = await sbAdmin.rpc("plan_quota_bytes", { p_plan: data.plan });
  const used = data.storage_used_bytes || 0;
  return {
    used_bytes: used,
    quota_bytes: quota ?? null,
    pct: quota ? Math.round(used / (quota as number) * 100) : null,
  };
}

// Go lisibles (1 décimale sous 10 Go, entier au-delà) pour les messages.
function fmtGo(bytes: number): string {
  const go = bytes / 1073741824;
  return go >= 10 ? `${Math.round(go)} Go` : `${go.toFixed(1)} Go`;
}

// ── DURCISSEMENT QUOTA (24/07/2026) ────────────────────────────────
// Avant, le quota était purement informatif : un locataire plein pouvait
// continuer d'uploader, et rien ne vérifiait la taille du fichier. Ici on
// BLOQUE avant de signer :
//   • si l'agence est déjà pleine (used ≥ quota) ;
//   • si le fichier annoncé ferait dépasser le quota (used + size > quota).
// La taille `size` est fournie par le navigateur (file.size). Un plan sans
// quota connu (quota null) n'est jamais bloqué.
// Renvoie une Response 413 à renvoyer tel quel, ou { used, quota } si OK.
async function checkQuota(agencyId: string, size: unknown): Promise<
  { block: Response } | { ok: true; used: number; quota: number | null }
> {
  const { data } = await sbAdmin.from("agencies")
    .select("storage_used_bytes, plan").eq("id", agencyId).single();
  if (!data) return { ok: true, used: 0, quota: null };
  const { data: q } = await sbAdmin.rpc("plan_quota_bytes", { p_plan: data.plan });
  const quota = q == null ? null : Number(q);
  const used = data.storage_used_bytes || 0;
  const incoming = Math.max(0, Number(size) || 0);
  if (quota != null) {
    if (used >= quota) {
      return { block: json(413, {
        error: `Espace de stockage plein (${fmtGo(used)} / ${fmtGo(quota)}). Libérez de l'espace en supprimant des médias, ou passez à une offre supérieure.`,
        code: "quota_full",
        storage: { used_bytes: used, quota_bytes: quota, pct: 100 },
      }) };
    }
    if (incoming > 0 && used + incoming > quota) {
      return { block: json(413, {
        error: `Ce fichier (${fmtGo(incoming)}) dépasse l'espace restant (${fmtGo(quota - used)}). Libérez de l'espace, ou passez à une offre supérieure.`,
        code: "quota_exceeded",
        storage: { used_bytes: used, quota_bytes: quota, pct: Math.round(used / quota * 100) },
      }) };
    }
  }
  return { ok: true, used, quota };
}

// Incrément OPTIMISTE du compteur (après une signature/finalisation) : les
// uploads successifs d'une même session sont ainsi correctement gated sans
// attendre la mesure nocturne, qui reste la source de vérité (elle réécrit
// la valeur absolue chaque nuit et corrige toute dérive — échecs, purges).
async function bumpUsage(agencyId: string, delta: unknown): Promise<void> {
  const d = Math.max(0, Number(delta) || 0);
  if (!d) return;
  try {
    const { data } = await sbAdmin.from("agencies")
      .select("storage_used_bytes").eq("id", agencyId).single();
    const cur = data?.storage_used_bytes || 0;
    await sbAdmin.from("agencies").update({ storage_used_bytes: cur + d }).eq("id", agencyId);
  } catch (_) { /* best effort — la mesure nocturne rattrape */ }
}

// ─── Handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json(405, { error: "Méthode non autorisée" });

  const caller = await requireAgencyMember(req);
  if (!caller) return json(401, { error: "Session admin requise — reconnecte-toi." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const action = body.action as string;
  const key    = body.key;

  if (!validKey(key)) {
    return json(400, { error: "Chemin de fichier invalide (préfixes autorisés : media/, weddings/, invoices/, documents/, photobooth/, agencies/)" });
  }
  const keyAgency = await keyAgencyScope(caller, key);
  if (!keyAgency) {
    return json(403, { error: "Chemin hors du périmètre de votre agence." });
  }

  try {
    switch (action) {
      // ── Upload simple (≤ ~4 Go) ──────────────────────────
      case "sign-put": {
        const q = await checkQuota(keyAgency, body.size);
        if ("block" in q) return q.block;
        const disposition = dispositionFor(key);
        const url = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: B2_BUCKET,
            Key: key,
            ContentType: (body.contentType as string) || "application/octet-stream",
            ...(disposition ? { ContentDisposition: disposition } : {}),
          }),
          { expiresIn: 3600 }
        );
        // Compteur incrémenté à la signature (le PUT suit immédiatement).
        await bumpUsage(keyAgency, body.size);
        // `disposition` est renvoyé : le navigateur DOIT envoyer cet en-tête à
        // l'identique, sinon la signature ne correspond plus.
        return json(200, { url, key, publicUrl: publicUrl(key), disposition, storage: await storageInfo(keyAgency) });
      }

      // ── Suppression définitive ───────────────────────────
      case "sign-delete": {
        //  Mêmes gardes que sign-put (validKey + périmètre d'agence, déjà
        //  vérifiés plus haut) : on ne supprime que dans son propre espace.
        //  S3/B2 répond 204 même si la clé n'existe plus — idempotent.
        const url = await getSignedUrl(
          s3,
          new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key }),
          { expiresIn: 900 }
        );
        return json(200, { url, key });
      }

      // ── Multipart (gros fichiers, ex : films de mariage) ─
      case "mpu-create": {
        // Contrôle du quota AVANT de démarrer un gros upload (l'incrément,
        // lui, se fait à la finalisation mpu-complete : fichier confirmé).
        const q = await checkQuota(keyAgency, body.size);
        if ("block" in q) return q.block;
        // Content-Disposition posé ici : il est porté par l'upload multipart
        // lui-même, les parts n'ont pas à le renvoyer.
        const res = await s3.send(
          new CreateMultipartUploadCommand({
            Bucket: B2_BUCKET,
            Key: key,
            ContentType: (body.contentType as string) || "application/octet-stream",
            ...(dispositionFor(key) ? { ContentDisposition: dispositionFor(key) } : {}),
          })
        );
        return json(200, { uploadId: res.UploadId, key, storage: await storageInfo(keyAgency) });
      }

      case "mpu-sign-parts": {
        const uploadId    = body.uploadId as string;
        const partNumbers = body.partNumbers as number[];
        if (!uploadId || !Array.isArray(partNumbers) || partNumbers.length === 0 || partNumbers.length > 200) {
          return json(400, { error: "uploadId / partNumbers manquants (max 200 par requête)" });
        }
        const urls: Record<number, string> = {};
        for (const n of partNumbers) {
          if (!Number.isInteger(n) || n < 1 || n > 10000) return json(400, { error: `Numéro de part invalide : ${n}` });
          urls[n] = await getSignedUrl(
            s3,
            new UploadPartCommand({ Bucket: B2_BUCKET, Key: key, UploadId: uploadId, PartNumber: n }),
            { expiresIn: 3600 * 6 } // les gros uploads peuvent être longs
          );
        }
        return json(200, { urls });
      }

      case "mpu-complete": {
        const uploadId = body.uploadId as string;
        const parts    = body.parts as { PartNumber: number; ETag: string }[];
        if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
          return json(400, { error: "uploadId / parts manquants" });
        }
        const sorted = parts
          .map((p) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag).replace(/"/g, "") }))
          .sort((a, b) => a.PartNumber - b.PartNumber);

        // ⚠️ Ne PAS utiliser s3.send() ici : CompleteMultipartUpload envoie un
        // corps XML, et le SDK AWS se bloque dessus dans le runtime Edge (la
        // fonction meurt sur IDLE_TIMEOUT 150s → tout upload > seuil échouait).
        // On signe l'URL (pas de réseau) puis on POST le XML via fetch natif.
        const url = await getSignedUrl(
          s3,
          new CompleteMultipartUploadCommand({ Bucket: B2_BUCKET, Key: key, UploadId: uploadId }),
          { expiresIn: 900 }
        );
        const xml =
          "<CompleteMultipartUpload>" +
          sorted.map((p) => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>&quot;${p.ETag}&quot;</ETag></Part>`).join("") +
          "</CompleteMultipartUpload>";
        const res = await fetch(url, { method: "POST", body: xml, headers: { "Content-Type": "application/xml" } });
        const text = await res.text();
        // S3 peut répondre 200 avec une <Error> dans le corps : on vérifie les deux.
        if (!res.ok || text.includes("<Error>")) {
          console.error("[b2-sign] mpu-complete échec:", res.status, text.slice(0, 300));
          return json(502, { error: `Finalisation B2 échouée (${res.status})`, detail: text.slice(0, 200) });
        }
        // Upload confirmé → on crédite le compteur de la taille du fichier.
        await bumpUsage(keyAgency, body.size);
        return json(200, { key, publicUrl: publicUrl(key) });
      }

      case "mpu-abort": {
        const uploadId = body.uploadId as string;
        if (!uploadId) return json(400, { error: "uploadId manquant" });
        await s3.send(
          new AbortMultipartUploadCommand({ Bucket: B2_BUCKET, Key: key, UploadId: uploadId })
        );
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: `Action inconnue : ${action}` });
    }
  } catch (err) {
    console.error(`[b2-sign] ${action} par ${caller.email} a échoué :`, err);
    return json(500, { error: err instanceof Error ? err.message : "Erreur B2" });
  }
});
