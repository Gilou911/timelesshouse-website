-- ═══════════════════════════════════════════════════════════════════
--  CHAT D'ÉQUIPE, FILS PRIVÉS — le patron parle à chacun s'il veut
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente, et
--  AUTO-SUFFISANTE : elle crée la table si migration-chat-equipe.sql
--  n'est pas passée — un seul collage couvre les deux cas.
--  (Table couverte par le verrou aal2 au §5 → rien d'autre à rejouer.)
--
--  Le modèle tient dans UNE colonne : `dest_id`.
--    · NULL   → message du FIL D'ÉQUIPE, toute l'agence le voit ;
--    · rempli → message PRIVÉ : seuls l'auteur et le destinataire
--      le voient. La base le garantit — l'interface n'est qu'une
--      politesse.
--  L'interface n'ouvre les fils privés qu'au patron (vers chacun) et
--  aux coéquipiers (vers le patron) ; la base, elle, exige seulement
--  que les deux soient de la même agence.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ 1. LA TABLE (si le chat n'existe pas encore) ══════════════════
create table if not exists public.team_messages (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  auteur_id   uuid not null references auth.users(id) on delete cascade,
  corps       text not null check (char_length(btrim(corps)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists team_messages_fil_idx
  on public.team_messages (agency_id, created_at desc);
alter table public.team_messages enable row level security;

-- ═══ 2. LE DESTINATAIRE ════════════════════════════════════════════
alter table public.team_messages
  add column if not exists dest_id uuid references auth.users(id) on delete cascade;

comment on column public.team_messages.dest_id is
  'NULL = fil d''équipe (toute l''agence). Rempli = message privé : seuls l''auteur et ce destinataire le voient.';

-- ═══ 3. LES VERROUS, RÉÉCRITS POUR LES DEUX FILS ═══════════════════
-- Lire : le fil d'équipe de son agence, et les privés OÙ L'ON EST —
-- auteur ou destinataire. Jamais le privé de deux autres.
drop policy if exists "equipe lit son fil" on public.team_messages;
create policy "equipe lit son fil" on public.team_messages
  for select to authenticated
  using (
    agency_id in (select my_agency_ids())
    and (dest_id is null or auth.uid() in (auteur_id, dest_id))
  );

-- Écrire : signé de soi, chez soi — et un privé ne part que vers un
-- COÉQUIPIER de la même agence (jamais vers soi-même, jamais dehors).
drop policy if exists "equipe ecrit chez elle" on public.team_messages;
create policy "equipe ecrit chez elle" on public.team_messages
  for insert to authenticated
  with check (
    auteur_id = auth.uid()
    and agency_id in (select my_agency_ids())
    and (
      dest_id is null
      or (dest_id <> auth.uid() and exists (
            select 1 from agency_members am
             where am.user_id = team_messages.dest_id
               and am.agency_id = team_messages.agency_id))
    )
  );

-- Effacer : ses propres messages, où qu'ils soient.
drop policy if exists "auteur efface son message" on public.team_messages;
create policy "auteur efface son message" on public.team_messages
  for delete to authenticated
  using (auteur_id = auth.uid() and agency_id in (select my_agency_ids()));

-- ═══ 5. LE VERROU 2FA (règle permanente, posé avec la table) ═══════
drop policy if exists "exige aal2 quand la 2FA est active" on public.team_messages;
create policy "exige aal2 quand la 2FA est active" on public.team_messages
  as restrictive for all to authenticated
  using ((select public.aal_satisfait()));

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : la colonne dest_id (ligne 1) + 4 policies dont le verrou.
select 'colonne dest_id' as controle, count(*)::text as valeur
  from information_schema.columns
 where table_name = 'team_messages' and column_name = 'dest_id'
union all
select 'policy ' || policyname, ''
  from pg_policies where tablename = 'team_messages';
