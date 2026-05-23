-- ════════════════════════════════════════════════════════════
-- 📊 TIMELESSHOUSE — SCHÉMA SUPABASE COMPLET (v2 — mai 2026)
-- ════════════════════════════════════════════════════════════
-- Généré à partir de l'introspection réelle de la base de données.
-- Fidèle à 100% à ce qui tourne en production.
--
-- À exécuter UNE SEULE FOIS dans Supabase :
--   Dashboard Supabase → SQL Editor → coller ce fichier → Run
--
-- Tables présentes :
--   1. clients         — espaces clients (tous univers)
--   2. analytics       — KPIs réseaux sociaux par client
--   3. documents       — fichiers contractuels livrés au client
--   4. event_pages     — configuration des pages événementielles (vidéos, photos…)
--   5. invoices        — factures
--   6. media           — photos & vidéos livrées (univers Communication)
--   7. media_comments  — commentaires par média
--   8. notifications   — historique des emails envoyés
--   9. shoots          — tournages planifiés
-- ════════════════════════════════════════════════════════════


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 1 : clients                                          │
-- │  Un client = un espace (Communication ou événementiel)      │
-- └────────────────────────────────────────────────────────────┘
create table if not exists clients (
  id                uuid        primary key default gen_random_uuid(),
  code              text        unique not null,           -- slug d'accès ex: "maison-lumiere"
  name              text        not null,                  -- ex: "Maison Lumière"
  greeting          text,                                  -- prénom de contact pour les emails
  initials          text,                                  -- ex: "ML"
  sector            text,                                  -- ex: "Hôtellerie de luxe"
  agency_name       text        default 'TimelessHouse',
  client_email      text,                                  -- email pour les notifications
  universe          text        default 'communication',   -- communication | mariage | fiancailles | anniversaire-mariage
  redirect_url      text,                                  -- URL de redirection personnalisée après login
  partner1          text,                                  -- prénom partenaire 1 (univers couple)
  partner2          text,                                  -- prénom partenaire 2 (univers couple)
  active            boolean     default true,
  -- Modules activables / désactivables par client
  analytics_enabled boolean     default false,
  media_enabled     boolean     default true,
  invoices_enabled  boolean     default true,
  shoots_enabled    boolean     default true,
  documents_enabled boolean     default true,
  -- Stockage (affiché dans le dashboard)
  storage_used      text        default '0 GB',
  storage_total     text        default '15 GB',
  storage_percent   integer     default 0,
  created_at        timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 2 : analytics                                        │
-- │  1 ligne par client — KPIs et données graphiques            │
-- └────────────────────────────────────────────────────────────┘
create table if not exists analytics (
  client_id         uuid        primary key references clients(id) on delete cascade,
  total_followers   text        default '—',
  followers_delta   text        default '',
  engagement        text        default '—',
  engagement_delta  text        default '',
  reach             text        default '—',
  reach_delta       text        default '',
  clicks            text        default '—',
  clicks_delta      text        default '',
  spent_delta       text        default '',
  media_delta       text        default '',
  platforms         jsonb       default '[]',   -- [{name, icon, followers, ...}]
  demographics      jsonb       default '[]',   -- [{age, percent}]
  follower_growth   jsonb       default '[]',   -- [{week, value}]
  engagement_by_day jsonb       default '[]',   -- [{day, insta, fb, tt}]
  ai_summary        jsonb,                      -- {headline, body}
  updated_at        timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 3 : documents                                        │
-- │  Fichiers contractuels / graphiques livrés au client        │
-- └────────────────────────────────────────────────────────────┘
create table if not exists documents (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  title       text        not null,                -- ex: "Contrat de prestation 2026"
  category    text        default 'Autre',         -- Contrat | Charte graphique | Devis | Brief | Autre
  file_url    text        not null,                -- URL Supabase Storage ou lien externe
  date_label  text,                                -- ex: "15 Avr 2026"
  size_label  text,                                -- ex: "1,2 MB"
  position    integer     default 0,               -- ordre d'affichage
  created_at  timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 4 : event_pages  ⚠️ NON DOCUMENTÉE INITIALEMENT     │
-- │  Configuration des pages de livraison événementielles       │
-- │  (mariage, fiançailles, anniversaire — vidéos, photos…)     │
-- └────────────────────────────────────────────────────────────┘
-- Une ligne par page configurée pour un client.
-- page_type : ex "mariage-video", "mariage-photos", "fiancailles-video", etc.
-- config    : jsonb libre contenant toute la config de la page.
--
-- Exemple de config (page vidéo mariage) :
-- {
--   "afficherTeaser": true,
--   "afficherFilm": true,
--   "teaserUrls": { "1080p": "https://...", "4K": "https://..." },
--   "filmUrls":   { "1080p": "https://...", "4K": "https://..." },
--   "teaserDownloadUrl": "https://...",
--   "filmDownloadUrl":   "https://...",
--   "defaultVideo": "film",
--   "upsellBouton": false,
--   "upsellTexte":  "Commander ce film",
--   "upsellLien":   "mailto:service@timelesshouse.org"
-- }
create table if not exists event_pages (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  page_type   text        not null,               -- identifiant du modèle de page
  config      jsonb       not null default '{}',  -- configuration complète de la page
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 5 : invoices                                         │
-- └────────────────────────────────────────────────────────────┘
create table if not exists invoices (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  reference   text        not null,               -- ex: "FAC-2026-042"
  description text,
  amount      numeric(10,2) not null,
  date_label  text,                               -- ex: "15 Avr 2026"
  due_date    date,                               -- date d'échéance (optionnel)
  status      text        default 'en attente'
                          check (status in ('payée', 'en attente')),
  pdf_url     text,                               -- lien vers le PDF de la facture
  created_at  timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 6 : media                                            │
-- │  Photos & vidéos livrées (univers Communication)            │
-- └────────────────────────────────────────────────────────────┘
create table if not exists media (
  id              uuid        primary key default gen_random_uuid(),
  client_id       uuid        references clients(id) on delete cascade,
  shoot_id        uuid        references shoots(id) on delete set null,  -- tournage associé
  type            text        check (type in ('photo', 'video')),
  title           text        not null,
  url             text,                           -- URL haute qualité (téléchargement)
  preview_url     text,                           -- URL allégée pour streaming navigateur
  thumb_url       text,                           -- miniature
  thumb_grad      text        default 'linear-gradient(135deg,#1a1a1d 0%,#3a3a3d 100%)',
  -- 🎯 Cadrage de la VIDÉO DE PREVIEW (celle qui démarre au survol côté client).
  -- N'affecte PAS la vignette statique (img), qui reste cover/center par défaut.
  -- focus_x / focus_y : position du point d'intérêt dans la vidéo, en % (0-100)
  -- zoom : facteur d'agrandissement (1 = original, 2 = ×2, etc.) pour exclure
  -- des bandes noires intégrées dans le fichier MP4 ou recentrer le cadrage.
  preview_focus_x numeric     default 50,
  preview_focus_y numeric     default 50,
  preview_zoom    numeric     default 1,
  date_label      text,                           -- ex: "12 Avr 2026"
  duration        text,                           -- vidéos uniquement, ex: "0:45"
  size_label      text,                           -- ex: "128 MB"
  tag             text,                           -- ex: "Réseaux sociaux"
  approval_status text        default 'pending'
                              check (approval_status in ('pending', 'approved', 'changes')),
  position        integer     default 0,
  created_at      timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 7 : media_comments                                   │
-- │  Commentaires laissés par le client ou l'admin sur un média │
-- └────────────────────────────────────────────────────────────┘
create table if not exists media_comments (
  id          uuid        primary key default gen_random_uuid(),
  media_id    uuid        references media(id) on delete cascade,
  author_name text        not null,               -- prénom ou "TimelessHouse"
  is_admin    boolean     default false,           -- true = commentaire de l'agence
  comment     text        not null,
  created_at  timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 8 : notifications  ⚠️ NON DOCUMENTÉE INITIALEMENT   │
-- │  Historique de tous les emails envoyés aux clients          │
-- └────────────────────────────────────────────────────────────┘
-- Chaque appel à la Edge Function notify-client insère une ligne ici.
-- kind    : "welcome" | "new_media" | "event_ready" | "invoice_ready"
-- payload : le corps JSON envoyé à la Edge Function (pour debug/audit)
-- sent_at : null si l'envoi a échoué, timestamptz si succès
create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  kind        text,                               -- type de notification
  payload     jsonb,                              -- payload complet envoyé
  sent_at     timestamptz,                        -- null = échec, non-null = succès
  created_at  timestamptz default now()
);


-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 9 : shoots                                           │
-- │  Tournages planifiés (affichés dans le calendrier client)   │
-- └────────────────────────────────────────────────────────────┘
create table if not exists shoots (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  title       text        not null,
  type        text        default 'photo'
                          check (type in ('photo', 'video')),
  date_day    integer,                            -- 1-31
  month_label text        default 'Avr',          -- ex: "Avr"
  year        integer     default 2026,
  time_label  text,                               -- ex: "09:00 — 16:00"
  location    text,
  notes       text,
  created_at  timestamptz default now()
);


-- ════════════════════════════════════════════════════════════
-- ⚡ TRIGGER : updated_at automatique sur event_pages
-- ════════════════════════════════════════════════════════════
-- La fonction set_updated_at() existe déjà en production.
-- Si elle n'existe pas encore, la créer :
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger event_pages_updated_at
  before update on event_pages
  for each row execute function set_updated_at();

create trigger analytics_updated_at
  before update on analytics
  for each row execute function set_updated_at();


-- ════════════════════════════════════════════════════════════
-- ⚡ FONCTION RPC : update_media_approval
-- ════════════════════════════════════════════════════════════
-- Appelée depuis l'admin pour changer le statut d'approbation d'un média.
-- Utilise security definer pour contourner RLS depuis le front.
create or replace function update_media_approval(p_media_id uuid, p_status text)
returns void language plpgsql security definer as $$
begin
  update media
  set approval_status = p_status
  where id = p_media_id;
end;
$$;


-- ════════════════════════════════════════════════════════════
-- 🔐 ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
-- Principe :
--   ▸ Lecture publique sur toutes les tables (les clients
--     lisent leurs données via leur code, qui agit comme clé)
--   ▸ Écriture réservée aux admins authentifiés (Supabase Auth)
-- ════════════════════════════════════════════════════════════

alter table clients        enable row level security;
alter table analytics      enable row level security;
alter table documents      enable row level security;
alter table event_pages    enable row level security;
alter table invoices       enable row level security;
alter table media          enable row level security;
alter table media_comments enable row level security;
alter table notifications  enable row level security;
alter table shoots         enable row level security;

-- ── Lecture publique ─────────────────────────────────────────
create policy "public read clients"        on clients        for select using (true);
create policy "public read analytics"      on analytics      for select using (true);
create policy "public read documents"      on documents      for select using (true);
create policy "public read event_pages"    on event_pages    for select using (true);
create policy "public read invoices"       on invoices       for select using (true);
create policy "public read media"          on media          for select using (true);
create policy "public read media_comments" on media_comments for select using (true);
create policy "public read notifications"  on notifications  for select using (true);
create policy "public read shoots"         on shoots         for select using (true);

-- ── Écriture admin uniquement ────────────────────────────────
create policy "auth write clients"        on clients        for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write analytics"      on analytics      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write documents"      on documents      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write event_pages"    on event_pages    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write invoices"       on invoices       for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write media"          on media          for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write media_comments" on media_comments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write notifications"  on notifications  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write shoots"         on shoots         for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Écriture cliente : commentaires (le client peut poster) ──
-- Les clients peuvent INSERT des commentaires sans être authentifiés Supabase
-- (ils sont identifiés par leur code, pas par Supabase Auth)
create policy "client insert media_comments" on media_comments
  for insert with check (is_admin = false);


-- ════════════════════════════════════════════════════════════
-- 🔄 MIGRATION INCRÉMENTALE — bases déjà déployées
-- ════════════════════════════════════════════════════════════
-- Ce bloc est idempotent : safe à exécuter plusieurs fois.
-- Gère les deux scénarios :
--   A) la migration n'a JAMAIS été exécutée → crée les colonnes preview_focus_*
--   B) une ancienne version avait créé thumb_focus_* → les renomme proprement
do $$
begin
  -- Scénario B : renommer si l'ancien nom existait
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media'
             and column_name = 'thumb_focus_x') then
    alter table media rename column thumb_focus_x to preview_focus_x;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media'
             and column_name = 'thumb_focus_y') then
    alter table media rename column thumb_focus_y to preview_focus_y;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'media'
             and column_name = 'thumb_zoom') then
    alter table media rename column thumb_zoom to preview_zoom;
  end if;
end $$;

-- Scénario A (et compléter B si une seule colonne avait été renommée) :
-- création si absentes.
alter table media add column if not exists preview_focus_x numeric default 50;
alter table media add column if not exists preview_focus_y numeric default 50;
alter table media add column if not exists preview_zoom    numeric default 1;


-- ════════════════════════════════════════════════════════════
-- ✅ INSTALLATION TERMINÉE
-- ════════════════════════════════════════════════════════════
-- Étapes suivantes :
--   1. Supabase → Authentication → Users → Add user
--      Créer le compte admin (email + mot de passe)
--   2. Créer le fichier supabase-config.js à la racine du site :
--      window.SUPABASE_URL  = 'https://XXXX.supabase.co';
--      window.SUPABASE_ANON_KEY = 'eyJhbGci...';
--   3. Déployer la Edge Function :
--      supabase functions deploy notify-client
--   4. Se connecter sur communication-admin.html
-- ════════════════════════════════════════════════════════════
