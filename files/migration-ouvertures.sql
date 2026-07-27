-- ═══════════════════════════════════════════════════════════════════
--  SUIVI DES OUVERTURES — « envoyé le X, ouvert le Y »
--  ═══════════════════════════════════════════════════════════════════
--  À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
--  Le photographe envoie une galerie et n'en entend plus parler. « Est-ce
--  qu'ils l'ont vue ? » est la question permanente — et c'est elle qui
--  décide s'il faut relancer. Le journal d'envois répond à « qu'est-ce
--  que j'ai envoyé » ; il manquait « est-ce que ça a été ouvert ».
--
--  DÉLIBÉRÉMENT GROSSIER. On compte des ouvertures et on retient la
--  première et la dernière — pas qui, pas d'où, pas combien de temps.
--  Un photographe a besoin de savoir SI sa galerie vit, pas de pister
--  ses clients ; et les mariés n'ont pas consenti à être suivis.
--  Aucune adresse IP, aucun identifiant de visiteur, aucun cookie.
-- ═══════════════════════════════════════════════════════════════════

alter table galleries add column if not exists opened_count integer not null default 0;
alter table galleries add column if not exists first_opened_at timestamptz;
alter table galleries add column if not exists last_opened_at  timestamptz;

comment on column galleries.opened_count is
  'Nombre d''ouvertures de la page galerie. Volontairement anonyme : aucun visiteur n''est identifié.';


-- Une ouverture. Appelée par la page publique, donc sans authentification :
-- elle passe par une RPC scellée par le code, comme toutes les autres, et
-- n'écrit RIEN d'autre que ces trois colonnes.
create or replace function note_gallery_open(p_code text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare g galleries;
begin
  g := portal_gallery(p_code);
  if g.id is null then return; end if;
  update galleries
     set opened_count    = coalesce(opened_count, 0) + 1,
         first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at  = now()
   where id = g.id;
end $$;
grant execute on function note_gallery_open(text) to anon, authenticated;
