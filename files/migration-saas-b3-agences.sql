-- ════════════════════════════════════════════════════════════
-- 🏢 MIGRATION SaaS B.3 (1ʳᵉ brique) — Création d'agences depuis l'admin
-- ════════════════════════════════════════════════════════════
-- Suite de files/migration-saas-b2.sql. Donne au PROPRIÉTAIRE DE LA
-- PLATEFORME (owner de l'agence « timelesshouse ») une section
-- « Agences » dans son admin : liste + création (l'Edge Function
-- create-agency crée aussi le compte du patron de l'agence).
-- ════════════════════════════════════════════════════════════

-- L'utilisateur connecté est-il propriétaire de la plateforme ?
-- (owner de l'agence racine « timelesshouse » — le SaaS lui appartient)
create or replace function platform_is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from agency_members am
     join agencies a on a.id = am.agency_id
     where am.user_id = auth.uid() and am.role = 'owner' and a.slug = 'timelesshouse') $$;

-- Liste des agences avec compteurs — réservée au propriétaire plateforme.
-- Sert aussi de détecteur côté admin : si l'appel échoue, la section
-- « Agences » n'est simplement pas affichée.
create or replace function platform_list_agencies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not platform_is_owner() then
    raise exception 'réservé au propriétaire de la plateforme';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',            a.id,
    'name',          a.name,
    'slug',          a.slug,
    'plan',          a.plan,
    'active',        a.active,
    'contact_email', a.contact_email,
    'logo_url',      a.logo_url,
    'accent_color',  a.accent_color,
    'bg_color',      a.bg_color,
    'created_at',    a.created_at,
    'clients_count', (select count(*) from clients c where c.agency_id = a.id),
    'owners',        (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
                      from agency_members am join auth.users u on u.id = am.user_id
                      where am.agency_id = a.id and am.role = 'owner')
  ) order by a.created_at) from agencies a), '[]'::jsonb);
end $$;
revoke execute on function platform_is_owner()      from public, anon;
revoke execute on function platform_list_agencies() from public, anon;
grant  execute on function platform_is_owner()      to authenticated;
grant  execute on function platform_list_agencies() to authenticated;

-- Helper pour l'Edge Function create-agency (service role uniquement) :
-- retrouve un compte existant par email pour le réutiliser au lieu
-- d'échouer si le patron de l'agence a déjà un compte.
create or replace function admin_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as
$$ select id from auth.users where lower(email) = lower(trim(p_email)) limit 1 $$;
revoke execute on function admin_user_id_by_email(text) from public, anon, authenticated;
grant  execute on function admin_user_id_by_email(text) to service_role;

-- ── Brique 2 : gardes Edge Functions par rôles ──────────────
-- b2-sign / cloudinary-sign / sync-social n'utilisent plus
-- ADMIN_EMAILS mais l'appartenance agency_members (b2-sign vérifie en
-- plus que chaque chemin signé appartient à l'agence de l'appelant).
-- Le compte machine du photobooth devient membre admin de
-- TimelessHouse pour continuer à signer ses uploads photobooth/.
insert into agency_members (agency_id, user_id, role)
select a.id, u.id, 'admin' from agencies a, auth.users u
where a.slug = 'timelesshouse' and lower(u.email) = 'photobooth@timelesshouse.org'
on conflict do nothing;

-- ── Brique 3 : marque blanche VISIBLE ───────────────────────
-- Les RPC du portail client renvoient la marque de l'agence du client
-- (nom, logo, couleurs, email de contact) : le dashboard, les pages
-- événement et les emails s'affichent aux couleurs de l'agence.
-- (get_client_portal et get_event_portal sont recréées ci-dessous avec
--  un bloc 'agency' — le reste est identique à migration-saas-b2.sql.)

create or replace function get_client_portal(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients; res jsonb;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  select jsonb_build_object(
    'client', to_jsonb(c),
    'agency', (select jsonb_build_object('name', a.name, 'slug', a.slug,
                 'logo_url', a.logo_url, 'accent_color', a.accent_color,
                 'bg_color', a.bg_color, 'contact_email', a.contact_email)
               from agencies a where a.id = c.agency_id),
    'media', coalesce((select jsonb_agg(to_jsonb(m) order by m.date_iso desc nulls last, m.created_at desc)
                       from media m where m.client_id = c.id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc)
                          from invoices i where i.client_id = c.id), '[]'::jsonb),
    'shoots', coalesce((select jsonb_agg(to_jsonb(s) order by s.year, s.date_day)
                        from shoots s where s.client_id = c.id), '[]'::jsonb),
    'analytics', (select to_jsonb(a) from analytics a where a.client_id = c.id limit 1),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.position, d.created_at desc)
                           from documents d where d.client_id = c.id), '[]'::jsonb),
    'strategies', coalesce((select jsonb_agg(to_jsonb(st) order by st.position, st.created_at desc)
                            from strategies st where st.client_id = c.id and st.status = 'published'), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(mc) order by mc.created_at)
                          from media_comments mc join media m2 on m2.id = mc.media_id
                          where m2.client_id = c.id), '[]'::jsonb),
    'event_pages', coalesce((select jsonb_agg(jsonb_build_object('page_type', ep.page_type, 'config', ep.config))
                             from event_pages ep where ep.client_id = c.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

create or replace function get_event_portal(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name,
                                 'universe', c.universe, 'agency_name', c.agency_name),
    'agency', (select jsonb_build_object('name', a.name, 'slug', a.slug,
                 'logo_url', a.logo_url, 'accent_color', a.accent_color,
                 'bg_color', a.bg_color, 'contact_email', a.contact_email)
               from agencies a where a.id = c.agency_id),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('page_type', ep.page_type, 'config', ep.config))
                       from event_pages ep where ep.client_id = c.id), '[]'::jsonb)
  );
