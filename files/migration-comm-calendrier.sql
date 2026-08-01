-- ═══════════════════════════════════════════════════════════════════
--  COMMUNICATION & MARKETING — la chaîne éditoriale et l'équipe
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--
--  ⚠️ CRÉE DES TABLES → REJOUER files/migration-2fa-rls.sql APRÈS,
--     sinon les nouvelles tables échappent au verrou aal2 de la 2FA.
--
--  Étage 2 du métier, après la réparation des dates de tournage.
--  Cadre décidé avec Gil (29/07/2026) :
--    · la « team », c'est l'ÉQUIPE DE L'AGENCE (cadreur, monteur, CM),
--      un compte chacun, ses tâches sur tous les clients ;
--    · les posts se PLANIFIENT, ils ne se publient pas tout seuls —
--      la place est gardée pour la publication automatique le jour où
--      Meta et TikTok valideront les apps ;
--    · le calendrier montre les tournages ET les sorties sur la même
--      grille ;
--    · un contenu = UN post, plusieurs SORTIES (Instagram mardi 18h,
--      TikTok mardi 19h, LinkedIn mercredi 9h) — le client ne valide
--      qu'une fois, les commentaires ne se dispersent pas.
--
--  CE QU'ON NE DUPLIQUE PAS : `media` reste LE FICHIER livré, avec son
--  circuit de validation client, ses commentaires et ses emails, qui
--  fonctionnent déjà. Un post POINTE vers un media quand le montage
--  existe. Le post est le plan, le media est la pièce.
-- ═══════════════════════════════════════════════════════════════════


-- ═══ 1. L'ÉQUIPE ═══════════════════════════════════════════════════
-- Les rôles s'arrêtaient à owner/admin. On ajoute `membre` : il
-- travaille (on lui assigne des tâches) mais ne touche ni à la
-- facturation, ni à la marque, ni aux autres comptes.
alter table agency_members drop constraint if exists agency_members_role_check;
alter table agency_members add constraint agency_members_role_check
  check (role in ('owner', 'admin', 'membre'));

-- Le nom qu'on affiche dans « assigné à » : auth.users n'est pas
-- lisible par le rôle authenticated, et un email n'est pas un prénom.
alter table agency_members add column if not exists display_name text;
alter table agency_members add column if not exists metier text;   -- cadreur, monteur, CM…

comment on column agency_members.display_name is
  'Prénom affiché dans les assignations. À défaut, l''email est utilisé.';


