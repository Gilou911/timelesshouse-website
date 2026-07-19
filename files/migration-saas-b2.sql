-- ════════════════════════════════════════════════════════════
-- 🔒 MIGRATION SaaS B.2 — Isolation des LECTURES (multi-tenant)
-- ════════════════════════════════════════════════════════════
-- Suite de files/migration-saas-b1.sql (fondation + écritures).
-- Objectif : plus AUCUNE donnée produit lisible avec la seule clé
-- anon. L'espace client passe par des RPC « security definer »
-- scellées par le code d'accès (le code devient un jeton vérifié
-- côté serveur, comme get_strategy_by_token déjà en place).
--
-- Exécutée par phases (chaque phase vérifiée en prod avant la
-- suivante — le portail joxciagence9991 ne doit jamais casser) :
--   A) RPC scellées (additif, aucun comportement modifié)
--   B) suppression des politiques « lecture publique » +
--      rescellement des écritures legacy + vues en security_invoker
--   C) codes d'accès uniques PAR agence (au lieu de globalement)
-- ════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────┐
-- │ PHASE A — RPC scellées par code d'accès                  │
-- └──────────────────────────────────────────────────────────┘

-- Helper INTERNE : code d'accès → ligne clients (ou NULL).
-- Refuse : code vide/trop court, client inactif, et code AMBIGU
-- (présent dans 2 agences — possible après la phase C : on refuse
-- plutôt que de servir la mauvaise agence ; B.3 apportera le
-- contexte d'agence via le domaine/sous-domaine de marque blanche).
create or replace function portal_client(p_code text) returns clients
language plpgsql stable security definer set search_path = public as $$
declare c clients; n int;
begin
  if p_code is null or length(trim(p_code)) < 4 then return null; end if;
  select count(*) into n from clients where code = trim(p_code) and active;
  if n <> 1 then return null; end if;
  select * into c from clients where code = trim(p_code) and active;
  return c;
end $$;
-- jamais appelable directement (uniquement via les RPC ci-dessous)
revoke execute on function portal_client(text) from public, anon, authenticated;

-- 1) Login (communication.html, index/mariage/immobilier.html) :
--    valide le code et renvoie le strict nécessaire au routage.
create or replace function resolve_client_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object('code', c.code, 'universe', c.universe, 'redirect_url', c.redirect_url);
end $$;

-- 2) Dashboard client (communication-dashboard.html) : TOUT le
--    portail en un appel — remplace 8 selects anon directs.
create or replace function get_client_portal(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients; res jsonb;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  select jsonb_build_object(
    'client', to_jsonb(c),
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

-- 3) Pages événement (event-video/photos/engagement/anniversary/
--    photos-cinematic) : version légère, sans les médias du dashboard.
create or replace function get_event_portal(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name,
                                 'universe', c.universe, 'agency_name', c.agency_name),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('page_type', ep.page_type, 'config', ep.config))
                       from event_pages ep where ep.client_id = c.id), '[]'::jsonb)
  );
end $$;

-- 4) Données sociales du client (hook useSocialData) : un appel
--    remplace 6 selects anon (dont les vues v_social_accounts_public
--    et v_campaign_kpis, scellées en phase B).
create or replace function get_client_social(p_code text, p_range text default '30j') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients; d_since timestamptz; res jsonb;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  d_since := now() - (case p_range when '24h' then interval '1 day'
                                   when '7j'  then interval '7 days'
                                   when '12m' then interval '365 days'
                                   else            interval '30 days' end);
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(v)) from v_social_accounts_public v
                          where v.client_id = c.id and v.active), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.published_at desc)
                       from social_posts p where p.client_id = c.id and p.published_at >= d_since), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(k) order by k.start_date desc)
                           from v_campaign_kpis k where k.client_id = c.id), '[]'::jsonb),
    'campaign_posts', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', cp.campaign_id,
                                  'post_id', cp.post_id, 'ad_spend', cp.ad_spend, 'role', cp.role))
                                from campaign_posts cp join campaigns ca on ca.id = cp.campaign_id
                                where ca.client_id = c.id), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(al)) from (
                          select * from social_alerts where client_id = c.id and acknowledged_at is null
                          order by created_at desc limit 5) al), '[]'::jsonb),
    'insights', (select to_jsonb(ins) from ai_insights ins
                 where ins.client_id = c.id and ins.scope = 'weekly_summary'
                 order by ins.created_at desc limit 1)
  ) into res;
  return res;
end $$;