end $$;

-- ── Brique 4 : quotas de stockage par agence ────────────────
-- L'Edge Function measure-storage (cron nocturne) liste le bucket B2,
-- classe chaque objet par agence (media/<id>, weddings/<code>,
-- invoices|documents/<clientId>, photobooth → TimelessHouse) et met à
-- jour agencies.storage_used_bytes. Jauge dans l'admin (Vue d'ensemble
-- + section Agences), alerte à 80 % — jamais de blocage d'upload
-- (dépassement souple facturé plus tard via Stripe).
alter table agencies add column if not exists storage_used_bytes bigint default 0;
alter table agencies add column if not exists storage_measured_at timestamptz;

-- Quota du plan en octets — null = illimité (plan fondateur)
create or replace function plan_quota_bytes(p_plan text) returns bigint
language sql immutable as $$
  select case p_plan
    when 'decouverte' then 3::bigint    * 1073741824
    when 'essentiel'  then 100::bigint  * 1073741824
    when 'studio'     then 500::bigint  * 1073741824
    when 'cinema'     then 2048::bigint * 1073741824
    when 'prestige'   then 5120::bigint * 1073741824
    else null
  end $$;

-- Jauge de l'admin connecté : le stockage de SON agence
create or replace function my_agency_storage() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'plan', a.plan,
    'used_bytes', coalesce(a.storage_used_bytes, 0),
    'quota_bytes', plan_quota_bytes(a.plan),
    'measured_at', a.storage_measured_at)
  from agencies a
  where a.id in (select agency_id from agency_members where user_id = auth.uid())
  limit 1 $$;
revoke execute on function my_agency_storage() from public, anon;
grant  execute on function my_agency_storage() to authenticated;

-- platform_list_agencies : + stockage (pour la section Agences)
create or replace function platform_list_agencies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not platform_is_owner() then
    raise exception 'réservé au propriétaire de la plateforme';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',            a.id,
    'name',          a.name,
    'slug',          a.slug,
    'plan',          a.plan,
    'active',        a.active,
    'contact_email', a.contact_email,
    'logo_url',      a.logo_url,
    'accent_color',  a.accent_color,
    'bg_color',      a.bg_color,
    'created_at',    a.created_at,
    'clients_count', (select count(*) from clients c where c.agency_id = a.id),
    'owners',        (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
                      from agency_members am join auth.users u on u.id = am.user_id
                      where am.agency_id = a.id and am.role = 'owner'),
    'storage_used_bytes',  coalesce(a.storage_used_bytes, 0),
    'storage_quota_bytes', plan_quota_bytes(a.plan),
    'storage_measured_at', a.storage_measured_at
  ) order by a.created_at) from agencies a), '[]'::jsonb);
end $$;

