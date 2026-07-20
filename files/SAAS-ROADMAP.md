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
- **Identité d'application (étage 1 ✅ fait le 20/07/2026)** : porte
  d'entrée dédiée `app.html` (connexion client par code + accès console
  agence, sans vitrine autour, HIG, mode sombre, noindex) — en prod sur
  `timelesshouse.org/app` ; sur le sous-domaine `app.*`, la racine
  redirige vers /app. ⚠️ Une action manuelle : rattacher
  `app.timelesshouse.org` au projet Pages (Dashboard Cloudflare →
  Workers & Pages → projet → Custom domains — le token API local est
  limité au DNS). **Étage 2 — LA LOGE ✅ côté code (20/07/2026 ; nom
  choisi, domaines laloge.app + laloge.house achetés chez Cloudflare
  Registrar)** : `app.html` sert plusieurs visages selon l'hôte —
  sous-domaine d'agence `<slug>.laloge.house` → marque de l'agence
  AVANT la saisie du code (RPC `resolve_agency_brand`), refus des
  codes étrangers à l'espace (`resolve_client_code` renvoie
  `agency_slug` ; gardes aussi dans le dashboard et les 5 pages
  événement) ; hôtes laloge nus → entrée neutre « La Loge. » ; hôtes
  timelesshouse inchangés ; en local `?agence=<slug>` simule un
  sous-domaine. Worker `laloge-proxy` (workers/laloge/) : proxy vers
  Pages + MANIFEST PWA DYNAMIQUE par agence (l'app installée porte le
  nom et les couleurs du vidéaste). **Branché et EN LIGNE le
  20/07/2026** (token CLOUDFLARE_LALOGE_TOKEN dans .env.local) :
  Worker `laloge-proxy` déployé, routes laloge.app/* · laloge.house/*
  · *.laloge.house/*, DNS proxiés apex + wildcard, SSL actif —
  vérifié en réel : https://laloge.app (entrée « La Loge. »),
  sous-domaine d'agence servi avec manifest PWA à la marque de
  l'agence. Étage 3 (palier Prestige) : domaine perso par agence
  (Cloudflare for SaaS).
- **Marque blanche visible ✅ (fait le 20/07/2026)** : les RPC du
  portail renvoient la marque de l'agence (nom, logo, couleurs, email
  de contact) et TOUT l'espace client la porte — dashboard (logo/nom,
  palette claire régénérée depuis fond+accent de l'agence, mode sombre
  inchangé), pages événement (logo, pieds de page, titres, écrans
  d'attente, mailto), et EMAILS (notify-client v43, source rapatriée
  dans le repo : expéditeur au nom de l'agence, en-tête/boutons à sa
  couleur, reply-to vers son contact, et les notifications admin_*
  partent vers l'email de contact de l'AGENCE du client — mode dry_run
  ajouté pour tester sans envoyer). TimelessHouse (couleurs par défaut)
  garde exactement son design — zéro régression vérifiée. Reste :
  sous-domaine/domaine perso par agence (plus tard).
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
- **Mécanique quotas ✅ (fait le 20/07/2026)** : Edge Function
  `measure-storage` (cron nocturne 02:30 UTC) liste le bucket B2 et
  classe chaque objet par agence (media/<id>, weddings/<code>,
  invoices|documents/<clientId>, photobooth → TimelessHouse) →
  `agencies.storage_used_bytes` ; quotas par plan (`plan_quota_bytes`,
  fondateur = illimité) ; jauge dans l'admin (Vue d'ensemble via
  `my_agency_storage` + cartes de la section Agences) avec alerte 80 %
  et message dépassement souple ; `b2-sign` joint l'état du quota aux
  réponses sign-put/mpu-create (informatif — jamais de blocage).
  1ʳᵉ mesure réelle : 1223 objets, ~718 Go TimelessHouse. 🔧 Réparé au
  passage : le cron sync-social-6h envoyait un placeholder au lieu du
  secret depuis son installation (tous ses appels étaient refusés).
  Rétention/archivage = soupape (plus tard).
- **Stripe abonnements ✅ (fait le 20/07/2026, mode LIVE)** :
  catalogue live 4 produits × 2 tarifs (lookup_keys
  `laloge_<plan>_<mensuel|annuel>`, annuel = 10 mois) ; Edge Function
  `stripe-billing` — checkout (owners d'agence), portail de
  facturation, webhook signé (HMAC vérifié, tolérance 5 min) qui met à
  jour `agencies.plan/subscription_status/stripe_*` (résiliation →
  retombe sur Découverte, le quota suit automatiquement) ; secrets
  STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET posés côté Supabase,
  endpoint webhook enregistré chez Stripe (we_…NAaPLJlF) ; carte
  « Abonnement » dans la Vue d'ensemble admin (palier + facturation +
  S'abonner, ou « Gérer mon abonnement » via le portail Stripe une
  fois abonné). Testé sans paiement réel : refus non-owner, signatures,
  cycle webhook complet (→ studio/annuel → résiliation → decouverte),
  session checkout live créée. Le 1ᵉʳ paiement réel validera le tout
  de bout en bout. Préfixes B2 par agence : `agencies/<slug>/…`
  (toujours à faire, avec la migration des fichiers).
- **Gardes Edge Functions par rôles ✅ (fait le 20/07/2026)** :
  `b2-sign`, `cloudinary-sign` et `sync-social` n'utilisent plus
  `ADMIN_EMAILS` mais l'appartenance `agency_members`. En plus du rôle,
  `b2-sign` vérifie que CHAQUE chemin signé appartient au périmètre de
  l'agence de l'appelant (`media/<id>` à elle, `weddings/<code>` /
  `invoices|documents/<clientId>` d'un de SES clients, `photobooth/`
  réservé aux membres TimelessHouse — le compte machine photobooth est
  membre admin). `sync-social` limité aux comptes de l'agence de
  l'appelant (le cron garde l'accès total). Testé cross-agence
  (12 cas) avec une agence éphémère, puis nettoyé. Les uploads d'une
  agence externe fonctionnent désormais. Reste : cloisonner les
  dossiers Cloudinary (ou migrer vers Cloudflare Images).

## C — Apps stores (après B)

Capacitor + **notifications push** (« Vos photos sont livrées ») —
indispensables pour la règle 4.2 d'Apple. Comptes : Apple 99 $/an,
Google 25 $ une fois.
