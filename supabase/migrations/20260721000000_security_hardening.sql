-- ════════════════════════════════════════════════════════════
-- 🔐 DURCISSEMENT SÉCURITÉ — La Loge / TimelessHouse (21/07/2026)
-- ════════════════════════════════════════════════════════════
-- Issu de l'audit du 21/07/2026. À exécuter dans Supabase :
--   Dashboard → SQL Editor → coller → Run.
-- Chaque bloc est idempotent et tolère l'absence de l'objet visé
-- (DO … EXCEPTION) : safe à rejouer, ne casse rien s'il manque.
--
-- Couvre :
--   #5  RPC security definer exposées à `anon`
--   #5  update_media_approval(uuid,text) non cloisonnée par agence
--   #9  (optionnel, commenté) défauts datés en dur sur `shoots`
-- ════════════════════════════════════════════════════════════

-- ── #5a — Couper l'accès `anon` aux RPC sensibles ─────────────
-- admin_user_id_by_email : n'est appelée QUE par les Edge Functions
-- (clé service_role — non affectée par ces REVOKE). L'exposer à anon
-- permettait d'énumérer les comptes par email.
do $$ begin
  execute 'revoke execute on function public.admin_user_id_by_email(text) from anon, authenticated';
exception when undefined_function then raise notice 'admin_user_id_by_email(text) absente — ignoré'; end $$;

-- update_media_approval(uuid, text) : surcharge ADMIN (l'admin est
-- authentifié). La surcharge CLIENT (p_code, p_media_id, p_status)
-- reste ouverte à anon — elle valide le code. On ne touche qu'à la
-- version 2-args, qui était appelable par n'importe qui avec la clé anon
-- → modification du statut d'approbation de tout média, tous locataires.
do $$ begin
  execute 'revoke execute on function public.update_media_approval(uuid, text) from anon';
exception when undefined_function then raise notice 'update_media_approval(uuid,text) absente — ignoré'; end $$;

-- ── #5b — Cloisonner update_media_approval(uuid,text) par agence ──
-- Même authentifié, un patron d'agence ne doit pouvoir approuver QUE
-- les médias de SON agence. `security definer` contourne la RLS : on
-- réintroduit donc le contrôle DANS la fonction. Les médias historiques
-- sans agency_id restent gérables par le propriétaire de la plateforme.
create or replace function public.update_media_approval(p_media_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending', 'approved', 'changes') then
    raise exception 'statut invalide : %', p_status;
  end if;

  update media m
     set approval_status = p_status
   where m.id = p_media_id
     and (
       exists (
         select 1 from agency_members am
         where am.user_id = auth.uid() and am.agency_id = m.agency_id
       )
       or (
         m.agency_id is null and exists (
           select 1 from agency_members am
           join agencies a on a.id = am.agency_id
           where am.user_id = auth.uid() and a.slug = 'timelesshouse'
         )
       )
     );

  if not found then
    raise exception 'média introuvable ou hors de votre périmètre';
  end if;
end;
$$;

-- ── #9 (OPTIONNEL) — retirer les défauts datés en dur ─────────
-- `shoots.year default 2026` / `month_label default 'Avr'` deviennent
-- faux avec le temps. À N'APPLIQUER que si l'app fournit toujours ces
-- champs à l'insertion (sinon ils tomberaient à NULL). Décommenter en
-- connaissance de cause :
--
-- alter table shoots alter column year        drop default;
-- alter table shoots alter column month_label drop default;

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution, vérifier qu'aucun flux ne casse :
--   · admin : approuver / demander modif sur un média (doit marcher)
--   · client : approuver depuis son espace (RPC 3-args, doit marcher)
-- ════════════════════════════════════════════════════════════
