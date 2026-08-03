-- ═══════════════════════════════════════════════════════════════════
--  CHAT PRIVÉ — le juge ne pouvait pas voir le destinataire
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  LE BUG (constaté par Gil le 02/08) : impossible d'envoyer un
--  message privé — « Cette action n'est pas disponible avec votre
--  offre actuelle » (c'est la traduction maison d'un refus RLS).
--
--  LA CAUSE : la policy d'écriture vérifiait que le destinataire est
--  bien un coéquipier avec un `exists (select 1 from agency_members
--  …)`. Or agency_members a SA PROPRE RLS — « members read own
--  membership » : chacun ne voit QUE sa propre ligne. La
--  sous-requête, exécutée avec les droits de l'appelant, ne trouvait
--  donc JAMAIS la ligne de l'AUTRE. Verdict : faux, systématiquement.
--
--  LA CORRECTION : un juge scellé (security definer) qui répond à la
--  seule question utile — « ces deux comptes sont-ils de la même
--  agence ? » — sans jamais exposer la table. Même motif que
--  my_agency_ids(), qui existe depuis SaaS B.1 pour cette raison
--  exacte.

create or replace function meme_agence(p_autre uuid, p_agence uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_members am
     where am.user_id = p_autre and am.agency_id = p_agence
  )
$$;
revoke execute on function meme_agence(uuid, uuid) from public, anon;
grant execute on function meme_agence(uuid, uuid) to authenticated;

-- L'écriture, réécrite avec le juge (le reste ne bouge pas) :
-- signé de soi, chez soi, et un privé ne part que vers un coéquipier
-- de la même agence — jamais vers soi-même.
drop policy if exists "equipe ecrit chez elle" on public.team_messages;
create policy "equipe ecrit chez elle" on public.team_messages
  for insert to authenticated
  with check (
    auteur_id = auth.uid()
    and agency_id in (select my_agency_ids())
    and (
      dest_id is null
      or (dest_id <> auth.uid() and meme_agence(dest_id, agency_id))
    )
  );

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Attendu : « true » (votre coéquipier est bien dans votre agence).
select meme_agence(
  '515f8dd6-833b-420c-a315-910a4589f549'::uuid,
  '1bde8357-29f9-43eb-b159-675d0f6b13af'::uuid) as juge_repond_vrai;
