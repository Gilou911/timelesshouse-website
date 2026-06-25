-- ════════════════════════════════════════════════════════════
-- 🎞️  TIMELESSHOUSE — MODULE PORTFOLIO & ESPACES DE PROSPECTION
-- ════════════════════════════════════════════════════════════
-- Trois tables + deux RPC. 100 % idempotent (relançable sans risque).
--   ▸ portfolio_items   — bibliothèque vitrine (tes meilleures réalisations)
--   ▸ portfolio_spaces  — espaces personnalisés partageables par token
--                         (kind = prospect | ambassador)
--   ▸ portfolio_leads   — demandes de mise en relation issues d'un espace
--
-- MODÈLE D'ACCÈS (volontairement plus strict que le reste du schéma) :
--   ▸ AUCUNE lecture publique directe sur ces tables.
--   ▸ Le public n'accède au contenu QUE via la RPC security-definer
--     get_portfolio_space_by_token() — qui ne renvoie qu'un espace
--     *publié* + *partage activé*, avec uniquement les sections choisies.
--   ▸ Les leads sont insérés côté serveur par la Edge Function notify-lead
--     (clé service-role) : pas de policy INSERT publique → pas de spam direct.
--
-- À exécuter dans Supabase → SQL Editor → coller → Run.
-- ════════════════════════════════════════════════════════════


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 1 : portfolio_items                                  │
-- │  Bibliothèque vitrine. category = section (Mariage, etc.)   │
-- │  Calquée sur `media` pour réutiliser la logique d'aperçu.   │
-- └────────────────────────────────────────────────────────────┘
create table if not exists portfolio_items (
  id              uuid        primary key default gen_random_uuid(),
  type            text        not null default 'photo' check (type in ('photo','video')),
  title           text        not null,
  category        text        not null default 'Général',  -- = section affichable
  url             text,                                     -- HQ / lien complet (Cloudinary, B2…)
  preview_url     text,                                     -- vidéo ALLÉGÉE pour le hover (jamais l'original)
  thumb_url       text,                                     -- miniature statique
  thumb_grad      text        default 'linear-gradient(135deg,#1a1a1d 0%,#3a3a3d 100%)',
  -- Cadrage de la vidéo de preview (cf. table media) : point d'intérêt en % + zoom.
  preview_focus_x numeric     default 50,
  preview_focus_y numeric     default 50,
  preview_zoom    numeric     default 1,
  duration        text,                                     -- vidéos : "0:45"
  caption         text,                                     -- légende optionnelle
  active          boolean     default true,                 -- masquer sans supprimer
  position        integer     default 0,                    -- ordre dans la section
  created_at      timestamptz default now()
);

create index if not exists portfolio_items_cat_pos_idx
  on portfolio_items (category, position, created_at);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 2 : portfolio_spaces                                 │
-- │  Un espace = une vue personnalisée + partageable par token. │
-- └────────────────────────────────────────────────────────────┘
create table if not exists portfolio_spaces (
  id              uuid        primary key default gen_random_uuid(),
  kind            text        not null default 'prospect'
                              check (kind in ('prospect','ambassador')),
  recipient_name  text,                                     -- nom du prospect / de l'ambassadeur
  referrer_name   text,                                     -- ambassadeur : "X vous recommande" (souvent = recipient_name)
  title           text,                                     -- titre d'accueil optionnel (sinon défaut côté front)
  intro           text,                                     -- mot d'intro personnalisé
  sections        jsonb       default '[]'::jsonb,          -- catégories à afficher, DANS L'ORDRE ; [] = toutes
  cta_label       text        default 'Demander un devis',
  cta_url         text,                                     -- mailto:/tel:/URL ; défaut côté front si null
  show_lead_form  boolean     default true,                 -- formulaire de mise en relation
  agency_name     text        default 'TimelessHouse',
  share_token     text        unique not null
                              default replace(gen_random_uuid()::text, '-', ''),
  share_enabled   boolean     default true,
  status          text        default 'draft' check (status in ('draft','published')),
  view_count      integer     default 0,                    -- "le prospect a-t-il ouvert l'espace ?"
  last_viewed_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists portfolio_spaces_token_idx on portfolio_spaces (share_token);
create index if not exists portfolio_spaces_kind_idx  on portfolio_spaces (kind, created_at desc);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 3 : portfolio_leads                                  │
-- │  Demande de mise en relation depuis un espace.              │
-- │  space_token + kind sont copiés pour survivre à une         │
-- │  suppression de l'espace (on delete set null).              │
-- └────────────────────────────────────────────────────────────┘
create table if not exists portfolio_leads (
  id          uuid        primary key default gen_random_uuid(),
  space_id    uuid        references portfolio_spaces(id) on delete set null,
  space_token text,
  kind        text,
  name        text        not null,
  email       text,
  phone       text,
  message     text,
  handled     boolean     default false,                    -- suivi admin
  created_at  timestamptz default now()
);

create index if not exists portfolio_leads_space_idx on portfolio_leads (space_id, created_at desc);


-- ════════════════════════════════════════════════════════════
-- ⚡ updated_at automatique sur portfolio_spaces
-- ════════════════════════════════════════════════════════════
-- set_updated_at() existe déjà (schema.sql) ; on la (re)crée par sécurité.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_spaces_updated_at on portfolio_spaces;
create trigger portfolio_spaces_updated_at
  before update on portfolio_spaces
  for each row execute function set_updated_at();


-- ════════════════════════════════════════════════════════════
-- ⚡ RPC : get_portfolio_space_by_token  (lecture publique par token)
-- ════════════════════════════════════════════════════════════
-- Renvoie l'espace (publié + activé) + ses items, filtrés aux sections
-- choisies, en un seul objet jsonb. security definer → contourne la RLS.
create or replace function get_portfolio_space_by_token(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',             s.id,
    'kind',           s.kind,
    'recipient_name', s.recipient_name,
    'referrer_name',  s.referrer_name,
    'title',          s.title,
    'intro',          s.intro,
    'sections',       s.sections,
    'cta_label',      s.cta_label,
    'cta_url',        s.cta_url,
    'show_lead_form', s.show_lead_form,
    'agency_name',    s.agency_name,
    'share_token',    s.share_token,
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.position, i.created_at)
      from portfolio_items i
      where i.active = true
        and (
          s.sections is null
          or jsonb_typeof(s.sections) <> 'array'
          or jsonb_array_length(s.sections) = 0
          or i.category in (select jsonb_array_elements_text(s.sections))
        )
    ), '[]'::jsonb)
  )
  from portfolio_spaces s
  where s.share_token = p_token
    and s.share_enabled = true
    and s.status = 'published'
  limit 1;
