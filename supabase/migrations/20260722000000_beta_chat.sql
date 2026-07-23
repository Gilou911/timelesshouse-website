-- ════════════════════════════════════════════════════════════
-- 💬  CHAT BÊTA — Gil ↔ chacun de ses locataires
-- ════════════════════════════════════════════════════════════
-- Un fil de discussion privé par agence, pour que les bêta-testeurs
-- remontent leurs contraintes et leurs idées sans quitter la console.
--
-- Trois règles portées par la base, pas par l'interface :
--   ① un locataire ne voit QUE son fil — jamais celui d'un autre ;
--   ② le chat n'existe que pour les agences que Gil a labellisées
--      « bêta testeur » (colonne `beta_chat`) ;
--   ③ personne ne peut signer à la place de l'autre : le rôle inscrit
--      dans un message est vérifié contre l'identité réelle.
--
-- Pas de politique UPDATE ni DELETE : un message envoyé ne peut être
-- ni modifié ni effacé, par personne. C'est volontaire pour un canal
-- de retours — à rouvrir si le besoin d'un « supprimer » se fait
-- sentir.
--
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════

-- ── ① Le label « bêta testeur », posé par Gil ────────────────────
alter table public.agencies
  add column if not exists beta_chat boolean not null default false;

comment on column public.agencies.beta_chat is
  'Le chat bêta (fil direct avec la plateforme) est-il ouvert à cette agence ?';

-- ── ② Le fil ─────────────────────────────────────────────────────
create table if not exists public.beta_messages (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  -- qui parle : 'agence' (le locataire) ou 'plateforme' (Gil)
  auteur_role text not null check (auteur_role in ('agence', 'plateforme')),
  auteur_id   uuid not null references auth.users(id) on delete cascade,
  -- borné : un champ de chat n'a pas à recevoir un roman ni du vide
  corps       text not null check (char_length(btrim(corps)) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists beta_messages_fil_idx
  on public.beta_messages (agency_id, created_at desc);

alter table public.beta_messages enable row level security;

-- ── ③ Qui a le droit de lire ce fil ? ────────────────────────────
-- La plateforme voit tout. Une agence voit le sien, et seulement si
-- son chat est ouvert : retirer le label referme l'accès sur-le-champ.
drop policy if exists "beta lecture" on public.beta_messages;
create policy "beta lecture" on public.beta_messages
  for select to authenticated
  using (
    public.is_platform_member()
    or exists (
      select 1
      from agency_members am
      join agencies a on a.id = am.agency_id
      where am.user_id = auth.uid()
        and am.agency_id = beta_messages.agency_id
        and a.beta_chat
    )
  );

-- ── ④ Qui a le droit d'écrire, et sous quelle signature ? ────────
-- Un locataire ne peut écrire QUE dans son fil, QUE signé 'agence',
-- et QUE sous sa propre identité. Impossible de se faire passer pour
-- la plateforme ni d'écrire chez le voisin.
drop policy if exists "beta ecriture agence" on public.beta_messages;
create policy "beta ecriture agence" on public.beta_messages
  for insert to authenticated
  with check (
    auteur_role = 'agence'
    and auteur_id = auth.uid()
    and exists (
      select 1
      from agency_members am
      join agencies a on a.id = am.agency_id
      where am.user_id = auth.uid()
        and am.agency_id = beta_messages.agency_id
        and a.beta_chat
    )
  );

drop policy if exists "beta ecriture plateforme" on public.beta_messages;
create policy "beta ecriture plateforme" on public.beta_messages
  for insert to authenticated
  with check (
    auteur_role = 'plateforme'
    and auteur_id = auth.uid()
    and public.is_platform_member()
  );

-- ── ⑤ Ouvrir / fermer le chat d'une agence (Gil seulement) ───────
create or replace function public.beta_toggle(p_agency uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not platform_is_owner() then
    raise exception 'Réservé au propriétaire de la plateforme.';
  end if;
  update agencies set beta_chat = coalesce(p_on, false) where id = p_agency;
  return coalesce(p_on, false);
end;
$$;
revoke execute on function public.beta_toggle(uuid, boolean) from anon;

-- ── ⑥ Les fils vus par Gil : qui est bêta, qui a écrit en dernier ─
-- Sert aussi à alimenter la pastille du bouton flottant sans charger
-- tous les messages de toutes les agences.
create or replace function public.beta_fils()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not platform_is_owner() then
    raise exception 'Réservé au propriétaire de la plateforme.';
  end if;
  return coalesce((
    select jsonb_agg(f order by f->>'dernier_le' desc nulls last)
    from (
      select jsonb_build_object(
               'agency_id',  a.id,
               'nom',        a.name,
               'slug',       a.slug,
               'beta_chat',  a.beta_chat,
               'messages',   (select count(*) from beta_messages m where m.agency_id = a.id),
               'dernier_le', (select max(m.created_at) from beta_messages m where m.agency_id = a.id),
               -- date du dernier message VENANT du locataire : c'est
               -- lui qui décide si Gil a quelque chose à lire.
               'dernier_recu', (select max(m.created_at) from beta_messages m
                                where m.agency_id = a.id and m.auteur_role = 'agence')
             ) as f
      from agencies a
      where a.slug <> 'timelesshouse'
    ) s
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.beta_fils() from anon;
