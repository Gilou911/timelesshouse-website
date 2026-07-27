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
--  IDENTITÉ = L'EMAIL (question de Gil, 27/07/2026). Le prénom seul ne
--  suffisait pas, pour deux raisons :
--    · deux invités prénommés Marie n'auraient formé qu'une colonne ;
--    · surtout, l'identité était propre au NAVIGATEUR. La même personne
--      passée du téléphone à l'ordinateur voyait bien ses cœurs (la
--      liste du serveur est réunie à l'affichage) mais ne pouvait plus
--      les DÉCOCHER : la suppression ne trouvait aucune ligne à son nom,
--      et le cœur revenait au rechargement.
--  Le prénom reste, comme étiquette lisible dans la console.
--
--  Sécurité : rien n'est écrit en direct. Le visiteur d'une galerie
--  n'est pas authentifié, donc tout passe par des RPC `security
--  definer` scellées par le CODE de la galerie — même motif que
--  get_gallery_by_code (brique 14). La table n'a aucune policy pour
--  `anon` : sans les RPC, elle est muette.
--
--  ⚠️ Contrepartie assumée de l'email comme clé : quelqu'un qui détient
--  À LA FOIS le lien de la galerie ET l'adresse d'une personne peut
--  modifier la liste de celle-ci. L'enjeu est un choix de photos, et le
--  bénéfice — pouvoir corriger sa sélection depuis n'importe quel
--  appareil — le vaut largement.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists gallery_selections (
  gallery_id  uuid not null references galleries(id)       on delete cascade,
  photo_id    uuid not null references gallery_photos(id)  on delete cascade,
  -- Identité, normalisée en minuscules par la RPC. Unique par personne,
  -- stable d'un appareil à l'autre.
  voter_email text not null,
  -- Étiquette affichée dans la console. Suit le dernier prénom saisi.
  voter_name  text not null,
  created_at  timestamptz not null default now(),
  primary key (gallery_id, photo_id, voter_email)
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


-- Normalisation partagée par les trois RPC : une seule définition de ce
-- qu'est « la même personne ». Renvoie null si l'adresse est inutilisable.
create or replace function selection_email(p_email text) returns text
language sql immutable as $$
  select case
    when e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then left(e, 160)
    else null end
  from (select lower(btrim(coalesce(p_email, '')))) as t(e)
$$;


-- ── Cocher / décocher ──────────────────────────────────────────────
-- Renvoie le nombre de photos retenues par CETTE personne, ou null si
-- la galerie, la photo, l'adresse ou le prénom ne conviennent pas.
create or replace function set_gallery_selection(
  p_code  text,
  p_photo uuid,
  p_email text,
  p_name  text,
  p_on    boolean
) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; n int; v_mail text; v_name text;
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

  v_mail := selection_email(p_email);
  if v_mail is null then return null; end if;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then return null; end if;
  v_name := left(v_name, 40);

  if p_on then
    -- Garde-fou : une galerie de mariage compte rarement plus de 2 000
    -- photos. Au-delà, ce n'est plus une sélection, c'est un robot.
    select count(*) into n from gallery_selections
     where gallery_id = g.id and voter_email = v_mail;
    if n >= 2000 then return n; end if;

    insert into gallery_selections (gallery_id, photo_id, voter_email, voter_name)
    values (g.id, p_photo, v_mail, v_name)
    on conflict (gallery_id, photo_id, voter_email)
      do update set voter_name = excluded.voter_name;
  else
    delete from gallery_selections
     where gallery_id = g.id and photo_id = p_photo and voter_email = v_mail;
  end if;

  select count(*) into n from gallery_selections
   where gallery_id = g.id and voter_email = v_mail;
  return n;
end $$;
grant execute on function set_gallery_selection(text, uuid, text, text, boolean)
  to anon, authenticated;


-- ── Retrouver SA propre sélection ──────────────────────────────────
-- Appelée à l'ouverture : la même adresse retrouve ses cœurs depuis
-- n'importe quel appareil, et peut les décocher.
-- Ne renvoie JAMAIS les choix des autres : chacun sa liste.
create or replace function get_gallery_selection_mine(p_code text, p_email text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries; v_mail text;
begin
  g := portal_gallery(p_code);
  if g.id is null then return '[]'::jsonb; end if;
  v_mail := selection_email(p_email);
  if v_mail is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(photo_id)
      from gallery_selections
     where gallery_id = g.id and voter_email = v_mail), '[]'::jsonb);
end $$;
grant execute on function get_gallery_selection_mine(text, text)
  to anon, authenticated;


-- ── Corriger son prénom après coup ─────────────────────────────────
-- « J'ai tapé Elea au lieu d'Eléa » : sans ça il faudrait tout
-- recocher. Ne touche QUE les lignes de cette adresse.
create or replace function rename_gallery_selection(
  p_code text, p_email text, p_name text
) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; n int; v_mail text; v_name text;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;
  v_mail := selection_email(p_email);
  if v_mail is null then return null; end if;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then return null; end if;
  update gallery_selections set voter_name = left(v_name, 40)
   where gallery_id = g.id and voter_email = v_mail;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function rename_gallery_selection(text, text, text)
  to anon, authenticated;
