-- ════════════════════════════════════════════════════════════
-- 🎨 MIGRATION — Personnalisation des galeries photobooth
-- ════════════════════════════════════════════════════════════
-- L'admin locale de l'app photobooth choisit thème + disposition ;
-- la config est poussée ici et lue par photobooth.html via la RPC.
-- Mêmes palettes que les galeries événement (event-photos-*).

create table if not exists photobooth_event_config (
  event_code  text primary key,
  config      jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table photobooth_event_config enable row level security;

drop policy if exists pb_config_rw on photobooth_event_config;
create policy pb_config_rw on photobooth_event_config
  for all to authenticated using (true) with check (true);

-- La RPC renvoie désormais aussi la config de l'événement de l'invité.
create or replace function photobooth_gallery(p_token text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select case when g.token is null then null else json_build_object(
    'first_name', g.first_name,
    'event_code', g.event_code,
    'config', coalesce((
      select c.config from photobooth_event_config c
      where c.event_code = g.event_code
    ), '{}'::jsonb),
    'photos', coalesce((
      select json_agg(json_build_object(
               'url', p.url,
               'stem', p.stem,
               'taken_at', p.taken_at
             ) order by p.taken_at)
      from photobooth_matches m
      join photobooth_photos p on p.id = m.photo_id
      where m.guest_token = g.token
    ), '[]'::json)
  ) end
  from (select * from photobooth_guests where token = p_token) g;
$$;

revoke all on function photobooth_gallery(text) from public;
grant execute on function photobooth_gallery(text) to anon, authenticated;

-- ── Ajout ultérieur (même jour) : miniatures de grille ──
-- alter table photobooth_photos add column if not exists thumb_url text;
-- (RPC photobooth_gallery mise à jour pour renvoyer thumb_url)
