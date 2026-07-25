-- ════════════════════════════════════════════════════════════
-- 💼 MÉTIERS PAR AGENCE — agency_universes (25/07/2026)
-- ════════════════════════════════════════════════════════════
-- Une loge se vend PAR MÉTIER. À l'inscription, l'agence en choisit un ;
-- elle pourra en ajouter d'autres depuis ses paramètres (option payante),
-- et s'en désabonner — auquel cas elle garde l'usage JUSQU'À L'ÉCHÉANCE
-- déjà réglée. D'où la colonne `valid_until` : la fondation du « je me
-- désabonne mais je finis mon mois » existe dès maintenant, avant même
-- que Stripe ne soit branché.
--
-- ⚠️ AUCUNE RÉGRESSION : les agences existantes sont rattrapées plus bas
-- avec TOUS les métiers qu'elles utilisent DÉJÀ (relevés dans clients).
-- Personne ne perd l'accès à un espace qu'il a créé.
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.agency_universes (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  -- 'celebration' | 'filmmaker' | 'communication' | 'neutre' (voir univers.js)
  universe    text not null,
  -- 'inclus' = compris dans l'offre (le métier choisi à l'inscription)
  -- 'option' = métier supplémentaire facturé
  source      text not null default 'inclus',
  -- 'active' = utilisable ; 'cancelling' = résilié, utilisable jusqu'à valid_until
  status      text not null default 'active',
  -- Fin de la période déjà payée. NULL = pas de date de fin (métier inclus).
  valid_until timestamptz,
  -- L'item Stripe correspondant (rempli quand la facturation sera branchée).
  stripe_item_id text,
  created_at  timestamptz not null default now(),
  primary key (agency_id, universe),
  constraint agency_universes_source_chk check (source in ('inclus', 'option')),
  constraint agency_universes_status_chk check (status in ('active', 'cancelling'))
);

create index if not exists agency_universes_agency_idx
  on public.agency_universes (agency_id);

-- ── Le métier est-il utilisable MAINTENANT ? ────────────────
-- Actif, ou résilié mais pas encore arrivé à échéance.
create or replace function public.agency_universe_actif(p_status text, p_valid_until timestamptz)
returns boolean
language sql
immutable
as $$
  select p_status = 'active'
      or (p_status = 'cancelling' and p_valid_until is not null and p_valid_until > now());
$$;

-- ── RLS : une agence lit SES métiers, personne n'écrit côté client ──
alter table public.agency_universes enable row level security;

do $$ begin
  drop policy if exists agency_universes_read on public.agency_universes;
  create policy agency_universes_read on public.agency_universes
    for select to authenticated
    using (
      exists (
        select 1 from public.agency_members am
        where am.agency_id = agency_universes.agency_id
          and am.user_id = auth.uid()
      )
    );
exception when others then raise notice 'policy agency_universes_read : %', sqlerrm; end $$;

-- La plateforme (TimelessHouse) lit TOUT : c'est ce qui permet au label
-- « métiers » d'apparaître dans l'admin fondateur, en face de chaque agence.
do $$ begin
  drop policy if exists agency_universes_read_platform on public.agency_universes;
  create policy agency_universes_read_platform on public.agency_universes
    for select to authenticated
    using (
      exists (
        select 1
          from public.agency_members am
          join public.agencies ag on ag.id = am.agency_id
         where am.user_id = auth.uid()
           and ag.slug = 'timelesshouse'
      )
    );
exception when others then raise notice 'policy agency_universes_read_platform : %', sqlerrm; end $$;

-- Aucune policy d'écriture : seul le service_role (webhook Stripe, console
-- fondateur) écrit. Un locataire ne doit JAMAIS pouvoir s'offrir un métier.

-- ════════════════════════════════════════════════════════════
-- RATTRAPAGE DES AGENCES EXISTANTES
-- ════════════════════════════════════════════════════════════
-- Chaque agence reçoit, en 'inclus', tous les métiers qu'elle utilise
-- déjà (d'après l'univers de ses clients), plus 'celebration' par défaut
-- si elle n'a encore aucun client. Les valeurs héritées (mariage,
-- fiancailles, anniversaire-mariage) comptent pour 'celebration'.
insert into public.agency_universes (agency_id, universe, source, status)
select distinct
  a.id,
  case
    when c.universe in ('mariage', 'fiancailles', 'anniversaire-mariage') then 'celebration'
    when c.universe in ('celebration', 'communication', 'neutre')          then c.universe
    else 'neutre'          -- immobilier, commercial, court-metrage, voyage, autre…
  end as universe,
  'inclus', 'active'
from public.agencies a
join public.clients c on c.agency_id = a.id
where c.universe is not null
on conflict (agency_id, universe) do nothing;

-- Les agences sans aucun client : métier Mariage & célébrations par défaut.
insert into public.agency_universes (agency_id, universe, source, status)
select a.id, 'celebration', 'inclus', 'active'
from public.agencies a
where not exists (
  select 1 from public.agency_universes u where u.agency_id = a.id
)
on conflict (agency_id, universe) do nothing;

-- ════════════════════════════════════════════════════════════
-- ✅ Après exécution :
--    select a.slug, u.universe, u.source, u.status, u.valid_until
--      from public.agency_universes u
--      join public.agencies a on a.id = u.agency_id
--     order by a.slug;
--    Chaque agence doit avoir AU MOINS une ligne, et aucune ne doit
--    avoir perdu un métier qu'elle utilisait.
-- ════════════════════════════════════════════════════════════
