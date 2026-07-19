-- ════════════════════════════════════════════════════════════
-- 🏢 MIGRATION SaaS B.1 — Fondation multi-tenant (marque blanche)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS. Idempotente. Aucune donnée supprimée, aucun
-- comportement client modifié (les lectures publiques restent en place
-- jusqu'à B.2 — voir files/SAAS-ROADMAP.md).
--
-- Contenu :
--   1) agencies (locataires, avec champs de marque blanche) + membres
--   2) TimelessHouse = 1ʳᵉ agence ; Gil = owner ; backfill intégral
--   3) agency_id sur 18 tables produit + 4 tables enfants + index
--   4) triggers : agency_id auto-rempli à l'insertion (aucun code admin
--      à changer ; couvre aussi les Edge Functions en service role)
--   5) écritures cloisonnées par agence (remplace « tout utilisateur
--      authentifié peut tout écrire »)
-- Hors périmètre produit (restent propres à TimelessHouse) :
--   photobooth_*, portfolio_*, paid_videos, purchases, ai_actions_log.
-- ════════════════════════════════════════════════════════════

-- ── 1) Locataires + membres ─────────────────────────────────
create table if not exists agencies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- « Studio Lumière »
  slug          text unique not null,             -- « studio-lumiere » (URLs, dossiers B2)
  contact_email text,
  logo_url      text,                             -- marque blanche
  accent_color  text default '#2a2620',
  bg_color      text default '#e9e4d9',
  plan          text default 'fondateur',         -- offre (Stripe en B.3)
  active        boolean default true,
  created_at    timestamptz default now()
);
create table if not exists agency_members (
  agency_id  uuid references agencies(id) on delete cascade,
  user_id    uuid not null,                       -- auth.users
  role       text default 'owner' check (role in ('owner','admin')),
  created_at timestamptz default now(),
  primary key (agency_id, user_id)
);
alter table agencies       enable row level security;
alter table agency_members enable row level security;
drop policy if exists "members read own agency" on agencies;
create policy "members read own agency" on agencies for select to authenticated
  using (id in (select agency_id from agency_members where user_id = auth.uid()));
drop policy if exists "members read own membership" on agency_members;
create policy "members read own membership" on agency_members for select to authenticated
  using (user_id = auth.uid());

-- ── 2) TimelessHouse = première agence, Gil = owner ─────────
insert into agencies (name, slug, contact_email)
select 'TimelessHouse', 'timelesshouse', 'service@timelesshouse.org'
where not exists (select 1 from agencies where slug = 'timelesshouse');
insert into agency_members (agency_id, user_id, role)
select id, 'd033a7d6-df51-43c6-ba22-80e20cc886a1', 'owner' from agencies where slug = 'timelesshouse'
on conflict do nothing;

-- Aide : liste des agences de l'utilisateur connecté (pour les policies)
create or replace function my_agency_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select agency_id from agency_members where user_id = auth.uid() $$;

-- ── 3) agency_id partout + backfill + index ─────────────────
do $$
declare
  th uuid := (select id from agencies where slug = 'timelesshouse');
  t  text;
begin
  -- clients : rattachés directement à l'agence
  execute 'alter table clients add column if not exists agency_id uuid references agencies(id)';
  execute format('update clients set agency_id = %L where agency_id is null', th);

  -- tables portant client_id : agence héritée du client
  foreach t in array array['ad_creatives','ai_insights','analytics','campaigns','competitors',
    'conversions','documents','event_pages','invoices','media','notifications','shoots',
    'social_accounts','social_alerts','social_posts','social_stat_snapshots','strategies'] loop
    execute format('alter table %I add column if not exists agency_id uuid references agencies(id)', t);
    execute format('update %I x set agency_id = c.agency_id from clients c where x.client_id = c.id and x.agency_id is null', t);
    execute format('create index if not exists %I on %I (agency_id)', t || '_agency_idx', t);
  end loop;

  -- tables enfants : agence héritée du parent
  execute 'alter table media_comments add column if not exists agency_id uuid references agencies(id)';
  execute 'update media_comments x set agency_id = m.agency_id from media m where x.media_id = m.id and x.agency_id is null';
  execute 'alter table campaign_posts add column if not exists agency_id uuid references agencies(id)';
  execute 'update campaign_posts x set agency_id = p.agency_id from campaigns p where x.campaign_id = p.id and x.agency_id is null';
  execute 'alter table competitor_snapshots add column if not exists agency_id uuid references agencies(id)';
  execute 'update competitor_snapshots x set agency_id = p.agency_id from competitors p where x.competitor_id = p.id and x.agency_id is null';
  execute 'alter table post_metrics_history add column if not exists agency_id uuid references agencies(id)';
  execute 'update post_metrics_history x set agency_id = p.agency_id from social_posts p where x.post_id = p.id and x.agency_id is null';
  execute 'create index if not exists clients_agency_idx on clients (agency_id)';
