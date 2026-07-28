-- ═══════════════════════════════════════════════════════════════════
--  MASQUAGE — les mariés choisissent ce que les invités voient
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Des mariés veulent écarter certaines photos avant de faire circuler
--  le lien : une photo qu'ils n'aiment pas, ou une qu'ils gardent pour
--  eux. Même chose pour un film. Le photographe doit pouvoir le faire
--  à leur place (« enlève la 47 » au téléphone).
--
--  QUI EST DEVANT LA GALERIE ? Un seul lien circule ; rien ne distingue
--  les mariés d'un invité. Mais deux codes existent déjà : l'access_code
--  de la galerie (le lien partagé) et le CODE CLIENT, qui ouvre l'espace
--  personnel des mariés et que les invités n'ont jamais. C'est lui la
--  clé de la vue maîtresse — aucun nouveau système d'identité.
--  (L'identité par email de la sélection est écartée : déclarative,
--  n'importe quel invité connaissant l'email des mariés verrait tout.)
--
--  LE MASQUAGE SE JOUE ICI, PAS DANS LA PAGE : voiler des photos à
--  l'écran laisserait leurs adresses dans le JSON que n'importe quel
--  invité curieux peut lire. La RPC publique ne livre QUE le visible.
-- ═══════════════════════════════════════════════════════════════════

alter table gallery_photos add column if not exists hidden boolean not null default false;

comment on column gallery_photos.hidden is
  'Masquée aux invités. Les mariés (code client) et le photographe la voient voilée ; la RPC publique ne la livre pas.';


-- La config sans les vidéos masquées. Les configs héritées (clés
-- teaser…/film…, sans tableau videos) passent telles quelles : elles
-- prédatent le masquage, rien n'y est masquable.
create or replace function config_public(cfg jsonb) returns jsonb
language sql immutable as $$
  select case
    when cfg is null then '{}'::jsonb
    when jsonb_typeof(cfg->'videos') = 'array' then
      jsonb_set(cfg, '{videos}', coalesce((
        select jsonb_agg(v) from jsonb_array_elements(cfg->'videos') v
        where not coalesce((v->>'hidden')::boolean, false)), '[]'::jsonb))
    else cfg
  end
$$;
revoke execute on function config_public(jsonb) from public, anon, authenticated;

-- ── La charge d'une galerie, en deux vues ──────────────────────────
-- Un seul constructeur pour la vue publique et la vue maîtresse :
-- deux copies auraient divergé à la première évolution.
-- p_maitre = false → photos masquées absentes, vidéos masquées retirées
--                    de la config.
-- p_maitre = true  → tout, avec le drapeau `hidden` sur chaque photo.
create or replace function gallery_payload(g galleries, p_maitre boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gallery', jsonb_build_object(
      'id', g.id, 'title', g.title, 'kind', g.kind,
      'template', g.template,
      'config', case when p_maitre then coalesce(g.config, '{}'::jsonb)
                     else config_public(g.config) end),
    'client', (select jsonb_build_object('name', c.name) from clients c where c.id = g.client_id),
    'agency', (select jsonb_build_object('name', a.name, 'slug', a.slug,
                 'logo_url', a.logo_url, 'accent_color', a.accent_color,
                 'bg_color', a.bg_color, 'contact_email', a.contact_email,
                 'badge', (plan_limits(a.plan)->>'badge')::boolean)
               from agencies a where a.id = g.agency_id),
    'maitre', p_maitre,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('category', q.category, 'photos', q.photos)
                       order by q.cat_pos, q.cat_born, q.category)
      from (
        select gp.category,
               min(gp.position)   as cat_pos,
               min(gp.created_at) as cat_born,
               jsonb_agg((jsonb_build_object(
                 'id', gp.id, 'width', gp.width, 'height', gp.height,
                 'url_original', gp.url_original, 'url_view', gp.url_view,
                 'url_grid', gp.url_grid)
                 || case when p_maitre
                         then jsonb_build_object('hidden', coalesce(gp.hidden, false))
                         else '{}'::jsonb end
               ) order by gp.position, gp.created_at) as photos
        from gallery_photos gp
        where gp.gallery_id = g.id
          and (p_maitre or not coalesce(gp.hidden, false))
        group by gp.category
      ) q), '[]'::jsonb)
  )
$$;
revoke execute on function gallery_payload(galleries, boolean) from public, anon, authenticated;


-- La RPC publique garde exactement son contrat — moins ce qui est masqué.
create or replace function get_gallery_by_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;
  return gallery_payload(g, false);
end $$;
grant execute on function get_gallery_by_code(text) to anon, authenticated;

