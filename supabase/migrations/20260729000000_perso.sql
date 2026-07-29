-- ════════════════════════════════════════════════════════════
-- 📓  ESPACE PERSO — les pages privées de Gil, type Notion
-- ════════════════════════════════════════════════════════════
-- perso.timelesshouse.org : des pages hiérarchiques faites de blocs,
-- que Gil écrit et partage arbre par arbre. Quatre règles portées par
-- la base, pas par l'interface :
--
--   ① seul le PROPRIÉTAIRE (Gil) et les personnes qu'il a invitées
--      voient quoi que ce soit — un compte connecté sans invitation
--      obtient zéro ligne ;
--   ② le partage se décide PAR ARBRE (page racine) : le rôle d'un
--      invité — 'lecteur' ou 'editeur' — vaut pour la racine et
--      toutes ses sous-pages, et se retire à chaud ;
--   ③ le JETON du lien secret vit dans une table à part
--      (perso_partages) : la RLS ne sait pas masquer une colonne,
--      et un invité qui lirait `select *` sur perso_pages ne doit
--      JAMAIS repartir avec le lien secret de l'arbre ;
--   ④ le lien secret est servi par une RPC security definer
--      fail-closed — aucune policy `anon` sur aucune table.
--
-- `racine_id` est dénormalisé (posé par trigger, jamais par le
-- client) : les policies s'écrivent sans récursion, et le with check
-- s'évalue APRÈS le trigger BEFORE, donc sur la vraie racine — un
-- éditeur ne peut pas s'injecter dans un arbre étranger en forgeant
-- le champ. Le DÉPLACEMENT d'une page (changer parent_id) est refusé
-- en v1 : c'est ce qui garantit qu'aucun cycle ni racine périmée
-- n'est possible, quel que soit le client HTTP.
--
-- Les types de bloc vivent DANS le jsonb, sans CHECK (doctrine
-- galleries.template : la liste s'allonge sans migration, un type
-- inconnu retombe sur « paragraphe » côté rendu).
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ⚠️ Ce fichier CRÉE des tables : REJOUER files/migration-2fa-rls.sql
--    juste après, sinon elles échappent au verrou aal2 (un mot de
--    passe volé suffirait à les lire via PostgREST).
-- ════════════════════════════════════════════════════════════

-- ── ① Le propriétaire ────────────────────────────────────────────
-- Une table plutôt qu'une constante : le jour où quelqu'un d'autre
-- doit administrer l'espace, on ajoute une ligne, pas une migration.
create table if not exists public.perso_proprietaires (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.perso_proprietaires enable row level security;

-- Se savoir propriétaire, rien d'autre. Aucune policy d'écriture :
-- le seed ci-dessous et service_role sont les seuls à écrire.
drop policy if exists "perso proprio se voit" on public.perso_proprietaires;
create policy "perso proprio se voit" on public.perso_proprietaires
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Le juge utilisé par toutes les policies perso (modèle my_agency_ids).
create or replace function public.perso_est_proprietaire()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perso_proprietaires
    where user_id = (select auth.uid())
  )
$$;
revoke execute on function public.perso_est_proprietaire() from public, anon;
grant  execute on function public.perso_est_proprietaire() to authenticated;

