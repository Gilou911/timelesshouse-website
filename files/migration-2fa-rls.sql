-- ═══════════════════════════════════════════════════════════════════
--  2FA AU NIVEAU DE LA BASE — le code exigé par les policies, plus
--  seulement par la porte de l'application
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  La double vérification vivait à la porte de la console : après le
--  mot de passe, l'app réclame le code à 6 chiffres. Mais quelqu'un qui
--  AURAIT le mot de passe pouvait ignorer l'app et interroger l'API
--  PostgREST directement avec sa session de niveau 1 — la RLS ne
--  regardait pas le niveau d'assurance. Ce verrou-là se pose ICI.
--
--  LE CONTRAT, en une phrase : un compte SANS 2FA ne change pas d'un
--  poil ; un compte AVEC 2FA vérifiée n'accède à RIEN tant que sa
--  session n'est pas de niveau aal2 (mot de passe + code).
--
--  QUI N'EST PAS CONCERNÉ :
--    · les visiteurs et clients finaux (rôle anon) — la policy ne vise
--      que `authenticated` ;
--    · les RPC scellées (security definer) et le worker (service_role),
--      qui passent hors RLS — les galeries, espaces clients et
--      encodages ne voient aucune différence.
--
--  POLICY « RESTRICTIVE » : elle s'AJOUTE en ET logique aux policies
--  existantes, elle n'en remplace aucune. C'est le motif documenté par
--  Supabase pour l'application stricte du MFA.
-- ═══════════════════════════════════════════════════════════════════

-- Le juge : la session satisfait-elle le niveau exigé par le compte ?
--   · aucun facteur vérifié  → aal1 comme aal2 passent (rien ne change)
--   · au moins un facteur    → seule une session aal2 passe
-- SECURITY DEFINER : auth.mfa_factors n'est pas lisible par le rôle
-- authenticated — le juge lit à sa place, et ne renvoie qu'un booléen.
create or replace function public.aal_satisfait() returns boolean
language sql stable security definer set search_path = ''
as $$
  -- coalesce : un jeton sans revendication aal (n'existe plus, mais un
  -- null verrouillerait TOUT le monde) vaut le niveau 1 d'origine.
  select array[(select coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
    select case when count(id) > 0 then array['aal2']
                else array['aal1', 'aal2'] end
    from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
$$;
revoke execute on function public.aal_satisfait() from public, anon;
grant execute on function public.aal_satisfait() to authenticated;

-- La même policy restrictive sur TOUTE table de `public` où la RLS est
-- active — aujourd'hui et à chaque ré-exécution de ce fichier. Une
-- table créée APRÈS cette migration n'est pas couverte tant qu'on ne la
-- rejoue pas : la rejouer fait partie de toute future migration qui
-- crée une table (note ajoutée aux habitudes).
do $$
declare t record;
begin
  for t in
    select c.relname as nom
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "exige aal2 quand la 2FA est active" on public.%I', t.nom);
    execute format(
      'create policy "exige aal2 quand la 2FA est active" on public.%I '
      || 'as restrictive for all to authenticated '
      -- (select …) et non l'appel nu : Postgres le fige en InitPlan,
      -- une évaluation par requête au lieu d'une par ligne.
      || 'using ((select public.aal_satisfait()))', t.nom);
  end loop;
end $$;

-- Contrôle : la liste des tables désormais verrouillées.
select tablename
from pg_policies
where policyname = 'exige aal2 quand la 2FA est active'
order by tablename;
