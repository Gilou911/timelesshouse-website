-- ═══════════════════════════════════════════════════════════════════
--  PRIVILÈGES DES MEMBRES — le rang plancher, et ce qui s'accorde
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--  (Le chat, lui, vit dans migration-chat-prive.sql — à passer avant
--  si ce n'est pas déjà fait ; le §4 d'ici le détecte sans casser.)
--
--  Constat de Gil (01/08/2026) : un « membre » pouvait encore agir sur
--  les espaces clients. Désormais :
--    · le RANG PLANCHER (membre sans privilège) n'a que le chat,
--      l'agenda et ses tâches — c'est l'interface qui montre, et la
--      BASE qui verrouille (policies restrictives ci-dessous) ;
--    · « Espaces clients » devient un PRIVILÈGE, accordé membre par
--      membre depuis l'onglet Équipe (owner et admin) ;
--    · les FACTURES ne regardent JAMAIS un membre, privilège ou pas —
--      c'est la comptabilité du studio.

-- ═══ 1. LE COFFRE À PRIVILÈGES ═════════════════════════════════════
alter table agency_members
  add column if not exists privileges text[] not null default '{}';

comment on column agency_members.privileges is
  'Privilèges d''un rôle membre (owner/admin ont tout). Valeurs : clients (voir et agir sur les espaces clients). Vide = rang plancher : chat, agenda, ses tâches.';

-- ═══ 2. L'ÉQUIPE ANNONCE LES PRIVILÈGES ════════════════════════════
-- equipe_agence nourrit la console (rôle affiché, menus, bridages) :
-- elle rend désormais aussi les privilèges de chacun.
create or replace function equipe_agence() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', am.user_id,
           'nom', coalesce(nullif(am.display_name, ''), u.email),
           'role', am.role,
           'metier', am.metier,
           'privileges', coalesce(to_jsonb(am.privileges), '[]'::jsonb)) order by am.role, am.created_at), '[]'::jsonb)
    from agency_members am
    join auth.users u on u.id = am.user_id
   where am.agency_id in (select my_agency_ids())
$$;
revoke execute on function equipe_agence() from public, anon;
grant execute on function equipe_agence() to authenticated;

-- ═══ 3. LES VERROUS EN BASE ════════════════════════════════════════
-- RESTRICTIVES : elles s'ajoutent en ET aux policies existantes.
-- Même motif que le verrou 2FA — l'écran cache, la base interdit.

-- Les factures : jamais pour un membre, quel que soit son privilège.
drop policy if exists "les factures ne regardent pas les membres" on invoices;
create policy "les factures ne regardent pas les membres" on invoices
  as restrictive for all to authenticated
  using (not exists (
    select 1 from agency_members am
    join clients c on c.id = invoices.client_id
    where am.user_id = auth.uid()
      and am.agency_id = c.agency_id
      and am.role = 'membre'
  ));

-- Écrire sur les CLIENTS : un privilège. (La lecture reste ouverte :
-- l'agenda et les posts nomment les marques — un calendrier sans noms
-- ne servirait à rien.)
drop policy if exists "clients: écrire est un privilège (insert)" on clients;
create policy "clients: écrire est un privilège (insert)" on clients
  as restrictive for insert to authenticated
  with check (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = clients.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));
drop policy if exists "clients: écrire est un privilège (update)" on clients;
create policy "clients: écrire est un privilège (update)" on clients
  as restrictive for update to authenticated
  using (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = clients.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));
drop policy if exists "clients: écrire est un privilège (delete)" on clients;
create policy "clients: écrire est un privilège (delete)" on clients
  as restrictive for delete to authenticated
  using (not exists (
    select 1 from agency_members am
    where am.user_id = auth.uid() and am.agency_id = clients.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));

-- Écrire sur les MÉDIAS livrés : même privilège (le circuit de
-- validation côté client final passe par les RPC scellées — intact).
drop policy if exists "media: écrire est un privilège (insert)" on media;
create policy "media: écrire est un privilège (insert)" on media
  as restrictive for insert to authenticated
  with check (not exists (
    select 1 from agency_members am
    join clients c on c.id = media.client_id
    where am.user_id = auth.uid() and am.agency_id = c.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));
drop policy if exists "media: écrire est un privilège (update)" on media;
create policy "media: écrire est un privilège (update)" on media
  as restrictive for update to authenticated
  using (not exists (
    select 1 from agency_members am
    join clients c on c.id = media.client_id
    where am.user_id = auth.uid() and am.agency_id = c.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));
drop policy if exists "media: écrire est un privilège (delete)" on media;
create policy "media: écrire est un privilège (delete)" on media
  as restrictive for delete to authenticated
  using (not exists (
    select 1 from agency_members am
    join clients c on c.id = media.client_id
    where am.user_id = auth.uid() and am.agency_id = c.agency_id
      and am.role = 'membre' and not ('clients' = any(am.privileges))
  ));

-- ═══ 4. LE CHAT EN TEMPS RÉEL ══════════════════════════════════════
-- Un message qui arrive pousse l'écran (Realtime) au lieu d'attendre
-- le sondage. Sans effet si la table du chat n'existe pas encore.
do $$ begin
  if to_regclass('public.team_messages') is not null
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'team_messages') then
    alter publication supabase_realtime add table public.team_messages;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : privileges = 1, 7 policies « privilège/membres », et
-- realtime = 1 si le chat est déjà en place.
select 'colonne privileges' as controle, count(*)::text as valeur
  from information_schema.columns
 where table_name = 'agency_members' and column_name = 'privileges'
union all
select 'policies de privilège', count(*)::text from pg_policies
 where policyname like '%privilège%' or policyname like '%membres%'
union all
select 'chat temps réel', count(*)::text from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'team_messages';