-- Cron nocturne de mesure (02:30 UTC) — __CRON_SECRET__ remplacé par le
-- vrai secret à l'exécution (jamais dans ce fichier) :
-- select cron.schedule('measure-storage-nightly', '30 2 * * *', $cron$
--   select net.http_post(
--     url := 'https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/measure-storage',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-key','__CRON_SECRET__'),
--     body := '{}'::jsonb) $cron$);
-- 🔧 Réparé au passage : le cron sync-social-6h (jobid 3) envoyait le
--    PLACEHOLDER __CRON_SECRET__ littéral depuis son installation — tous
--    ses appels étaient refusés en 401 (les runs pg_cron « succeeded »
--    ne couvrent que l'envoi HTTP). Recréé avec le vrai secret.

-- ── Brique 5 : LA LOGE — marque par sous-domaine ────────────
-- Produit nommé « La Loge » (décidé 20/07/2026) : laloge.app (console)
-- et laloge.house (espaces clients), avec UN SOUS-DOMAINE PAR AGENCE
-- (<slug>.laloge.house). L'écran de connexion du sous-domaine porte la
-- marque de l'agence AVANT toute saisie de code.

-- Marque publique d'une agence active, résolue par son slug.
-- Volontairement limitée aux champs d'affichage (rien de sensible).
create or replace function resolve_agency_brand(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', a.name, 'slug', a.slug, 'logo_url', a.logo_url,
    'accent_color', a.accent_color, 'bg_color', a.bg_color,
    'contact_email', a.contact_email)
  from agencies a where a.slug = lower(trim(p_slug)) and a.active $$;
grant execute on function resolve_agency_brand(text) to anon, authenticated;

-- resolve_client_code renvoie AUSSI le slug d'agence du client : les
-- portes d'entrée refusent un code étranger au sous-domaine visité
-- (« ce code n'appartient pas à cet espace »).
create or replace function resolve_client_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'code', c.code, 'universe', c.universe, 'redirect_url', c.redirect_url,
    'agency_slug', (select slug from agencies where id = c.agency_id));
end $$;

-- ── Brique 6 : STRIPE — abonnements par agence ──────────────
-- L'Edge Function stripe-billing (checkout + portail + webhook signé)
-- fait vivre ces colonnes ; le plan de l'agence pilote déjà le quota
-- de stockage (plan_quota_bytes). Prix live avec lookup_keys
-- laloge_<plan>_<mensuel|annuel> (annuel = 10 mois).
alter table agencies add column if not exists stripe_customer_id     text;
alter table agencies add column if not exists stripe_subscription_id text;
alter table agencies add column if not exists subscription_status    text;
alter table agencies add column if not exists billing_interval       text;

-- ── Brique 7 : fonctionnalités réservées à la plateforme ────
-- Certains modules ne font pas partie de l'offre vendue aux agences :
--   · analyses sociales (apps Meta/TikTok au nom de TimelessHouse —
--     un locataire ne peut pas connecter les comptes de ses clients
--     sous nos apps ; sera revendu plus tard avec ses propres apps)
--   · portfolio (outil de prospection propre à TimelessHouse, non
--     cloisonné par agence)
-- Drapeaux par agence : faux par défaut → activables à la main pour
-- une agence pilote sans toucher au code.
alter table agencies add column if not exists features_analytics boolean default false;
alter table agencies add column if not exists features_portfolio boolean default false;
update agencies set features_analytics = true, features_portfolio = true
  where slug = 'timelesshouse';

-- get_client_portal expose le drapeau analyses : un client dont
-- l'agence n'a pas l'option ne voit jamais l'onglet, même si son
-- analytics_enabled avait été activé avant.
create or replace function get_client_portal(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients; res jsonb;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  select jsonb_build_object(
    'client', to_jsonb(c),
    'agency', (select jsonb_build_object('name', a.name, 'slug', a.slug,
                 'logo_url', a.logo_url, 'accent_color', a.accent_color,
                 'bg_color', a.bg_color, 'contact_email', a.contact_email,
                 'features_analytics', coalesce(a.features_analytics, false))
               from agencies a where a.id = c.agency_id),
    'media', coalesce((select jsonb_agg(to_jsonb(m) order by m.date_iso desc nulls last, m.created_at desc)
                       from media m where m.client_id = c.id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc)
                          from invoices i where i.client_id = c.id), '[]'::jsonb),
    'shoots', coalesce((select jsonb_agg(to_jsonb(s) order by s.year, s.date_day)
                        from shoots s where s.client_id = c.id), '[]'::jsonb),
    'analytics', (select to_jsonb(a) from analytics a where a.client_id = c.id limit 1),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.position, d.created_at desc)
                           from documents d where d.client_id = c.id), '[]'::jsonb),
    'strategies', coalesce((select jsonb_agg(to_jsonb(st) order by st.position, st.created_at desc)
                            from strategies st where st.client_id = c.id and st.status = 'published'), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(mc) order by mc.created_at)
                          from media_comments mc join media m2 on m2.id = mc.media_id
                          where m2.client_id = c.id), '[]'::jsonb),
    'event_pages', coalesce((select jsonb_agg(jsonb_build_object('page_type', ep.page_type, 'config', ep.config))
                             from event_pages ep where ep.client_id = c.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ── Brique 8 : récupération de mot de passe ─────────────────
-- Journal des demandes (anti-bombardement d'emails) : l'Edge Function
-- account-recovery refuse au-delà de 5 demandes par heure et par
-- email. Table sans policy → service role uniquement.
create table if not exists auth_recovery_log (
  id         bigserial primary key,
  email      text not null,
  created_at timestamptz default now()
);
alter table auth_recovery_log enable row level security;
create index if not exists auth_recovery_log_email_idx on auth_recovery_log (lower(email), created_at desc);

-- ── Brique 9 : inscription self-serve ───────────────────────
-- Journal des inscriptions publiques (anti-abus : 3 créations par
-- heure et par IP côté Edge Function signup-agency). Sans policy →
-- service role uniquement.
create table if not exists signup_log (
  id         bigserial primary key,
  email      text,
  ip         text,
  created_at timestamptz default now()
);
alter table signup_log enable row level security;
create index if not exists signup_log_ip_idx on signup_log (ip, created_at desc);

-- ── Brique 10 : file d'attente d'inscriptions ───────────────
-- Au-delà de SIGNUP_AUTO_LIMIT agences locataires (10, constante de
-- l'Edge Function signup-agency), les nouvelles inscriptions sont
-- créées INACTIVES : le compte existe, mais l'agence attend la
-- validation du propriétaire de la plateforme.
alter table agencies add column if not exists status text default 'active';
update agencies set status = 'active' where status is null;

-- ⚠️ Verrou central : une agence inactive ne peut RIEN écrire.
-- my_agency_ids() alimente toutes les policies « agency write » (B.1),
-- donc filtrer ici suffit à geler clients, médias, factures, etc.
create or replace function my_agency_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select am.agency_id from agency_members am
   join agencies a on a.id = am.agency_id
   where am.user_id = auth.uid() and coalesce(a.active, true) $$;

-- Statut de MON agence (écran d'attente de la console)
create or replace function my_agency_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', a.name, 'slug', a.slug,
    'active', coalesce(a.active, true), 'status', coalesce(a.status, 'active'),
    'contact_email', a.contact_email)
  from agencies a
  where a.id in (select agency_id from agency_members where user_id = auth.uid())
  limit 1 $$;
revoke execute on function my_agency_status() from public, anon;
grant  execute on function my_agency_status() to authenticated;

-- Approbation / suspension par le propriétaire de la plateforme
create or replace function platform_set_agency_active(p_agency_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a agencies;
begin
  if not platform_is_owner() then
    raise exception 'réservé au propriétaire de la plateforme';
  end if;
  update agencies set active = p_active,
         status = case when p_active then 'active' else 'suspended' end
   where id = p_agency_id returning * into a;
  if a.id is null then raise exception 'agence introuvable'; end if;
  return jsonb_build_object('id', a.id, 'name', a.name, 'slug', a.slug,
    'active', a.active, 'status', a.status, 'contact_email', a.contact_email);
end $$;
revoke execute on function platform_set_agency_active(uuid, boolean) from public, anon;
grant  execute on function platform_set_agency_active(uuid, boolean) to authenticated;

-- platform_list_agencies : + statut (pour la file d'attente)
create or replace function platform_list_agencies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not platform_is_owner() then
    raise exception 'réservé au propriétaire de la plateforme';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'slug', a.slug, 'plan', a.plan,
    'active', coalesce(a.active, true), 'status', coalesce(a.status, 'active'),
    'contact_email', a.contact_email, 'logo_url', a.logo_url,
    'accent_color', a.accent_color, 'bg_color', a.bg_color,
    'created_at', a.created_at,
    'clients_count', (select count(*) from clients c where c.agency_id = a.id),
    'owners', (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
               from agency_members am join auth.users u on u.id = am.user_id
               where am.agency_id = a.id and am.role = 'owner'),
    'storage_used_bytes', coalesce(a.storage_used_bytes, 0),
    'storage_quota_bytes', plan_quota_bytes(a.plan),
    'storage_measured_at', a.storage_measured_at
  ) order by (case when coalesce(a.active, true) then 1 else 0 end), a.created_at)
  from agencies a), '[]'::jsonb);
end $$;

-- ── Brique 11 : GALERIES PHOTOS B2 (pipeline locataires) ────
-- Décision du 20/07/2026 (files/SAAS-ROADMAP.md § 📸) : les galeries
-- photos des locataires se livrent sur B2 UNIQUEMENT (Cloudinary =
-- héritage TimelessHouse, upload verrouillé plateforme). Les variantes
-- (view ≤ 2000 px, grid ≤ 1000 px) sont générées DANS LE NAVIGATEUR
-- à l'upload (admin), stockées sous weddings/<code>/galerie/… — elles
-- comptent donc automatiquement dans les quotas (measure-storage).
create table if not exists gallery_photos (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  agency_id    uuid references agencies(id),
  category     text not null,             -- libellé affiché (« Préparatifs »)
  position     int default 0,             -- ordre dans la catégorie
  width        int,                       -- dimensions de l'ORIGINAL
  height       int,
  url_original text,                      -- téléchargement (fichier intact)
  url_view     text,                      -- lightbox (≤ 2000 px)
  url_grid     text,                      -- grille (≤ 1000 px)
  created_at   timestamptz default now()
);
create index if not exists gallery_photos_client_cat_pos
  on gallery_photos (client_id, category, position);
create index if not exists gallery_photos_agency_idx on gallery_photos (agency_id);
alter table gallery_photos enable row level security;

-- Écritures admin : cloisonnées par agence (modèle B.1)
drop policy if exists "agency write" on gallery_photos;
create policy "agency write" on gallery_photos for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

-- agency_id auto-rempli depuis le client à l'insertion (modèle B.1)
drop trigger if exists set_agency on gallery_photos;
create trigger set_agency before insert on gallery_photos
  for each row execute function trg_agency_from_client();

-- Lecture côté espace client : RPC scellée par le code d'accès
-- (modèle files/migration-saas-b2.sql). Photos groupées par catégorie ;
-- catégories ordonnées par position minimale puis ancienneté ; photos
-- par position puis created_at.
create or replace function get_client_gallery(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', g.category, 'photos', g.photos)
                       order by g.cat_pos, g.cat_born, g.category)
      from (
        select gp.category,
               min(gp.position)   as cat_pos,
               min(gp.created_at) as cat_born,
               jsonb_agg(jsonb_build_object(
                 'id', gp.id, 'width', gp.width, 'height', gp.height,
                 'url_original', gp.url_original, 'url_view', gp.url_view,
                 'url_grid', gp.url_grid
               ) order by gp.position, gp.created_at) as photos
        from gallery_photos gp
        where gp.client_id = c.id
        group by gp.category
      ) g
    ), '[]'::jsonb)
  );
