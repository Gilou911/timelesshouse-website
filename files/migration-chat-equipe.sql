-- ═══════════════════════════════════════════════════════════════════
--  CHAT D'ÉQUIPE — le fil de discussion interne d'une agence
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--
--  ⚠️ CRÉE UNE TABLE → la policy « exige aal2 quand la 2FA est
--  active » est REPOSÉE ici même (§4), à l'identique de
--  migration-2fa-rls.sql : pas besoin de rejouer tout le fichier,
--  la règle permanente est satisfaite sur place.
--
--  Un fil unique par agence : cadreur, monteur, CM et patron se
--  parlent sans quitter la console (onglet Équipe). Cousin du chat
--  bêta (beta_messages), avec deux différences assumées :
--    · pas de rôles d'auteur — tout le monde parle à égalité, le nom
--      vient de l'équipe (equipe_agence) côté interface ;
--    · on peut EFFACER son propre message (une maladresse entre
--      collègues se corrige) — jamais celui d'un autre. Le canal
--      bêta, lui, reste sans effacement : c'est un registre de
--      retours, pas une conversation.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ 1. LE FIL ═════════════════════════════════════════════════════
create table if not exists public.team_messages (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  auteur_id   uuid not null references auth.users(id) on delete cascade,
  -- borné : un champ de chat n'a pas à recevoir un roman ni du vide
  corps       text not null check (char_length(btrim(corps)) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists team_messages_fil_idx
  on public.team_messages (agency_id, created_at desc);

alter table public.team_messages enable row level security;

-- ═══ 2. QUI LIT, QUI ÉCRIT ═════════════════════════════════════════
-- Le périmètre est l'AGENCE, comme partout : my_agency_ids() est le
-- même juge que pour les posts, les tâches et les sorties. Un membre
-- lit le fil de son agence, y écrit sous SA propre identité — jamais
-- chez le voisin, jamais signé d'un autre.
drop policy if exists "equipe lit son fil" on public.team_messages;
create policy "equipe lit son fil" on public.team_messages
  for select to authenticated
  using (agency_id in (select my_agency_ids()));

drop policy if exists "equipe ecrit chez elle" on public.team_messages;
create policy "equipe ecrit chez elle" on public.team_messages
  for insert to authenticated
  with check (
    auteur_id = auth.uid()
    and agency_id in (select my_agency_ids())
  );

-- ═══ 3. EFFACER SA PROPRE MALADRESSE ═══════════════════════════════
drop policy if exists "auteur efface son message" on public.team_messages;
create policy "auteur efface son message" on public.team_messages
  for delete to authenticated
  using (
    auteur_id = auth.uid()
    and agency_id in (select my_agency_ids())
  );

-- ═══ 4. LE VERROU 2FA, REPOSÉ SUR LA TABLE NEUVE ═══════════════════
-- Copie exacte de la policy de migration-2fa-rls.sql : un compte avec
-- 2FA vérifiée n'accède à rien sous une session de niveau 1. Le juge
-- aal_satisfait() existe déjà en base.
drop policy if exists "exige aal2 quand la 2FA est active" on public.team_messages;
create policy "exige aal2 quand la 2FA est active" on public.team_messages
  as restrictive for all to authenticated
  using ((select public.aal_satisfait()));

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : 4 lignes de policies sur team_messages, dont le verrou 2FA.
select policyname from pg_policies
 where tablename = 'team_messages' order by policyname;
