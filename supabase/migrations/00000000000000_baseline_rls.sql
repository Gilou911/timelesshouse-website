-- ════════════════════════════════════════════════════════════
-- 🔐 BASELINE RLS — état RÉEL de production (capturé le 21/07/2026)
-- ════════════════════════════════════════════════════════════
-- Reconstruit depuis pg_policies via supabase/rls-inspect.sql (requête 1),
-- faute de Docker/pg_dump en local. C'est la source de vérité versionnée
-- des politiques RLS (ferme le point #3 de l'audit).
--
-- ⚠️ RÉFÉRENCE / restauration : ne pas rejouer tel quel sur la prod (les
-- politiques existent déjà → erreurs de doublon). Sur une base neuve,
-- exécuter après avoir créé les tables.
--
-- 📌 DEUX MODÈLES coexistent :
--   ✅ « agency write » : cloisonné par agence
--        using (agency_id IN (SELECT my_agency_ids()))
--   ⚠️ « auth all … » / « pb_*_rw » : NON cloisonné (tout authentifié voit
--        tout) — FUITE CROSS-TENANT, correction à appliquer (audit en cours,
--        dépend du schéma exact de ces tables — voir rapport).
-- ════════════════════════════════════════════════════════════

-- ── Tables cloisonnées par agence (modèle correct) ──────────────
alter table public.ad_creatives          enable row level security;
create policy "agency write" on public.ad_creatives          as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.ai_insights            enable row level security;
create policy "agency write" on public.ai_insights            as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.analytics              enable row level security;
create policy "agency write" on public.analytics              as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.campaign_posts         enable row level security;
create policy "agency write" on public.campaign_posts         as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.campaigns              enable row level security;
create policy "agency write" on public.campaigns              as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.clients                enable row level security;
create policy "agency write" on public.clients                as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.competitor_snapshots   enable row level security;
create policy "agency write" on public.competitor_snapshots   as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.competitors            enable row level security;
create policy "agency write" on public.competitors            as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.conversions            enable row level security;
create policy "agency write" on public.conversions            as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.documents              enable row level security;
create policy "agency write" on public.documents              as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.encode_jobs            enable row level security;
create policy "agency write" on public.encode_jobs            as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.event_pages            enable row level security;
create policy "agency write" on public.event_pages            as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.galleries              enable row level security;
create policy "agency write" on public.galleries              as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.gallery_photos         enable row level security;
create policy "agency write" on public.gallery_photos         as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.invoices               enable row level security;
create policy "agency write" on public.invoices               as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.media                  enable row level security;
create policy "agency write" on public.media                  as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.media_comments         enable row level security;
create policy "agency write" on public.media_comments         as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.notifications          enable row level security;
create policy "agency write" on public.notifications          as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.post_metrics_history   enable row level security;
create policy "agency write" on public.post_metrics_history   as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.shoots                 enable row level security;
create policy "agency write" on public.shoots                 as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.social_accounts        enable row level security;
create policy "agency write" on public.social_accounts        as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.social_alerts          enable row level security;
create policy "agency write" on public.social_alerts          as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.social_posts           enable row level security;
create policy "agency write" on public.social_posts           as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.social_stat_snapshots  enable row level security;
create policy "agency write" on public.social_stat_snapshots  as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));
alter table public.strategies             enable row level security;
create policy "agency write" on public.strategies             as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids())) with check (agency_id IN (SELECT my_agency_ids()));

-- ── Agence & appartenances (lecture de son propre périmètre) ────
alter table public.agencies               enable row level security;
create policy "members read own agency" on public.agencies as permissive for select to authenticated
  using (id IN (SELECT agency_members.agency_id FROM agency_members WHERE agency_members.user_id = auth.uid()));
alter table public.agency_members         enable row level security;
create policy "members read own membership" on public.agency_members as permissive for select to authenticated
  using (user_id = auth.uid());

-- ── ⚠️ NON CLOISONNÉES — tout utilisateur authentifié voit TOUT ──
--    (FUITE CROSS-TENANT — correction en attente de confirmation du schéma)
alter table public.paid_videos            enable row level security;
create policy "auth all paid_videos"     on public.paid_videos     as permissive for all to public using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter table public.portfolio_items        enable row level security;
create policy "auth all portfolio_items" on public.portfolio_items as permissive for all to public using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter table public.portfolio_leads        enable row level security;
create policy "auth all portfolio_leads" on public.portfolio_leads as permissive for all to public using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter table public.portfolio_spaces       enable row level security;
create policy "auth all portfolio_spaces" on public.portfolio_spaces as permissive for all to public using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter table public.purchases              enable row level security;
create policy "auth all purchases"       on public.purchases       as permissive for all to public using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── ⚠️ Photobooth — using(true) : tout authentifié voit TOUT ────
--    (PII invités : emails, selfies — voir migration de correction)
alter table public.photobooth_event_config enable row level security;
create policy "pb_config_rw"    on public.photobooth_event_config as permissive for all    to authenticated using (true) with check (true);
alter table public.photobooth_guests        enable row level security;
create policy "pb_guests_rw"    on public.photobooth_guests        as permissive for all    to authenticated using (true) with check (true);
alter table public.photobooth_matches       enable row level security;
create policy "pb_matches_rw"   on public.photobooth_matches       as permissive for all    to authenticated using (true) with check (true);
alter table public.photobooth_metrics       enable row level security;
create policy "pb_metrics_read" on public.photobooth_metrics       as permissive for select to authenticated using (true);
alter table public.photobooth_photos        enable row level security;
create policy "pb_photos_rw"    on public.photobooth_photos        as permissive for all    to authenticated using (true) with check (true);
alter table public.photobooth_signups       enable row level security;
create policy "pb_signups_machine" on public.photobooth_signups    as permissive for all    to authenticated using (true) with check (true);

-- ── RLS activée SANS politique = accès service_role uniquement ──
--    (verrouillage total — correct pour des journaux internes)
alter table public.ai_actions_log     enable row level security;  -- aucune policy
alter table public.auth_recovery_log  enable row level security;  -- aucune policy
alter table public.signup_log         enable row level security;  -- aucune policy
