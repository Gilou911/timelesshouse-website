// ════════════════════════════════════════════════════════════
// 🔒  LE VERROU 2FA VAUT AUSSI POUR LES FONCTIONS
// ════════════════════════════════════════════════════════════
// La migration du 21/07 (files/migration-2fa-rls.sql) pose sur chaque
// table une policy restrictive : « un compte AVEC 2FA vérifiée n'accède
// à RIEN tant que sa session n'est pas de niveau aal2 ». Ce contrat
// s'arrêtait au bord de PostgREST.
//
// Les Edge Functions, elles, agissent avec la CLÉ SERVICE — hors RLS.
// Une session obtenue avec le mot de passe seul (aal1) y était donc
// pleinement acceptée : elle pouvait encore signer des URLs B2, promouvoir
// un admin, et même appeler admin-mfa-reset pour retirer la 2FA qu'elle
// aurait dû franchir. Le verrou se referme ici.
//
// LE JUGE EST LE MÊME QU'EN BASE : la fonction scellée public.aal_satisfait(),
// appelée AVEC LE JETON DE L'APPELANT (jamais la clé service — sinon elle
// jugerait le service au lieu de l'humain). Une seule règle, un seul endroit.
//
// USAGE dans une fonction, juste après avoir authentifié l'appelant :
//     const refus = await refusAal(jeton);
//     if (refus) return refus;
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** La session satisfait-elle le niveau exigé par le compte ? */
export async function aalSatisfait(jeton: string): Promise<boolean> {
  if (!jeton) return false;
  const sbAppelant = createClient(SB_URL, SB_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const { data, error } = await sbAppelant.rpc("aal_satisfait");
  if (error) {
    // Le juge absent (migration non rejouée sur cet environnement) : la
    // base elle-même ne verrouille alors rien non plus — on ne ferme pas
    // une porte que le reste de la maison laisse ouverte, mais on le dit.
    if (error.code === "PGRST202" || /does not exist/i.test(error.message || "")) {
      console.error("[aal] public.aal_satisfait() absente — verrou 2FA inactif sur cet environnement.");
      return true;
    }
    /* Toute autre panne (base injoignable, hoquet réseau) : on LAISSE
       PASSER, bruyamment. Ce verrou est une seconde ligne — la policy
       restrictive tient déjà la porte de la base. Refuser sur une panne
       enfermerait toute une agence dehors (plus d'upload, plus d'équipe)
       pour un incident réseau, alors que l'attaque visée, elle, produit
       un verdict NET : une session aal1 en règle à qui le juge répond
       « non ». C'est ce non-là qui bloque. */
    console.error("[aal] juge injoignable — verrou 2FA non appliqué sur cet appel :", error.message);
    return true;
  }
  return data === true;
}

/**
 * Renvoie la réponse de refus si la session n'est pas au niveau exigé,
 * ou `null` si l'appelant peut continuer.
 */
export async function refusAal(jeton: string, cors: Record<string, string> = {}): Promise<Response | null> {
  if (await aalSatisfait(jeton)) return null;
  return new Response(
    JSON.stringify({
      error: "Double vérification requise : reconnectez-vous avec votre code à 6 chiffres.",
      code: "aal2_requis",
    }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