end $$;

-- ── 4) Triggers : agency_id auto-rempli à l'insertion ───────
-- clients : depuis l'appartenance de l'utilisateur connecté
create or replace function trg_agency_from_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then
    select agency_id into new.agency_id from agency_members where user_id = auth.uid() limit 1;
  end if;
  return new;
end $$;
drop trigger if exists set_agency on clients;
create trigger set_agency before insert on clients
  for each row execute function trg_agency_from_membership();

-- lignes rattachées à un client : depuis le client (fonctionne pour
-- l'admin ET pour les Edge Functions en service role, qui portent
-- toujours client_id mais n'ont pas d'auth.uid())
create or replace function trg_agency_from_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null and new.client_id is not null then
    select agency_id into new.agency_id from clients where id = new.client_id;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['ad_creatives','ai_insights','analytics','campaigns','competitors',
    'conversions','documents','event_pages','invoices','media','notifications','shoots',
    'social_accounts','social_alerts','social_posts','social_stat_snapshots','strategies'] loop
    execute format('drop trigger if exists set_agency on %I', t);
    execute format('create trigger set_agency before insert on %I for each row execute function trg_agency_from_client()', t);
  end loop;
end $$;

-- enfants : depuis leur parent
create or replace function trg_agency_from_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then
    if tg_table_name = 'media_comments' then
      select agency_id into new.agency_id from media where id = new.media_id;
    elsif tg_table_name = 'campaign_posts' then
      select agency_id into new.agency_id from campaigns where id = new.campaign_id;
    elsif tg_table_name = 'competitor_snapshots' then
      select agency_id into new.agency_id from competitors where id = new.competitor_id;
    elsif tg_table_name = 'post_metrics_history' then
      select agency_id into new.agency_id from social_posts where id = new.post_id;
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['media_comments','campaign_posts','competitor_snapshots','post_metrics_history'] loop
    execute format('drop trigger if exists set_agency on %I', t);
    execute format('create trigger set_agency before insert on %I for each row execute function trg_agency_from_parent()', t);
  end loop;
end $$;

-- ── 5) Écritures cloisonnées par agence ─────────────────────
-- Remplace toutes les politiques « ALL » (« tout utilisateur authentifié
-- peut tout écrire ») par « membre de l'agence de la ligne uniquement ».
-- Les lectures publiques (SELECT) restent INCHANGÉES jusqu'à B.2.
-- media_comments : les invités postent des commentaires avec la clé anon
-- → sa politique d'écriture actuelle est conservée telle quelle.
do $$
declare
  t text; pol record;
begin
  foreach t in array array['clients','ad_creatives','ai_insights','analytics','campaigns','competitors',
    'conversions','documents','event_pages','invoices','media','notifications','shoots',
    'social_accounts','social_alerts','social_posts','social_stat_snapshots','strategies',
    'campaign_posts','competitor_snapshots','post_metrics_history'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd = 'ALL' loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    execute format(
      'create policy "agency write" on %I for all to authenticated
         using (agency_id in (select my_agency_ids()))
         with check (agency_id in (select my_agency_ids()))', t);
  end loop;
end $$;

-- ✅ B.1 TERMINÉE — écritures isolées par agence, schéma prêt.
--    B.2 : isolation des LECTURES (accès client par RPC scellé, fin des
--    politiques « lecture publique ») — OBLIGATOIRE avant d'accueillir
--    la première agence externe. Voir files/SAAS-ROADMAP.md.
