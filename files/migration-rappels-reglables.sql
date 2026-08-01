-- ═══════════════════════════════════════════════════════════════════
--  RAPPELS RÉGLABLES — chaque agence choisit quoi, et à quelle heure
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  Jusqu'ici, l'heure des rappels vivait dans le cron (9h UTC, à
--  prendre ou à laisser). Désormais :
--    · le cron passe TOUTES LES HEURES (§4 ci-dessous) ;
--    · chaque agence règle ses rappels dans Paramètres → Rappels
--      automatiques : tournages (J-7/J-1, aux clients), factures
--      (échéances, aux clients), sorties (« À publier aujourd'hui »,
--      à l'équipe) — actif/coupé, et l'heure d'envoi (heure de Paris) ;
--    · la règle d'envoi est « au premier passage À PARTIR de l'heure
--      choisie » : un passage raté se rattrape à l'heure suivante, et
--      les gardes anti-doublon (flags reminded_*, dedupe_key,
--      rappel_envoye_pour) font qu'aucun rappel ne part deux fois.
--  RÉGLAGE ABSENT = tout actif à 9 h : aucune agence ne change de
--  comportement sans l'avoir demandé.

-- ═══ 1. LES RÉGLAGES ═══════════════════════════════════════════════
alter table agencies add column if not exists rappels jsonb;

comment on column agencies.rappels is
  'Réglages des rappels automatiques : {tournages:{actif,heure}, factures:{actif,heure}, sorties:{actif,heure}} — heure de Paris. NULL = tout actif à 9h. Écrit par update_my_agency_rappels, lu par le cron scheduled-notifications.';

-- ═══ 2. L'ANTI-DOUBLON DES SORTIES (si pas déjà passé ce matin) ════
alter table post_sorties add column if not exists rappel_envoye_pour date;

comment on column post_sorties.rappel_envoye_pour is
  'Jour (Paris) pour lequel le rappel « à publier » est parti. NULL = jamais rappelée. Écrit par le cron scheduled-notifications.';

-- ═══ 3. L'ÉCRITURE, SCELLÉE ════════════════════════════════════════
-- Même modèle qu'update_my_agency_brand : la console ne touche jamais
-- la table en direct, la RPC vérifie le rôle (owner OU admin — régler
-- l'heure d'un rappel n'est pas un acte de facturation) et borne la
-- taille (un jsonb libre ne doit pas devenir un débarras).
create or replace function update_my_agency_rappels(p_rappels jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_agency uuid;
begin
  select am.agency_id into v_agency
    from agency_members am
   where am.user_id = auth.uid() and am.role in ('owner', 'admin')
   limit 1;
  if v_agency is null then
    raise exception 'Réservé au propriétaire ou à un admin de l''agence.';
  end if;
  if p_rappels is null or jsonb_typeof(p_rappels) <> 'object'
     or length(p_rappels::text) > 2000 then
    raise exception 'Réglages invalides.';
  end if;
  update agencies set rappels = p_rappels where id = v_agency;
end $$;
revoke execute on function update_my_agency_rappels(jsonb) from public, anon;
grant execute on function update_my_agency_rappels(jsonb) to authenticated;

-- ═══ 4. LE CRON PASSE À L'HEURE ════════════════════════════════════
-- « daily-notifications » (Integrations → Cron) tournait à 9h UTC.
-- On ne touche qu'à la CADENCE — la commande (l'appel HTTP avec sa
-- clé) reste exactement celle du dashboard. La fonction, elle, décide
-- heure par heure qui est servi : sans ce changement de cadence, les
-- réglages d'heure resteraient lettre morte (une agence réglée à 8h
-- ne serait jamais servie par un unique passage à 11h de Paris).
select cron.alter_job(jobid, schedule => '0 * * * *')
  from cron.job where jobname = 'daily-notifications';

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
-- Ligne 1 : la colonne rappels existe. Ligne 2 : le cron est bien
-- passé à « 0 * * * * » (si aucune ligne : le job porte un autre nom —
-- me le dire, on ajustera depuis le dashboard).
select 'agencies.rappels' as controle, count(*)::text as valeur
  from information_schema.columns
 where table_name = 'agencies' and column_name = 'rappels'
union all
select 'cron ' || jobname, schedule from cron.job where jobname = 'daily-notifications';