end $$;
grant execute on function get_client_gallery(text) to anon, authenticated;

-- ── Brique 12 : écran « Ma marque » ─────────────────────────
-- Chaque agence règle ELLE-MÊME son identité (nom, logo, couleurs,
-- email de contact) depuis la carte « Ma marque » de sa console.
-- RPC réservée aux OWNERS de l'agence, qui ne touche QUE les champs
-- de marque. Volontairement PAS de policy UPDATE sur agencies : la
-- table porte trop de colonnes sensibles (plan, active, status, slug,
-- stripe_*, features_*, storage_*) — cette RPC est le SEUL chemin
-- d'écriture, et la marque se propage partout dès la ligne modifiée
-- (get_client_portal, get_event_portal, resolve_agency_brand, emails).
create or replace function update_my_agency_brand(
  p_name          text,
  p_logo_url      text default null,
  p_accent_color  text default null,
  p_bg_color      text default null,
  p_contact_email text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_name   text := trim(coalesce(p_name, ''));
  v_logo   text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_accent text := lower(trim(coalesce(p_accent_color, '')));
  v_bg     text := lower(trim(coalesce(p_bg_color, '')));
  v_email  text := nullif(lower(trim(coalesce(p_contact_email, ''))), '');
  a agencies;
begin
  select am.agency_id into v_agency from agency_members am
   where am.user_id = auth.uid() and am.role = 'owner' limit 1;
  if v_agency is null then
    raise exception 'réservé au propriétaire de l''agence';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'nom invalide (2 à 80 caractères)';
  end if;
  if v_logo is not null and (char_length(v_logo) > 500 or v_logo !~* '^https://\S+$') then
    raise exception 'logo invalide (URL https, 500 caractères max)';
  end if;
  if v_accent !~ '^#[0-9a-f]{6}$' or v_bg !~ '^#[0-9a-f]{6}$' then
    raise exception 'couleur invalide (format #rrggbb attendu)';
  end if;
  if v_email is not null and (char_length(v_email) > 200
      or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'email de contact invalide';
  end if;
  update agencies set
    name = v_name, logo_url = v_logo,
    accent_color = v_accent, bg_color = v_bg,
    contact_email = v_email
  where id = v_agency
  returning * into a;
  return jsonb_build_object('name', a.name, 'slug', a.slug,
    'logo_url', a.logo_url, 'accent_color', a.accent_color,
    'bg_color', a.bg_color, 'contact_email', a.contact_email);
end $$;
revoke execute on function update_my_agency_brand(text, text, text, text, text) from public, anon;
grant  execute on function update_my_agency_brand(text, text, text, text, text) to authenticated;

-- ── Brique 13 : GALERIES AUTONOMES (fondation) ──────────────
-- Décision du 20/07/2026 : les galeries de livraison deviennent des
-- OBJETS DE PREMIER RANG (modèle Pic-Time). Jusqu'ici une livraison
-- était une `event_pages` accrochée au client : UNE page vidéo + UNE
-- page photos maximum, atteignables uniquement en passant par le code
-- de l'espace client. Désormais une galerie a SON PROPRE code et SON
-- PROPRE lien (https://<slug>.laloge.house/galerie?c=<code>) — on peut
-- en livrer autant qu'on veut à un même client, et en partager une
-- sans donner accès à l'espace client.
--
-- DEUX ESPACES DE NOMS DISTINCTS, VOLONTAIREMENT ÉTANCHES :
--   · clients.code    → l'espace client (dashboard, factures, médias)
--   · galleries.access_code → une livraison précise
-- Un code doit rester NON AMBIGU pour un humain : le trigger refuse
-- qu'une galerie prenne le code d'un client de la même agence, et le
-- générateur évite en plus toute collision à l'échelle de la
-- plateforme (voir gallery_code_suggest).
--
-- ⚠️ `event_pages` N'EST PAS SUPPRIMÉE ni désactivée. Elle reste la
-- SOURCE DE VÉRITÉ des pages event-*.html, qui continuent de servir
-- les ~17 clients de production exactement comme aujourd'hui. Cette
-- brique ne fait que DUPLIQUER l'existant dans `galleries` (migration
-- idempotente ci-dessous) pour poser le modèle sans risque. La console
-- de gestion (session suivante) écrira dans `galleries` et portera la
-- bascule/synchro puis, seulement à ce moment, la sortie d'event_pages.

-- Slug ASCII partagé (titres → codes lisibles). Même normalisation que
-- le front (app.html) : minuscules, accents aplatis, tout le reste en
-- tirets. Volontairement `immutable` : sert aussi dans les index/checks.
create or replace function gallery_slug(p_text text) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(p_text, ''),
          'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
          'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
        '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'), ''), 'galerie') $$;

