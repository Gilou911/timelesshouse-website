-- ═══════════════════════════════════════════════════════════════════
--  TOURNAGES — de vraies heures, et un tri qui tient debout
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  Premier étage du métier Communication & Marketing : avant tout
--  calendrier éditorial, il faut que la donnée temporelle soit fiable.
--
--  ÉTAT DES LIEUX (relevé sur les 7 tournages en base, 29/07/2026) :
--    · `date_iso` existe et est rempli à 100 % — rien à réparer là.
--    · L'HEURE, elle, n'est que du TEXTE LIBRE dans `time_label`, et
--      la saisie libre a produit ce qu'elle produit toujours :
--        « 10 :00 » (espace avant les deux-points)
--        « 10:00 » (sans fin)
--        « 11:00 - 19:00 »
--        « 08:00 - 00:00 » (fin après minuit)
--        « » (vide)
--      Impossible d'en tirer « ce matin », « qui est libre jeudi »,
--      ou de poser deux tournages côte à côte sans se recouvrir.
--
--  On ajoute donc deux vraies heures. `time_label` RESTE écrit et lu
--  par l'application : les deux cohabitent le temps que tout bascule,
--  et aucune vue existante ne casse.
-- ═══════════════════════════════════════════════════════════════════

alter table shoots add column if not exists start_time time;
alter table shoots add column if not exists end_time   time;

comment on column shoots.start_time is
  'Heure de début, vraie. Source de vérité pour le calendrier ; time_label reste le texte affiché tant que tout n''a pas basculé.';
comment on column shoots.end_time is
  'Heure de fin. Peut être INFÉRIEURE à start_time : un tournage qui finit après minuit (constaté : 08:00 - 00:00).';

-- ── Rétro-remplissage tolérant ─────────────────────────────────────
-- Le texte est nettoyé avant lecture : espaces parasites retirés, et
-- tous les tirets (court, demi-cadratin, cadratin) ramenés au même.
-- Une valeur qui ne ressemble à rien laisse simplement NULL — on
-- n'invente pas une heure qui n'a jamais été saisie.
with propre as (
  select
    id,
    replace(replace(replace(coalesce(time_label, ''), '—', '-'), '–', '-'), ' ', '') as t
  from shoots
), morceaux as (
  select
    id,
    substring(split_part(t, '-', 1) from '^\d{1,2}:\d{2}') as debut,
    substring(split_part(t, '-', 2) from '^\d{1,2}:\d{2}') as fin
  from propre
)
update shoots s
   set start_time = coalesce(s.start_time, m.debut::time),
       end_time   = coalesce(s.end_time,   m.fin::time)
  from morceaux m
 where m.id = s.id
   and (m.debut is not null or m.fin is not null);

-- ── L'index qui porte le calendrier ────────────────────────────────
-- Un calendrier interroge toujours « quels tournages entre telle et
-- telle date » : la date d'abord, l'heure ensuite.
create index if not exists shoots_date_idx on shoots (date_iso, start_time);

-- ── Contrôle ───────────────────────────────────────────────────────
-- À lire après exécution : chaque ligne doit montrer des heures
-- cohérentes avec son texte d'origine, ou NULL si le texte était vide.
select date_iso, time_label, start_time, end_time, title
  from shoots
 order by date_iso, start_time nulls last;
