// ════════════════════════════════════════════════════════════
// 👥  EDGE FUNCTION — team-member
// ════════════════════════════════════════════════════════════
// L'équipe d'une agence : inviter un coéquipier (compte + rattachement),
// modifier son prénom / métier / rôle, le retirer. Appelée par
// l'onglet « Équipe » de la console.
//
// POST { action: "invite", email, display_name?, metier?, role? }
//   → { ok, member: { email, user_id, temp_password|null, existing_account } }
// POST { action: "update", user_id, display_name?, metier?, role? }
// POST { action: "remove", user_id }
//
// RÈGLES (vérifiées ICI, l'interface n'est qu'une politesse) :
//   ▸ l'appelant est OWNER ou ADMIN de son agence (JWT rejoué) ;
//   ▸ un admin ne gère que des « membre » ; créer ou promouvoir un
//     « admin » est réservé au propriétaire ;
//   ▸ les OWNERS ne se gèrent pas ici (c'est la plateforme qui les
//     crée) — et personne ne se cible soi-même ;
//   ▸ retirer = retirer le RATTACHEMENT. Le compte survit : il peut
//     appartenir à une autre agence, et rien d'irréversible ne se
//     joue sur un clic.
//   ▸ le mot de passe temporaire est renvoyé UNE fois, jamais stocké.
//
// DÉPLOIEMENT :
//   supabase functions deploy team-member --no-verify-jwt \
//     --project-ref vpbxeqjvaeiytxcpilxf
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Les privilèges qu'un rôle « membre » peut recevoir (owner/admin ont
// tout). Le rang plancher — liste vide — n'a que le chat, l'agenda et
// ses tâches.
const PRIVILEGES_VALIDES = ["clients"];

// Même recette que create-agency : lisible mais fort (~77 bits).
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  // ── L'appelant : owner ou admin de SON agence ──
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Session requise." });
  const { data: who, error: wErr } = await sbAdmin.auth.getUser(jwt);
  if (wErr || !who?.user) return json(401, { error: "Session invalide." });
  const { data: mienRows } = await sbAdmin
    .from("agency_members").select("agency_id, role")
    .eq("user_id", who.user.id).in("role", ["owner", "admin"]).limit(1);
  const mien = mienRows?.[0];
  if (!mien) return json(403, { error: "Réservé au propriétaire ou à un admin de l'agence." });
  const agencyId = mien.agency_id as string;
  const patron = mien.role === "owner";

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }
  const action = String(body.action || "");

  const displayName = String(body.display_name ?? "").trim().slice(0, 60) || null;
  const metier = String(body.metier ?? "").trim().slice(0, 60) || null;
  // Privilèges demandés : seules les valeurs connues passent. `null`
  // quand le corps n'en parle pas — un update qui ne touche pas aux
  // privilèges ne doit pas les effacer.
  const privilegesDemandes = Array.isArray(body.privileges)
    ? [...new Set(body.privileges.map(String).filter((p) => PRIVILEGES_VALIDES.includes(p)))]
    : null;

  // ── Inviter ─────────────────────────────────────────────────
  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Email invalide." });
    const role = body.role === "admin" ? "admin" : "membre";
    if (role === "admin" && !patron) {
      return json(403, { error: "Seul le propriétaire peut créer un admin." });
    }

    // Compte réutilisé s'il existe (il peut venir d'une autre agence).
    let userId: string | null = null;
    let temp: string | null = null;
    let existing = false;
    const { data: existingId } = await sbAdmin.rpc("admin_user_id_by_email", { p_email: email });
    if (existingId) {
      userId = existingId as string;
      existing = true;
      const { data: deja } = await sbAdmin.from("agency_members")
        .select("user_id").eq("agency_id", agencyId).eq("user_id", userId).limit(1);
      if (deja?.length) return json(409, { error: "Ce compte fait déjà partie de l'équipe." });
    } else {
      temp = tempPassword();
      const { data: created, error: cErr } = await sbAdmin.auth.admin.createUser({
        email, password: temp, email_confirm: true,
      });
      if (cErr || !created?.user) return json(500, { error: `Création du compte impossible : ${cErr?.message || "?"}` });
      userId = created.user.id;
    }

    // Rang plancher par défaut : un membre naît sans privilège. Et si
    // la colonne n'existe pas encore (migration non passée), on
    // réessaie SANS — PostgREST rejette la requête entière sinon.
    let { error: mErr } = await sbAdmin.from("agency_members").insert({
      agency_id: agencyId, user_id: userId, role,
      display_name: displayName, metier,
      ...(privilegesDemandes ? { privileges: privilegesDemandes } : {}),
    });
    if (mErr && privilegesDemandes && /privileges/.test(mErr.message || "")) {
      ({ error: mErr } = await sbAdmin.from("agency_members").insert({
        agency_id: agencyId, user_id: userId, role,
        display_name: displayName, metier,
      }));
    }
    if (mErr) {
      // rollback : ne pas laisser un compte orphelin qu'on vient de créer
      if (!existing && userId) await sbAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: `Rattachement impossible : ${mErr.message}` });
    }
    return json(200, {
      ok: true,
      member: { email, user_id: userId, temp_password: temp, existing_account: existing },
    });
  }

  // ── Modifier / retirer : mêmes gardes sur la cible ──────────
  if (action === "update" || action === "remove") {
    const targetId = String(body.user_id || "");
    if (!targetId) return json(400, { error: "user_id manquant" });
    if (targetId === who.user.id) return json(400, { error: "On ne se gère pas soi-même ici." });
    const { data: cibleRows } = await sbAdmin.from("agency_members")
      .select("user_id, role").eq("agency_id", agencyId).eq("user_id", targetId).limit(1);
    const cible = cibleRows?.[0];
    if (!cible) return json(404, { error: "Ce compte n'est pas dans l'équipe." });
    if (cible.role === "owner") return json(403, { error: "Les propriétaires ne se gèrent pas ici." });
    if (!patron && cible.role !== "membre") {
      return json(403, { error: "Un admin ne gère que les membres." });
    }

    if (action === "remove") {
      const { error } = await sbAdmin.from("agency_members")
        .delete().eq("agency_id", agencyId).eq("user_id", targetId);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    // update : le prénom, le métier et les PRIVILÈGES pour tous les
    // gestionnaires (owner comme admin — accorder un privilège à un
    // membre fait partie de gérer les membres) ; le RÔLE, lui, ne
    // bouge que sous la main du propriétaire.
    const patch: Record<string, unknown> = { display_name: displayName, metier };
    if (privilegesDemandes) patch.privileges = privilegesDemandes;
    if (patron && (body.role === "admin" || body.role === "membre")) patch.role = body.role;
    let { error } = await sbAdmin.from("agency_members")
      .update(patch).eq("agency_id", agencyId).eq("user_id", targetId);
    // Colonne pas encore migrée : on garde le reste de la mise à jour.
    if (error && privilegesDemandes && /privileges/.test(error.message || "")) {
      delete patch.privileges;
      ({ error } = await sbAdmin.from("agency_members")
        .update(patch).eq("agency_id", agencyId).eq("user_id", targetId));
    }
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: `Action inconnue : ${action || "(vide)"}` });
});
