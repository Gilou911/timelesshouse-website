-- ════════════════════════════════════════════════════════════
-- 🔄 MIGRATION v3 — Système de notifications complet
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor → Run
-- Aucune donnée existante n'est supprimée.
-- ════════════════════════════════════════════════════════════

-- 1) Date d'échéance des factures (pour les rappels automatiques)
alter table invoices add column if not exists due_date date;

-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION TERMINÉE
-- ════════════════════════════════════════════════════════════
--
-- 📌 RAPPEL: pour activer les notifications planifiées (rappels
--    de tournage J-2, rappels de facture), il faut ensuite :
--    1. Déployer la fonction scheduled-notifications
--    2. Configurer son cron (voir NOTIFICATIONS-SETUP.md)
-- ════════════════════════════════════════════════════════════
