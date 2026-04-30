-- ════════════════════════════════════════════════════════════
-- 🔄 MIGRATION v2 — Galerie, approbation, commentaires, emails
-- ════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans Supabase → SQL Editor → Run
-- Aucune donnée existante n'est supprimée.
-- ════════════════════════════════════════════════════════════

-- 1) Email du client (pour les notifications)
alter table clients add column if not exists client_email text;

-- 2) Lier les médias à un tournage (pour grouper par shooting)
alter table media add column if not exists shoot_id uuid references shoots(id) on delete set null;

-- 3) Statut d'approbation par média (workflow de validation)
alter table media add column if not exists approval_status text default 'pending';
-- Valeurs possibles : 'pending' (en attente), 'approved' (approuvé), 'changes_requested' (changements demandés)

-- 4) Table des commentaires
create table if not exists media_comments (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid references media(id) on delete cascade,
  author_name text not null,
  is_admin    boolean default false,
  comment     text not null,
  created_at  timestamptz default now()
);

alter table media_comments enable row level security;

drop policy if exists "comments public select" on media_comments;
drop policy if exists "comments public insert" on media_comments;
drop policy if exists "comments auth update"   on media_comments;
drop policy if exists "comments auth delete"   on media_comments;

create policy "comments public select" on media_comments for select using (true);
create policy "comments public insert" on media_comments for insert with check (true);
create policy "comments auth update"   on media_comments for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "comments auth delete"   on media_comments for delete using (auth.uid() is not null);

-- 5) Fonction RPC pour permettre au CLIENT (non-authentifié) de
--    changer UNIQUEMENT le approval_status d'un média.
--    Utilise security definer → bypasse RLS de manière contrôlée.
create or replace function update_media_approval(p_media_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending', 'approved', 'changes_requested') then
    raise exception 'Statut invalide : %', p_status;
  end if;
  update media set approval_status = p_status where id = p_media_id;
end;
$$;

revoke all on function update_media_approval(uuid, text) from public;
grant execute on function update_media_approval(uuid, text) to anon, authenticated;

-- 6) Notifications envoyées (pour éviter les doublons + historique)
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  kind        text,                                 -- 'new_media', 'new_invoice', 'shoot_reminder'…
  payload     jsonb,
  sent_at     timestamptz,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;

drop policy if exists "notif select"   on notifications;
drop policy if exists "notif insert"   on notifications;
drop policy if exists "notif auth all" on notifications;

create policy "notif auth all" on notifications for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION TERMINÉE
-- ════════════════════════════════════════════════════════════
