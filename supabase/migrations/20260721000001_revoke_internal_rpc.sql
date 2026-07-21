-- ════════════════════════════════════════════════════════════
-- 🔐 DURCISSEMENT #2 — RPC internes exposées à anon (21/07/2026)
-- ════════════════════════════════════════════════════════════
-- Issu de l'audit des droits EXECUTE (rls-inspect.sql, requête 2).
-- Ces deux fonctions écrivent des données mais étaient exécutables par
-- `anon` — aucune page du repo ne les appelle (fonctionnalité boutique
-- externe). Un flux de paiement légitime tourne en service_role (non
-- affecté par ces REVOKE).
--
-- ⚠️ AVANT D'APPLIQUER : si une app boutique séparée appelle l'une de ces
-- fonctions avec la clé anon, adapte (garder anon là où c'est voulu).
-- À exécuter dans Supabase → SQL Editor. Idempotent (DO … EXCEPTION).
-- ════════════════════════════════════════════════════════════

-- recompute_post_derived_metrics : recalcul INTERNE de métriques.
-- Ne devrait être déclenché ni par anon ni par un client authentifié.
do $$ begin
  execute 'revoke execute on function public.recompute_post_derived_metrics(uuid) from anon, authenticated';
exception when undefined_function then raise notice 'recompute_post_derived_metrics(uuid) absente — ignoré'; end $$;

-- increment_video_sales : incrément de compteur de ventes. Ne doit venir
-- que d'un flux de paiement côté serveur (service_role), jamais du client.
do $$ begin
  execute 'revoke execute on function public.increment_video_sales() from anon, authenticated';
exception when undefined_function then raise notice 'increment_video_sales() absente — ignoré'; end $$;

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution, relancer la requête 2 de rls-inspect.sql :
--    ces deux fonctions ne doivent plus apparaître pour anon.
-- ════════════════════════════════════════════════════════════