-- ── La table ────────────────────────────────────────────────
create table if not exists galleries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  agency_id     uuid references agencies(id),
  title         text not null,
  -- 'photos' | 'video' | 'mixte' — pilote les sections rendues
  kind          text not null default 'photos' check (kind in ('photos', 'video', 'mixte')),
  -- Gabarit de rendu : 'mariage' | 'fiancailles' | 'anniversaire' |
  -- 'evenement' | 'mannequinat' | 'immobilier' | 'corporate'…
  -- PAS de CHECK volontairement : la liste doit pouvoir s'allonger sans
  -- migration (un nouveau métier = un nouveau gabarit). La validation
  -- se fait côté applicatif ; un gabarit inconnu retombe sur 'evenement'.
  template      text not null default 'evenement',
  config        jsonb default '{}'::jsonb,
  access_code   text,
  share_enabled boolean not null default true,
  position      int default 0,
  created_at    timestamptz default now()
);
create index if not exists galleries_client_pos  on galleries (client_id, position);
create index if not exists galleries_agency_idx  on galleries (agency_id);

-- Unicité du code PAR AGENCE (modèle clients_agency_code_key, phase C de B.2)
alter table galleries drop constraint if exists galleries_agency_code_key;
alter table galleries add  constraint galleries_agency_code_key unique (agency_id, access_code);

alter table galleries enable row level security;

-- Écritures admin : cloisonnées par agence (modèle B.1)
drop policy if exists "agency write" on galleries;
create policy "agency write" on galleries for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

-- agency_id auto-rempli depuis le client (modèle B.1)
drop trigger if exists set_agency on galleries;
create trigger set_agency before insert on galleries
  for each row execute function trg_agency_from_client();

