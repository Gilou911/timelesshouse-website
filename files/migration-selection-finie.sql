-- ═══════════════════════════════════════════════════════════════════
--  SÉLECTION TERMINÉE — le signal, et l'archive des favoris
-- ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--  ⚠️ Puis REJOUER files/migration-2fa-rls.sql ? Non — aucune table
--  n'est créée ici, la policy aal2 couvre déjà zip_jobs.
--
--  Les coups de cœur existaient, mais rien ne disait au studio QUAND le
--  choix était clos — le photographe qui prépare un album attendait un
--  appel. Désormais : l'invité (souvent le couple) clôt sa sélection
--  d'un geste, le studio reçoit l'email, et la console sait fabriquer
--  l'ARCHIVE DES SEULS FAVORIS, prête pour la conception d'album.
-- ═══════════════════════════════════════════════════════════════════

-- ── L'archive d'une sélection : les mêmes rouages que l'archive de
--    galerie, plus une liste de photos. NULL = archive complète
--    (comportement d'origine, aucun job existant ne change de sens).
alter table zip_jobs add column if not exists photo_ids uuid[];

comment on column zip_jobs.photo_ids is
  'Archive partielle : seules ces photos. NULL = toute la galerie (visible). Utilisé par l''archive de sélection de la console.';

-- ── La charge publique porte l'identifiant du client ───────────────
-- L'email « sélection terminée » (notify-client) exige un client_id ;
-- la page galerie ne connaissait que son nom. L'identifiant est un
-- uuid opaque : il n'ouvre rien par lui-même, toutes les lectures
-- restent scellées par les RPC et la RLS.
create or replace function gallery_payload(g galleries, p_maitre boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gallery', jsonb_build_object(
      'id', g.id, 'title', g.title, 'kind', g.kind,
      'template', g.template,
      'config', case when p_maitre then coalesce(g.config, '{}'::jsonb)
                     else config_public(g.config) end),
    'client', (select jsonb_build_object('name', c.name, 'id', c.id) from clients c where c.id = g.client_id),
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

-- ── Demander l'archive d'une sélection (console, authentifié) ──────
-- Même contrat que request_gallery_zip, pour une LISTE de photos.
-- L'empreinte dérive de la liste : deux demandes identiques réutilisent
-- la même archive ; une sélection modifiée en fabrique une neuve.
-- Le ménage existant emporte ces archives 7 jours après leur
-- fabrication (leur empreinte ne vaut jamais celle de la galerie) —
-- exactement la durée de vie qu'on veut pour un outil de travail.
create or replace function request_selection_zip(p_gallery uuid, p_photo_ids uuid[])
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g galleries; emp text; j zip_jobs; ids uuid[];
begin
  select * into g from galleries where id = p_gallery;
  if g.id is null or g.agency_id is null
     or not (g.agency_id in (select my_agency_ids())) then
    return jsonb_build_object('statut', 'refus');
  end if;

  -- On ne garde que les photos qui appartiennent VRAIMENT à la galerie :
  -- une liste bricolée ne fera jamais sortir la photo d'un autre client.
  select array_agg(gp.id) into ids
    from gallery_photos gp
   where gp.gallery_id = g.id and gp.id = any(p_photo_ids);
  if ids is null or array_length(ids, 1) = 0 then
    return jsonb_build_object('statut', 'vide');
  end if;

  -- Empreinte : la liste triée, condensée — l'ordre de clic n'y change rien.
  select 'sel-' || md5(string_agg(x::text, ',' order by x)) || '-' || count(*)
    into emp from unnest(ids) x;

  select * into j from zip_jobs
   where gallery_id = g.id and empreinte = emp
     and status in ('pending','processing','done')
   order by created_at desc limit 1;

  if j.id is null then
    insert into zip_jobs (gallery_id, agency_id, empreinte, photo_ids)
    values (g.id, g.agency_id, emp, ids)
    on conflict do nothing
    returning * into j;
    if j.id is null then
      select * into j from zip_jobs
       where gallery_id = g.id and empreinte = emp
         and status in ('pending','processing','done')
       order by created_at desc limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'id',       j.id,
    'statut',   coalesce(j.status, 'pending'),
    'url',      j.url,
    'taille',   j.taille,
    'progress', coalesce(j.progress, 0),
    'photos',   array_length(ids, 1));
end $$;
revoke execute on function request_selection_zip(uuid, uuid[]) from public, anon;
grant execute on function request_selection_zip(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
