-- ═══════════════════════════════════════════════════════════════════
--  VAGUE 2 DE L'AUDIT — l'écran, le serveur et la base disent enfin
--  la même chose
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente (rejouable).
--  Ne crée AUCUNE table → pas besoin de rejouer migration-2fa-rls.sql.
--
--  L'audit du 07/08/2026 a trouvé trois écarts entre ce que la console
--  montre et ce que la base autorise. Les voici refermés.
-- ═══════════════════════════════════════════════════════════════════


-- ═══ 1. CINQ TABLES OUBLIÉES PAR LE VERROU DE PRIVILÈGE ════════════
--
--  migration-privileges-2.sql scelle clients, galleries, media,
--  documents, shoots, posts, post_sorties, tasks. Mais la baseline pose
--  aussi « agency write » (simple appartenance à l'agence) sur cinq
--  tables qui livrent, elles aussi, aux clients : les PHOTOS d'une
--  galerie, les PAGES ÉVÉNEMENT, les STRATÉGIES, les ANALYSES et les
--  COMMENTAIRES de médias. Un membre au rang plancher pouvait donc, en
--  interrogeant l'API directement, ajouter ou effacer des photos dans
--  une galerie livrée, supprimer une page événement, réécrire les
--  analyses — tout ce que l'écran lui cache. La garde n'existait qu'à
--  l'écran ; elle existe maintenant en base.
--
--  Les cinq portent agency_id EN DIRECT (vérifié table par table) :
--  même motif que clients et galleries, à la lettre.
--
--  La LECTURE n'est jamais touchée : un plancher doit voir la galerie
--  dont on lui parle dans le chat. Et le client final passe par des RPC
--  scellées (get_media_comments, add_media_comment, portal_client) qui
--  sont security definer : rien de tout ceci ne le concerne.

do $$
declare t text;
begin
  foreach t in array array['gallery_photos', 'event_pages', 'strategies', 'analytics', 'media_comments'] loop
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (insert)', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (insert)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (update)', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (update)', t, t);
    execute format('drop policy if exists %I on public.%I', t || ': écrire est un privilège (delete)', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using '
      || '(not exists (select 1 from agency_members am where am.user_id = auth.uid() '
      || 'and am.agency_id = %I.agency_id and am.role = ''membre'' and not (''clients'' = any(am.privileges))))',
      t || ': écrire est un privilège (delete)', t, t);
  end loop;
end $$;


-- ═══ 2. LA PORTE DÉROBÉE DE L'APPROBATION ══════════════════════════
--
--  update_media_approval(uuid, text) est security definer : elle passe
--  donc AU-DESSUS de toutes les policies ci-dessus. Elle ne vérifiait
--  que l'appartenance à l'agence — un membre au rang plancher pouvait
--  approuver ou refuser n'importe quel montage livré au client, alors
--  que la table media le lui interdit. Elle demande désormais le même
--  privilège que la table qu'elle modifie.
--
--  ⚠️ L'AUTRE signature — update_media_approval(text, uuid, text),
--  celle du CLIENT FINAL scellée par son code d'accès — n'est pas
--  touchée : c'est elle que la page client appelle pour valider ses
--  montages, et elle ne doit rien connaître des privilèges de l'équipe.

create or replace function update_media_approval(p_media_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_agence uuid;
begin
  /* ⚠️ CORRECTIF DE FOND (trouvé en écrivant cette vague) : la version
     déployée le 21/07 n'acceptait que ('pending','approved','changes')
     alors que la console envoie 'changes_requested' — le bouton
     « Demander des changements » échouait donc EN SILENCE depuis, et
     l'appel n'inspectait pas l'erreur. Le vocabulaire de l'application
     fait foi ; 'changes' est accepté par indulgence pour d'éventuelles
     lignes anciennes. */
  if p_status = 'changes' then p_status := 'changes_requested'; end if;
  if p_status not in ('pending', 'approved', 'changes_requested') then
    raise exception 'Statut de validation inconnu : %', p_status;
  end if;
  select m.agency_id into v_agence
    from media m
   where m.id = p_media_id and m.agency_id in (select my_agency_ids());
  if v_agence is null then
    raise exception 'Ce montage n''appartient pas à votre loge.';
  end if;
  -- Le rang plancher LIT les livrables, il ne les valide pas.
  if exists (
    select 1 from agency_members am
     where am.user_id = auth.uid() and am.agency_id = v_agence
       and am.role = 'membre' and not ('clients' = any(am.privileges))
  ) then
    raise exception 'Il vous manque le privilège « espaces clients » pour valider un montage.';
  end if;
  update media set approval_status = p_status where id = p_media_id;
end $$;


-- ═══ 3. L'ÉQUIPE DE QUELLE LOGE ? ══════════════════════════════════
--
--  equipe_agence() renvoyait les membres de TOUTES les agences de
--  l'appelant, sans dire de laquelle vient chaque ligne. Depuis la
--  vague 1, les actions (inviter, changer un rôle, retirer) sont
--  épinglées à UNE loge : la liste doit l'être aussi, sinon on voit des
--  coéquipiers sur lesquels on ne peut rien.
--
--  Le paramètre a une VALEUR PAR DÉFAUT : la console déjà déployée,
--  qui appelle sans argument, continue de fonctionner exactement comme
--  avant. L'ancienne signature est supprimée d'abord — sans ça, l'appel
--  sans argument serait ambigu et Postgres refuserait.
--
--  agency_id part désormais dans chaque ligne : l'écran peut dire de
--  quelle loge vient un coéquipier sans re-interroger la base.

drop function if exists equipe_agence();
create or replace function equipe_agence(p_agence uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', am.user_id,
           'agency_id', am.agency_id,
           'nom', coalesce(nullif(am.display_name, ''), u.email),
           'role', am.role,
           'metier', am.metier,
           'privileges', coalesce(to_jsonb(am.privileges), '[]'::jsonb)) order by am.role, am.created_at), '[]'::jsonb)
    from agency_members am
    join auth.users u on u.id = am.user_id
   where am.agency_id in (select my_agency_ids())
     and (p_agence is null or am.agency_id = p_agence)
