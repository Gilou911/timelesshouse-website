// ════════════════════════════════════════════════════════════
// 🛡  EDGE FUNCTION — admin-mfa-reset
// ════════════════════════════════════════════════════════════
// Retire la double vérification (tous les facteurs TOTP) d'un compte
// locataire — le geste de secours quand un patron d'agence a perdu son
// téléphone et ne peut plus entrer. Son compte repasse en mot de passe
// seul ; il réactive la 2FA depuis ses Paramètres quand il veut.
//
// POST { email }  →  { ok: true, retires: n }
//
// GARDE-FOUS :
//   ▸ réservé au PROPRIÉTAIRE DE LA PLATEFORME : le JWT de l'appelant
//     est rejoué contre platform_is_owner() — la même garde que la
//     section Agences. Un patron d'agence ne peut PAS retirer la 2FA
//     d'une autre agence (ni de la sienne) par ici.
//   ▸ la clé service ne sert qu'APRÈS ce contrôle, et uniquement pour
//     lister puis supprimer les facteurs du compte visé.
//   ▸ réponse identique que le compte existe ou non (pas d'énumération).
//
// DÉPLOIEMENT :
//   supabase functions deploy admin-mfa-reset --no-verify-jwt
//   (le contrôle d'identité est DANS le code, comme b2-sign)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusAal } from "../_shared/aal.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const admin = (chemin: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/auth/v1${chemin}`, {
    ...init,
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  // ── 1. L'appelant est-il le propriétaire de la plateforme ? ──
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return json(401, { error: "Session requise." });
  const sbAppelant = createClient(SB_URL, SB_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const { data: estProprio, error: eProprio } = await sbAppelant.rpc("platform_is_owner");
  if (eProprio || estProprio !== true) {
    return json(403, { error: "Réservé au propriétaire de la plateforme." });
  }
  /* Le verrou 2FA vaut ICI aussi (audit du 07/08) : sans ce contrôle,
     une session ouverte avec le mot de passe SEUL pouvait appeler cette
     fonction et supprimer les facteurs — la double vérification se
     désarmait elle-même. C'est le même juge qu'en base. */
  const refus2fa = await refusAal(jeton, cors);
  if (refus2fa) return refus2fa;

  // ── 2. Le compte visé ──
  const { email } = await req.json().catch(() => ({}));
  const cible = String(email || "").trim().toLowerCase();
  if (!cible || !cible.includes("@")) return json(400, { error: "Email manquant." });

  // GoTrue ne filtre pas par email de façon fiable : on parcourt. Les
  // comptes se comptent en dizaines — le jour où ils se compteront en
  // dizaines de milliers, ce parcours sera le cadet de nos soucis.
  let utilisateur: { id: string } | null = null;
  for (let page = 1; page <= 20 && !utilisateur; page++) {
    const r = await admin(`/admin/users?page=${page}&per_page=200`);
    if (!r.ok) return json(502, { error: "Le registre des comptes ne répond pas." });
    const { users } = await r.json();
    if (!users?.length) break;
    utilisateur = users.find((u: { email?: string }) =>
      (u.email || "").toLowerCase() === cible) || null;
  }

  // Réponse IDENTIQUE compte trouvé sans facteur / compte inconnu : le
  // propriétaire connaît ses locataires, mais autant ne rien confirmer.
  if (!utilisateur) return json(200, { ok: true, retires: 0 });

  // ── 3. Retirer chaque facteur — l'endpoint DÉDIÉ, le seul fiable
  //      (le champ `factors` de la liste des users est paresseux). ──
  const rF = await admin(`/admin/users/${utilisateur.id}/factors`);
  if (!rF.ok) return json(502, { error: "Lecture des facteurs impossible." });
  const facteurs: { id: string }[] = (await rF.json()) || [];

  let retires = 0;
  for (const f of facteurs) {
    const rD = await admin(`/admin/users/${utilisateur.id}/factors/${f.id}`, { method: "DELETE" });
    if (rD.ok) retires++;
  }
  return json(200, { ok: true, retires });
});