-- ═══ 2. LE POST — le plan éditorial ════════════════════════════════
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  -- D'où vient le contenu, et où il atterrit une fois monté.
  shoot_id    uuid references shoots(id) on delete set null,
  media_id    uuid references media(id)  on delete set null,

  title       text not null,
  brief       text,                      -- l'intention, le script, l'angle

  /* La chaîne. `validation` est le seul état dont la vérité vit
     AILLEURS : c'est media.approval_status qui fait foi, cet état ne
     fait que dire « c'est parti chez le client ». */
  statut      text not null default 'idee'
              check (statut in ('idee','tournage','montage','validation','programme','publie','abandonne')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_agency_idx on posts (agency_id, statut);
create index if not exists posts_client_idx on posts (client_id);


-- ═══ 3. LES SORTIES — un post, plusieurs réseaux ═══════════════════
create table if not exists post_sorties (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  reseau       text not null
               check (reseau in ('instagram','tiktok','linkedin','facebook','youtube','autre')),

  /* L'heure de sortie prévue. timestamptz : une agence qui voyage ne
     doit pas voir ses sorties glisser. NULL = pas encore datée. */
  prevue_le    timestamptz,
  publie_le    timestamptz,              -- rempli à la main, ou par l'API le jour venu

  /* Place gardée pour la publication automatique : quand Meta et TikTok
     auront validé les apps, c'est ici qu'atterriront l'identifiant du
     post distant et l'erreur éventuelle. Rien ne les écrit aujourd'hui. */
  externe_id   text,
  erreur       text,

  created_at   timestamptz not null default now()
);

-- Le même post ne sort pas deux fois sur le même réseau.
create unique index if not exists post_sorties_unique on post_sorties (post_id, reseau);
-- La requête du calendrier : « quelles sorties entre telle et telle date ».
create index if not exists post_sorties_date_idx on post_sorties (prevue_le);


-- ═══ 4. LES TÂCHES — qui fait quoi, et quand ═══════════════════════
-- Volontairement AUTONOMES : une tâche peut pendre à un post, à un
-- tournage, ou à rien du tout (« relancer le client », « acheter une
-- carte SD »). Forcer un rattachement aurait rendu l'outil inutile
-- pour la moitié du travail réel d'une agence.
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  post_id     uuid references posts(id)  on delete cascade,
  shoot_id    uuid references shoots(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,

  titre       text not null,
  assigne_a   uuid,                      -- auth.users ; NULL = personne encore
  due_on      date,                      -- à la journée : « et quand »
  fait_le     timestamptz,               -- NULL = à faire

  created_at  timestamptz not null default now()
);

-- « Mes tâches, par échéance » — la requête la plus fréquente.
create index if not exists tasks_assigne_idx on tasks (assigne_a, fait_le, due_on);
create index if not exists tasks_agency_idx  on tasks (agency_id, due_on);


-- ═══ 5. LES VERROUS ════════════════════════════════════════════════
-- Tout se lit et s'écrit dans le périmètre de SON agence, jamais
-- au-delà. `my_agency_ids()` est le même juge que partout ailleurs.
alter table posts        enable row level security;
alter table post_sorties enable row level security;
alter table tasks        enable row level security;

drop policy if exists "agence gère ses posts" on posts;
create policy "agence gère ses posts" on posts for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

-- Une sortie suit son post : pas de périmètre propre à tenir à jour.
drop policy if exists "agence gère ses sorties" on post_sorties;
create policy "agence gère ses sorties" on post_sorties for all to authenticated
  using (post_id in (select id from posts where agency_id in (select my_agency_ids())))
  with check (post_id in (select id from posts where agency_id in (select my_agency_ids())));

drop policy if exists "agence gère ses tâches" on tasks;
create policy "agence gère ses tâches" on tasks for all to authenticated
  using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));


-- ═══ 6. LE CALENDRIER — une seule requête pour la grille ═══════════
-- Tournages ET sorties dans la même réponse, déjà triés. Deux appels
-- séparés auraient obligé la page à fusionner puis retrier elle-même,
-- et à recommencer à chaque changement de mois.
create or replace function agenda_agence(p_du date, p_au date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tournages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titre', s.title, 'type', s.type,
        'jour', s.date_iso, 'debut', s.start_time, 'fin', s.end_time,
        'lieu', s.location,
        'client_id', s.client_id, 'client', c.name)
      order by s.date_iso, s.start_time nulls last)
      from shoots s
      join clients c on c.id = s.client_id
      where c.agency_id in (select my_agency_ids())
        and s.date_iso between p_du and p_au), '[]'::jsonb),
    'sorties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'post_id', p.id, 'titre', p.title, 'statut', p.statut,
        'reseau', ps.reseau, 'prevue_le', ps.prevue_le, 'publie_le', ps.publie_le,
        'client_id', p.client_id, 'client', c.name)
      order by ps.prevue_le)
      from post_sorties ps
      join posts p on p.id = ps.post_id
      left join clients c on c.id = p.client_id
      where p.agency_id in (select my_agency_ids())
        and ps.prevue_le >= p_du::timestamptz
        and ps.prevue_le < (p_au + 1)::timestamptz), '[]'::jsonb)
  )
$$;
revoke execute on function agenda_agence(date, date) from public, anon;
grant execute on function agenda_agence(date, date) to authenticated;


-- ═══ 7. QUI EST DANS L'ÉQUIPE ══════════════════════════════════════
-- auth.users n'est pas lisible par le rôle authenticated : cette RPC
-- rend la liste des coéquipiers (et rien d'autre) pour peupler les
-- menus « assigné à ».
create or replace function equipe_agence() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', am.user_id,
           'nom', coalesce(nullif(am.display_name, ''), u.email),
           'role', am.role,
           'metier', am.metier) order by am.role, am.created_at), '[]'::jsonb)
    from agency_members am
    join auth.users u on u.id = am.user_id
   where am.agency_id in (select my_agency_ids())
$$;
revoke execute on function equipe_agence() from public, anon;
grant execute on function equipe_agence() to authenticated;

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
select 'posts' as table_creee, count(*) from posts
union all select 'post_sorties', count(*) from post_sorties
union all select 'tasks', count(*) from tasks;