-- ── La vue maîtresse ───────────────────────────────────────────────
-- Scellée par les DEUX codes : celui de la galerie ET celui du client,
-- qui doivent se correspondre. Sert aux mariés (leur espace garde leur
-- code dans le navigateur) et au concepteur (le photographe connaît le
-- code de son client).
create or replace function get_gallery_master(p_client_code text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g galleries; c clients;
begin
  c := portal_client(p_client_code);
  if c.id is null then return null; end if;
  g := portal_gallery(p_code);
  if g.id is null or g.client_id is distinct from c.id then return null; end if;
  return gallery_payload(g, true);
end $$;
grant execute on function get_gallery_master(text, text) to anon, authenticated;


-- ── Basculer une photo ─────────────────────────────────────────────
-- Le sceau est le code client : la photo doit appartenir à CE client.
-- Renvoie true si la bascule a eu lieu — la page ne voile jamais une
-- photo que le serveur n'a pas réellement masquée.
create or replace function set_gallery_photo_hidden(p_client_code text, p_photo uuid, p_hidden boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare c clients;
begin
  c := portal_client(p_client_code);
  if c.id is null then return false; end if;
  update gallery_photos set hidden = p_hidden
   where id = p_photo and client_id = c.id;
  return found;
end $$;
grant execute on function set_gallery_photo_hidden(text, uuid, boolean) to anon, authenticated;

-- ── Basculer un film ───────────────────────────────────────────────
-- Le drapeau vit dans config.videos[]. Retiré (et non posé à false)
-- quand on révèle : les configs restent propres.
create or replace function set_gallery_video_hidden(p_client_code text, p_code text, p_key text, p_hidden boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare c clients; g galleries; nv jsonb;
begin
  c := portal_client(p_client_code);
  if c.id is null then return false; end if;
  g := portal_gallery(p_code);
  if g.id is null or g.client_id is distinct from c.id then return false; end if;
  if jsonb_typeof(g.config->'videos') <> 'array' then return false; end if;
  if not exists (select 1 from jsonb_array_elements(g.config->'videos') v
                  where v->>'key' = p_key) then return false; end if;
  select jsonb_agg(case when v->>'key' = p_key
                        then case when p_hidden then v || jsonb_build_object('hidden', true)
                                  else v - 'hidden' end
                        else v end)
    into nv from jsonb_array_elements(g.config->'videos') v;
  update galleries set config = jsonb_set(config, '{videos}', nv) where id = g.id;
  return true;
end $$;
grant execute on function set_gallery_video_hidden(text, text, text, boolean) to anon, authenticated;


-- ── L'archive ne doit jamais livrer une photo masquée ──────────────
-- L'empreinte intègre le masquage : la moindre bascule périme
-- l'archive existante, qui sera refabriquée (du seul visible) au
-- prochain clic. Effet de bord assumé : les archives déjà prêtes
-- portent l'ancienne forme d'empreinte, elles seront toutes
-- refabriquées une fois — le ménage emportera les anciennes.
create or replace function gallery_empreinte(p_gallery uuid) returns text
language sql stable as $$
  select coalesce(
           count(*) filter (where not coalesce(hidden, false))::text
             || '-' || coalesce(max(created_at)::text, 'vide')
             || '-m' || count(*) filter (where coalesce(hidden, false))::text,
           '0-vide-m0')
    from gallery_photos where gallery_id = p_gallery
$$;

-- Même corps qu'avant, un seul changement : « vide » et le compte se
-- jugent sur le VISIBLE. Une galerie dont toutes les photos sont
-- masquées n'a rien à archiver.
create or replace function request_gallery_zip(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; emp text; j zip_jobs; n int;
begin
  g := portal_gallery(p_code);
  if g.id is null then return null; end if;

  select count(*) into n from gallery_photos
   where gallery_id = g.id and not coalesce(hidden, false);
  if n = 0 then
    return jsonb_build_object('statut', 'vide');
  end if;

  emp := gallery_empreinte(g.id);

  select * into j from zip_jobs
   where gallery_id = g.id and empreinte = emp
     and status in ('pending','processing','done')
   order by created_at desc limit 1;

  if j.id is null then
    insert into zip_jobs (gallery_id, agency_id, empreinte)
    values (g.id, g.agency_id, emp)
    on conflict do nothing
    returning * into j;
    -- Course entre deux visiteurs : l'autre vient de l'insérer, on la lit.
    if j.id is null then
      select * into j from zip_jobs
       where gallery_id = g.id and empreinte = emp
         and status in ('pending','processing','done')
       order by created_at desc limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'statut',   coalesce(j.status, 'pending'),
    'url',      j.url,
    'taille',   j.taille,
    'progress', coalesce(j.progress, 0),
    'photos',   n);
end $$;
grant execute on function request_gallery_zip(text) to anon, authenticated;

notify pgrst, 'reload schema';
