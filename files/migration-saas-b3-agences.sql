-- ════════════════════════════════════════════════════════════
-- 🏢 MIGRATION SaaS B.3 (1ʳᵉ brique) — Création d'agences depuis l'admin
-- ════════════════════════════════════════════════════════════
-- Suite de files/migration-saas-b2.sql. Donne au PROPRIÉTAIRE DE LA
-- PLATEFORME (owner de l'agence « timelesshouse ») une section
-- « Agences » dans son admin : liste + création (l'Edge Function
-- create-agency crée aussi le compte du patron de l'agence).
-- ════════════════════════════════════════════════════════════

-- L'utilisateur connecté est-il propriétaire de la plateforme ?
-- (owner de l'agence racine « timelesshouse » — le SaaS lui appartient)
create or replace function platform_is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from agency_members am
     join agencies a on a.id = am.agency_id
     where am.user_id = auth.uid() and am.role = 'owner' and a.slug = 'timelesshouse') $$;

-- Liste des agences avec compteurs — réservée au propriétaire plateforme.
-- Sert aussi de détecteur côté admin : si l'appel échoue, la section
-- « Agences » n'est simplement pas affichée.
create or replace function platform_list_agencies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not platform_is_owner() then
    raise exception 'réservé au propriétaire de la plateforme';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',            a.id,
    'name',          a.name,
    'slug',          a.slug,
    'plan',          a.plan,
    'active',        a.active,
    'contact_email', a.contact_email,
    'logo_url',      a.logo_url,
    'accent_color',  a.accent_color,
    'bg_color',      a.bg_color,
    'created_at',    a.created_at,
    'clients_count', (select count(*) from clients c where c.agency_id = a.id),
    'owners',        (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
                      from agency_members am join auth.users u on u.id = am.user_id
                      where am.agency_id = a.id and am.role = 'owner')
  ) order by a.created_at) from agencies a), '[]'::jsonb);
end $$;
revoke execute on function platform_is_owner()      from public, anon;
revoke execute on function platform_list_agencies() from public, anon;
grant  execute on function platform_is_owner()      to authenticated;
grant  execute on function platform_list_agencies() to authenticated;

-- Helper pour l'Edge Function create-agency (service role uniquement) :
-- retrouve un compte existant par email pour le réutiliser au lieu
-- d'échouer si le patron de l'agence a déjà un compte.
create or replace function admin_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as
$$ select id from auth.users where lower(email) = lower(trim(p_email)) limit 1 $$;
revoke execute on function admin_user_id_by_email(text) from public, anon, authenticated;
grant  execute on function admin_user_id_by_email(text) to service_role;

-- ── Brique 2 : gardes Edge Functions par rôles ──────────────
-- b2-sign / cloudinary-sign / sync-social n'utilisent plus
-- ADMIN_EMAILS mais l'appartenance agency_members (b2-sign vérifie en
-- plus que chaque chemin signé appartient à l'agence de l'appelant).
-- Le compte machine du photobooth devient membre admin de
-- TimelessHouse pour continuer à signer ses uploads photobooth/.
insert into agency_members (agency_id, user_id, role)
select a.id, u.id, 'admin' from agencies a, auth.users u
where a.slug = 'timelesshouse' and lower(u.email) = 'photobooth@timelesshouse.org'
on conflict do nothing;

-- ✅ Briques 1 & 2 de B.3 posées. Restent (voir files/SAAS-ROADMAP.md) :
--    marque blanche visible, quotas stockage, Stripe, inscription
--    self-serve, cloisonnement des dossiers Cloudinary (ou migration
--    Cloudflare Images).