$$;
revoke execute on function equipe_agence(uuid) from public, anon;
grant execute on function equipe_agence(uuid) to authenticated;


-- ═══ 4. LES LECTURES ANONYMES QUI TRAÎNENT ═════════════════════════
--
--  La production est SAINE aujourd'hui (sondé : un visiteur anonyme
--  voit 0 ligne partout). Mais trois fichiers du dépôt recréeraient ces
--  lectures publiques si on les rejouait — et l'un d'eux s'annonce
--  « rejouable sans risque ». Ces lignes sont donc un FILET : elles ne
--  changent rien si tout va bien, et réparent si un fichier ancien a
--  été rejoué entre-temps.

drop policy if exists "public read documents"              on documents;
-- …et les policies AVEUGLES À L'AGENCE de l'ère mono-locataire : « for
-- all using (auth.role() = 'authenticated') » veut dire « tout compte
-- connecté voit et écrit TOUT », toutes loges confondues. La capture du
-- 21/07 (supabase/migrations/00000000000000_baseline_rls.sql) montre
-- qu'elles ont disparu de la production — ces lignes sont donc un filet,
-- pour le jour où un vieux fichier serait rejoué (schema.sql les
-- recréerait toutes).
drop policy if exists "auth write clients"        on clients;
drop policy if exists "auth write analytics"      on analytics;
drop policy if exists "auth write documents"      on documents;
drop policy if exists "auth write event_pages"    on event_pages;
drop policy if exists "auth write invoices"       on invoices;
drop policy if exists "auth write media"          on media;
drop policy if exists "auth write media_comments" on media_comments;
drop policy if exists "auth write notifications"  on notifications;
drop policy if exists "auth write shoots"         on shoots;
drop policy if exists "public read media_comments"         on media_comments;
drop policy if exists "public read social_stat_snapshots"  on social_stat_snapshots;
drop policy if exists "anon read social_stat_snapshots"    on social_stat_snapshots;
drop policy if exists "public read gallery_photos"         on gallery_photos;
drop policy if exists "public read event_pages"            on event_pages;
drop policy if exists "public read strategies"             on strategies;
drop policy if exists "public read analytics"              on analytics;

notify pgrst, 'reload schema';


-- ═══ CONTRÔLES ═════════════════════════════════════════════════════
-- 1) Les cinq tables portent bien leurs trois verrous + celui de la 2FA.
--    Attendu : 4 lignes par table (insert/update/delete + « exige aal2 »).
select tablename, count(*) as verrous
  from pg_policies
 where schemaname = 'public'
   and tablename in ('gallery_photos','event_pages','strategies','analytics','media_comments')
   and (policyname like '%est un privilège%' or policyname like 'exige aal2%')
 group by tablename order by tablename;

-- 2) Plus aucune policy ouverte à un visiteur anonyme sur ces tables.
--    Attendu : 0 ligne.
select tablename, policyname, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('documents','media_comments','social_stat_snapshots',
                     'gallery_photos','event_pages','strategies','analytics')
   and 'anon' = any(roles);

-- 3) Aucune policy aveugle à l'agence ne subsiste.
--    Attendu : 0 ligne.
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and (qual like '%auth.role()%' or with_check like '%auth.role()%');

-- 4) L'équipe se demande loge par loge.
--    Attendu : la liste de VOTRE équipe (identique à avant).
select jsonb_array_length(equipe_agence()) as coequipiers;
