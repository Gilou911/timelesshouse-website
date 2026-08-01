-- ═══════════════════════════════════════════════════════════════════
--  DRIVE ↔ POSTS — la chaîne de production se referme
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotente.
--  Aucune table créée → pas besoin de rejouer migration-2fa-rls.sql.
--
--  Le geste d'une agence : le cadreur dépose les rushes au Drive, le
--  monteur dépose l'export, le CM RATTACHE le fichier au post — la
--  fiche montre la vidéo (en version allégée) à côté des sorties.
--  À ne pas confondre avec media_id : `media` reste la LIVRAISON au
--  client (validation, commentaires, emails) ; le fichier du Drive
--  est la matière interne de l'équipe.
alter table posts
  add column if not exists drive_id uuid references drive_items(id) on delete set null;

comment on column posts.drive_id is
  'Fichier du Drive rattaché au post (rush, export). on delete set null : supprimer le fichier ne casse jamais le post.';

notify pgrst, 'reload schema';

-- ═══ CONTRÔLE ══════════════════════════════════════════════════════
select column_name, data_type from information_schema.columns
 where table_name = 'posts' and column_name = 'drive_id';