-- 5) Commentaires d'un média (relecture dans la lightbox).
create or replace function get_media_comments(p_code text, p_media_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then return null; end if;
  return coalesce((select jsonb_agg(to_jsonb(mc) order by mc.created_at)
                   from media_comments mc join media m on m.id = mc.media_id
                   where mc.media_id = p_media_id and m.client_id = c.id), '[]'::jsonb);
end $$;

-- 6) Écriture invités RESCELLÉE : poster un commentaire n'est possible
--    que sur un média du client dont on détient le code (remplace la
--    politique « insert public » supprimée en phase B).
create or replace function add_media_comment(p_code text, p_media_id uuid, p_author_name text, p_comment text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clients; rec media_comments;
begin
  c := portal_client(p_code);
  if c.id is null then raise exception 'code invalide'; end if;
  if not exists (select 1 from media m where m.id = p_media_id and m.client_id = c.id) then
    raise exception 'média introuvable';
  end if;
  if p_comment is null or length(trim(p_comment)) = 0 or length(p_comment) > 4000 then
    raise exception 'commentaire invalide';
  end if;
  insert into media_comments (media_id, author_name, is_admin, comment)
    values (p_media_id, left(coalesce(nullif(trim(p_author_name), ''), 'Client'), 120), false, trim(p_comment))
    returning * into rec;
  return to_jsonb(rec);
end $$;

-- 7) Approbation média — l'ancienne RPC (p_media_id, p_status) était
--    security definer SANS AUCUNE vérification (n'importe quelle clé
--    anon pouvait approuver n'importe quel média). Deux versions :
--    · admin (signature conservée) : réservée aux membres de l'agence
create or replace function update_media_approval(p_media_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'approved', 'changes_requested') then
    raise exception 'statut invalide';
  end if;
  if not exists (select 1 from media m where m.id = p_media_id
                 and m.agency_id in (select my_agency_ids())) then
    raise exception 'non autorisé';
  end if;
  update media set approval_status = p_status where id = p_media_id;
end $$;
--    · client (nouvelle signature) : scellée par le code d'accès
create or replace function update_media_approval(p_code text, p_media_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_code);
  if c.id is null then raise exception 'code invalide'; end if;
  if p_status not in ('pending', 'approved', 'changes_requested') then
    raise exception 'statut invalide';
  end if;
  update media set approval_status = p_status where id = p_media_id and client_id = c.id;
  if not found then raise exception 'média introuvable'; end if;
end $$;

-- ┌──────────────────────────────────────────────────────────┐
-- │ PHASE B — fin des lectures publiques (après bascule front)│
-- └──────────────────────────────────────────────────────────┘
-- Exécutée UNIQUEMENT une fois toutes les pages passées aux RPC.

-- B.a — politiques « lecture publique » (SELECT anon, qual = true)
drop policy if exists "public read ad_creatives"   on ad_creatives;
drop policy if exists "public read insights"       on ai_insights;
drop policy if exists "allow public select"        on analytics;
drop policy if exists "public read campaign_posts" on campaign_posts;
drop policy if exists "public read campaigns"      on campaigns;
drop policy if exists "allow public select"        on clients;
drop policy if exists "public read comp_snap"      on competitor_snapshots;
drop policy if exists "public read competitors"    on competitors;
drop policy if exists "public read conversions"    on conversions;
drop policy if exists "public read documents"      on documents;
drop policy if exists "event_pages public select"  on event_pages;
drop policy if exists "public read event_pages"    on event_pages;
drop policy if exists "allow public select"        on invoices;
drop policy if exists "allow public select"        on media;
drop policy if exists "comments public select"     on media_comments;
drop policy if exists "public read media_comments" on media_comments;
drop policy if exists "public read pmh"            on post_metrics_history;
drop policy if exists "allow public select"        on shoots;
drop policy if exists "public read alerts"         on social_alerts;
drop policy if exists "public read posts"          on social_posts;
drop policy if exists "public read snapshots"      on social_stat_snapshots;
drop policy if exists "public read strategies"     on strategies;

-- B.b — écritures LEGACY restées après B.1 (cross-tenant : tout
-- utilisateur authentifié pouvait écrire dans toutes les agences ;
-- « agency write » posée en B.1 suffit désormais)
drop policy if exists "allow auth insert" on clients;
drop policy if exists "allow auth update" on clients;
drop policy if exists "allow auth delete" on clients;
drop policy if exists "allow auth insert" on media;
drop policy if exists "allow auth update" on media;
drop policy if exists "allow auth delete" on media;
drop policy if exists "allow auth insert" on invoices;
drop policy if exists "allow auth update" on invoices;
drop policy if exists "allow auth delete" on invoices;
drop policy if exists "allow auth insert" on shoots;
drop policy if exists "allow auth update" on shoots;
drop policy if exists "allow auth delete" on shoots;
drop policy if exists "allow auth insert" on analytics;
drop policy if exists "allow auth update" on analytics;
drop policy if exists "allow auth delete" on analytics;

-- B.c — media_comments : l'insert invités passe par add_media_comment
-- (RPC scellée) ; l'admin garde l'écriture via « agency write » comme
-- les autres tables (l'agency_id est posé par trigger avant le CHECK).
drop policy if exists "comments public insert"       on media_comments;
drop policy if exists "public insert media_comments" on media_comments;
drop policy if exists "comments auth update"         on media_comments;
drop policy if exists "comments auth delete"         on media_comments;
drop policy if exists "auth write media_comments"    on media_comments;
drop policy if exists "agency write" on media_comments;
create policy "agency write" on media_comments for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

-- B.d — les vues s'exécutaient avec les droits du propriétaire
-- (contournement de la RLS : lisibles par anon même sans politique).
-- En security_invoker, elles suivent la RLS de l'appelant — vides
-- pour anon, cloisonnées par agence pour les admins.
alter view v_social_accounts_public set (security_invoker = true);
alter view v_campaign_kpis          set (security_invoker = true);

-- ┌──────────────────────────────────────────────────────────┐
-- │ PHASE C — codes d'accès uniques PAR agence               │
-- └──────────────────────────────────────────────────────────┘
-- Chaque agence gère son propre espace de codes. portal_client()
-- refuse déjà les codes ambigus (présents dans 2 agences) : dans ce
-- cas rarissime, régénérer le code de l'un des deux clients. B.3
-- lèvera l'ambiguïté proprement (contexte d'agence via le domaine).
alter table clients drop constraint if exists clients_code_key;
alter table clients add constraint clients_agency_code_key unique (agency_id, code);

-- ✅ B.2 TERMINÉE — plus aucune lecture produit possible avec la
--    seule clé anon ; l'espace client est scellé par le code d'accès
--    (vérifié côté serveur, cloisonné par agence) ; les écritures
--    invités (commentaires, approbations) sont scellées de même.
--    Prochaine étape : B.3 (onboarding, marque blanche visible,
--    quotas de stockage, Stripe) — voir files/SAAS-ROADMAP.md.
