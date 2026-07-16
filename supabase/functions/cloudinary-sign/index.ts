// ════════════════════════════════════════════════════════════
// 🔏  EDGE FUNCTION — cloudinary-sign
// ════════════════════════════════════════════════════════════
// Signe un upload direct navigateur → Cloudinary pour les galeries
// photos, afin que l'admin uploade depuis son espace (au lieu du
// dashboard Cloudinary) tout en gardant les dossiers = catégories.
//
// Même modèle de sécurité que b2-sign : réservé aux emails ADMIN_EMAILS
// (JWT Supabase vérifié). Le secret Cloudinary ne quitte jamais la fonction.
//
// Le front demande une signature pour un `folder` (ex : "Photos_x/ceremonie"),
// puis POST chaque fichier sur https://api.cloudinary.com/v1_1/<cloud>/image/upload
// avec { file, api_key, timestamp, folder, signature }. La signature couvre
// folder + timestamp (Cloudinary exclut file/api_key/cloud_name/resource_type).
// Une signature est réutilisable pour tout un lot (mêmes folder + timestamp).
//
// SECRETS REQUIS (déjà présents sur le projet) :
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), ADMIN_EMAILS
//
// DÉPLOIEMENT : supabase functions deploy cloudinary-sign --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const ADMIN_EMAILS   = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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

async function requireAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return false;
  const email = (data.user.email || "").toLowerCase();
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) return false;
  return true;
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