-- ── Codes d'accès ───────────────────────────────────────────
-- Propose un code libre pour une agence, à partir d'un libellé (titre).
-- Évite : les codes de galerie ET les codes d'espace client — non
-- seulement dans l'agence (là où porte la contrainte d'unicité) mais
-- SUR TOUTE LA PLATEFORME, pour qu'un code reste non ambigu pour un
-- humain (get_gallery_by_code refuse les codes servis par 2 agences,
-- comme portal_client le fait déjà).
create or replace function gallery_code_suggest(p_agency uuid, p_base text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_base text := left(gallery_slug(p_base), 48);
  v_try  text := left(gallery_slug(p_base), 48);
  i      int  := 0;
begin
  while i < 40 loop
    if not exists (select 1 from galleries g where g.access_code = v_try)
       and not exists (select 1 from clients c where c.code = v_try) then
      return v_try;
    end if;
    i := i + 1;
    v_try := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;
  -- Filet : suffixe long, collision statistiquement impossible
  return v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
end $$;
-- NB : le suffixe vient de md5(random()) et NON de gen_random_bytes —
-- pgcrypto vit dans le schéma `extensions` chez Supabase, donc hors du
-- `search_path = public` que ces fonctions figent par sécurité.
revoke execute on function gallery_code_suggest(uuid, text) from public, anon;
grant  execute on function gallery_code_suggest(uuid, text) to authenticated;

-- Remplit le code s'il est vide ; REFUSE toute collision avec le code
-- d'un espace client de la même agence (les deux espaces de noms
-- doivent rester lisibles séparément par un humain).
create or replace function trg_gallery_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text := nullif(trim(coalesce(new.access_code, '')), '');
begin
  if v_code is null then
    new.access_code := gallery_code_suggest(new.agency_id, new.title);
    return new;
  end if;
  v_code := gallery_slug(v_code);
  if length(v_code) < 4 then
    raise exception 'code de galerie trop court (4 caractères minimum) : « % »', v_code;
  end if;
  if exists (select 1 from clients c
             where c.agency_id is not distinct from new.agency_id and c.code = v_code) then
    raise exception 'code « % » déjà utilisé par un espace client de cette agence', v_code;
  end if;
  new.access_code := v_code;
  return new;
end $$;

-- set_agency (alphabétiquement avant) a déjà posé agency_id quand
-- celui-ci s'exécute : le contrôle de collision porte sur la bonne agence.
drop trigger if exists set_gallery_code on galleries;
create trigger set_gallery_code before insert on galleries
  for each row execute function trg_gallery_code();

drop trigger if exists set_gallery_code_upd on galleries;
create trigger set_gallery_code_upd before update of access_code on galleries
  for each row when (new.access_code is distinct from old.access_code)
  execute function trg_gallery_code();

-- ── gallery_photos : rattachement à une galerie ─────────────
-- `client_id` est CONSERVÉ et reste rempli : get_client_gallery (brique
-- 11) et event-photos.html continuent de fonctionner à l'identique.
alter table gallery_photos add column if not exists gallery_id uuid references galleries(id) on delete cascade;
create index if not exists gallery_photos_gallery_pos on gallery_photos (gallery_id, position);

-- ── Migration des livraisons existantes (idempotente) ───────
-- Chaque event_pages obtient sa galerie miroir. Relancer ce bloc ne
-- crée jamais de doublon (garde `not exists` sur client_id + kind).
insert into galleries (client_id, agency_id, title, kind, template, config, position)
select ep.client_id,
       c.agency_id,
       (case ep.page_type when 'video' then 'Film — ' else 'Galerie photos — ' end)
         || coalesce(nullif(trim(c.name), ''), c.code),
       ep.page_type,
       case c.universe
         when 'anniversaire-mariage' then 'anniversaire'
         when 'fiancailles'          then 'fiancailles'
         else                             'mariage' end,
       coalesce(ep.config, '{}'::jsonb),
       case ep.page_type when 'video' then 0 else 1 end
from event_pages ep
join clients c on c.id = ep.client_id
where not exists (select 1 from galleries g
                  where g.client_id = ep.client_id and g.kind = ep.page_type);

-- Les photos B2 déjà livrées rejoignent la galerie photos de leur client.
update gallery_photos gp set gallery_id = g.id
from galleries g
where gp.gallery_id is null and g.client_id = gp.client_id and g.kind = 'photos';

-- ── RPC scellées par le CODE DE LA GALERIE ──────────────────
-- Helper INTERNE (modèle portal_client) : code → ligne galleries.
-- Refuse : code vide/trop court, partage coupé, agence inactive, et
-- code AMBIGU (servi par 2 agences) — on refuse plutôt que de servir
-- la mauvaise agence. Volontairement INDÉPENDANT de clients.active :
-- une galerie est autonome, elle vit tant que share_enabled le dit.
create or replace function portal_gallery(p_code text) returns galleries
language plpgsql stable security definer set search_path = public as $$
declare g galleries; n int; v_code text;
begin
  v_code := lower(trim(coalesce(p_code, '')));
  if length(v_code) < 4 then return null; end if;
  select count(*) into n
    from galleries gg join agencies a on a.id = gg.agency_id
   where gg.access_code = v_code and gg.share_enabled and a.active;
  if n <> 1 then return null; end if;
  select gg.* into g
    from galleries gg join agencies a on a.id = gg.agency_id
   where gg.access_code = v_code and gg.share_enabled and a.active;
  return g;