$$;

grant execute on function get_portfolio_space_by_token(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- ⚡ RPC : bump_portfolio_view  (compteur d'ouvertures)
-- ════════════════════════════════════════════════════════════
-- Appelée une fois au chargement de la page publique.
create or replace function bump_portfolio_view(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update portfolio_spaces
  set view_count     = coalesce(view_count, 0) + 1,
      last_viewed_at = now()
  where share_token = p_token
    and share_enabled = true;
$$;

grant execute on function bump_portfolio_view(text) to anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 🔐 ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
-- Lecture ET écriture réservées à l'admin authentifié (Supabase Auth).
-- Le public passe EXCLUSIVEMENT par les RPC security-definer ci-dessus.
-- Les leads sont insérés par la Edge Function (service-role) → aucune
-- policy publique nécessaire ni souhaitable.
alter table portfolio_items  enable row level security;
alter table portfolio_spaces enable row level security;
alter table portfolio_leads  enable row level security;

drop policy if exists "auth all portfolio_items"  on portfolio_items;
drop policy if exists "auth all portfolio_spaces" on portfolio_spaces;
drop policy if exists "auth all portfolio_leads"  on portfolio_leads;

create policy "auth all portfolio_items" on portfolio_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth all portfolio_spaces" on portfolio_spaces
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth all portfolio_leads" on portfolio_leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-- ════════════════════════════════════════════════════════════
-- 🔄 Recharge du cache de schéma PostgREST
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════
-- ✅ INSTALLATION TERMINÉE
-- ════════════════════════════════════════════════════════════
-- Étapes suivantes :
--   1. Déployer la Edge Function de mise en relation :
--        supabase functions deploy notify-lead
--      (clé Resend déjà en secret ; sinon : supabase secrets set RESEND_API_KEY=...)
--   2. Ajouter le module Portfolio à communication-admin.jsx (phase 2)
--   3. Déposer portfolio.html + portfolio-public.jsx à la racine du site (phase 2)
-- ════════════════════════════════════════════════════════════
