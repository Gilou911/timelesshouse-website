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
- **Onboarding self-serve ✅ (fait le 20/07/2026)** : page publique
  `/inscription` (nom du studio → aperçu en direct de l'adresse
  `<slug>.laloge.house`, email, mot de passe) → Edge Function
  `signup-agency` (plan **decouverte forcé**, fonctionnalités
  plateforme désactivées, slugs réservés, 3 inscriptions/h/IP,
  rollback si une étape échoue, email de bienvenue Resend) →
  connexion automatique et arrivée dans la console. Les CTA de la
  vitrine pointent tous vers l'inscription (fin du « demander un accès »
  par email). **Mots de passe** : lien « Mot de passe oublié ? » sur la
  connexion → `account-recovery` (lien Supabase envoyé par Resend à la
  marque de l'agence, 5 demandes/h/email, aucune énumération de
  comptes) → page `/reinitialiser` ; et carte « Sécurité » dans la
  console pour changer son mot de passe. Auth Supabase configurée
  (site_url laloge.app + liste d'URL de redirection autorisées).
  Vérifié de bout en bout : inscription réelle depuis le navigateur,
  lien de récupération suivi jusqu'au changement effectif (ancien mot
  de passe refusé, nouveau accepté), puis fixtures nettoyées.
- **Notification + file d'attente ✅ (fait le 20/07/2026)** : email à la
  plateforme (ADMIN_EMAIL) à CHAQUE inscription (studio, adresse,
  contact, nombre d'agences). Au-delà de **10 agences locataires**
  (`SIGNUP_AUTO_LIMIT` dans signup-agency), les nouvelles inscriptions
  sont créées **inactives** (`status = 'pending'`) : le studio reçoit un
  accusé de réception, voit un écran « votre loge ouvre bientôt » dans
  la console, et **ne peut rien écrire** — le verrou est central,
  `my_agency_ids()` (qui alimente toutes les policies « agency write »)
  ne renvoie plus que les agences actives. Validation en un clic depuis
  la section Agences (« Ouvrir la loge » / « Suspendre », action de
  l'Edge Function create-agency) → l'email de bienvenue part à
  l'ouverture. Vérifié en réel : 10 agences créées pour atteindre le
  seuil, 11ᵉ inscription mise en attente, écriture refusée par la RLS,
  validation depuis la console, écriture débloquée — puis tout nettoyé.
- **📸 DÉCISION PIPELINE PHOTOS (20/07/2026) : tout sur B2, Cloudinary
  devient un héritage TimelessHouse.** Analyse à l'échelle cible
  (100 agences × 4 galeries/mois × 600-1000 photos ≈ 2,5 To/mois) :
  Cloudinary gratuit intenable (25 crédits/mois, 10 Mo max/image) et
  payant inviable (besoin ≈ milliers de crédits/mois → tarif
  entreprise) ; B2 = 6 $/To/mois, egress gratuit vers Cloudflare, coût
  aligné sur les paliers de stockage vendus, et les photos comptent
  enfin dans les quotas. ✅ Fait : `cloudinary-sign` verrouillée aux
  membres TimelessHouse (upload ET destroy — testé TH 200 / locataire
  401 / anon 401). ✅ **Pipeline galeries B2 CONSTRUIT (20/07/2026,
  brique 11 de `files/migration-saas-b3-agences.sql`)** : table
  `gallery_photos` (RLS « agency write » + trigger `set_agency`) + RPC
  scellée `get_client_gallery(code)` ; admin → section « Galerie B2 »
  de l'onglet Page client (catégories, variantes générées DANS LE
  NAVIGATEUR — view ≤ 2000 px q0.82, grid ≤ 1000 px q0.80, original
  intact — upload direct `weddings/<code>/galerie/<slug>/<uuid>/`,
  réordonnancement, suppression [purge B2 différée : lignes SQL
  supprimées, fichiers orphelins à balayer par un script de ménage
  plateforme]) ; rendu : event-photos(-cinematic).html essaient la RPC
  B2 D'ABORD puis retombent sur list-gallery/legacy — testé en réel
  de bout en bout (agence de test éphémère : b2-sign scoping 403
  cross-agence, RLS 42501 cross-tenant, uploads + lightbox + download
  B2 sur les 2 pages) et non-régression vérifiée (ezla-davy Cloudinary
  320 photos intact, dashboard joxci intact). Les photos comptent dans
  les quotas via measure-storage (préfixe `weddings/<code>` déjà
  classé). Vidéo : les locataires livrent en MP4
  progressif (aucun outil requis, le lecteur gère) ; l'encodage HLS
  automatique (worker ffmpeg externe — impossible en serverless)
  viendra plus tard ; Cloudflare Stream écarté (échelle de qualités
  imposée, sortirait la vidéo des quotas B2 = du modèle de vente).
- Rôles admin supplémentaires par agence : reste à faire.
- **Convergence `event_pages` → `galleries` : reste à faire.** Les
  galeries sont désormais pilotables de bout en bout, mais `event_pages`
  demeure la source de vérité des pages `event-*.html` (13 pages, ~17
  clients de production dont une galerie Cloudinary de 320 photos).
  Prochaine session : synchroniser puis basculer `event_pages` vers
  `galleries`, et faire converger les `event-*.html` sur
  `galerie-rendu.js` — après quoi la double saisie « Espace de
  l'événement » / « Galeries » de l'onglet Page client disparaîtra.
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
- **Écran « Ma marque » ✅ (fait le 20/07/2026, brique 12)** : chaque
  agence règle ELLE-MÊME son identité depuis la carte « Ma marque » de
  la Vue d'ensemble — nom, email de contact, couleurs (sélecteur +
  hexa), logo (URL https ou téléversement ≤ 2 Mo vers
  `agencies/<slug>/logo/…`, nouveau préfixe b2-sign scopé par
  appartenance), sous-domaine `<slug>.laloge.house` et plan affichés en
  lecture seule. Écriture par la RPC `update_my_agency_brand` (owners
  uniquement, validations strictes nom 2-80 / #rrggbb / URL https /
  email) — SEULE voie d'écriture sur `agencies` : aucune policy UPDATE,
  les champs sensibles (plan, active, status, slug, stripe_*,
  features_*, storage_*) restent hors de portée. Propagation immédiate
  (les RPC de lecture portent déjà la marque). Testé en réel avec une
  agence éphémère (puis nettoyée) : parcours navigateur complet (owner
  → carte → nom/couleurs #7c3aed/#f5f3ff/email + logo généré par canvas
  → `app.html?agence=<slug>` à la NOUVELLE marque avant saisie du
  code) ; 11 tests API (refus non-owner et anon, UPDATE direct sans
  effet, b2-sign 200 chez soi / 403 chez le voisin, validations,
  champs sensibles intacts) ; non-régression dashboard joxci + Vue
  d'ensemble TimelessHouse.
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

