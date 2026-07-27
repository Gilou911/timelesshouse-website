-- ═══════════════════════════════════════════════════════════════════
--  PROGRESSION D'ENCODAGE — celui qui dépose voit où ça en est
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Jusqu'ici la console disait « Optimisation en cours » et rien de
--  plus : sur un 4K de trois minutes, cela reste affiché des heures
--  sans le moindre signe de vie. Le guide demande une barre DÉTERMINÉE
--  dès que la durée est estimable — elle l'est, ffmpeg dit exactement
--  où il en est.
--
--  0 à 98 pendant le transcodage (les deux derniers points couvrent
--  poster, aperçu au survol et envoi sur B2), puis la ligne passe en
--  status='done' — le pourcentage n'a plus à être lu.
-- ═══════════════════════════════════════════════════════════════════

alter table encode_jobs
  add column if not exists progress smallint not null default 0;

-- Un pourcentage reste un pourcentage, même si le worker déraille.
do $$
begin
  alter table encode_jobs
    add constraint encode_jobs_progress_ck check (progress between 0 and 100);
exception when duplicate_object then null;
end $$;

comment on column encode_jobs.progress is
  'Avancement du transcodage, 0-100. Écrit par le worker (workers/encoder), lu par la console.';
