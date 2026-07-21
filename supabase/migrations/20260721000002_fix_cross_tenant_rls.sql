-- ════════════════════════════════════════════════════════════
-- 🔐 CORRECTION FUITE CROSS-TENANT (audit 21/07/2026)
-- ════════════════════════════════════════════════════════════
-- 11 tables étaient lisibles/écrivables par TOUT utilisateur authentifié
-- (`to public using(auth.role()='authenticated')` ou `using(true)`).
-- Comme l'inscription est self-serve, n'importe quel locataire pouvait
-- lire les données personnelles de TimelessHouse : prospects
-- (portfolio_leads), acheteurs (purchases), invités photobooth (emails,
-- selfies).
--
-- Ces tables N'ONT PAS de colonne agency_id : ce sont des fonctionnalités
-- MONO-LOCATAIRE (boutique / portfolio de prospection / photobooth de
-- TimelessHouse). On les restreint donc au PERSONNEL TIMELESSHOUSE.
--
-- ✅ Les flux publics (galerie portfolio par jeton, inscription photobooth,
--    tracking) passent par des RPC `security definer` qui CONTOURNENT la RLS
--    → non affectés par ce changement.
-- 📌 Si un jour ces features deviennent multi-agences, il faudra AJOUTER une
--    colonne agency_id + backfill, puis cloisonner par agence (comme les
--    ~25 autres tables). Ici on ferme la fuite sans changer le schéma.
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════

-- ── Garde : l'utilisateur courant est-il membre de l'agence plateforme ? ──
create or replace function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from agency_members am
    join agencies a on a.id = am.agency_id
    where am.user_id = auth.uid()
      and a.slug = 'timelesshouse'
  );
$$;
revoke execute on function public.is_platform_member() from anon;

-- ── Boutique (mono-locataire TimelessHouse) ─────────────────────
drop policy if exists "auth all paid_videos" on public.paid_videos;
create policy "platform staff" on public.paid_videos as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "auth all purchases" on public.purchases;
create policy "platform staff" on public.purchases as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

-- ── Portfolio de prospection (mono-locataire) ───────────────────
drop policy if exists "auth all portfolio_spaces" on public.portfolio_spaces;
create policy "platform staff" on public.portfolio_spaces as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "auth all portfolio_items" on public.portfolio_items;
create policy "platform staff" on public.portfolio_items as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "auth all portfolio_leads" on public.portfolio_leads;
create policy "platform staff" on public.portfolio_leads as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

-- ── Photobooth (mono-locataire — PII invités) ───────────────────
drop policy if exists "pb_config_rw" on public.photobooth_event_config;
create policy "platform staff" on public.photobooth_event_config as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "pb_guests_rw" on public.photobooth_guests;
create policy "platform staff" on public.photobooth_guests as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "pb_matches_rw" on public.photobooth_matches;
create policy "platform staff" on public.photobooth_matches as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "pb_photos_rw" on public.photobooth_photos;
create policy "platform staff" on public.photobooth_photos as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "pb_signups_machine" on public.photobooth_signups;
create policy "platform staff" on public.photobooth_signups as permissive for all to authenticated
  using (is_platform_member()) with check (is_platform_member());

drop policy if exists "pb_metrics_read" on public.photobooth_metrics;
create policy "platform staff read" on public.photobooth_metrics as permissive for select to authenticated
  using (is_platform_member());

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution, vérifier :
--   · console TimelessHouse : portfolio / photobooth / boutique OK
--   · un compte locataire NON-TimelessHouse : `select * from portfolio_leads`
--     doit renvoyer 0 ligne (avant : toutes les lignes)
-- ════════════════════════════════════════════════════════════
