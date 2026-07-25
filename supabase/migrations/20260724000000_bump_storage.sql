-- ════════════════════════════════════════════════════════════
-- 📏 COMPTEUR DE STOCKAGE ATOMIQUE — bump_storage (delta, phase 2)
-- ════════════════════════════════════════════════════════════
-- Objectif : compter les octets AU MOMENT où ils bougent, au lieu de
-- rescanner tout le bucket. Trois écrivains l'appellent avec un delta
-- (positif ou négatif) :
--   • b2-sign          → +taille à chaque upload
--   • worker d'encodage → +HLS créé − anciens HLS purgés
--   • (réservé)         → autres écritures serveur
--
-- Pourquoi une RPC et pas un UPDATE côté code : l'incrément lecture-
-- écriture (SELECT puis UPDATE) peut se PERDRE quand deux uploads
-- arrivent en même temps (le 2ᵉ écrase le 1ᵉʳ). Ici l'UPDATE est un seul
-- ordre SQL atomique : aucune perte, même en simultané.
--
-- ⚠️ SÉCURITÉ : cette fonction change l'usage facturable. Un client qui
-- pourrait l'appeler avec un delta NÉGATIF remettrait son compteur à zéro
-- et contournerait son quota. On la verrouille donc au SEUL service_role
-- (le serveur) : jamais anon ni authenticated.
--
-- Le plancher à 0 (greatest) évite un compteur négatif si un delta de
-- suppression arrive avant l'ajout correspondant.
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════

create or replace function public.bump_storage(p_agency uuid, p_delta bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.agencies
     set storage_used_bytes = greatest(0, coalesce(storage_used_bytes, 0) + p_delta)
   where id = p_agency
  returning storage_used_bytes;
$$;

-- Verrou d'accès : uniquement le serveur (service_role).
revoke execute on function public.bump_storage(uuid, bigint) from public, anon, authenticated;
grant  execute on function public.bump_storage(uuid, bigint) to service_role;

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution : b2-sign et le worker utilisent automatiquement la
--    RPC (repli lecture-écriture tant qu'elle n'existe pas — donc aucun
--    ordre de déploiement imposé). Le scan complet reste le contrôle
--    périodique qui corrige toute dérive résiduelle.
-- ════════════════════════════════════════════════════════════
