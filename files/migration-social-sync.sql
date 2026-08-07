-- ═══════════════════════════════════════════════════════════════════
-- ⛔  FICHIER HISTORIQUE — NE PLUS EXÉCUTER (audit du 07/08/2026)
-- ═══════════════════════════════════════════════════════════════════
--  Ce fichier date d'AVANT la marque blanche, quand la base servait un
--  seul studio. Le rejouer aujourd'hui rouvrirait les statistiques sociales des locataires — et son secret
--  de cron n'est qu'un gabarit (__CRON_SECRET__) que l'éditeur SQL ne
--  remplace pas.
--
--  Le garde-fou ci-dessous ARRÊTE le script dès la première ligne :
--  l'éditeur SQL de Supabase exécute tout dans une transaction, donc
--  rien ne s'applique. Il est là parce qu'un commentaire d'avertissement
--  ne suffit pas — on colle un fichier sans le lire jusqu'au bout.
--
--  Ce fichier reste dans le dépôt comme ARCHIVE : il raconte d'où vient
--  le schéma. Pour agir sur la base d'aujourd'hui, voir
--  files/AUDIT-COHERENCE-2026-08.md et les migrations récentes.
-- ═══════════════════════════════════════════════════════════════════
do $$ begin
  raise exception 'ARCHIVE — ne pas exécuter : elle rouvre les statistiques et son secret de cron est un gabarit (voir l''en-tête du fichier).';
end $$;

-- ════════════════════════════════════════════════════════════
-- 📡 MIGRATION — Sync sociale réelle (Instagram + TikTok OAuth)
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- Idempotente. Aucune donnée existante supprimée.

-- 1) 🔐 SÉCURITÉ — social_accounts contiendra de vrais tokens OAuth.
--    La politique « public read » exposait TOUTES les colonnes (dont
--    access_token_encrypted) à la clé anon. On la retire : les lectures
--    publiques passent par la vue v_social_accounts_public (sans tokens),
--    qui reste fonctionnelle (propriétaire postgres → contourne la RLS).
drop policy if exists "public read social_accounts" on social_accounts;

-- 2) Historique quotidien des abonnés (courbe de croissance réelle)
create table if not exists social_stat_snapshots (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid references social_accounts(id) on delete cascade,
  client_id       uuid references clients(id) on delete cascade,
  platform        text,
  captured_on     date not null default current_date,
  follower_count  bigint,
  following_count bigint,
  total_posts     bigint,
  likes_total     bigint,                        -- TikTok : likes cumulés du compte
  created_at      timestamptz default now(),
  unique (account_id, captured_on)               -- 1 point par compte et par jour
);
alter table social_stat_snapshots enable row level security;
drop policy if exists "public read snapshots" on social_stat_snapshots;
-- ⚠️ NEUTRALISÉE (07/08/2026) : les statistiques sociales d'un locataire
-- ne regardent pas les visiteurs — et surtout pas ceux des autres loges.
-- Le `drop` reste : rejouer ce fichier nettoie au lieu d'ouvrir.
-- create policy "public read snapshots" on social_stat_snapshots for select using (true);

-- 3) Upsert des posts par identifiant externe (la sync repasse toutes les 6 h)
create unique index if not exists social_posts_external_uq
  on social_posts (client_id, platform, post_id_external);

-- 4) ⏰ CRON — sync toutes les 6 h via pg_cron + pg_net.
--    ⚠️ Remplacer __CRON_SECRET__ par la valeur du secret CRON_SECRET
--    (fait automatiquement quand la migration est jouée par l'outillage).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('sync-social-6h') where exists
  (select 1 from cron.job where jobname = 'sync-social-6h');
select cron.schedule(
  'sync-social-6h',
  '0 */6 * * *',
  $$ select net.http_post(
       url     := 'https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/sync-social',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-key','__CRON_SECRET__'),
       body    := '{}'::jsonb
     ); $$
);

-- ✅ TERMINÉ — voir files/SOCIAL-SETUP.md pour la création des apps
--    Meta / TikTok et les secrets des Edge Functions.
