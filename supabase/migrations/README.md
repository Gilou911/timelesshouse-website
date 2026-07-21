# Migrations & schéma Supabase

## Pourquoi ce dossier existe

L'audit du 21/07/2026 a relevé que **les politiques RLS et les RPC de
production ne sont pas versionnées** : elles vivent uniquement dans le
Dashboard Supabase. Le fichier racine `schema.sql` est un instantané de
**mai 2026, pré-multi-tenant** — il ne reflète plus la prod et serait
**dangereux à rejouer** (il rouvrirait la lecture cross-tenant).

Toute l'isolation entre agences locataires repose sur ces politiques RLS.
Tant qu'elles ne sont pas dans le repo, une régression (ex. quelqu'un
réexécute `schema.sql`) passerait inaperçue.

## Figer l'état réel dans le repo (à faire une fois)

Avec le CLI Supabase relié au projet (`supabase link`) :

```bash
# Schéma + RLS + fonctions réels, versionnables :
supabase db dump --schema public          > supabase/migrations/00000000000000_baseline.sql
supabase db dump --schema public --data-only=false --role-only  # (droits/GRANTs)
```

Ou, sans CLI : Dashboard → Database → **Backups / Schema** → export SQL,
puis committer le résultat ici.

Vérifier en particulier que **chaque table sensible** (clients, media,
invoices, documents, shoots, analytics, galleries, strategies…) a bien une
politique `SELECT`/`ALL` cloisonnée par `agency_id IN (SELECT …
my_agency_ids())` — et **pas** `using (true)`.

## Migrations présentes

| Fichier | Rôle |
|---|---|
| `20260721000000_security_hardening.sql` | REVOKE `anon` sur les RPC sensibles, cloisonne `update_media_approval` par agence (audit #5). À exécuter dans le SQL Editor. |

## À vérifier manuellement dans le Dashboard (audit #5)

Confirmer que ces RPC `security definer` ne sont PAS exécutables par `anon` :
`admin_user_id_by_email`, `platform_list_agencies`, `update_my_agency_brand`,
`claim_encode_job`, `my_agency_storage`. Requête utile :

```sql
select p.proname, array_agg(a.rolname) as peut_executer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
left join lateral (
  select r.rolname from pg_roles r
  where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    and r.rolname in ('anon','authenticated')
) a on true
group by p.proname
order by p.proname;
```
