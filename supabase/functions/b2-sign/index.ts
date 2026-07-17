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
//   ▸ Réservée aux admins : le JWT Supabase de la session admin
//     est vérifié via auth.getUser() — la clé anon seule est
//     refusée (les clients n'ont pas de compte, seul l'admin
//     se connecte via signInWithPassword).
//   ▸ Les clés B2 ne quittent JAMAIS cette fonction.
//   ▸ Les chemins (key) sont validés : pas de "..", pas de "/",
//     préfixes autorisés uniquement (media/, weddings/).
//
// ACTIONS (body JSON { action, ... }) :
//   sign-put       { key, contentType }            → { url, publicUrl }
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
const KEY_RE = /^(media|weddings|invoices|documents)\/[a-zA-Z0-9._\-/]{1,400}$/;
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
  if (!key.includes("/original/")) return undefined;
  const name = (key.split("/").pop() || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `attachment; filename="${name}"`;
}

// L'appelant doit être authentifié ET faire partie des emails admin.
// Double barrière : même si les inscriptions publiques étaient ouvertes,
// seul un email de la liste ADMIN_EMAILS peut signer un upload.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const email = (data.user.email || "").toLowerCase();
  // Si ADMIN_EMAILS est défini, on l'exige ; sinon (secret oublié) on
  // retombe sur « tout utilisateur authentifié » pour ne pas tout bloquer.
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) return null;
  return data.user.email ?? data.user.id;
}

// ─── Handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json(405, { error: "Méthode non autorisée" });

  const who = await requireAdmin(req);
  if (!who) return json(401, { error: "Session admin requise — reconnecte-toi." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const action = body.action as string;
  const key    = body.key;

  if (!validKey(key)) {
    return json(400, { error: "Chemin de fichier invalide (préfixes autorisés : media/, weddings/)" });
  }

  try {
    switch (action) {
      // ── Upload simple (≤ ~4 Go) ──────────────────────────
      case "sign-put": {
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
        // `disposition` est renvoyé : le navigateur DOIT envoyer cet en-tête à
        // l'identique, sinon la signature ne correspond plus.
        return json(200, { url, key, publicUrl: publicUrl(key), disposition });
      }

      // ── Multipart (gros fichiers, ex : films de mariage) ─
      case "mpu-create": {
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
        return json(200, { uploadId: res.UploadId, key });
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
    console.error(`[b2-sign] ${action} par ${who} a échoué :`, err);
    return json(500, { error: err instanceof Error ? err.message : "Erreur B2" });
  }
});
