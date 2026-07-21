-- ════════════════════════════════════════════════════════════
-- 🔐 CORRECTIF de 20260721000001 — REVOKE FROM PUBLIC (21/07/2026)
-- ════════════════════════════════════════════════════════════
-- La migration précédente faisait `REVOKE … FROM anon, authenticated`, sans
-- effet : ces fonctions ont un droit EXECUTE hérité de PUBLIC. On retire donc
-- le droit de PUBLIC (source réelle), puis on le redonne explicitement à
-- service_role pour ne pas casser un flux serveur/trigger légitime.
--
-- ⚠️ Si une app boutique EXTERNE incrémente les ventes côté CLIENT (clé
-- anon/authenticated), ce correctif la bloquera — mais c'est précisément
-- l'abus qu'on veut empêcher (l'incrément doit venir du serveur).
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════

do $$ begin
  execute 'revoke execute on function public.recompute_post_derived_metrics(uuid) from public, anon, authenticated';
  execute 'grant  execute on function public.recompute_post_derived_metrics(uuid) to service_role';
exception when undefined_function then raise notice 'recompute_post_derived_metrics(uuid) absente — ignoré'; end $$;

do $$ begin
  execute 'revoke execute on function public.increment_video_sales() from public, anon, authenticated';
  execute 'grant  execute on function public.increment_video_sales() to service_role';
exception when undefined_function then raise notice 'increment_video_sales() absente — ignoré'; end $$;

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution, relancer la requête 2 de rls-inspect.sql :
--    recompute_post_derived_metrics et increment_video_sales ne doivent
--    plus apparaître du tout (ni anon ni authenticated).
--    is_platform_member peut rester (inoffensive, renvoie false pour anon).
-- ════════════════════════════════════════════════════════════
