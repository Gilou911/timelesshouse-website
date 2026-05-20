-- ════════════════════════════════════════════════════════════
-- 📊 TIMELESSHOUSE — SCHÉMA SUPABASE COMPLET (v3 — mai 2026)
-- ════════════════════════════════════════════════════════════
-- Généré à partir de l'introspection réelle de la base de données.
-- Fidèle à 100% à ce qui tourne en production.
--
-- ⚠️ CHANGEMENT v3 (mai 2026) :
--   ▸ Ajout de la colonne shoots.date_iso (date)
--     Le front (ShootForm) enregistre désormais une date ISO complète
--     via <input type="date">, en plus des champs legacy
--     (date_day / month_label / year) conservés pour l'affichage.
--   ▸ Une section MIGRATION idempotente a été ajoutée en fin de
--     fichier : elle ajoute date_iso aux bases DÉJÀ existantes
--     (create table if not exists ne touche pas une table existante).
--
-- À exécuter dans Supabase :
--   Dashboard Supabase → SQL Editor → coller ce fichier → Run
--   (Le fichier est idempotent : ré-exécutable sans danger.)
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
-- date_iso     : date complète au format ISO (AAAA-MM-JJ). Source de
--                vérité saisie via <input type="date"> dans ShootForm.
-- date_day /   : champs LEGACY recalculés à partir de date_iso pour
-- month_label /  l'affichage compact (pastille calendrier). Conservés
-- year           pour compatibilité avec l'ancien rendu client.
create table if not exists shoots (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references clients(id) on delete cascade,
  title       text        not null,
  type        text        default 'photo'
                          check (type in ('photo', 'video')),
  date_iso    date,                               -- date du tournage (ISO, source de vérité)
  date_day    integer,                            -- legacy : 1-31
  month_label text        default 'Avr',          -- legacy : ex "Avr"
  year        integer     default 2026,           -- legacy : ex 2026
  time_label  text,                               -- ex: "09:00 — 16:00"
  location    text,
  notes       text,
  created_at  timestamptz default now()
);


-- ════════════════════════════════════════════════════════════
-- 🔧 MIGRATION — bases déjà existantes
-- ════════════════════════════════════════════════════════════
-- IMPORTANT : "create table if not exists" ne modifie PAS une table
-- déjà présente en production. Ce bloc ajoute donc explicitement la
-- colonne manquante sur les bases existantes. Il est idempotent
-- (sans effet si la colonne existe déjà).
alter table shoots add column if not exists date_iso date;

-- Rétro-remplissage : reconstruire date_iso pour les tournages
-- existants à partir des champs legacy, quand c'est possible.
-- month_label attendu sous forme abrégée FR ("Jan", "Fév", "Mar"…).
update shoots
set date_iso = make_date(
  coalesce(year, 2026),
  case lower(left(month_label, 3))
    when 'jan' then 1
    when 'fév' then 2  when 'fev' then 2
    when 'mar' then 3
    when 'avr' then 4
    when 'mai' then 5
    when 'jui' then 6                 -- "Juin" (ambigu avec Juillet : voir note)
    when 'jul' then 7
    when 'aoû' then 8  when 'aou' then 8
    when 'sep' then 9
    when 'oct' then 10
    when 'nov' then 11
    when 'déc' then 12 when 'dec' then 12
    else 1
  end,
  greatest(1, least(28, coalesce(date_day, 1)))   -- borne 1..28 pour éviter les dates invalides
)
where date_iso is null
  and date_day is not null
  and month_label is not null
  and year is not null;
-- NOTE : "Jui" est ambigu entre Juin et Juillet en abrégé 3 lettres.
-- Le rétro-remplissage suppose Juin. Vérifiez/corrigez manuellement
-- les éventuels tournages de juillet après exécution si besoin.

-- Recharge immédiate du cache de schéma PostgREST
-- (sinon l'API peut renvoyer "Could not find the column ... in the
-- schema cache" pendant quelques secondes).
notify pgrst, 'reload schema';


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

-- Note : si vous ré-exécutez ce fichier sur une base existante,
-- "create trigger" lèvera une erreur "trigger already exists".
-- Les deux DROP ci-dessous rendent la création idempotente.
drop trigger if exists event_pages_updated_at on event_pages;
create trigger event_pages_updated_at
  before update on event_pages
  for each row execute function set_updated_at();

drop trigger if exists analytics_updated_at on analytics;
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
-- "drop policy if exists" rend chaque création idempotente
-- (ré-exécution du fichier sans erreur "policy already exists").
drop policy if exists "public read clients"        on clients;
create policy "public read clients"        on clients        for select using (true);
drop policy if exists "public read analytics"      on analytics;
create policy "public read analytics"      on analytics      for select using (true);
drop policy if exists "public read documents"      on documents;
create policy "public read documents"      on documents      for select using (true);
drop policy if exists "public read event_pages"    on event_pages;
create policy "public read event_pages"    on event_pages    for select using (true);
drop policy if exists "public read invoices"       on invoices;
create policy "public read invoices"       on invoices       for select using (true);
drop policy if exists "public read media"          on media;
create policy "public read media"          on media          for select using (true);
drop policy if exists "public read media_comments" on media_comments;
create policy "public read media_comments" on media_comments for select using (true);
drop policy if exists "public read notifications"  on notifications;
create policy "public read notifications"  on notifications  for select using (true);
drop policy if exists "public read shoots"         on shoots;
create policy "public read shoots"         on shoots         for select using (true);

-- ── Écriture admin uniquement ────────────────────────────────
drop policy if exists "auth write clients"        on clients;
create policy "auth write clients"        on clients        for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write analytics"      on analytics;
create policy "auth write analytics"      on analytics      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write documents"      on documents;
create policy "auth write documents"      on documents      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write event_pages"    on event_pages;
create policy "auth write event_pages"    on event_pages    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write invoices"       on invoices;
create policy "auth write invoices"       on invoices       for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write media"          on media;
create policy "auth write media"          on media          for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write media_comments" on media_comments;
create policy "auth write media_comments" on media_comments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write notifications"  on notifications;
create policy "auth write notifications"  on notifications  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth write shoots"         on shoots;
create policy "auth write shoots"         on shoots         for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Écriture cliente : commentaires (le client peut poster) ──
-- Les clients peuvent INSERT des commentaires sans être authentifiés Supabase
-- (ils sont identifiés par leur code, pas par Supabase Auth)
drop policy if exists "client insert media_comments" on media_comments;
create policy "client insert media_comments" on media_comments
  for insert with check (is_admin = false);


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
