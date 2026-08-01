-- ═══════════════════════════════════════════════════════════════════
--  DRIVE — le disque commun de l'équipe
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  ⚠️ CRÉE UNE TABLE → le verrou aal2 est REPOSÉ ici même (§3),
--  à l'identique de migration-2fa-rls.sql. Rien d'autre à rejouer.
--
--  Demande de Gil (01/08/2026) : que les MEMBRES puissent déposer
--  photos et vidéos dans un espace rangeable façon disque dur —
--  dossiers, visionneuse au clic, et pour les vidéos une VERSION
--  ALLÉGÉE (720p, fabriquée par le worker d'encodage) : c'est elle
--  qu'on regarde, l'original ne bouge que pour un téléchargement.
--
--  UNE table porte tout : dossiers et fichiers sont des lignes, le
--  parent fait l'arborescence (NULL = racine). Supprimer un dossier
--  emporte son contenu (cascade) — l'interface prévient avant.

create table if not exists public.drive_items (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  parent_id   uuid references public.drive_items(id) on delete cascade,
  genre       text not null check (genre in ('dossier', 'photo', 'video')),
  nom         text not null check (char_length(btrim(nom)) between 1 and 200),

  -- Fichiers (NULL pour un dossier)
  url         text,              -- original, sur B2
  taille      bigint,
  mime        text,
  largeur     int,
  hauteur     int,
  apercu_url  text,              -- photo : vignette ; vidéo : affiche
  leger_url   text,              -- photo : grande vue ; vidéo : 720p allégée
  duree       int,               -- vidéo, en secondes

  /* La version allégée d'une vidéo : pending → processing → done.
     Écrit par le worker (service_role). NULL pour photos/dossiers. */
  encodage    text check (encodage in ('pending', 'processing', 'done', 'error')),
  erreur      text,

  cree_par    uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists drive_items_dossier_idx on drive_items (agency_id, parent_id, genre, nom);
create index if not exists drive_items_encodage_idx on drive_items (encodage) where encodage in ('pending', 'processing');

alter table public.drive_items enable row level security;

-- ═══ 2. LES VERROUS ════════════════════════════════════════════════
-- TOUTE l'équipe lit, dépose et RANGE (c'est le but du Drive — le
-- rang plancher y a pleinement droit, demande explicite de Gil).
-- SUPPRIMER, en revanche : ses propres dépôts, ou owner/admin — le
-- plancher n'efface pas les rushes du patron.
drop policy if exists "equipe lit le drive" on public.drive_items;
create policy "equipe lit le drive" on public.drive_items
  for select to authenticated
  using (agency_id in (select my_agency_ids()));

drop policy if exists "equipe depose signe d'elle" on public.drive_items;
create policy "equipe depose signe d'elle" on public.drive_items
  for insert to authenticated
  with check (agency_id in (select my_agency_ids()) and cree_par = auth.uid());

drop policy if exists "equipe range le drive" on public.drive_items;
create policy "equipe range le drive" on public.drive_items
  for update to authenticated
  using (agency_id in (select my_agency_ids()));

drop policy if exists "supprimer: les siens ou patron" on public.drive_items;
create policy "supprimer: les siens ou patron" on public.drive_items
  for delete to authenticated
  using (
    agency_id in (select my_agency_ids())
    and (cree_par = auth.uid() or exists (
      select 1 from agency_members am
      where am.user_id = auth.uid() and am.agency_id = drive_items.agency_id
        and am.role in ('owner', 'admin')))
  );

-- ═══ 3. LE VERROU 2FA (règle permanente, table neuve) ══════════════
drop policy if exists "exige aal2 quand la 2FA est active" on public.drive_items;
create policy "exige aal2 quand la 2FA est active" on public.drive_items
  as restrictive for all to authenticated
  using ((select public.aal_satisfait()));

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : 5 policies sur drive_items, dont le verrou 2FA.
select policyname from pg_policies
 where tablename = 'drive_items' order by policyname;
