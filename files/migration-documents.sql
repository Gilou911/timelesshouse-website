-- ════════════════════════════════════════════════════════════
-- 📁 MIGRATION — Espace Documents (contrats, chartes, devis…)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE SEULE FOIS dans Supabase :
--   Dashboard Supabase → SQL Editor → coller ce fichier → Run
-- Idempotent : peut être relancé sans risque.
-- ════════════════════════════════════════════════════════════

-- 1 — Nouveau module activable par client (comme media / invoices)
alter table clients
  add column if not exists documents_enabled boolean default true;

-- 2 — Table documents
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  title       text not null,                       -- ex: "Contrat de prestation 2026"
  category    text default 'Autre',                -- Contrat | Charte graphique | Devis | Brief | Autre
  file_url    text not null,                       -- URL Supabase Storage OU lien externe
  date_label  text,                                -- ex: "15 Avr 2026"
  size_label  text,                                -- ex: "1,2 MB" (optionnel)
  position    integer default 0,                   -- ordre d'affichage
  created_at  timestamptz default now()
);

-- 3 — Row Level Security (même logique que les autres tables)
alter table documents enable row level security;

drop policy if exists "public read documents" on documents;
create policy "public read documents"
  on documents for select using (true);

drop policy if exists "auth write documents" on documents;
create policy "auth write documents"
  on documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════
-- ✅ TERMINÉ
-- ════════════════════════════════════════════════════════════
-- Astuce : pour héberger les fichiers directement dans Supabase,
-- crée un bucket public "documents" (Storage → New bucket → public),
-- glisse-y le PDF, puis copie son URL publique dans le champ
-- "URL du fichier" du formulaire admin.
-- ════════════════════════════════════════════════════════════
