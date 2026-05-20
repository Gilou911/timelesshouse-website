-- ════════════════════════════════════════════════════════════
-- 🔧 RÉTRO-REMPLISSAGE — shoots.date_iso (optionnel)
-- ════════════════════════════════════════════════════════════
-- À lancer SEULEMENT si tu veux que les tournages déjà existants
-- (créés avant l'ajout de la colonne date_iso) aient eux aussi
-- une date ISO renseignée, reconstruite à partir des anciens
-- champs date_day / month_label / year.
--
-- Ce script est SANS DANGER et idempotent :
--   ▸ il ne touche QUE les lignes dont date_iso est encore NULL
--   ▸ le relancer plusieurs fois ne change rien
--   ▸ les nouveaux tournages ne sont pas concernés (date_iso déjà rempli)
--
-- À exécuter : Supabase → SQL Editor → coller → Run
-- ════════════════════════════════════════════════════════════

update shoots
set date_iso = make_date(
  coalesce(year, 2026),
  case lower(left(month_label, 3))
    when 'jan' then 1
    when 'fév' then 2  when 'fev' then 2
    when 'mar' then 3
    when 'avr' then 4
    when 'mai' then 5
    when 'jui' then 6                 -- "Juin" (voir NOTE plus bas)
    when 'jul' then 7
    when 'aoû' then 8  when 'aou' then 8
    when 'sep' then 9
    when 'oct' then 10
    when 'nov' then 11
    when 'déc' then 12 when 'dec' then 12
    else 1
  end,
  greatest(1, least(28, coalesce(date_day, 1)))   -- borne 1..28 pour éviter une date invalide
)
where date_iso is null
  and date_day is not null
  and month_label is not null
  and year is not null;

-- ── Vérification (optionnel) ──────────────────────────────────
-- Décommente pour voir le résultat après exécution :
-- select id, title, date_day, month_label, year, date_iso
-- from shoots
-- order by date_iso nulls first;

-- ════════════════════════════════════════════════════════════
-- ⚠️ NOTE — ambiguïté Juin / Juillet
-- ════════════════════════════════════════════════════════════
-- Sur 3 lettres, "Jui" ne distingue pas Juin de Juillet.
-- Ce script suppose JUIN. Si des anciens tournages étaient en
-- juillet, corrige-les manuellement après coup, par exemple :
--
--   update shoots
--   set date_iso = make_date(year, 7, greatest(1, least(28, date_day)))
--   where id = 'LE-UUID-DU-TOURNAGE';
-- ════════════════════════════════════════════════════════════
