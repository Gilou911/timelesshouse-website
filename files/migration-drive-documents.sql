-- ═══════════════════════════════════════════════════════════════════
--  DRIVE — les documents entrent au disque commun
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  Le Drive n'acceptait que photos et vidéos. Les contrats, devis et
--  briefs y entrent désormais (genre 'document') — visionneuse PDF au
--  clic, envoi vers les Documents d'un client ou transformation en
--  facture (le PDF devient pdf_url), et les formulaires Médias /
--  Factures / Documents savent piocher dans le Drive au lieu de
--  re-téléverser.
alter table drive_items drop constraint if exists drive_items_genre_check;
alter table drive_items add constraint drive_items_genre_check
  check (genre in ('dossier', 'photo', 'video', 'document'));

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
select pg_get_constraintdef(oid) as contrainte
  from pg_constraint where conname = 'drive_items_genre_check';
