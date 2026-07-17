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
create policy "public read snapshots" on social_stat_snapshots for select using (true);

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
