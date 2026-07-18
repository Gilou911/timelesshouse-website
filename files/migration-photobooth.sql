-- ════════════════════════════════════════════════════════════
-- 📸 MIGRATION — Galeries Photobooth en ligne (juillet 2026)
-- ════════════════════════════════════════════════════════════
-- L'app photobooth locale (Mac de Gil) pousse ici les photos
-- traitées ; la page photobooth.html du site les affiche.
--
-- Modèle de sécurité :
--   ▸ AUCUN accès direct aux tables pour anon (RLS sans policy
--     de lecture publique = tout est refusé). Exposer les tables
--     permettrait d'énumérer tous les tokens et toutes les photos.
--   ▸ La SEULE porte publique est la fonction photobooth_gallery(token) :
--     elle ne rend que la galerie du token présenté.
--   ▸ Les écritures exigent un utilisateur authentifié (le compte
--     machine photobooth@… utilisé par l'app locale).
--   ▸ Les emails des invités NE MONTENT PAS ici : ils restent dans
--     le SQLite local (minimisation des données en ligne).
-- ════════════════════════════════════════════════════════════

create table if not exists photobooth_guests (
  token       text primary key,          -- token de galerie (généré localement)
  event_code  text not null,
  first_name  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists photobooth_photos (
  id          bigint generated always as identity primary key,
  event_code  text not null,
  stem        text not null,             -- nom Sony (DSC01234) = clé de jointure RAW
  url         text not null,             -- URL publique B2
  taken_at    timestamptz,
  created_at  timestamptz not null default now(),
  unique (event_code, stem)
);

create table if not exists photobooth_matches (
  photo_id    bigint not null references photobooth_photos(id) on delete cascade,
  guest_token text   not null references photobooth_guests(token) on delete cascade,
  primary key (photo_id, guest_token)
);

create index if not exists idx_pb_matches_guest on photobooth_matches (guest_token);

alter table photobooth_guests  enable row level security;
alter table photobooth_photos  enable row level security;
alter table photobooth_matches enable row level security;

-- Écritures + lecture : uniquement authentifié (compte machine / admin).
-- Pas de policy pour anon -> lecture directe refusée.
drop policy if exists pb_guests_rw  on photobooth_guests;
drop policy if exists pb_photos_rw  on photobooth_photos;
drop policy if exists pb_matches_rw on photobooth_matches;

create policy pb_guests_rw  on photobooth_guests  for all to authenticated using (true) with check (true);
create policy pb_photos_rw  on photobooth_photos  for all to authenticated using (true) with check (true);
create policy pb_matches_rw on photobooth_matches for all to authenticated using (true) with check (true);

-- ─── Porte publique unique ──────────────────────────────────
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire,
-- donc passe au travers du RLS — mais ne rend QUE les données du
-- token fourni. Un token inconnu rend NULL.
create or replace function photobooth_gallery(p_token text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select case when g.token is null then null else json_build_object(
    'first_name', g.first_name,
    'event_code', g.event_code,
    'photos', coalesce((
      select json_agg(json_build_object(
               'url', p.url,
               'stem', p.stem,
               'taken_at', p.taken_at
             ) order by p.taken_at)
      from photobooth_matches m
      join photobooth_photos p on p.id = m.photo_id
      where m.guest_token = g.token
    ), '[]'::json)
  ) end
  from (select * from photobooth_guests where token = p_token) g;
$$;

revoke all on function photobooth_gallery(text) from public;
grant execute on function photobooth_gallery(text) to anon, authenticated;
