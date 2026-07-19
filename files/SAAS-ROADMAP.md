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

## B.2 — Isolation des LECTURES ✅ (fait le 20/07/2026)

Plus aucune donnée produit lisible avec la seule clé anon : l'espace client
est **scellé par le code d'accès**, vérifié côté serveur et cloisonné par
agence. La voie est libre pour accueillir la 1ʳᵉ agence externe.
- **RPC scellées** (security definer) : `resolve_client_code` (login),
  `get_client_portal` (dashboard), `get_event_portal` (pages événement),
  `get_client_social` (analyses), `get_media_comments` /
  `add_media_comment` (commentaires — l'écriture invités est scellée
  aussi), `update_media_approval` (admin par rôle d'agence, client par
  code ; l'ancienne version n'avait AUCUNE vérification).
- **22 politiques « lecture publique » supprimées**, plus les écritures
  legacy cross-tenant restées de B.1 (`allow auth insert/update/delete`) ;
  vues `v_social_accounts_public` / `v_campaign_kpis` en
  `security_invoker` (fin du contournement RLS).
- **Codes d'accès uniques PAR agence** (`unique (agency_id, code)`).
  Un code présent dans 2 agences est refusé des deux côtés (fail closed)
  tant que B.3 n'apporte pas le contexte d'agence par domaine — dans ce
  cas rarissime, régénérer le code de l'un des deux clients.
- Vérifié : clé anon = 0 ligne sur 24 tables + 2 vues ; aucune fuite
  inter-agences (2ᵉ agence de test créée puis nettoyée) ; portail,
  pages événement, galerie photos, analyses et partage de stratégie
  intacts. Bonus : fix du hook social client (`CLIENT_DATA.id` jamais
  peuplé — la page Analyses restait bloquée sur « Connectez vos réseaux »).
- Migration : `files/migration-saas-b2.sql` (exécutée).

## B.3 — Produit

- **Création d'agences depuis l'admin ✅ (fait le 20/07/2026)** :
  section « Agences » dans l'admin, visible UNIQUEMENT par le
  propriétaire de la plateforme (owner de l'agence « timelesshouse » —
  première garde par rôles, pas d'ADMIN_EMAILS). Liste des locataires
  (plan, clients, couleurs, propriétaires) + formulaire de création :
  l'Edge Function `create-agency` crée l'agence ET le compte du patron
  (mot de passe temporaire affiché une seule fois, à transmettre ;
  email déjà connu → compte rattaché tel quel). RPC
  `platform_is_owner` / `platform_list_agencies` + helper
  `admin_user_id_by_email` : `files/migration-saas-b3-agences.sql`.
- **Onboarding self-serve** (reste à faire) : inscription publique d'une
  agence (email → compte → 1ᵉʳ espace client guidé), page de changement
  de mot de passe, rôles admin supplémentaires.
- **Marque blanche visible** : logo/couleurs de l'agence dans l'espace
  client, les pages événement ET les emails (notify-client paramétré par
  agence) ; sous-domaine ou domaine perso plus tard.
- **Offres par paliers de STOCKAGE** (décidé 19/07/2026 — clientèle à
  vidéos lourdes, masters jamais compressés = argument de vente) :
  | Offre | Stockage | Prix suggéré |
  |---|---|---|
  | Découverte | 3 Go | 0 € — 1 espace client, badge « propulsé par », rétention 90 j (purge des médias inactifs après alerte), quota strict sans dépassement |
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
