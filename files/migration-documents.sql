-- ════════════════════════════════════════════════════════════
-- 📁 MIGRATION — Espace Documents (contrats, chartes, devis…)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE SEULE FOIS dans Supabase :
--   Dashboard Supabase → SQL Editor → coller ce fichier → Run
-- Idempotent, MAIS voir l'avertissement juste en dessous.
-- ⚠️  NE REJOUEZ PAS CE FICHIER TEL QUEL (audit du 07/08/2026).
--     Il date d'AVANT le cloisonnement par agence : les lectures
--     publiques qu'il posait ont été supprimées depuis
--     (migration-saas-b2.sql). Les rejouer rouvrirait à n'importe quel
--     visiteur des données de TOUS les locataires. Les lignes fautives
--     sont désormais neutralisées ci-dessous, et expliquées sur place.

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
-- ⚠️ NEUTRALISÉE (07/08/2026). Cette policy rendait TOUS les documents
-- clients — contrats, devis, chartes, avec leurs URL de fichier —
-- lisibles par n'importe quel visiteur, tous locataires confondus.
-- La page client passe aujourd'hui par des RPC scellées par le code
-- d'accès. Le `drop` ci-dessus reste : rejouer ce fichier NETTOIE au
-- lieu d'ouvrir.
-- create policy "public read documents"
--   on documents for select using (true);

drop policy if exists "auth write documents" on documents;
create policy "auth write documents"
  on documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════
-- ✅ TERMINÉ
-- ════════════════════════════════════════════════════════════
-- ⚠️ L'« astuce » qui vivait ici — un bucket Supabase PUBLIC pour les
-- PDF — a été retirée le 07/08/2026 : un contrat ou un devis dans un
-- seau public se lit avec la seule URL. Les documents passent par
-- l'upload de la console (dépôt B2 sous le préfixe de la loge, servi
-- par URL signée).
-- ════════════════════════════════════════════════════════════
