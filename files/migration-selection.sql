-- ═══════════════════════════════════════════════════════════════════
--  LA SÉLECTION DU CLIENT — les coups de cœur remontent au photographe
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent : ré-exécutable
--  sans dommage.
--
--  Pourquoi : les favoris n'existaient que dans le localStorage du
--  visiteur. Les mariés cochaient des cœurs et il ne se passait RIEN —
--  le photographe ne voyait jamais leur choix, et vider le cache
--  effaçait tout. C'est pourtant LE flux de travail du mariage : le
--  couple désigne les photos de l'album.
--
--  Deux personnes, deux listes (choix de Gil, 27/07/2026) : chacun
--  saisit son prénom, et la console montre les deux colonnes.
--
--  Sécurité : rien n'est écrit en direct. Le visiteur d'une galerie
--  n'est pas authentifié, donc tout passe par des RPC `security
--  definer` scellées par le CODE de la galerie — même motif que
--  get_gallery_by_code (brique 14). La table n'a aucune policy pour
--  `anon` : sans les RPC, elle est muette.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists gallery_selections (
  gallery_id uuid not null references galleries(id)       on delete cascade,
  photo_id   uuid not null references gallery_photos(id)  on delete cascade,
  -- Identité anonyme gardée par le navigateur du visiteur. Elle est la
  -- clé d'ÉCRITURE : on ne peut décocher que ses propres choix, donc
  -- personne ne peut effacer la liste de l'autre.
  voter_key  uuid not null,
  -- Le prénom saisi. Sert à l'AFFICHAGE : la console regroupe par
  -- prénom, si bien qu'une même personne venue de son téléphone puis de
  -- son ordinateur (deux voter_key) apparaît en une seule colonne.
  voter_name text not null,
  created_at timestamptz not null default now(),
  primary key (gallery_id, photo_id, voter_key)
);

create index if not exists gallery_selections_gallery_idx
  on gallery_selections (gallery_id);

alter table gallery_selections enable row level security;

-- Aucune policy pour `anon` : l'écriture passe uniquement par les RPC.
-- La console lit les sélections de SES galeries — même motif « agency
-- write » que le reste de la B.1 (my_agency_ids).
drop policy if exists "agence lit ses selections" on gallery_selections;
create policy "agence lit ses selections" on gallery_selections
  for select to authenticated
  using (exists (
    select 1 from galleries g
     where g.id = gallery_selections.gallery_id
       and g.agency_id in (select my_agency_ids())));


-- ── Cocher / décocher ──────────────────────────────────────────────
-- Renvoie le nombre de photos retenues par CE visiteur, ou null si la
-- galerie, la photo ou le prénom ne conviennent pas.
create or replace function set_gallery_selection(
  p_code  text,
  p_photo uuid,
  p_voter uuid,
  p_name  text,
  p_on    boolean
) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; n int; v_name text;
begin
  -- portal_gallery vérifie déjà : code unique, partage ouvert, agence
  -- active. Un lien coupé ne peut donc plus rien écrire.
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;

  -- La photo doit appartenir À CETTE galerie. Sans ce contrôle, le
  -- porteur d'un seul lien pourrait coucher des favoris sur les photos
  -- de n'importe quelle autre galerie, dont il n'a pas le lien.
  if not exists (
    select 1 from gallery_photos where id = p_photo and gallery_id = g.id
  ) then return null; end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then return null; end if;
  v_name := left(v_name, 40);

  if p_on then
    -- Garde-fou : une galerie de mariage compte rarement plus de 2 000
    -- photos. Au-delà, ce n'est plus une sélection, c'est un robot.
    select count(*) into n from gallery_selections
     where gallery_id = g.id and voter_key = p_voter;
    if n >= 2000 then return n; end if;

    insert into gallery_selections (gallery_id, photo_id, voter_key, voter_name)
    values (g.id, p_photo, p_voter, v_name)
    on conflict (gallery_id, photo_id, voter_key)
      do update set voter_name = excluded.voter_name;
  else
    delete from gallery_selections
     where gallery_id = g.id and photo_id = p_photo and voter_key = p_voter;
  end if;

  select count(*) into n from gallery_selections
   where gallery_id = g.id and voter_key = p_voter;
  return n;
end $$;
grant execute on function set_gallery_selection(text, uuid, uuid, text, boolean)
  to anon, authenticated;


-- ── Retrouver SA propre sélection ──────────────────────────────────
-- Appelée à l'ouverture : le visiteur revoit ses cœurs même si son
-- navigateur a oublié la liste, tant qu'il garde son identité locale.
-- Ne renvoie JAMAIS les choix de l'autre : chacun sa liste.
create or replace function get_gallery_selection_mine(p_code text, p_voter uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries;
begin
  g := portal_gallery(p_code);
  if g.id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(photo_id)
      from gallery_selections
     where gallery_id = g.id and voter_key = p_voter), '[]'::jsonb);
end $$;
grant execute on function get_gallery_selection_mine(text, uuid)
  to anon, authenticated;


-- ── Renommer sa colonne après coup ─────────────────────────────────
-- « J'ai tapé Elea au lieu d'Eléa » : sans ça il faudrait tout
-- recocher. Ne touche QUE les lignes de ce visiteur.
create or replace function rename_gallery_selection(
  p_code text, p_voter uuid, p_name text
) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; n int; v_name text;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then return null; end if;
  update gallery_selections set voter_name = left(v_name, 40)
   where gallery_id = g.id and voter_key = p_voter;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function rename_gallery_selection(text, uuid, text)
  to anon, authenticated;
