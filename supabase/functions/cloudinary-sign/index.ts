// ════════════════════════════════════════════════════════════
// 🔏  EDGE FUNCTION — cloudinary-sign
// ════════════════════════════════════════════════════════════
// Signe un upload direct navigateur → Cloudinary pour les galeries
// photos, afin que l'admin uploade depuis son espace (au lieu du
// dashboard Cloudinary) tout en gardant les dossiers = catégories.
//
// Même modèle de sécurité que b2-sign : réservé aux MEMBRES D'AGENCE
// (JWT Supabase vérifié + agency_members — SaaS B.3). Le secret
// Cloudinary ne quitte jamais la fonction.
//
// Le front demande une signature pour un `folder` (ex : "Photos_x/ceremonie"),
// puis POST chaque fichier sur https://api.cloudinary.com/v1_1/<cloud>/image/upload
// avec { file, api_key, timestamp, folder, signature }. La signature couvre
// folder + timestamp (Cloudinary exclut file/api_key/cloud_name/resource_type).
// Une signature est réutilisable pour tout un lot (mêmes folder + timestamp).
//
// SECRETS REQUIS (déjà présents sur le projet) :
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//
// DÉPLOIEMENT : supabase functions deploy cloudinary-sign --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aalSatisfait } from "../_shared/aal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOUD_NAME     = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
const API_KEY        = Deno.env.get("CLOUDINARY_API_KEY")!;
const API_SECRET     = Deno.env.get("CLOUDINARY_API_SECRET")!;
const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Dossier Cloudinary sûr : lettres/chiffres/_/-/ et /, pas de traversée.
const FOLDER_RE = /^[A-Za-z0-9_\-/]{1,200}$/;

async function sha1Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cloudinary est un HÉRITAGE TimelessHouse (galeries photos existantes,
// décision du 20/07/2026) : les locataires livrent leurs photos via B2
// (variantes générées à l'upload). Comme les dossiers Cloudinary ne
// sont pas cloisonnés par agence — et que « destroy » supprime
// n'importe quel visuel — cette fonction est réservée aux MEMBRES DE
// L'AGENCE PLATEFORME uniquement.
/* Audit du 07/08 : cette fonction se dit « même modèle de sécurité que
   b2-sign » — elle ne l'était plus. Elle ne lisait ni le rang ni le
   niveau de session : un membre au rang plancher de la plateforme, avec
   une session au mot de passe seul, pouvait signer la SUPPRESSION
   définitive de n'importe quelle photo. Elle rejoint le modèle. */
async function requireAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return false;
  if (!(await aalSatisfait(token))) return false;
  /* `privileges` est une colonne ajoutée après coup : demandée dans un
     select qui l'ignore, PostgREST refuserait TOUTE la requête. */
  let rows = (await sbAdmin
    .from("agency_members").select("role, privileges, agencies!inner(slug)")
    .eq("user_id", data.user.id).eq("agencies.slug", "timelesshouse").limit(1)).data as
    Array<Record<string, unknown>> | null;
  if (!rows) {
    rows = (await sbAdmin
      .from("agency_members").select("role, agencies!inner(slug)")
      .eq("user_id", data.user.id).eq("agencies.slug", "timelesshouse").limit(1)).data as
      Array<Record<string, unknown>> | null;
  }
  if (!rows || rows.length === 0) return false;
  const role = (rows[0].role as string) || "membre";
  const privileges = Array.isArray(rows[0].privileges) ? (rows[0].privileges as string[]) : [];
  // Les visuels d'un client ne se signent — ni surtout ne s'effacent —
  // qu'avec le privilège qui ouvre les espaces clients.
  return role === "owner" || role === "admin" || privileges.includes("clients");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json(405, { error: "Méthode non autorisée" });

  if (!(await requireAdmin(req))) return json(401, { error: "Session admin requise — reconnecte-toi." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const timestamp = Math.round(Date.now() / 1000);

  // ── Signer une SUPPRESSION (destroy d'un public_id) ──
  if (body.action === "destroy") {
    const publicId = body.public_id;
    if (typeof publicId !== "string" || !FOLDER_RE.test(publicId) || publicId.includes("..")) {
      return json(400, { error: "public_id invalide" });
    }
    const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = await sha1Hex(toSign + API_SECRET);
    return json(200, { cloudName: CLOUD_NAME, apiKey: API_KEY, timestamp, public_id: publicId, signature });
  }

  // ── Signer un UPLOAD dans un dossier (défaut) ──
  const folder = body.folder;
  if (typeof folder !== "string" || !FOLDER_RE.test(folder) || folder.includes("..") || folder.includes("//")) {
    return json(400, { error: "Dossier invalide" });
  }
  // Params signés, triés alphabétiquement : folder, timestamp
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = await sha1Hex(toSign + API_SECRET);
  return json(200, { cloudName: CLOUD_NAME, apiKey: API_KEY, timestamp, folder, signature });
});
