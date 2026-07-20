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

-- ✅ Briques 1→4 de B.3 posées. Restent (voir files/SAAS-ROADMAP.md) :
--    Stripe (en attente du compte), inscription self-serve,
--    cloisonnement des dossiers Cloudinary (ou Cloudflare Images).
