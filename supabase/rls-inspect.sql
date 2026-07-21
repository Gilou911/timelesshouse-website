-- ════════════════════════════════════════════════════════════
-- 🔎 GÉNÉRATEUR — export de l'état RÉEL des RLS + grants
-- ════════════════════════════════════════════════════════════
-- Contourne l'absence de Docker/pg_dump en local : à exécuter dans
-- Supabase → SQL Editor. Ce sont des SELECT (aucune modification).
--
-- Copie la colonne `ddl` du résultat de la REQUÊTE 1 → c'est le vrai
-- schéma de sécurité de production. Colle-le dans un fichier
-- supabase/migrations/00000000000000_baseline_rls.sql (le versionner
-- ferme le point #3 de l'audit : les RLS ne vivront plus seulement
-- dans le dashboard).
--
-- La REQUÊTE 2 audite qui (anon/authenticated) peut exécuter chaque
-- fonction — utile pour confirmer les REVOKE du 21/07 et repérer
-- d'éventuelles autres RPC trop ouvertes.
-- ════════════════════════════════════════════════════════════

-- ── REQUÊTE 1 : RLS activée + toutes les politiques, en DDL ──────────
with lines as (
  select 0 as ord, 0 as sub, t.tablename,
         '-- ' || t.tablename || ' : RLS ' ||
         case when t.rowsecurity then 'ACTIVÉE' else '⚠️ DÉSACTIVÉE' end as ddl
  from pg_tables t where t.schemaname = 'public'
  union all
  select 1, 0, t.tablename,
         'alter table public.' || quote_ident(t.tablename) || ' enable row level security;'
  from pg_tables t
  where t.schemaname = 'public'
    and exists (select 1 from pg_policies p
                where p.schemaname = 'public' and p.tablename = t.tablename)
  union all
  select 2, 0, p.tablename,
         'create policy ' || quote_literal(p.policyname) ||
         ' on public.' || quote_ident(p.tablename) ||
         ' as ' || lower(p.permissive) ||
         ' for ' || lower(p.cmd) ||
         ' to ' || array_to_string(p.roles, ', ') ||
         coalesce(' using (' || p.qual || ')', '') ||
         coalesce(' with check (' || p.with_check || ')', '') || ';'
  from pg_policies p where p.schemaname = 'public'
)
select ddl from lines order by tablename, ord, sub;

-- ── REQUÊTE 2 : droits EXECUTE anon/authenticated sur les fonctions ──
-- (à lancer séparément) — repère toute RPC exécutable par anon.
select p.proname
         || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fonction,
       string_agg(r.rolname, ', ' order by r.rolname)               as executable_par
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) r(rolname)
where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
group by p.proname, p.oid
order by
  -- les fonctions exécutables par anon en premier (à surveiller)
  (string_agg(r.rolname, ',') like '%anon%') desc, p.proname;