- **Galeries autonomes — fondation ✅ (fait le 20/07/2026)** :
  les galeries de livraison deviennent des **objets de premier rang**
  (modèle Pic-Time). Jusqu'ici une livraison était une `event_pages`
  accrochée au client — UNE page vidéo + UNE page photos maximum,
  atteignables seulement en passant par le code de l'espace client.
  Désormais table **`galleries`** (client_id, `kind` photos|video|mixte,
  `template` libre, config, `access_code`, `share_enabled`, position),
  RLS « agency write » + trigger `set_agency`, et `gallery_photos` gagne
  `gallery_id` (`client_id` conservé et rempli — `get_client_gallery` et
  `event-photos.html` inchangés).
  **Deux espaces de noms de codes, étanches** : `clients.code` ouvre
  l'espace client, `galleries.access_code` ouvre UNE livraison. Unicité
  par agence (`unique (agency_id, access_code)`) ; `gallery_code_suggest()`
  dérive le code du titre et évite les collisions sur TOUTE la plateforme
  (un code reste non ambigu pour un humain) ; un trigger REFUSE qu'une
  galerie prenne le code d'un espace client de son agence.
  **RPC scellées** : `get_gallery_by_code` (par code galerie — agence
  active + `share_enabled`, refuse les codes ambigus, et n'expose JAMAIS
  `clients.code` : détenir un lien de galerie n'ouvre pas le dashboard) et
  `get_client_galleries` (par code client, pour le hall).
  **Page publique `galerie.html`** : `?c=<code>` ou saisie manuelle,
  marque de l'agence appliquée avant ET après saisie, refus d'une galerie
  étrangère sur le sous-domaine d'une autre agence, `noindex`. Rendu par
  `galerie-rendu.js` (grille justifiée, lightbox clavier + swipe, favoris,
  téléchargement, HLS adaptatif ou MP4). Lien de partage :
  `https://<slug>.laloge.house/galerie?c=<code>`.
  **Espace client** : carte « Vos galeries » (masquée si aucune),
  alimentée en parallèle du portail — aucun temps de chargement ajouté.
  **Migration sans perte** : les 13 `event_pages` existantes ont leur
  galerie miroir (titre, kind, template déduit de l'univers, config telle
  quelle, code généré). ⚠️ `event_pages` **reste la source de vérité** des
  pages `event-*.html`, qui n'ont pas été touchées — la bascule viendra
  avec la console.
  Testé pour de vrai : agence + client + 2 galeries éphémères, 3 images
  réellement uploadées sur B2 via `b2-sign`, matrice de sécurité complète
  (code client, code ambigu, partage coupé, agence inactive, galerie
  d'une autre agence, RLS anon), navigateur (grille, lightbox, favoris,
  téléchargement, HLS, mobile 375 px), puis nettoyage intégral.
  Non-régression vérifiée sur les vrais clients : `ezla-davy`
  (320 photos Cloudinary + film 1080p/4K), `andry-elio31ans`
  (anniversaire), `joxciagence9991` (11 médias, 7 factures, et pas de
  carte « Vos galeries » puisqu'il n'en a aucune).
  **Reste pour la session « console des galeries »** : créer/éditer/
  ordonner les galeries depuis l'admin, régénérer un code et couper le
  partage, uploader les photos vers une galerie précise (aujourd'hui
  `gallery_photos.gallery_id` se remplit par migration), gabarits
  supplémentaires, puis synchro/bascule d'`event_pages` vers `galleries`
  et convergence des pages `event-*.html` sur `galerie-rendu.js`.

- **Console des galeries ✅ (fait le 20/07/2026, brique 14)** :
  le gestionnaire « Galerie B2 » (brique 11) ne savait gérer QU'UNE
  galerie implicite par client — les photos partaient dans
  `gallery_photos` avec (client_id, category) mais **sans `gallery_id`**,
  et ni titre, ni gabarit, ni partage n'existaient. L'onglet « Page
  client » porte désormais une vraie console multi-galeries :
  **liste ordonnable** (titre, type, gabarit, nombre de photos, état du
  partage), **création/édition** (titre, type photos|film|mixte, gabarit
  parmi les 7, et pour le film une liste de vidéos titre + URL MP4 + URL
  de téléchargement au format `config.videos` déjà lu par
  `galerie-rendu.js`), **partage** (lien complet
  `https://<slug>.laloge.house/galerie?c=<code>` — `timelesshouse.org`
  pour la plateforme — bouton copier, régénération du code via
  `gallery_code_suggest`, interrupteur `share_enabled`), **suppression**
  avec confirmation (cascade SQL sur `gallery_photos` ; purge B2 toujours
  différée), et **upload DANS une galerie précise** : `gallery_id` est
  enfin rempli à l'écriture, `client_id` restant renseigné pour que
  `get_client_gallery` et `event-photos.html` ne bougent pas. Le
  stockage B2 est inchangé (variantes view ≤ 2000 px q0.82 / grid
  ≤ 1000 px q0.80 / original intact, préfixe
  `weddings/<code>/galerie/<slug-catégorie>/<uuid>/`).
  Testé en réel (agence + client éphémères, puis nettoyés) : 2 galeries
  créées depuis le navigateur, 6 images générées au canvas réellement
  uploadées sur B2 (fichier `grid.jpg` vérifié en 1000×625, `gallery_id`
  ET `client_id` remplis sur les 6 lignes), réordonnancement persisté,
  code régénéré (`photos-du-mariage` → `photos-du-mariage-8bce`, ancien
  code mort, nouveau servi, `clients.code` toujours pas exposé),
  anti-collision vérifié dans les deux sens (code d'un espace client →
  refus du trigger ; code d'une autre galerie → refus de la contrainte
  d'unicité), partage coupé → `/galerie?c=…` ne rend plus rien puis
  réactivé → galerie de nouveau servie à la marque de l'agence.

- **Univers simplifiés ✅ (fait le 20/07/2026, brique 14)** :
  les 9 univers mélangeaient le MÉTIER et le GABARIT de rendu. Depuis la
  brique 13 le gabarit vit sur la galerie (`galleries.template`) : un
  locataire n'a donc plus à choisir un univers par type de fête. Il en
  voit **3**, qui ne décrivent que la FORME de l'espace client :
  | Univers | Espace client | Analyses | Onglet « Page client » |
  |---|---|---|---|
  | `celebration` | livraison (galeries/films) | jamais | oui |
  | `communication` | tableau de bord complet | **option** | non |
  | `neutre` | tableau de bord complet | **jamais** | oui |
  La **liste complète** reste à la plateforme via le drapeau
  `agencies.features_all_universes` (vrai pour timelesshouse), qui garde
  ses pages vitrines par métier. Le **gabarit** ne se choisit plus à la
  création du client mais sur la galerie.
  **Compatibilité des valeurs héritées, sans aucune migration de
  données** (les 18 clients de prod ne bougent pas) : `mariage`,
  `fiancailles`, `anniversaire-mariage` sont des **célébrations** et
  gardent leur page dédiée ; `autre` est traité comme `neutre`. Toute la
  sémantique est centralisée dans **`univers.js`** (`isCelebration`,
  `isDashboardUniverse`, `allowsAnalytics`, `hasDeliveryTab`,
  `routeForClient`, `videoPageFor`, `homeUrlFor`), importé par l'admin ET
  par les 7 portes d'entrée — fin des comparaisons
  `universe === 'communication'` éparpillées.
  ⚠️ **Nuance assumée sur `autre`** : la règle « → tableau de bord » ne
  s'y applique que si le client n'a AUCUNE livraison. `pandore260426`
  (client réel) est une livraison pure — page photos, modules coupés — et
  l'y envoyer aurait cassé sa page ; se fier aux modules ne suffisait pas
  (`documents_enabled`/`strategies_enabled` étaient restés à `true` par
  défaut). `resolve_client_code` renvoie donc `has_delivery`. `neutre`,
  valeur neuve, n'a pas cette réserve.
  🔧 Corrigé au passage : l'encart d'upsell « Activer cette option —
  49 €/mois » du tableau de bord s'affichait dès que les analyses étaient
  éteintes, **sans regarder l'univers ni l'agence** — un client `neutre`
  le voyait, et un locataire vendait sous SA marque une option qu'il ne
  peut pas livrer (les apps Meta/TikTok sont au nom de TimelessHouse).
  Nouveau drapeau `analyticsOffered`. Corrigé aussi : `accueilUrl`
  fabriquait des URL mortes (`autre.html`, et `celebration.html` serait
  venu s'y ajouter) — `homeUrlFor` ne renvoie que des pages existantes.
  Vérifié en réel : select à 3 univers chez un locataire / liste complète
  avec le drapeau ; client `neutre` créé → aucune option Analyses **alors
  que l'agence de test avait `features_analytics = true`**, arrivée sur
  `communication-dashboard.html` sans onglet ni encart Analyses ; fiche
  d'un client `autre` qui s'ouvre normalement, son univers hérité étant
  proposé tel quel (« autre (univers actuel) ») pour ne jamais être
  réécrit à son insu. **Non-régression** rejouée sur les vrais clients :
  routage ancien/nouveau comparé sur les 5 clients concernés (aucun
  changement sauf `mamacita91`, voulu), `ezla-davy` (330 références
  Cloudinary → les 320 photos intactes, film 1080p/4K),
  `andry-elio31ans` (event-anniversary), `joxciagence9991` (11 médias,
  7 factures, 2 550 €, encart Analyses toujours présent).
  Audit HIG mobile 375 px de la console : aucune cible sous 44 px, aucun
  débordement horizontal, aucun input sous 16 px.

- **Corrections locataires après le test de Gil ✅ (fait le 20/07/2026)** :
  retours de Gil après avoir testé la console avec VisonMike.
  ① **Plus aucun lien à coller pour un locataire** — tout est upload :
  vidéos de galerie (MP4 → B2 sous `weddings/<code>/galerie/videos/`,
  lecture + téléchargement pointent sur le fichier uploadé), photos ET
  vidéos de l'onglet Médias (la vidéo devient lisible immédiatement :
  `preview_url = url`, MP4 progressif servi par B2), vignettes (le champ
  « coller une URL d'image » a disparu). L'écran `npm run encode` et le
  panneau HLS sont réservés à la plateforme (`FEATURES.allUniverses`),
  comme le bloc « Espace de l'événement » entier et ses réglages
  Cloudinary (cloud name, dossier racine) : l'onglet « Page client » d'un
  locataire ne montre QUE la section Galeries. L'encodage HLS multi-
  qualités des locataires reste À FAIRE (worker ffmpeg externe) — en
  attendant, le MP4 progressif se lit tel quel.
  ② **Carte « Accès client »** dans l'en-tête de la fiche : code d'accès
  + lien de connexion de l'agence (`https://<slug>.laloge.house`) avec
  boutons copier et Ouvrir — l'admin sait enfin QUOI communiquer à son
  client (`clientLoginUrl()` à côté de `galleryShareUrl()`).
  ③ **laloge.house devient la porte des clients finaux** : racine → /app
  (laloge.app garde la vitrine /offres — Worker + secours JS d'index.html),
  la carte « Espace agence » disparaît de ce visage (lien discret en pied
  de page), et la connexion accepte AUSSI les codes de galerie : si
  `resolve_client_code` ne trouve rien, `get_gallery_by_code` est tentée
  et redirige vers `/galerie?c=…` (les deux espaces de noms étant
  étanches, aucune ambiguïté possible). Sur le sous-domaine d'une agence,
  un code de galerie étranger reste refusé.
  Vérifié en réel (agence locataire éphémère, nettoyée) : onglet Page
  client = Galeries seules, formulaire vidéo sans champ URL, upload vidéo
  réel vers B2 via b2-sign, photo Médias uploadée (`media/<id>/original/`),
  vidéo Médias sans écran d'encodage et `preview_url = url`, carte Accès
  client avec le bon sous-domaine, code galerie `essai-photos` sur /app →
  redirection `/galerie` à la marque, code étranger refusé sur le visage
  visonmike, `joxciagence9991` route toujours vers son tableau de bord,
  `laloge.house/` → `/app` et `laloge.app/` → `/offres` en prod.

- **Worker d'encodage HLS ✅ (fait le 20/07/2026, brique 15)** : les
  vidéos des locataires passent automatiquement en lecture adaptative,
  sans aucune action manuelle. Circuit : upload → ticket dans
  `encode_jobs` (déposé par la console, silencieux et non bloquant) →
  worker `workers/encoder/worker-encode.mjs` → segments HLS sur B2 à
  côté de l'original → `media.preview_url` ou
  `galleries.config.videos[].hls` renseigné → `galerie-rendu.js` charge
  hls.js et affiche le sélecteur de qualité. Le cœur d'encodage
  (ffprobe, paliers 2160/1080/720/480, ffmpeg, upload) a été extrait
  dans `scripts/encode-core.mjs`, **partagé** avec le CLI manuel de la
  plateforme : une seule vérité à maintenir, et `npm run encode` reste
  identique pour Gil (vérifié par un encodage réel de bout en bout).
  Garde-fous : réclamation atomique (`claim_encode_job()`,
  `for update skip locked`) donc deux workers ne prennent jamais le même
  job ; index partiels anti-doublon ; sources hors bucket refusées ;
  plafond 30 Go ; une reprise en cas de panne passagère, abandon
  immédiat sur erreur définitive ; nettoyage des encodages précédents.
  La plateforme n'enfile RIEN (`features_all_universes`).
  Vérifié en réel : galerie créée au navigateur avec upload d'un vrai
  MP4 1080p → ticket enfilé seul avec la bonne agence → worker →
  **12 fichiers HLS produits, lecture confirmée dans le navigateur via
  MediaSource, décodée en 1280×720, sélecteur AUTO/480p/720p/1080p,
  saut à 5,5 s réussi** (le maillon que la session « galeries » n'avait
  jamais pu prouver) ; cas d'erreur (source absente → 1 reprise puis
  abandon ; source hors plateforme → abandon immédiat) ; anti-doublon
  rejeté par la contrainte ; isolation : un owner d'une autre agence ne
  voit aucun job. Non-régression : film d'Ezla & Davy intact (4K/1080p).
  **Bug trouvé en testant** : `.g-soon` (« Bientôt disponible ») était
  déclaré `display:flex`, ce qui **bat l'attribut `hidden`** du
  navigateur — le message s'affichait sous un film parfaitement lisible.
  Corrigé par `.g-soon[hidden] { display: none }`.
  **LaunchAgent installé et vérifié le 20/07/2026** (à la demande de
  Gil) : service `org.timelesshouse.worker-encode`, démarrage au login,
  relance automatique, priorité basse. Prouvé en conditions réelles —
  job déposé en base, ramassé seul en moins de 30 s, encodé, écrit ;
  ce qui valide surtout que `ffmpeg` est joignable depuis launchd (qui
  n'hérite pas du PATH du shell). ⚠️ Le service exécute le code chargé
  à son démarrage : tout changement du worker exige
  `launchctl kickstart -k` (piège rencontré, documenté).
  Reste : migration éventuelle sur un VPS et le ré-encodage des vidéos
  locataires déjà uploadées (aucune à ce jour). Doc :
  `files/WORKER-ENCODE.md`.

- **Vidéo visible seulement une fois encodée ✅ (fait le 20/07/2026,
  brique 16)** : demande de Gil — le client d'un locataire ne doit pas
  voir le film tant qu'aucune qualité n'est prête. Servir le master
  brut ferait une mauvaise première impression (lourd, saccadé sur une
  connexion moyenne) sur une livraison qui ne se fait qu'une fois.
  Galeries : drapeau `videos[].awaitingEncode` posé à l'enregistrement
  chez un locataire (jamais sur la plateforme), levé par le worker ;
  la page affiche « Votre film est en cours de préparation » à la place
  du lecteur, sans bouton de téléchargement. Médiathèque : colonne
  `media.awaiting_encode` (défaut false, donc aucune des 12 vidéos
  existantes n'est masquée), exposée automatiquement par
  `to_jsonb(m)` dans get_client_portal ; l'espace client masque lecteur
  ET téléchargement. Un drapeau EXPLICITE plutôt que l'absence de
  `preview_url` : sinon une vidéo légitimement sans version allégée
  serait prise à tort pour un encodage en attente.
  Rendu défensif : la condition est `awaitingEncode && !hls` — un
  drapeau resté à true par accident ne masque jamais une vidéo prête.
  **Bug corrigé au passage** : l'enregistrement d'une galerie remettait
  `hls` à `''` (la valeur n'était même pas chargée dans l'état du
  formulaire) — renommer une galerie après l'encodage effaçait le
  travail du worker et la vidéo retombait silencieusement en
  progressif. Vérifié en réel : upload → message d'attente sans lecteur
  ni téléchargement → worker → lecteur adaptatif AUTO/480p/720p et
  téléchargement rétabli, sans rien recharger d'autre que la page ;
  non-régression sur le film d'Ezla & Davy (Streamable, sans drapeau,
  toujours visible).

- **Audit HIG complet ✅ (fait le 20/07/2026, 3 vagues)** : audit MESURÉ
  dans le navigateur (auditeur maison : cibles, contrastes calculés,
  tailles de police, débordements) sur les 7 surfaces de l'app, en
  375 px et 1280 px, clair et sombre.
  **Vague 1 (P0)** : focus clavier invisible (`outline:none` sans
  remplacement) sur 5 pages ; contrastes du texte secondaire à 3.3:1 et
  des libellés de formulaire à 2.2:1 ; cibles sous 44 px (pieds de page,
  logos, interrupteur jour/nuit 42×22 — zone étendue, dessin conservé) ;
  champ de recherche à 14 px (iOS zoomait) ; `prefers-reduced-motion`
  ignoré partout ; safe areas et `color-scheme` ajoutés.
  **Bug de marque blanche** : la galerie appliquait l'accent de l'agence
  — choisi pour un fond CLAIR — sur son fond noir. L'accent
  TimelessHouse tombait à 1.3:1, le sur-titre disparaissait ; tout
  locataire à couleur foncée aurait été touché. `readableOnDark()`
  éclaircit l'accent jusqu'à 4.5:1 en gardant sa teinte.
  **Vague 2 (P1)** : la modale de la console ne gérait que le verrou de
  défilement — ajout d'Échap, du piège à focus, de la restitution du
  focus et de `role=dialog/aria-modal` ; `h1` manquant sur /app ; saut
  h1→h3 dans la console.
  **Vague 3 (P2)** : lexique (trois noms pour la même action sur le même
  écran), valeurs techniques d'univers affichées telles quelles,
  tutoiement isolé dans une interface qui vouvoie, états vides
  reformulés sans « Cliquez », infobulles des boutons icône.
  Écarts P0 restants mesurés : 0 sur /app, /galerie, la console,
  /inscription et /offres. Faux positifs écartés en cours de route :
  couleurs `oklch()` de Tailwind v4 mal lues par l'auditeur, et fonds en
  dégradé qu'il ne sait pas inspecter.


## C — Apps stores (après B)

Capacitor + **notifications push** (« Vos photos sont livrées ») —
indispensables pour la règle 4.2 d'Apple. Comptes : Apple 99 $/an,
Google 25 $ une fois.
