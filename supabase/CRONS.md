# Tâches planifiées (crons) — La Loge / TimelessHouse

⚠️ Ces tâches tournent en production mais **leur définition n'est pas dans
le repo** (elles vivent dans Supabase `pg_cron` / le scheduler, ou sur le
Mac de Gil). Relevé lors de l'audit du 21/07/2026 pour éviter qu'elles
soient oubliées. À terme : les exporter en migration versionnée.

| Tâche | Fréquence | Déclencheur | Où c'est défini |
|---|---|---|---|
| **measure-storage** — recalcule `storage_used_bytes` par agence | 02:30 UTC | header `x-cron-key: CRON_SECRET` | Edge Function `measure-storage` + `pg_cron` (à confirmer) |
| **scheduled-notifications** — relances factures (J-3/J0/J+7/J+14) & rappels tournage (J-7/J-1) | quotidien | appelle `notify-client` (`invoice_reminder`, `shoot_reminder`) | Edge Function `scheduled-notifications` — **code rapatrié dans le repo le 21/07/2026** ; reste à versionner sa planification |
| **sync-social** — resync KPIs IG/TikTok | toutes les 6 h | OAuth stockés | Edge Function `sync-social` + scheduler |
| **worker-encode** — transcodage HLS des vidéos locataires | boucle 30 s | LaunchAgent sur le Mac de Gil | `workers/encoder/worker-encode.mjs` (dans le repo) |

## Points de vigilance

- **scheduled-notifications** : le code source est désormais dans le repo
  (`supabase/functions/scheduled-notifications/index.ts`). Ce qui manque
  encore, c'est la **planification** elle-même (pg_cron / scheduler), qui
  n'est pas versionnée — donc invérifiable depuis le dépôt.
- **CRON_SECRET** doit rester secret (header d'appel de `measure-storage`).
- Le **worker-encode** dépend d'un Mac allumé : s'il dort, les vidéos
  restent `awaiting_encode`. Un filet de requeue des jobs orphelins a été
  ajouté au démarrage du worker (audit #4), mais une exécution sur un
  petit serveur Linux 24/7 reste préférable à terme.


## ⚠️ Garde ajoutée le 24/07/2026 — action requise sur le cron

`scheduled-notifications` **exige désormais** l'en-tête `x-cron-key: <CRON_SECRET>` (comme `measure-storage`). Le cron **daily-notifications** (Integrations → Cron) doit donc envoyer cet en-tête, sinon la tournée nocturne renvoie 401 et **les rappels s'arrêtent**.

À faire une fois : dans Supabase → **Integrations → Cron → daily-notifications → Edit**, ajouter aux *HTTP headers* la clé `x-cron-key` avec **la même valeur que le cron de mesure du stockage** (le `CRON_SECRET`). Rien d'autre à changer.
