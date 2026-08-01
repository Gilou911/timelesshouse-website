-- ═══════════════════════════════════════════════════════════════════
--  PRIVILÈGES, ACTE II — l'audit de cohérence de l'Équipe
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--  (Suppose migration-privileges.sql passée : la colonne privileges.)
--
--  Audit demandé par Gil (01/08/2026, capture du membre plancher) :
--    · « Donner des tâches » devient un privilège (`taches`) — sans
--      lui, un membre ne crée des tâches QUE pour lui-même, ne coche
--      que les siennes, n'efface que celles qu'il a créées ;
--    · découvert en route : un plancher pouvait PROGRAMMER, MODIFIER
--      et SUPPRIMER des posts et des sorties → privilège `posts` ;
--    · les tâches ne savaient pas QUI les avait créées → `cree_par` ;
--    · le scellé « écrire est un privilège clients » ne couvrait que
--      clients et media → étendu à galleries, documents, shoots.

-- ═══ 1. QUI A CRÉÉ LA TÂCHE ════════════════════════════════════════
-- Sans mémoire du créateur, impossible de dire « chacun efface les
-- siennes ». Les tâches d'avant restent orphelines (NULL) : seuls
-- owner/admin et les membres privilégiés peuvent les effacer.
alter table tasks add column if not exists cree_par uuid default auth.uid();

comment on column tasks.cree_par is
  'Créateur de la tâche (auth.uid() à l''insertion). NULL = créée avant cette migration, ou par le serveur.';

-- ═══ 2. LES ÉCRITURES « CLIENTS », EN BOUCLE ═══════════════════════
-- Remplace (mêmes noms) et étend les policies de l'acte I : écrire
-- sur les espaces clients et tout ce qui s'y livre exige le
-- privilège `clients`. La lecture n'est jamais touchée.
do $$
declare t text;
begin
  -- Tables portant agency_id en direct.
  foreach t in array array['clients', 'galleries'] loop
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (insert)', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (insert)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (update)', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (update)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (delete)', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (delete)', t, t);
  end loop;
  -- Tables rattachées par client_id.
  foreach t in array array['media', 'documents', 'shoots'] loop
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (insert)', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check '
      || '(not exists (select 1 from agency_members am join clients c on c.id = %I.client_id '
      || 'where am.user_id = auth.uid() and am.agency_id = c.agency_id '
      || 'and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (insert)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (update)', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using '
      || '(not exists (select 1 from agency_members am join clients c on c.id = %I.client_id '
      || 'where am.user_id = auth.uid() and am.agency_id = c.agency_id '
      || 'and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (update)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (delete)', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using '
      || '(not exists (select 1 from agency_members am join clients c on c.id = %I.client_id '
      || 'where am.user_id = auth.uid() and am.agency_id = c.agency_id '
      || 'and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (delete)', t, t);
  end loop;
end $$;

-- ═══ 3. LES PUBLICATIONS : PRIVILÈGE `posts` ═══════════════════════
-- Programmer, modifier, supprimer un post ou une sortie, cocher
-- « publié » — l'éditorial. La lecture reste : l'agenda du plancher
-- doit continuer de MONTRER ce qui se prépare.
drop policy if exists "posts: publier est un privilège (insert)" on posts;
create policy "posts: publier est un privilège (insert)" on posts
  as restrictive for insert to authenticated
  with check (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = posts.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));
drop policy if exists "posts: publier est un privilège (update)" on posts;
create policy "posts: publier est un privilège (update)" on posts
  as restrictive for update to authenticated
  using (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = posts.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));
drop policy if exists "posts: publier est un privilège (delete)" on posts;
create policy "posts: publier est un privilège (delete)" on posts
  as restrictive for delete to authenticated
  using (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = posts.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));

drop policy if exists "sorties: publier est un privilège (insert)" on post_sorties;
create policy "sorties: publier est un privilège (insert)" on post_sorties
  as restrictive for insert to authenticated
  with check (not exists (
    select 1 from agency_members am
    join posts p on p.id = post_sorties.post_id
    where am.user_id = auth.uid() and am.agency_id = p.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));
drop policy if exists "sorties: publier est un privilège (update)" on post_sorties;
create policy "sorties: publier est un privilège (update)" on post_sorties
  as restrictive for update to authenticated
  using (not exists (
    select 1 from agency_members am
    join posts p on p.id = post_sorties.post_id
    where am.user_id = auth.uid() and am.agency_id = p.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));
drop policy if exists "sorties: publier est un privilège (delete)" on post_sorties;
create policy "sorties: publier est un privilège (delete)" on post_sorties
  as restrictive for delete to authenticated
  using (not exists (
    select 1 from agency_members am
    join posts p on p.id = post_sorties.post_id
    where am.user_id = auth.uid() and am.agency_id = p.agency_id
      and am.role = 'membre' and not ('posts' = any(am.privileges))));

-- ═══ 4. LES TÂCHES : PRIVILÈGE `taches` ════════════════════════════
-- Sans lui, un membre : crée pour LUI-MÊME, coche LES SIENNES,
-- efface CE QU'IL A CRÉÉ. Avec lui (ou owner/admin) : tout.
drop policy if exists "taches: donner est un privilège (insert)" on tasks;
create policy "taches: donner est un privilège (insert)" on tasks
  as restrictive for insert to authenticated
  with check (
    assigne_a = auth.uid()
    or not exists (
      select 1 from agency_members am
      where am.user_id = auth.uid() and am.agency_id = tasks.agency_id
        and am.role = 'membre' and not ('taches' = any(am.privileges))));
drop policy if exists "taches: donner est un privilège (update)" on tasks;
create policy "taches: donner est un privilège (update)" on tasks
  as restrictive for update to authenticated
  using (
    assigne_a = auth.uid()
    or not exists (
      select 1 from agency_members am
      where am.user_id = auth.uid() and am.agency_id = tasks.agency_id
        and am.role = 'membre' and not ('taches' = any(am.privileges))));
drop policy if exists "taches: donner est un privilège (delete)" on tasks;
create policy "taches: donner est un privilège (delete)" on tasks
  as restrictive for delete to authenticated
  using (
    cree_par = auth.uid()
    or not exists (
      select 1 from agency_members am
      where am.user_id = auth.uid() and am.agency_id = tasks.agency_id
        and am.role = 'membre' and not ('taches' = any(am.privileges))));

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : cree_par = 1, et 24 policies de privilège
-- (5 tables clients × 3 + posts 3 + sorties 3 + taches 3).
select 'colonne cree_par' as controle, count(*)::text as valeur
  from information_schema.columns
 where table_name = 'tasks' and column_name = 'cree_par'
union all
select 'policies de privilège', count(*)::text from pg_policies
 where policyname like '%privilège%';
