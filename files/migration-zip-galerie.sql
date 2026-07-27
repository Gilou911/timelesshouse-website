-- ═══════════════════════════════════════════════════════════════════
--  TÉLÉCHARGEMENT GROUPÉ — l'archive d'une galerie, préparée à la demande
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Le client télécharge photo par photo. Sur 400 photos de mariage ce
--  n'est pas tenable — et les anciennes pages event-* n'avaient qu'un
--  lien vers une archive Drive préparée À LA MAIN, donc rien de
--  réutilisable.
--
--  Pourquoi une file et pas un zip dans le navigateur : 400 photos font
--  3 Go. Aucun iPhone ne les assemble en mémoire, et l'API de flux vers
--  le disque n'existe pas sur Safari. C'est donc le worker (déjà en
--  place pour l'encodage, déjà relié à B2) qui prépare l'archive, et le
--  client reçoit un simple lien — qui marche partout.
--
--  À LA DEMANDE, pas systématiquement : une archive double le poids de
--  la galerie sur B2. On ne la fabrique que si quelqu'un la réclame, et
--  on la réutilise tant que la galerie n'a pas changé.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists zip_jobs (
  id          uuid primary key default gen_random_uuid(),
  gallery_id  uuid not null references galleries(id) on delete cascade,
  agency_id   uuid references agencies(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','error')),
  -- Empreinte du contenu au moment de la demande : nombre de photos et
  -- date de la plus récente. Elle change dès qu'on ajoute ou retire une
  -- photo, ce qui périme l'archive sans avoir à la surveiller.
  empreinte   text not null,
  url         text,
  taille      bigint,
  progress    smallint not null default 0,
  attempts    int not null default 0,
  erreur      text,
  claimed_at  timestamptz,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Une seule archive VALIDE par galerie et par empreinte : deux invités
-- qui cliquent en même temps ne lancent pas deux fois le travail.
create unique index if not exists zip_jobs_unique_valide
  on zip_jobs (gallery_id, empreinte) where status in ('pending','processing','done');

create index if not exists zip_jobs_pending_idx on zip_jobs (status, created_at);

alter table zip_jobs enable row level security;

-- La console de l'agence peut suivre ses archives. Les visiteurs, eux,
-- passent uniquement par les RPC scellées ci-dessous.
drop policy if exists "agence lit ses archives" on zip_jobs;
create policy "agence lit ses archives" on zip_jobs
  for select to authenticated
  using (agency_id in (select my_agency_ids()));


-- Empreinte du contenu : change dès qu'une photo entre ou sort.
create or replace function gallery_empreinte(p_gallery uuid) returns text
language sql stable as $$
  select coalesce(count(*)::text || '-' || coalesce(max(created_at)::text, 'vide'), '0-vide')
    from gallery_photos where gallery_id = p_gallery
$$;


-- ── Demander l'archive ─────────────────────────────────────────────
-- Renvoie l'état courant : prête (avec son lien), en préparation, ou
-- tout juste mise en file. Ne fabrique jamais deux fois la même.
create or replace function request_gallery_zip(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; emp text; j zip_jobs; n int;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;

  select count(*) into n from gallery_photos where gallery_id = g.id;
  if n = 0 then
    return jsonb_build_object('statut', 'vide');
  end if;

  emp := gallery_empreinte(g.id);

  select * into j from zip_jobs
   where gallery_id = g.id and empreinte = emp
     and status in ('pending','processing','done')
   order by created_at desc limit 1;

  if j.id is null then
    insert into zip_jobs (gallery_id, agency_id, empreinte)
    values (g.id, g.agency_id, emp)
    on conflict do nothing
    returning * into j;
    -- Course entre deux visiteurs : l'autre vient de l'insérer, on la lit.
    if j.id is null then
      select * into j from zip_jobs
       where gallery_id = g.id and empreinte = emp
         and status in ('pending','processing','done')
       order by created_at desc limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'statut',   coalesce(j.status, 'pending'),
    'url',      j.url,
    'taille',   j.taille,
    'progress', coalesce(j.progress, 0),
    'photos',   n);
end $$;
grant execute on function request_gallery_zip(text) to anon, authenticated;


-- ── Suivre l'avancement ────────────────────────────────────────────
-- Appelée en boucle par la page pendant la préparation. Ne crée rien.
create or replace function get_gallery_zip(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries; j zip_jobs;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;
  select * into j from zip_jobs
   where gallery_id = g.id and empreinte = gallery_empreinte(g.id)
     and status in ('pending','processing','done')
   order by created_at desc limit 1;
  if j.id is null then return jsonb_build_object('statut', 'absent'); end if;
  return jsonb_build_object(
    'statut', j.status, 'url', j.url, 'taille', j.taille,
    'progress', coalesce(j.progress, 0));
end $$;
grant execute on function get_gallery_zip(text) to anon, authenticated;


-- ── Réclamation par le worker ──────────────────────────────────────
-- Même motif que claim_encode_job : une seule instance sert la file.
create or replace function claim_zip_job() returns zip_jobs
language plpgsql volatile security definer set search_path = public as $$
declare j zip_jobs;
begin
  update zip_jobs set status = 'processing', claimed_at = now(), attempts = attempts + 1
   where id = (
     select id from zip_jobs where status = 'pending'
      order by created_at limit 1 for update skip locked)
  returning * into j;
  return j;
end $$;
revoke execute on function claim_zip_job() from public, anon, authenticated;