end $$;
revoke execute on function portal_gallery(text) from public, anon, authenticated;

-- Page publique galerie.html : tout le contenu en un appel.
-- N'expose JAMAIS clients.code (le code de l'espace client) : détenir
-- le lien d'une galerie ne doit pas ouvrir le dashboard du client.
-- `photos` porte les mêmes groupes {category, photos} que
-- get_client_gallery (brique 11) — même rendu côté front.
create or replace function get_gallery_by_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries; c clients;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;
  select * into c from clients where id = g.client_id;
  return jsonb_build_object(
    'gallery', jsonb_build_object(
      'id', g.id, 'title', g.title, 'kind', g.kind,
      'template', g.template, 'config', coalesce(g.config, '{}'::jsonb)),
    'client', jsonb_build_object('name', c.name),
    'agency', (select jsonb_build_object('name', a.name, 'slug', a.slug,
                 'logo_url', a.logo_url, 'accent_color', a.accent_color,
                 'bg_color', a.bg_color, 'contact_email', a.contact_email)
               from agencies a where a.id = g.agency_id),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('category', q.category, 'photos', q.photos)
                       order by q.cat_pos, q.cat_born, q.category)
      from (
        select gp.category,
               min(gp.position)   as cat_pos,
               min(gp.created_at) as cat_born,
               jsonb_agg(jsonb_build_object(
                 'id', gp.id, 'width', gp.width, 'height', gp.height,
                 'url_original', gp.url_original, 'url_view', gp.url_view,
                 'url_grid', gp.url_grid
               ) order by gp.position, gp.created_at) as photos
        from gallery_photos gp
        where gp.gallery_id = g.id
        group by gp.category
      ) q), '[]'::jsonb)
  );
end $$;
grant execute on function get_gallery_by_code(text) to anon, authenticated;

-- Hall des galeries dans l'espace client : scellé par le code CLIENT.
-- Renvoie access_code (le client a le droit de repartager SES galeries).
create or replace function get_client_galleries(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'kind', g.kind, 'template', g.template,
      'access_code', g.access_code, 'share_enabled', g.share_enabled,
      'photos_count', (select count(*) from gallery_photos gp where gp.gallery_id = g.id)
    ) order by g.position, g.created_at)
    from galleries g where g.client_id = c.id and g.share_enabled), '[]'::jsonb);
end $$;
grant execute on function get_client_galleries(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Brique 14 : UNIVERS SIMPLIFIÉS ──────────────────────────
-- Les 9 univers hérités (mariage, fiancailles, anniversaire-mariage,
-- immobilier, commercial, court-metrage, voyage, communication, autre)
-- portaient à la fois le MÉTIER et le GABARIT de rendu. Depuis la
-- brique 13, le gabarit vit sur la GALERIE (galleries.template) : un
-- locataire n'a plus besoin de choisir un univers par type de fête.
-- On lui en propose donc 3, qui décrivent seulement la FORME de
-- l'espace client :
--   · celebration   → espace de livraison (galeries/films)
--   · communication → tableau de bord complet + option Analyses
--   · neutre        → tableau de bord complet SANS Analyses,
--                     + galeries de livraison possibles
-- La liste complète reste réservée à la plateforme (drapeau ci-dessous),
-- qui conserve ses pages vitrines par métier (mariage.html, immobilier…).
-- AUCUNE migration de données : les valeurs héritées continuent de
-- fonctionner (mariage|fiancailles|anniversaire-mariage = célébrations,
-- autre = neutre) — la compatibilité est portée par les helpers de
-- `univers.js`, partagés par l'admin et toutes les portes d'entrée.
alter table agencies add column if not exists features_all_universes boolean not null default false;
update agencies set features_all_universes = true where slug = 'timelesshouse';

comment on column agencies.features_all_universes is
  'Propose la liste COMPLÈTE des univers (héritage plateforme) au lieu des 3 univers simplifiés. Faux pour les locataires.';

-- resolve_client_code renvoie AUSSI `has_delivery` : le client a-t-il une
-- page événement ou une galerie ?
-- Pourquoi : la règle « neutre → tableau de bord » vaut aussi pour son
-- équivalent hérité `autre`… sauf que 2 clients RÉELS portent déjà cette
-- valeur, et que l'un d'eux (pandore260426) est une livraison PURE — une
-- page photos, modules Médias/Factures/Tournages coupés. Le basculer vers
-- le tableau de bord casserait sa livraison. On ne peut pas non plus se
-- fier aux seuls modules : `documents_enabled`/`strategies_enabled` sont
-- restés à `true` chez lui (valeur par défaut jamais touchée), donc
-- « aucun module actif » ne le détecte pas.
-- Règle retenue, portée par univers.js : `neutre` (valeur NEUVE, aucun
-- client existant) va toujours au tableau de bord ; `autre` (valeur
-- HÉRITÉE) n'y va que s'il n'a AUCUNE livraison — sinon il garde
-- exactement sa destination d'aujourd'hui. Zéro régression, et les deux
-- valeurs restent identiques partout ailleurs (pas d'option Analyses,
-- modules et onglet « Page client » disponibles).
create or replace function resolve_client_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'code', c.code, 'universe', c.universe, 'redirect_url', c.redirect_url,
    'agency_slug', (select slug from agencies where id = c.agency_id),
    'has_delivery', (exists (select 1 from event_pages ep where ep.client_id = c.id)
                  or exists (select 1 from galleries   g  where g.client_id  = c.id)));
