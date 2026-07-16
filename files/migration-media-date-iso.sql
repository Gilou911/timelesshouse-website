-- ════════════════════════════════════════════════════════════
-- 📅 MIGRATION — tri automatique des médias par date
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor → Run.
-- Idempotente et sans danger (ne touche que les lignes date_iso IS NULL).
--
-- Contexte : la table media ne stockait que `date_label` (texte,
-- ex. « 16 Juillet 2026 ») — impossible à trier chronologiquement.
-- On ajoute une vraie colonne date `date_iso` : les nouveaux médias
-- la renseignent depuis le sélecteur de date de l'admin, et les
-- galeries se trient par cette date (plus besoin du champ position).
-- ════════════════════════════════════════════════════════════

-- 1) Nouvelle colonne date triable
alter table media add column if not exists date_iso date;

-- 2) Rétro-remplissage depuis date_label (« JJ MoisComplet AAAA »).
--    Le jour est borné à 28 pour éviter toute date invalide
--    (ex. « 31 Avril ») — le tri reste correct au mois près.
update media
set date_iso = make_date(
  (split_part(date_label, ' ', 3))::int,                     -- année
  case
    when lower(split_part(date_label, ' ', 2)) like 'janv%' then 1
    when lower(split_part(date_label, ' ', 2)) like 'f%vr%' then 2
    when lower(split_part(date_label, ' ', 2)) like 'mars%' then 3
    when lower(split_part(date_label, ' ', 2)) like 'avr%'  then 4
    when lower(split_part(date_label, ' ', 2)) like 'mai%'  then 5
    when lower(split_part(date_label, ' ', 2)) like 'juin%' then 6
    when lower(split_part(date_label, ' ', 2)) like 'juil%' then 7
    when lower(split_part(date_label, ' ', 2)) like 'ao%'   then 8   -- août / aout
    when lower(split_part(date_label, ' ', 2)) like 'sept%' then 9
    when lower(split_part(date_label, ' ', 2)) like 'oct%'  then 10
    when lower(split_part(date_label, ' ', 2)) like 'nov%'  then 11
    when lower(split_part(date_label, ' ', 2)) like 'd%c%'  then 12  -- décembre / decembre
  end,
  greatest(1, least(28, (split_part(date_label, ' ', 1))::int))      -- jour (borné 1..28)
)
where date_iso is null
  and date_label ~ '^[0-9]{1,2} [^ ]+ [0-9]{4}$'                     -- « JJ Mois AAAA »
  and case                                                          -- mois reconnu uniquement
    when lower(split_part(date_label, ' ', 2)) like 'janv%' then 1
    when lower(split_part(date_label, ' ', 2)) like 'f%vr%' then 2
    when lower(split_part(date_label, ' ', 2)) like 'mars%' then 3
    when lower(split_part(date_label, ' ', 2)) like 'avr%'  then 4
    when lower(split_part(date_label, ' ', 2)) like 'mai%'  then 5
    when lower(split_part(date_label, ' ', 2)) like 'juin%' then 6
    when lower(split_part(date_label, ' ', 2)) like 'juil%' then 7
    when lower(split_part(date_label, ' ', 2)) like 'ao%'   then 8
    when lower(split_part(date_label, ' ', 2)) like 'sept%' then 9
    when lower(split_part(date_label, ' ', 2)) like 'oct%'  then 10
    when lower(split_part(date_label, ' ', 2)) like 'nov%'  then 11
    when lower(split_part(date_label, ' ', 2)) like 'd%c%'  then 12
  end is not null;

-- 3) Index pour un tri rapide par client + date
create index if not exists media_client_date_idx on media (client_id, date_iso desc);

-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION TERMINÉE
--   ▸ nouveaux médias : date_iso renseignée par l'admin
--   ▸ galeries triées par date_iso (récent en premier)
-- Vérif : select title, date_label, date_iso from media order by date_iso desc nulls last;
-- ════════════════════════════════════════════════════════════
