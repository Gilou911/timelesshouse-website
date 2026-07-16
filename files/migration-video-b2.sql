-- ════════════════════════════════════════════════════════════
-- 🎬 MIGRATION — Pipeline vidéo B2 (HLS adaptatif + affichage qualité)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor → Run
-- Aucune donnée existante n'est supprimée.
--
-- Contexte :
--   Les vidéos livrées sont désormais hébergées uniquement sur
--   Backblaze B2 : l'original (téléchargement) + une version HLS
--   adaptative (lecture, générée par scripts/encode-hls.mjs).
--   Colonnes existantes réutilisées :
--     url         → original haute qualité (téléchargement)
--     preview_url → master.m3u8 HLS (lecture adaptative)
--     thumb_url   → poster jpg (généré automatiquement)
--   Nouvelles colonnes ci-dessous : métadonnées RÉELLES de
--   l'original, mesurées par ffprobe — servent à afficher au
--   client « Original : 4K · 2,3 Go » (pour qu'il ne croie pas
--   que la version de lecture est la qualité finale).
-- ════════════════════════════════════════════════════════════

-- 1) Résolution réelle du fichier original (px)
alter table media add column if not exists source_width  integer;
alter table media add column if not exists source_height integer;

-- 2) Poids réel du fichier original (octets) — remplace à terme
--    la saisie manuelle size_label
alter table media add column if not exists source_size_bytes bigint;

-- 3) Durée exacte en secondes (ffprobe) — remplace à terme la
--    saisie manuelle duration ("0:45")
alter table media add column if not exists duration_seconds integer;

-- 4) Mini-MP4 muet 480p pour l'aperçu au survol des cartes.
--    (preview_url contenant désormais un .m3u8, le survol a besoin
--    de son propre fichier léger — généré par le script d'encodage)
alter table media add column if not exists hover_url text;

-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION TERMINÉE
-- ════════════════════════════════════════════════════════════
--
-- 📌 SUITE DU SETUP (voir files/VIDEO-B2-SETUP.md) :
--    1. Déployer l'Edge Function b2-sign + configurer ses secrets
--    2. Configurer le CORS du bucket : node scripts/setup-b2-cors.mjs
--    3. Workflow : upload depuis l'admin → npm run encode
-- ════════════════════════════════════════════════════════════
