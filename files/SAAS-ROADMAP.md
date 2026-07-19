# 🏢 SaaS marque blanche — Feuille de route

> **Objectif :** vendre l'espace client/admin à d'autres vidéastes et agences,
> chacun avec son propre admin, ses clients et sa marque (logo/couleurs).
> Ordre décidé : PWA ✅ → multi-tenant (B) → apps stores (C).

## B.1 — Fondation multi-tenant ✅ (fait le 19/07/2026)

- Tables **`agencies`** (avec champs marque blanche : logo, couleurs, plan)
  et **`agency_members`** (rôles owner/admin liés à Supabase Auth).
- **TimelessHouse = première agence**, Gil owner ; backfill intégral
  (`agency_id` sur 22 tables produit, 0 null).
- **Triggers d'auto-rattachement** : toute insertion reçoit son `agency_id`
  automatiquement (via l'appartenance pour `clients`, via le client pour le
  reste, via le parent pour les tables enfants) → aucun code admin à
  modifier, et les Edge Functions (service role) restent correctes.
- **Écritures cloisonnées** : un membre ne peut écrire QUE dans son agence
  (« agency write » sur 21 tables, remplace « tout authentifié écrit tout »).
- Hors produit (restent TimelessHouse) : photobooth_*, portfolio_*,
  paid_videos, purchases. `media_comments` garde son écriture invités.
- Migration : `files/migration-saas-b1.sql` (exécutée).

## B.2 — Isolation des LECTURES ⚠️ obligatoire avant la 1ʳᵉ agence externe

Aujourd'hui les lectures restent publiques (héritage single-tenant) : la clé
anon peut lire les données de toutes les agences. Sans danger tant que
TimelessHouse est seul locataire — **bloquant avant d'en accueillir un 2ᵉ**.
- Accès client par **RPC scellé** (le code d'accès devient un jeton vérifié
  côté serveur, cloisonné par agence) au lieu de `select` directs anon.
- Suppression des politiques « lecture publique » table par table.
- Adapter le chargeur du dashboard client + pages événement.
- Codes d'accès uniques PAR agence (aujourd'hui uniques globalement).

## B.3 — Produit

- **Onboarding** : inscription d'une agence (email → compte → 1ᵉʳ espace
  client guidé), rôles admin supplémentaires.
- **Marque blanche visible** : logo/couleurs de l'agence dans l'espace
  client, les pages événement ET les emails (notify-client paramétré par
  agence) ; sous-domaine ou domaine perso plus tard.
- **Offres par paliers de STOCKAGE** (décidé 19/07/2026 — clientèle à
  vidéos lourdes, masters jamais compressés = argument de vente) :
  | Offre | Stockage | Prix suggéré |
  |---|---|---|
  | Essentiel | 100 Go | 29 €/mois |
  | Studio | 500 Go | 49 €/mois |
  | Cinéma | 2 To | 89 €/mois |
  | Prestige | 5 To | 149 €/mois |
  +10 €/To de dépassement souple ; -2 mois en annuel. (~30 Go par film
  4K livré : master + HLS.)
- **Mécanique quotas** : cron nocturne mesurant l'usage B2 par préfixe
  d'agence → `agencies.storage_used_bytes` + jauge dans l'admin ;
  `b2-sign` vérifie le quota (alerte 80 %, tolérance, upgrade proposé —
  jamais de blocage en plein upload) ; rétention/archivage = soupape.
- **Stripe abonnements** (modèle éprouvé sur ylvfeet), un produit par
  palier, mensuel + annuel. Préfixes B2 par agence : `agencies/<slug>/…`.
- Gardes Edge Functions : remplacer `ADMIN_EMAILS` par les rôles
  `agency_members`.

## C — Apps stores (après B)

Capacitor + **notifications push** (« Vos photos sont livrées ») —
indispensables pour la règle 4.2 d'Apple. Comptes : Apple 99 $/an,
Google 25 $ une fois.