end $$;
grant execute on function resolve_client_code(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ✅ Briques 1→14 de B.3 posées. Restent (voir files/SAAS-ROADMAP.md) :
--    cloisonnement des dossiers Cloudinary (ou Cloudflare Images),
--    et la BASCULE d'event_pages vers galleries (convergence des pages
--    event-*.html sur galerie-rendu.js).

-- ════════════════════════════════════════════════════════════
-- BRIQUE 15 — File d'attente d'encodage HLS (worker automatique)
-- ════════════════════════════════════════════════════════════
-- Un locataire uploade un MP4 : il est lisible IMMÉDIATEMENT en
-- progressif (une seule qualité, servie telle quelle par B2). Pour
-- obtenir la lecture adaptative — le lecteur choisit 4K/1080p/720p/
-- 480p selon la connexion, comme les films de la plateforme — il faut
-- transcoder, et ffmpeg ne tourne ni dans le navigateur ni sur
-- Supabase. Cette table est la boîte aux lettres entre la console
-- (qui dépose un ticket après l'upload) et le worker
-- workers/encoder/worker-encode.mjs (qui encode et range le résultat).
--
-- La plateforme n'enfile RIEN : Gil garde son `npm run encode` manuel.

create table if not exists encode_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('media','gallery_video')),
  media_id    uuid references media(id)     on delete cascade,
  gallery_id  uuid references galleries(id) on delete cascade,
  video_key   text,                              -- clé dans config.videos[]
  source_url  text not null,                     -- MP4 d'origine sur B2
  agency_id   uuid references agencies(id)  on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','error')),
  attempts    int  not null default 0,
  error       text,
  claimed_at  timestamptz,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- Un job désigne sa cible sans ambiguïté
  constraint encode_jobs_target_ck check (
    (kind = 'media'         and media_id   is not null and gallery_id is null)
    or
    (kind = 'gallery_video' and gallery_id is not null and video_key  is not null and media_id is null)
  )
);

create index if not exists encode_jobs_queue_idx  on encode_jobs (status, created_at);
create index if not exists encode_jobs_agency_idx on encode_jobs (agency_id);

-- Anti-doublon : ré-enregistrer une galerie ou recliquer sur
-- « Publier » ne doit pas empiler dix fois le même encodage.
create unique index if not exists encode_jobs_media_active
  on encode_jobs (media_id) where status in ('pending','processing');
create unique index if not exists encode_jobs_gallery_active
  on encode_jobs (gallery_id, video_key) where status in ('pending','processing');

-- agency_id auto-rempli depuis la cible (media ou galerie) : la
-- console n'a pas à le fournir, et il ne peut pas être falsifié.
create or replace function trg_agency_from_encode_target() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then
    if new.media_id is not null then
      select agency_id into new.agency_id from media where id = new.media_id;
    elsif new.gallery_id is not null then
      select agency_id into new.agency_id from galleries where id = new.gallery_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists set_agency on encode_jobs;
create trigger set_agency before insert on encode_jobs
  for each row execute function trg_agency_from_encode_target();

alter table encode_jobs enable row level security;

-- L'admin dépose et suit SES jobs, jamais ceux d'une autre agence.
drop policy if exists "agency write" on encode_jobs;
create policy "agency write" on encode_jobs for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

-- ── Réclamation atomique par le worker ──────────────────────
-- `for update skip locked` garantit que deux workers (ou deux
-- lancements concurrents) ne prennent jamais le même job. Réservée
-- au service role : le worker tourne sur la machine de Gil, jamais
-- dans un navigateur.
create or replace function claim_encode_job() returns encode_jobs
language plpgsql volatile security definer set search_path = public as $$
declare j encode_jobs;
begin
  update encode_jobs set
    status     = 'processing',
    attempts   = attempts + 1,
    claimed_at = now()
  where id = (
    select id from encode_jobs
    where status = 'pending'
    order by created_at
    for update skip locked
    limit 1
  )
  returning * into j;
  return j;
end $$;

revoke all on function claim_encode_job() from public, anon, authenticated;
grant execute on function claim_encode_job() to service_role;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- BRIQUE 16 — Vidéo visible seulement une fois encodée
-- ════════════════════════════════════════════════════════════
-- Demande de Gil (20/07/2026) : le client d'un locataire ne doit pas
-- voir la vidéo tant qu'aucune qualité n'est prête. Sinon il tomberait
-- sur le master brut — lourd, parfois saccadé sur une connexion
-- moyenne : une mauvaise première impression sur une livraison qu'on
-- ne fait qu'une fois. Mieux vaut « préparation en cours » pendant
-- quelques minutes.
--
-- Un drapeau EXPLICITE plutôt que l'absence de preview_url : sinon une
-- vidéo légitimement sans version allégée (lien collé par la
-- plateforme) serait prise à tort pour un encodage en attente.
-- Les galeries utilisent l'équivalent dans leur config jsonb
-- (`videos[].awaitingEncode`), levé par le même worker.
--
-- Par défaut à false : aucune des 12 vidéos existantes n'est masquée.

alter table media add column if not exists awaiting_encode boolean not null default false;

-- get_client_portal renvoie to_jsonb(m) : la colonne est exposée
-- automatiquement, aucune RPC à modifier.
notify pgrst, 'reload schema';