-- ── ② Les pages ──────────────────────────────────────────────────
create table if not exists public.perso_pages (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.perso_pages(id) on delete cascade,
  -- la racine de l'arbre ; = id pour une page racine. Posé par
  -- trigger, FK cascade : supprimer une racine emporte tout l'arbre
  -- sans dépendre de la profondeur des parent_id.
  racine_id  uuid not null references public.perso_pages(id) on delete cascade,
  -- borné : un titre n'est pas un paragraphe, une page n'est pas
  -- une base de données (512 Ko de blocs = déjà énorme en texte).
  titre      text  not null default '' check (char_length(titre) <= 300),
  icone      text  check (icone is null or char_length(icone) <= 16),
  blocs      jsonb not null default '[]'::jsonb
             check (pg_column_size(blocs) <= 524288),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.perso_pages.blocs is
  'Liste ordonnée de blocs [{id, type, …}] — types SANS check, un type inconnu se rend en paragraphe.';

create index if not exists perso_pages_racine_idx
  on public.perso_pages (racine_id, parent_id, position);

-- racine_id : recopié du parent, = id pour une racine. Le client ne
-- le choisit jamais. security definer : la lecture du parent ne
-- dépend pas des policies de l'appelant.
create or replace function public.perso_pose_racine()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- v1 : une page ne se déplace pas. C'est cette interdiction qui
    -- rend cycles et racines périmées impossibles par construction.
    if new.parent_id is distinct from old.parent_id then
      raise exception 'déplacement de page non pris en charge';
    end if;
    new.racine_id := old.racine_id;
    return new;
  end if;
  if new.parent_id is null then
    new.racine_id := new.id;
  else
    if new.parent_id = new.id then
      raise exception 'page parente invalide';
    end if;
    select racine_id into new.racine_id
      from public.perso_pages where id = new.parent_id;
    if new.racine_id is null then
      raise exception 'page parente introuvable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists perso_pages_racine on public.perso_pages;
create trigger perso_pages_racine
  before insert or update on public.perso_pages
  for each row execute function public.perso_pose_racine();

-- updated_at automatique — set_updated_at() existe déjà
-- (files/migration-portfolio.sql) ; on la (re)crée par sécurité.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists perso_pages_updated_at on public.perso_pages;
create trigger perso_pages_updated_at
  before update on public.perso_pages
  for each row execute function set_updated_at();

-- ── ③ Les invités (par arbre) ────────────────────────────────────
create table if not exists public.perso_membres (
  racine_id  uuid not null references public.perso_pages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- l'email d'invitation, pour l'affichage : auth.users est illisible
  -- depuis le navigateur, et c'est très bien ainsi.
  email      text not null,
  role       text not null default 'lecteur' check (role in ('lecteur', 'editeur')),
  created_at timestamptz not null default now(),
  primary key (racine_id, user_id)
);

alter table public.perso_membres enable row level security;

-- Lire : le propriétaire (modale Partage) et soi-même (connaître son
-- rôle). C'est aussi ce qui fait marcher les policies de perso_pages :
-- leur sous-requête sur perso_membres passe par CETTE policy, et un
-- membre voit sa propre ligne.
drop policy if exists "perso membres lecture" on public.perso_membres;
create policy "perso membres lecture" on public.perso_membres
  for select to authenticated
  using (public.perso_est_proprietaire() or user_id = (select auth.uid()));

-- Changer un rôle / révoquer : le propriétaire, en PostgREST direct.
-- INSÉRER : personne ici — seule l'edge function perso-invite
-- (service_role) crée la ligne, car elle seule sait résoudre un email
-- vers un user_id (et créer le compte au besoin).
drop policy if exists "perso membres role" on public.perso_membres;
create policy "perso membres role" on public.perso_membres
  for update to authenticated
  using (public.perso_est_proprietaire())
  with check (public.perso_est_proprietaire());

drop policy if exists "perso membres revocation" on public.perso_membres;
create policy "perso membres revocation" on public.perso_membres
  for delete to authenticated
  using (public.perso_est_proprietaire());

-- ── ④ Qui voit / écrit quelles pages ? ───────────────────────────
alter table public.perso_pages enable row level security;

-- Lire : le propriétaire, ou un invité de l'arbre (peu importe le rôle).
drop policy if exists "perso pages lecture" on public.perso_pages;
create policy "perso pages lecture" on public.perso_pages
  for select to authenticated
  using (
    public.perso_est_proprietaire()
    or exists (
      select 1 from public.perso_membres m
      where m.racine_id = perso_pages.racine_id
        and m.user_id = (select auth.uid())
    )
  );

-- Créer : le propriétaire partout ; un éditeur seulement SOUS un
-- arbre où il est éditeur (parent_id non nul : jamais de nouvelle
-- racine par un invité). Le trigger a déjà posé le vrai racine_id.
drop policy if exists "perso pages creation" on public.perso_pages;
create policy "perso pages creation" on public.perso_pages
  for insert to authenticated
  with check (
    public.perso_est_proprietaire()
    or (
      parent_id is not null
      and exists (
        select 1 from public.perso_membres m
        where m.racine_id = perso_pages.racine_id
          and m.user_id = (select auth.uid())
          and m.role = 'editeur'
      )
    )
  );

-- Modifier (titre, blocs, position…) : propriétaire ou éditeur.
-- Forger parent_id est déjà refusé par le trigger.
drop policy if exists "perso pages modification" on public.perso_pages;
create policy "perso pages modification" on public.perso_pages
  for update to authenticated
  using (
    public.perso_est_proprietaire()
    or exists (
      select 1 from public.perso_membres m
      where m.racine_id = perso_pages.racine_id
        and m.user_id = (select auth.uid())
        and m.role = 'editeur'
    )
  )
  with check (
    public.perso_est_proprietaire()
    or exists (
      select 1 from public.perso_membres m
      where m.racine_id = perso_pages.racine_id
        and m.user_id = (select auth.uid())
        and m.role = 'editeur'
    )
  );

-- Supprimer : le propriétaire ; un éditeur seulement une SOUS-page.
-- Une racine ne se supprime que par le propriétaire — la cascade
-- emporte l'arbre entier, ses membres et son lien secret.
drop policy if exists "perso pages suppression" on public.perso_pages;
create policy "perso pages suppression" on public.perso_pages
  for delete to authenticated
  using (
    public.perso_est_proprietaire()
    or (
      parent_id is not null
      and exists (
        select 1 from public.perso_membres m
        where m.racine_id = perso_pages.racine_id
          and m.user_id = (select auth.uid())
          and m.role = 'editeur'
      )
    )
  );

-- ── ⑤ Le lien secret (une ligne par arbre, table à part) ─────────
-- Fermé par défaut. Seul le propriétaire voit ou touche cette table :
-- c'est LE point qui empêche un invité de diffuser le lien secret.
create table if not exists public.perso_partages (
  racine_id  uuid primary key references public.perso_pages(id) on delete cascade,
  enabled    boolean not null default false,
  token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists perso_partages_token_idx on public.perso_partages (token);

alter table public.perso_partages enable row level security;

drop policy if exists "perso partage proprio" on public.perso_partages;
create policy "perso partage proprio" on public.perso_partages
  for all to authenticated
  using (public.perso_est_proprietaire())
  with check (public.perso_est_proprietaire());

drop trigger if exists perso_partages_updated_at on public.perso_partages;
create trigger perso_partages_updated_at
  before update on public.perso_partages
  for each row execute function set_updated_at();

-- La ligne naît avec sa racine (enabled=false : rien n'est ouvert
-- tant que Gil ne l'a pas décidé). security definer : le trigger
-- écrit dans une table que l'appelant n'a pas le droit de toucher.
create or replace function public.perso_cree_partage()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perso_partages (racine_id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists perso_pages_partage on public.perso_pages;
create trigger perso_pages_partage
  after insert on public.perso_pages
  for each row when (new.parent_id is null)
  execute function public.perso_cree_partage();

-- ── ⑥ Anti-bombardement des liens magiques ───────────────────────
-- Budget SÉPARÉ d'auth_recovery_log : 5 « liens perso »/heure ne
-- doivent pas consommer les 5 récupérations de mot de passe, ni
-- l'inverse. RLS sans policy : service_role seul (perso-invite).
create table if not exists public.perso_lien_log (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.perso_lien_log enable row level security;

create index if not exists perso_lien_log_email_idx
  on public.perso_lien_log (lower(email), created_at desc);

-- ── ⑦ Le lien secret, côté visiteur (RPC fail-closed) ────────────
-- Helper INTERNE (modèle portal_gallery) : jeton → racine, ou null.
-- Refuse : jeton vide/court, partage coupé. Personne ne peut
-- l'appeler directement.
create or replace function public.perso_racine_par_jeton(p_token text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select pp.racine_id
    from public.perso_partages pp
   where length(coalesce(p_token, '')) >= 16
     and pp.token = p_token
     and pp.enabled
$$;
revoke execute on function public.perso_racine_par_jeton(text) from public, anon, authenticated;

-- L'enveloppe publique : la page demandée (la racine par défaut) et
-- l'ARBRE pour naviguer — titres et positions seulement, jamais les
-- blocs des autres pages, jamais le jeton. Une page hors de l'arbre
-- du jeton rend null (fail-closed).
create or replace function public.perso_page_par_jeton(p_token text, p_page uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_racine uuid;
  v_page   public.perso_pages;
begin
  v_racine := public.perso_racine_par_jeton(p_token);
  if v_racine is null then return null; end if;

  select * into v_page
    from public.perso_pages
   where id = coalesce(p_page, v_racine)
     and racine_id = v_racine;
  if v_page.id is null then return null; end if;

  return jsonb_build_object(
    'page', jsonb_build_object(
      'id', v_page.id,
      'parent_id', v_page.parent_id,
      'titre', v_page.titre,
      'icone', v_page.icone,
      'blocs', v_page.blocs,
      'updated_at', v_page.updated_at
    ),
    'arbre', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'parent_id', s.parent_id,
               'titre', s.titre,
               'icone', s.icone,
               'position', s.position
             ) order by s.position, s.created_at)
        from public.perso_pages s
       where s.racine_id = v_racine
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.perso_page_par_jeton(text, uuid) from public;
grant  execute on function public.perso_page_par_jeton(text, uuid) to anon, authenticated;

-- ── ⑧ Seed : Gil est propriétaire ────────────────────────────────
-- Par email pour rester rejouable. Si le compte console de Gil vit
-- sous une autre adresse, remplacer ci-dessous puis rejouer — le
-- bloc de vérification doit rendre 1.
insert into public.perso_proprietaires (user_id)
select id from auth.users where lower(email) = 'service@timelesshouse.org'
on conflict do nothing;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- ✅ VÉRIFICATION (à lancer après exécution)
-- ════════════════════════════════════════════════════════════
-- 1. RLS active sur les 5 tables (5 lignes, relrowsecurity = t) :
--    select c.relname, c.relrowsecurity
--      from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relname like 'perso_%' and c.relkind = 'r'
--     order by 1;
-- 2. Les policies posées :
--    select tablename, policyname, cmd from pg_policies
--     where tablename like 'perso_%' order by 1, 2;
-- 3. Gil est bien propriétaire (doit rendre 1 — sinon corriger
--    l'email du seed ⑧ et rejouer) :
--    select count(*) from public.perso_proprietaires;
-- 4. Le helper est scellé, l'enveloppe est publique :
--    select p.proname,
--           has_function_privilege('anon', p.oid, 'execute') as anon_ok
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname like 'perso_%jeton%';
--    → perso_racine_par_jeton : false · perso_page_par_jeton : true
--
-- ⚠️ MAINTENANT : rejouer files/migration-2fa-rls.sql (ce fichier a
--    créé des tables → la policy restrictive « exige aal2 quand la
--    2FA est active » doit les couvrir). Sa sortie liste les tables
--    traitées : vérifier que les perso_% y figurent.
