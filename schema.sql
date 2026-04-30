-- ════════════════════════════════════════════════════════════
-- 📊 TIMELESSHOUSE — SCHÉMA SUPABASE (univers Communication)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE SEULE FOIS dans Supabase :
--   Dashboard Supabase → SQL Editor → coller ce fichier → Run
-- ════════════════════════════════════════════════════════════

-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 1 : clients                                          │
-- │  Un client = une marque qui a accès à son espace            │
-- └────────────────────────────────────────────────────────────┘
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,                  -- ex: "maison-lumiere"
  name            text not null,                         -- ex: "Maison Lumière"
  greeting        text,                                  -- prénom du contact
  initials        text,                                  -- ex: "ML"
  sector          text,                                  -- ex: "Hôtellerie de luxe"
  agency_name     text default 'TimelessHouse',
  storage_used    text default '0 GB',
  storage_total   text default '15 GB',
  storage_percent integer default 0,
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 2 : media (photos & vidéos livrées)                  │
-- └────────────────────────────────────────────────────────────┘
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  type        text check (type in ('photo', 'video')),
  title       text not null,
  url         text,                                      -- lien Cloudinary, Streamable, Drive...
  thumb_url   text,                                      -- miniature (optionnel)
  thumb_grad  text default 'linear-gradient(135deg,#1a1a1d 0%,#3a3a3d 100%)',
  date_label  text,                                      -- ex: "12 Avr 2026"
  duration    text,                                      -- vidéos uniquement
  size_label  text,                                      -- ex: "128 MB"
  tag         text,                                      -- ex: "Réseaux sociaux"
  position    integer default 0,                         -- ordre d'affichage
  created_at  timestamptz default now()
);

-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 3 : invoices                                         │
-- └────────────────────────────────────────────────────────────┘
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id) on delete cascade,
  reference    text not null,                            -- ex: "FAC-2026-042"
  description  text,
  amount       numeric(10,2) not null,
  date_label   text,                                     -- ex: "15 Avr 2026"
  status       text check (status in ('payée', 'en attente')) default 'en attente',
  pdf_url      text,
  created_at   timestamptz default now()
);

-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 4 : shoots (tournages prévus)                        │
-- └────────────────────────────────────────────────────────────┘
create table if not exists shoots (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  title       text not null,
  type        text check (type in ('photo', 'video')) default 'photo',
  date_day    integer,                                   -- 1-31
  month_label text default 'Avr',
  year        integer default 2026,
  time_label  text,                                      -- ex: "09:00 — 16:00"
  location    text,
  notes       text,
  created_at  timestamptz default now()
);

-- ┌────────────────────────────────────────────────────────────┐
-- │  TABLE 5 : analytics (1 ligne par client, JSON pour KPIs)   │
-- └────────────────────────────────────────────────────────────┘
create table if not exists analytics (
  client_id           uuid primary key references clients(id) on delete cascade,
  total_followers     text default '—',
  followers_delta     text default '',
  engagement          text default '—',
  engagement_delta    text default '',
  reach               text default '—',
  reach_delta         text default '',
  clicks              text default '—',
  clicks_delta        text default '',
  spent_delta         text default '',
  media_delta         text default '',
  platforms           jsonb default '[]',                -- liste des réseaux
  demographics        jsonb default '[]',                -- répartition d'âge
  follower_growth     jsonb default '[]',                -- série temporelle
  engagement_by_day   jsonb default '[]',                -- série par jour
  ai_summary          jsonb,                             -- {headline, body}
  updated_at          timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- 🔐 ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
-- Règles :
--   ▸ Lecture publique : OK (les clients lisent leurs propres données
--     à partir de leur code, qui agit comme une clé d'accès)
--   ▸ Écriture : seulement si authentifié (= l'admin connecté)
-- ════════════════════════════════════════════════════════════

alter table clients   enable row level security;
alter table media     enable row level security;
alter table invoices  enable row level security;
alter table shoots    enable row level security;
alter table analytics enable row level security;

-- Lecture publique
create policy "public read clients"   on clients   for select using (true);
create policy "public read media"     on media     for select using (true);
create policy "public read invoices"  on invoices  for select using (true);
create policy "public read shoots"    on shoots    for select using (true);
create policy "public read analytics" on analytics for select using (true);

-- Écriture uniquement par admin connecté
create policy "auth write clients"   on clients   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write media"     on media     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write invoices"  on invoices  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write shoots"    on shoots    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write analytics" on analytics for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════
-- ✅ TERMINÉ
-- ════════════════════════════════════════════════════════════
-- Étape suivante :
--   1. Aller dans Authentication → Users → Add user
--   2. Créer ton compte admin (email + mot de passe)
--   3. Tu pourras alors te connecter sur communication-admin.html
-- ════════════════════════════════════════════════════════════
