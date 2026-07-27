-- ═══════════════════════════════════════════════════════════════════
--  JOURNAL DES ENVOIS — chaque locataire voit ce qui est parti de chez lui
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Aujourd'hui un email part au client final et il n'en reste presque
--  rien : la table `notifications` enregistre bien le type et la charge
--  utile de la DEMANDE, mais pas ce qui a réellement été envoyé — ni
--  l'adresse destinataire, ni l'objet, ni le corps. Le photographe ne
--  peut donc pas répondre à « je n'ai rien reçu », ni relire ce que ses
--  mariés ont eu sous les yeux.
--
--  Choix de Gil (27/07/2026) : la trace va au LOCATAIRE, pas à la
--  plateforme — lire la correspondance entre un photographe et ses
--  mariés serait un vrai sujet de confidentialité en marque blanche.
--  Et sous forme de JOURNAL consultable plutôt que de copie par email :
--  la boîte ne se remplit pas, et on retrouve un envoi six mois après.
--
--  On ÉTEND `notifications` au lieu de créer une seconde table : elle
--  existe, elle porte déjà agency_id et client_id, elle est déjà écrite
--  par notify-client et déjà scellée (vérifié : la clé anon n'en lit
--  aucune ligne). Deux journaux concurrents auraient divergé.
-- ═══════════════════════════════════════════════════════════════════

alter table notifications add column if not exists to_email text;
alter table notifications add column if not exists subject  text;
-- Le corps réellement envoyé : c'est LUI qui répond à « qu'est-ce que
-- mon client a reçu ? ». Un objet seul ne suffirait pas.
alter table notifications add column if not exists html     text;
-- envoye · echec · ignore (adresse manquante, doublon, mode test)
alter table notifications add column if not exists statut   text;
alter table notifications add column if not exists erreur   text;

-- Le journal se consulte du plus récent au plus ancien, par client.
create index if not exists notifications_client_recent_idx
  on notifications (client_id, created_at desc);

comment on column notifications.html is
  'Corps HTML réellement envoyé au client final. Lu par la console de l''agence (onglet Envois).';
