-- ═══════════════════════════════════════════════════════════════════
--  CHAT ↔ DRIVE — un message peut porter un fichier du disque
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  « Je l'ai mis dans le Drive » se disait avec des mots ; désormais
--  le message MONTRE le fichier (carte cliquable, aperçu au clic) —
--  depuis le trombone du chat, ou depuis « Annoncer dans le chat »
--  sur la fiche d'un fichier. on delete set null : retirer le fichier
--  du Drive n'efface jamais le message, la carte dit « fichier
--  retiré ». La confidentialité ne change pas : un fichier référencé
--  dans un fil privé reste un fichier du Drive de l'agence — la RLS
--  de drive_items juge qui peut le VOIR, celle du chat juge qui lit
--  le message.
alter table team_messages
  add column if not exists drive_id uuid references drive_items(id) on delete set null;

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
select column_name, data_type from information_schema.columns
 where table_name = 'team_messages' and column_name = 'drive_id';
