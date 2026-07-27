-- ═══════════════════════════════════════════════════════════════════
--  MÉNAGE DES ARCHIVES PÉRIMÉES
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Une archive porte l'EMPREINTE de la galerie au moment où elle a été
--  fabriquée : nombre de photos + date de la plus récente. Dès qu'une
--  photo entre ou sort, l'empreinte change — request_gallery_zip ne
--  trouve plus d'archive valide et en refabrique une. L'ancienne, elle,
--  reste sur B2 sans que personne ne puisse plus l'atteindre : elle
--  occupe le quota de l'agence pour rien.
--
--  DÉLAI DE GRÂCE : on ne supprime pas dès que l'empreinte change. Un
--  client peut être EN TRAIN de télécharger l'ancienne archive — couper
--  le fichier sous lui casserait un téléchargement de plusieurs Go, sans
--  qu'il comprenne pourquoi. Sept jours laissent le temps.
-- ═══════════════════════════════════════════════════════════════════

-- Les archives que plus personne ne peut atteindre, passé le délai.
-- Réservée au worker (clé de service) : elle sert à supprimer.
create or replace function stale_zip_jobs(p_grace_days int default 7)
returns setof zip_jobs
language sql stable security definer set search_path = public as $$
  select z.* from zip_jobs z
   where z.status = 'done'
     and z.url is not null
     and z.done_at < now() - make_interval(days => p_grace_days)
     and z.empreinte <> gallery_empreinte(z.gallery_id)
$$;
revoke execute on function stale_zip_jobs(int) from public, anon, authenticated;

-- Les galeries encore vivantes, pour repérer les archives dont la
-- galerie a été supprimée : la ligne zip_jobs part alors en cascade,
-- mais le fichier sur B2, lui, resterait orphelin à jamais.
create or replace function gallery_ids_vivants() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from galleries
$$;
revoke execute on function gallery_ids_vivants() from public, anon, authenticated;
