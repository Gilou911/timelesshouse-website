-- ═══════════════════════════════════════════════════════════════════
--  RAPPELS DE SORTIE — l'agenda qui réveille
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  Chaque matin (cron scheduled-notifications, ~11h de Paris), une
--  agence reçoit UN email : les sorties du jour, et celles d'hier
--  jamais cochées « publié ». Cette colonne est l'anti-doublon : elle
--  retient POUR QUEL JOUR une sortie a déjà été rappelée.
--    · cron rejoué le même jour  → rien ne repart ;
--    · sortie déplacée à demain  → le jour mémorisé ne correspond
--      plus, elle se ré-arme toute seule ;
--    · au plus DEUX rappels par sortie : le jour J, puis J+1 si
--      « publié » n'a jamais été coché — ensuite, silence.
alter table post_sorties add column if not exists rappel_envoye_pour date;

comment on column post_sorties.rappel_envoye_pour is
  'Jour (Paris) pour lequel le rappel « à publier » est parti. NULL = jamais rappelée. Écrit par le cron scheduled-notifications.';

-- ── Contrôle ───────────────────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_name = 'post_sorties' and column_name = 'rappel_envoye_pour';
