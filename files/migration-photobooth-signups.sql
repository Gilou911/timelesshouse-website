-- ════════════════════════════════════════════════════════════
-- 📝 MIGRATION — Inscription photobooth EN LIGNE (complément tablette)
-- ════════════════════════════════════════════════════════════
-- L'invité en 4G s'inscrit sur timelesshouse.org/photobooth-inscription.
-- Le selfie est stocké ICI de façon TRANSITOIRE (bytea), le Mac le
-- récupère, calcule la signature faciale localement, puis SUPPRIME la
-- ligne (selfie + email disparaissent du serveur).
--
-- Garde-fous du point d'entrée public :
--   ▸ code événement validé contre photobooth_event_config ;
--   ▸ selfie plafonné (~600 Ko) ; champs bornés ;
--   ▸ saturation à 500 inscriptions en attente par événement ;
--   ▸ aucune lecture anon (RLS fermé, la RPC est la seule porte).

create table if not exists photobooth_signups (
  id          bigint generated always as identity primary key,
  event_code  text not null,
  first_name  text not null,
  email       text not null,
  marketing   boolean not null default false,
  token       text not null,
  selfie      bytea not null,
  created_at  timestamptz not null default now()
);

alter table photobooth_signups enable row level security;
drop policy if exists pb_signups_machine on photobooth_signups;
create policy pb_signups_machine on photobooth_signups
  for all to authenticated using (true) with check (true);

-- ── Inscription (appelée par la page publique) ──────────────
create or replace function photobooth_signup(
  p_event text, p_first_name text, p_email text,
  p_selfie_b64 text, p_marketing boolean default false
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_pending int;
begin
  if not exists (select 1 from photobooth_event_config where event_code = p_event) then
    return json_build_object('error', 'event_unknown');
  end if;
  if p_first_name is null or length(trim(p_first_name)) < 1 or length(p_first_name) > 80 then
    return json_build_object('error', 'name_invalid');
  end if;
  if p_email is null or position('@' in p_email) < 2 or length(p_email) > 200 then
    return json_build_object('error', 'email_invalid');
  end if;
  if p_selfie_b64 is null or length(p_selfie_b64) < 1000 or length(p_selfie_b64) > 800000 then
    return json_build_object('error', 'selfie_invalid');
  end if;
  select count(*) into v_pending from photobooth_signups where event_code = p_event;
  if v_pending >= 500 then
    return json_build_object('error', 'saturated');
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into photobooth_signups(event_code, first_name, email, marketing, token, selfie)
  values (p_event, trim(p_first_name), lower(trim(p_email)), coalesce(p_marketing, false),
          v_token, decode(p_selfie_b64, 'base64'));

  --  La galerie du token répond immédiatement (« tes photos arrivent »)
  --  au lieu de « galerie introuvable ».
  insert into photobooth_guests(token, event_code, first_name)
  values (v_token, p_event, trim(p_first_name))
  on conflict (token) do nothing;

  return json_build_object('token', v_token);
exception when others then
  return json_build_object('error', 'internal');
end $$;

revoke all on function photobooth_signup(text, text, text, text, boolean) from public;
grant execute on function photobooth_signup(text, text, text, text, boolean) to anon, authenticated;

-- ── Infos publiques d'un événement (thème de la page) ───────
--  N'expose que la config d'apparence, déjà publique via les galeries.
create or replace function photobooth_event_info(p_event text)
returns json language sql security definer set search_path = public stable as $$
  select coalesce(
    (select c.config from photobooth_event_config c where c.event_code = p_event),
    null
  )::json;
$$;

revoke all on function photobooth_event_info(text) from public;
grant execute on function photobooth_event_info(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
