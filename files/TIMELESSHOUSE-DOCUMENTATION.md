# 📚 TimelessHouse — Documentation Technique Complète

> Document de référence généré pour permettre à toute IA (ou développeur) de comprendre, maintenir et faire évoluer le site TimelessHouse sans avoir accès au code source original.

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture des fichiers](#2-architecture-des-fichiers)
3. [Stack technique](#3-stack-technique)
4. [Base de données Supabase (schema.sql)](#4-base-de-données-supabase)
5. [Page d'accueil — index.html](#5-page-daccueil--indexhtml)
6. [Univers Portfolio public](#6-univers-portfolio-public)
7. [Univers Communication & Marketing](#7-univers-communication--marketing)
8. [Espaces événementiels clients (mariage, fiançailles, anniversaire)](#8-espaces-événementiels-clients)
9. [Interface Admin — communication-admin.html](#9-interface-admin--communication-adminhtml)
10. [Dashboard client — communication-dashboard.html](#10-dashboard-client--communication-dashboardhtml)
11. [Système de notifications email (Edge Function)](#11-système-de-notifications-email)
12. [Module Documents](#12-module-documents)
13. [Design System](#13-design-system)
14. [Système d'authentification client](#14-système-dauthentification-client)
15. [Gestion du mode sombre](#15-gestion-du-mode-sombre)
16. [Internationalisation (FR / EN)](#16-internationalisation-fr--en)
17. [Hébergement des médias (Cloudinary)](#17-hébergement-des-médias-cloudinary)
18. [Fichier supabase-config.js](#18-fichier-supabase-configjs)
19. [Flux complet d'un client Communication](#19-flux-complet-dun-client-communication)
20. [Flux complet d'un client Mariage/Événement](#20-flux-complet-dun-client-mariageevenement)
21. [Checklist de mise en production](#21-checklist-de-mise-en-production)
22. [Points d'extension et évolutions futures](#22-points-dextension-et-évolutions-futures)

---

## 1. Vue d'ensemble du projet

**TimelessHouse** est le site web d'un vidéaste / photographe professionnel. Il combine :

- Un **portfolio public** présentant les différents univers créatifs (mariage, immobilier, communication, etc.)
- Un **espace client privé par code d'accès** pour livrer médias, factures, tournages et documents
- Un **panneau d'administration** pour l'agence (gestion complète des clients, contenus, analytics)
- Des **pages de livraison cinématiques** pour les clients mariage/fiançailles/anniversaire

Le site est entièrement **statique côté fichiers** (HTML/CSS/JS), la persistance étant assurée par **Supabase** (PostgreSQL + Auth + Storage + Edge Functions).

**Domaine :** `timelesshouse.org`
**Email de contact :** `service@timelesshouse.org`

---

## 2. Architecture des fichiers

```
/
├── index.html                    ← Page d'accueil portfolio (choix d'univers)
├── mariage.html                  ← Page portfolio mariage (publique)
├── communication.html            ← Page d'entrée espace communication (avec modale login)
├── immobilier.html               ← Page portfolio immobilier (publique)
│
├── communication-dashboard.html  ← Dashboard client communication (après login)
├── communication-admin.html      ← Interface admin complète (après auth Supabase)
├── communication-app.jsx         ← App React du dashboard client (injectée dans dashboard.html)
├── portal.jsx                    ← App React du portail admin (prototype / référence)
│
├── event-photos.html             ← Galerie photos mariage (espace client)
├── event-photos-cinematic.html   ← Galerie photos cinématique alternative
├── event-video.html              ← Lecteur vidéo mariage (espace client)
├── event-anniversary.html        ← Film anniversaire de mariage (espace client)
├── event-engagement.html         ← Film fiançailles (espace client)
│
├── demo-toggle.html              ← Démo du toggle dark/light mode
├── schema.sql                    ← Schéma complet de la BDD Supabase
├── supabase-config.js            ← Fichier de configuration (URL + clé anon) NON versionné
│
└── DOCUMENTS-ET-NOTIF-FACTURE.md ← Notes de livraison du module Documents
```

### Fichier critique non présent dans le dépôt

```js
// supabase-config.js — à créer manuellement
window.SUPABASE_URL = 'https://VOTRE-REF.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGci...';
```

Ce fichier doit exister à la racine du site. Tous les fichiers HTML le chargent via `<script src="supabase-config.js"></script>`.

---

## 3. Stack technique

| Couche | Technologie |
|---|---|
| Frontend | HTML5, CSS3 natif, vanilla JS + React 18 (via ESM CDN) |
| UI | Tailwind CSS (CDN), design néomorphique custom |
| Graphiques | Recharts 2.12 (via ESM CDN) |
| Icônes | Lucide React 0.439 |
| Polices | Google Fonts : Cormorant Garamond, Montserrat, Manrope, Instrument Serif |
| Base de données | Supabase (PostgreSQL) |
| Auth admin | Supabase Auth (email/password) |
| Auth client | Code slug unique stocké en `sessionStorage` |
| Hébergement médias | Cloudinary (photos/vidéos) + Backblaze B2 (téléchargements) |
| Emails transactionnels | Supabase Edge Functions → Resend |
| React en HTML | Babel Standalone (transpilation in-browser) + Import Maps |

**Important :** React est chargé via des Import Maps et Babel standalone, sans build step. Cela permet des fichiers `.jsx` inclus directement dans les `.html`.

---

## 4. Base de données Supabase

### Installation

Aller dans **Supabase → SQL Editor**, coller `schema.sql`, cliquer Run.

### Tables

#### `clients`
Chaque ligne = un espace client.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | Généré automatiquement |
| `code` | text unique | Slug d'accès ex: `maison-lumiere` |
| `name` | text | Nom affiché ex: `Maison Lumière` |
| `greeting` | text | Prénom de contact pour les emails |
| `initials` | text | Initiales ex: `ML` |
| `sector` | text | Secteur d'activité |
| `agency_name` | text | Défaut: `TimelessHouse` |
| `client_email` | text | Email pour les notifications (pas dans schema initial, à ajouter) |
| `universe` | text | `communication`, `mariage`, `fiancailles`, `anniversaire-mariage` |
| `redirect_url` | text | URL de redirection personnalisée après login |
| `partner1` / `partner2` | text | Prénoms du couple (univers mariage/fiançailles) |
| `analytics_enabled` | boolean | Active le module Analytics |
| `media_enabled` | boolean | Active le module Médias |
| `invoices_enabled` | boolean | Active le module Factures |
| `shoots_enabled` | boolean | Active le module Tournages |
| `documents_enabled` | boolean | Active le module Documents |
| `active` | boolean | Compte actif ou non |
| `storage_used/total/percent` | text/int | Informations de stockage affichées |
| `config` | jsonb | Configuration spécifique à l'univers (vidéos, toggles…) |

#### `media`
Médias livrés aux clients Communication.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK | Référence `clients(id)` |
| `type` | text | `photo` ou `video` |
| `title` | text | Titre du média |
| `url` | text | URL haute qualité (téléchargement) |
| `preview_url` | text | URL allégée pour lecture streaming |
| `thumb_url` | text | Miniature |
| `thumb_grad` | text | Gradient CSS de fallback |
| `date_label` | text | Ex: `12 Avr 2026` |
| `duration` | text | Vidéos uniquement, ex: `0:45` |
| `size_label` | text | Ex: `128 MB` |
| `tag` | text | Ex: `Réseaux sociaux` |
| `shoot_id` | uuid FK | Tournage associé (optionnel) |
| `approval_status` | text | `pending`, `approved`, `changes` |
| `position` | integer | Ordre d'affichage |

#### `invoices`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK | |
| `reference` | text | Ex: `FAC-2026-042` |
| `description` | text | |
| `amount` | numeric(10,2) | |
| `date_label` | text | |
| `status` | text | `payée` ou `en attente` |
| `pdf_url` | text | Lien vers le PDF de la facture |

#### `shoots`
Tournages planifiés.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK | |
| `title` | text | |
| `type` | text | `photo` ou `video` |
| `date_day` | integer | Jour 1–31 |
| `month_label` | text | Ex: `Avr` |
| `year` | integer | |
| `time_label` | text | Ex: `09:00 — 16:00` |
| `location` | text | |
| `notes` | text | |

#### `analytics`
Une seule ligne par client, données agrégées des réseaux sociaux.

| Colonne | Type | Description |
|---|---|---|
| `client_id` | uuid PK | |
| `total_followers` | text | Ex: `24.5K` |
| `followers_delta` | text | Ex: `+1.2K` |
| `engagement` | text | Ex: `4.8%` |
| `engagement_delta` | text | |
| `reach` / `clicks` | text | |
| `platforms` | jsonb | Liste des réseaux `[{name, icon, followers, ...}]` |
| `demographics` | jsonb | `[{age, percent}]` |
| `follower_growth` | jsonb | `[{week, value}]` |
| `engagement_by_day` | jsonb | `[{day, insta, fb, tt}]` |
| `ai_summary` | jsonb | `{headline, body}` — résumé IA |

#### `documents`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK | |
| `title` | text | Ex: `Contrat de prestation 2026` |
| `category` | text | `Contrat`, `Charte graphique`, `Devis`, `Brief`, `Autre` |
| `file_url` | text | URL publique Supabase Storage ou lien externe |
| `date_label` | text | |
| `size_label` | text | |
| `position` | integer | |

### Colonnes à ajouter manuellement (non dans schema.sql initial)

```sql
-- Si non présentes, ajouter via SQL Editor :
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS universe text DEFAULT 'communication';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS redirect_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS partner1 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS partner2 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS analytics_enabled boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS media_enabled boolean DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS invoices_enabled boolean DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shoots_enabled boolean DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS config jsonb;
ALTER TABLE media ADD COLUMN IF NOT EXISTS shoot_id uuid REFERENCES shoots(id);
ALTER TABLE media ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';
```

### Row Level Security (RLS)

- **Lecture publique** sur toutes les tables : les clients lisent leurs propres données en se basant sur leur code (qui agit comme une clé d'accès privée).
- **Écriture** uniquement pour les utilisateurs authentifiés Supabase Auth (`auth.role() = 'authenticated'`) = l'admin.

### Créer le compte admin

Supabase Dashboard → Authentication → Users → Add user → email + mot de passe.

---

## 5. Page d'accueil — index.html

### Rôle
Page d'entrée du site. Présente les univers créatifs de l'agence, affiche une vidéo de fond cinématique, et donne accès à l'espace client via une modale à code.

### Fonctionnalités

#### Vidéo de fond
- Un `<video>` en `position:fixed` couvre tout l'écran (classe `.bg-video`)
- Un poster statique (`.bg-poster`) s'affiche pendant le chargement
- Une deuxième vidéo (`.bg-video-preview`) se superpose au hover sur les boutons de thème

#### Thèmes (THEMES array)
Définis dans le JavaScript, chaque thème a :
```js
{
  id:       'mariage',
  label:    { fr: 'Mariage', en: 'Wedding' },
  subtitle: { fr: 'Films de mariage', en: 'Wedding films' },
  url:      'mariage.html',       // null = pas encore disponible (caché)
  preview:  'https://...',        // URL vidéo de prévisualisation au hover
  poster:   'https://...'         // Image Cloudinary (.jpg) avant chargement vidéo
}
```

Seuls les thèmes avec `url !== null` sont affichés. Les autres sont masqués automatiquement.

**Thèmes actifs actuellement :**
- Mariage → `mariage.html`
- Communication → `communication.html`

**Thèmes désactivés (url: null) :**
- Court-Métrage, Immobilier, Commercial, Voyage

**Pour activer un thème :** renseigner la propriété `url` dans l'objet THEMES correspondant.

#### Comportement hover / mobile
- **Desktop :** hover sur un bouton → affiche la vidéo de prévisualisation, mouseLeave → cache
- **Mobile/touch :** premier tap → affiche la preview, deuxième tap → navigue vers la page

#### Transition de page
Fade-out via `.pageTransition` overlay (classe CSS `.exiting`) avant navigation.

#### Espace client (modale)
- Bouton "Espace Clients" dans le header → ouvre `#clientModal`
- Saisie du code → appel Supabase `clients.select().eq('code', code).eq('active', true)`
- Si valide → `sessionStorage.setItem('access_granted', code)` + redirection
- Logique de redirection :
  - `redirect_url` personnalisée si définie
  - Sinon par `universe` : `communication` → `communication-dashboard.html`, `anniversaire-mariage` → `event-anniversary.html`, `fiancailles` → `event-engagement.html`, défaut → `event-photos.html`

#### Ouverture automatique de la modale
Si l'URL contient `#clients` (ex: lien depuis un email de notification), la modale s'ouvre automatiquement :
```js
if(window.location.hash === '#clients') {
  setTimeout(() => { openClientModal(); }, 300);
  history.replaceState(null, null, ' ');
}
```

#### Langue
Toggle FR/EN via `body.classList.toggle('en-mode')`. Les éléments utilisent `[data-lang="fr"]` et `[data-lang="en"]`.

---

## 6. Univers Portfolio public

### mariage.html
Page vitrine complète pour l'univers mariage. Contenu :
- Header fixe avec navigation et menu mobile
- Hero cinématique avec vidéo de fond
- Galeries photos (Cloudinary)
- Section films / vidéos
- Présentation de l'équipe
- Section processus (étapes de travail)
- Section tarifs / packages
- FAQ
- Formulaire de contact (mailto)
- Méta OG / Twitter Cards pour partage réseaux sociaux

**Palette :** ivoire chaud + bronze doré (`--accent: #b08968`)
**Polices :** Cormorant Garamond (titres) + Montserrat (corps)

### immobilier.html
Page portfolio immobilier. Structure similaire à mariage.html mais avec contenu adapté à la photo/vidéo immobilière.

### communication.html
**Ce n'est pas une page portfolio** — c'est la **page d'entrée de l'espace client Communication**. Elle sert de "landing page" avec une modale de connexion par code.

---

## 7. Univers Communication & Marketing

### Flux global

```
communication.html (landing + modale login)
    ↓ [code validé, sessionStorage]
communication-dashboard.html (shell HTML)
    ↓ [injecte communication-app.jsx via Babel]
App React complète du dashboard client
```

### communication.html — Page d'entrée

**Design :** néomorphique cream warm / graphite bleuté (dark)
**Variables CSS :**
```css
:root {
  --bg: #e9e4d9;        /* cream warm light */
  --surface: #efeae0;
  --accent: #2a2620;    /* brun foncé = accent light */
}
[data-theme="dark"] {
  --bg: #181b20;         /* graphite bleuté */
  --accent: #e8d8be;     /* ivoire chaud = accent dark */
}
```

Contient :
- Header avec bouton retour, logo, toggle FR/EN, toggle dark/light, lien admin discret
- Hero avec texte de présentation + pills de services
- Bouton "Accéder à mon espace" → ouvre la modale
- Modale de connexion par code (input password + validation Supabase)
- Validation du code : normalisation → slugification → query Supabase

**Code de normalisation :**
```js
const code = raw.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, ' ').trim()
  .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
```

### communication-dashboard.html — Shell

Page HTML légère qui :
1. Charge Tailwind, Babel, les Import Maps (React, Supabase, Recharts, Lucide)
2. Applique le thème avant rendu (pas de flash)
3. Charge `supabase-config.js`
4. Exécute un script `<script type="module">` qui :
   - Lit le code dans `sessionStorage`
   - Fait une query Supabase complète (client + médias + factures + tournages + analytics + documents + commentaires)
   - Stocke tout dans `window.CLIENT_DATA` et `window.__SUPABASE`
   - Charge et transpile `communication-app.jsx` via Babel standalone
   - Affiche un écran de chargement animé pendant ce temps

### communication-app.jsx — Dashboard client React

Application React complète. Modules activables/désactivables par client :

#### Navigation latérale (desktop) / barre basse (mobile)
- **Accueil** (toujours visible)
- **Médias** (si `mediaEnabled`)
- **Factures** (si `invoicesEnabled`)
- **Analytics** (si `analyticsEnabled`)
- **Calendrier** (si `shootsEnabled`)
- **Documents** (si `documentsEnabled`)

#### Module Accueil (dashboard)
Cartes de résumé avec compteurs, derniers médias, prochains tournages, résumé IA analytics.

#### Module Médias
- Grille responsive (vue Grille / Liste)
- Recherche et filtres par tag
- Lightbox photo avec navigation clavier (← →)
- Lecteur vidéo intégré (Cloudinary, Streamable, YouTube, mp4 direct)
- Téléchargement direct compatible iOS (fetch → blob → link click)
- **Système d'approbation** : boutons Approuver / Demander des changements par média
- **Commentaires** par média (interface dédiée)

#### Module Factures
- Liste avec statuts (payée / en attente)
- Téléchargement PDF si `pdf_url` renseignée
- Total et ventilation

#### Module Analytics
- KPIs : followers, engagement, reach, clics
- Graphiques Recharts : croissance followers (AreaChart), engagement par jour (BarChart), démographies (PieChart)
- Plateformes sociales avec liens
- Résumé IA (`ai_summary.headline` + `.body`)

#### Module Calendrier
- Affichage calendrier mensuel (navigation mois par mois)
- Détail des tournages (type, heure, lieu, notes)

#### Module Documents
- Grille de documents avec catégories (Contrat, Charte graphique, Devis, Brief, Autre)
- Filtre par catégorie
- Téléchargement / ouverture dans un nouvel onglet

---

## 8. Espaces événementiels clients

Ces pages sont des **livraisons cinématiques** pour les clients mariage/événements. Elles chargent leur configuration depuis Supabase via le code stocké en `sessionStorage`.

### Flux d'authentification commun

```js
// Toutes ces pages font la même vérification au chargement :
const code = sessionStorage.getItem('access_granted');
// Query Supabase pour récupérer la config du client
const { data } = await sb.from('clients').select('*').eq('code', code).maybeSingle();
// Si pas de client ou pas actif → showError('invalid')
// Si client actif mais contenu pas encore prêt → showError('not-ready', data.name)
```

### event-photos.html — Galerie photos mariage
- Galerie masonry/grid de photos Cloudinary
- Lightbox plein écran avec navigation
- Téléchargement des photos

### event-photos-cinematic.html
- Variante cinématique de la galerie photos
- Effets visuels plus poussés (grain, overlays)

### event-video.html — Film de mariage
- Lecteur vidéo principal (teaser + film complet)
- Choix qualité 1080p / 4K
- Bouton de téléchargement

### event-anniversary.html — Anniversaire de mariage
- Même structure que event-video.html mais pour les films d'anniversaire

### event-engagement.html — Fiançailles
- Même structure pour les films de fiançailles

### Configuration des vidéos (colonne `config` jsonb)
La colonne `config` de la table `clients` stocke la configuration des pages vidéo :
```json
{
  "afficherTeaser": true,
  "afficherFilm": true,
  "teaserUrls": { "1080p": "https://...", "4K": "https://..." },
  "filmUrls": { "1080p": "https://...", "4K": "https://..." },
  "teaserDownloadUrl": "https://...",
  "filmDownloadUrl": "https://...",
  "defaultVideo": "film",
  "upsellBouton": false,
  "upsellTexte": "Commander ce film",
  "upsellLien": "mailto:service@timelesshouse.org"
}
```

### Gestion des erreurs
Chaque page affiche un écran cinématique en cas d'erreur :
- **Code invalide** : message + boutons "Réessayer" + "Contacter"
- **Contenu pas encore prêt** (`not-ready`) : message personnalisé avec prénom du client

---

## 9. Interface Admin — communication-admin.html

### Accès
- URL directe : `/communication-admin.html`
- Lien discret dans `communication.html` header (icône cadenas, opacité 45%)
- Authentification : Supabase Auth (email + mot de passe de l'admin)

### Structure React (Babel in-browser)

```
App
├── LoginScreen (si non authentifié)
└── Dashboard (si authentifié)
    ├── Overview (stats globales)
    ├── ClientsList
    │   └── ClientForm (création / édition)
    └── ClientDetail (vue d'un client)
        ├── Header (infos client + toggles modules)
        ├── IdentityTab (modifier les infos)
        ├── ContentTab (gestion des pages événementielles)
        ├── MediaTab (gestion des médias)
        │   ├── MediaForm (ajouter / modifier un média)
        │   ├── CommentsModal (voir/modérer les commentaires)
        │   └── [Bouton notifier client]
        ├── InvoicesTab (gestion des factures)
        │   └── [Bouton notifier client — facture prête]
        ├── ShootsTab (gestion des tournages)
        ├── AnalyticsTab (saisie des KPIs)
        └── DocumentsTab (gestion des documents)
```

### Fonctionnalités par onglet

#### Overview
- Nombre de clients actifs, revenus totaux, médias livrés, tournages prévus
- Carte hero avec message d'accroche

#### ClientsList
- Recherche par nom ou code
- Grille de cartes clients (nom, secteur, code, univers, badge analytics)
- Bouton "Nouveau client"

#### ClientForm (création / édition)
Champs :
- **Univers** : Communication, Mariage, Fiançailles, Anniversaire, ou personnalisé
- **Noms des partenaires** (si couple) : auto-génère nom, initiales et code
- Code d'accès (slugifié automatiquement)
- Email du client (pour notifications)
- Nom de l'agence, secteur, prénom de salutation
- URL de redirection personnalisée
- Toggles d'activation des modules (Médias, Factures, Tournages, Documents, Analytics)

Lors de la création, une ligne `analytics` vide est automatiquement insérée.

#### ContentTab
Gestion des pages événementielles (mariage, fiançailles, anniversaire) :
- Sélection du modèle de page (photos, vidéo, etc.)
- Toggles Teaser / Film complet
- Champs URL vidéo (1080p, 4K) + URLs de téléchargement
- Vidéo affichée par défaut
- Toggle upsell (bouton "Commander")

#### MediaTab
- Liste des médias avec miniature, titre, type, tag, statut d'approbation
- Bouton "Ajouter un média" → formulaire (titre, type, URLs, tag, tournage associé)
- Bouton "Notifier le client" par média → Edge Function `notify-client` kind `new_media`
- Badge d'approbation (en attente / approuvé / changements demandés)
- Compteur de commentaires

#### InvoicesTab
- Liste des factures avec références, montants, statuts
- Formulaire d'ajout/édition de facture
- Bouton "Notifier le client" → Edge Function `notify-client` kind `invoice_ready`

#### ShootsTab
- Liste + formulaire des tournages (titre, type, date, heure, lieu, notes)

#### AnalyticsTab
- Saisie manuelle de tous les KPIs (followers, engagement, reach, clics, deltas)
- Saisie JSON pour les données de graphiques (platforms, demographics, follower_growth, engagement_by_day)
- Champ résumé IA (headline + body)

#### DocumentsTab
- Liste + formulaire des documents
- Catégories : Contrat, Charte graphique, Devis, Brief, Autre
- Champ URL du fichier (Supabase Storage ou lien externe)

---

## 10. Dashboard client — communication-dashboard.html

### Chargement des données

```js
// Séquence de chargement dans communication-dashboard.html :
const code = sessionStorage.getItem('access_granted');
// → query clients + media + invoices + shoots + analytics + documents + media_comments
// → construit window.CLIENT_DATA = { ...client, media: [...], invoices: [...], ... }
// → window.__SUPABASE = sb (client Supabase)
// → charge communication-app.jsx via fetch + Babel.transform
// → ReactDOM.createRoot(root).render(<App />)
```

### Sécurité
```js
// En tête de communication-app.jsx :
const accessCode = sessionStorage.getItem('access_granted');
const expectedCode = (window.CLIENT_DATA && window.CLIENT_DATA.code) || null;
if (!accessCode || (expectedCode && accessCode !== expectedCode)) {
  window.location.href = 'communication.html';
}
```

Le dashboard se déconnecte si le code en session ne correspond pas au client chargé.

---

## 11. Système de notifications email

### Architecture
Les notifications sont envoyées via une **Supabase Edge Function** nommée `notify-client`.

### Déploiement
```bash
supabase functions deploy notify-client
```

### Appel depuis l'admin
```js
const url = `${window.SUPABASE_URL}/functions/v1/notify-client`;
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({
    client_id: clientId,
    media_id: media.id,      // pour new_media
    kind: 'new_media',       // ou 'invoice_ready', 'welcome', 'event_ready'
    extra: {
      loginUrl: 'https://timelesshouse.org/index.html#clients'
    }
  })
});
```

### Types de notifications (`kind`)

| kind | Déclencheur | Contenu email |
|---|---|---|
| `welcome` | Création d'un espace client | Email de bienvenue avec lien |
| `new_media` | Nouveau média livré | "Votre contenu est disponible" |
| `event_ready` | Espace événementiel prêt | "Votre film/galerie est disponible" |
| `invoice_ready` | Facture disponible | "Votre facture FAC-XXXX est disponible" |

### Payload `invoice_ready`
```json
{
  "kind": "invoice_ready",
  "client_id": "<uuid>",
  "extra": {
    "reference": "FAC-2026-042",
    "amount": 3200,
    "loginUrl": "https://timelesshouse.org/index.html#clients"
  }
}
```

### Template email `invoice_ready` (à ajouter dans la Edge Function)
```ts
case "invoice_ready": {
  const ref = body.extra?.reference ?? "";
  const amount = body.extra?.amount ?? null;
  const loginUrl = body.extra?.loginUrl ?? "https://timelesshouse.org/index.html#clients";
  const montant = amount != null
    ? new Intl.NumberFormat("fr-FR").format(amount) + " €"
    : "";

  subject = `Votre facture ${ref} est disponible`;
  html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;color:#1c1d21">
    <h2 style="font-weight:400">Bonjour ${client.greeting || client.name},</h2>
    <p>Votre facture <strong>${ref}</strong>${montant ? ` (${montant})` : ""} est disponible dans votre espace client.</p>
    <p style="margin:28px 0">
      <a href="${loginUrl}" style="background:#1c1d21;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block">
        Consulter ma facture
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">Saisissez votre code d'accès habituel pour vous connecter.</p>
    <p style="color:#9ca3af;font-size:12px">${client.agency_name || "TimelessHouse"}</p>
  </div>`;
  break;
}
```

### Lien de connexion dans les emails
Le lien pointe vers `https://timelesshouse.org/index.html#clients`. Le `#clients` déclenche l'ouverture automatique de la modale de connexion.

---

## 12. Module Documents

### Activation
Par client dans l'admin : toggle "Documents" dans le formulaire client.

### Ajout de fichiers
Les fichiers sont référencés par URL. Deux options :
1. **Supabase Storage** : créer un bucket public "documents", uploader le fichier, copier l'URL publique
2. **Lien externe** : Google Drive, Dropbox, etc. (n'importe quelle URL directe)

### Catégories disponibles
`Contrat`, `Charte graphique`, `Devis`, `Brief`, `Autre`

### Côté admin
Onglet "Documents" dans la fiche client :
- Ajouter / modifier / supprimer des documents
- Champs : titre, catégorie, URL, date, taille

### Côté client (dashboard)
Section "Documents" avec :
- Grille de documents
- Filtres par catégorie
- Bouton téléchargement / ouverture (selon le type de lien)

---

## 13. Design System

### Deux palettes selon l'univers

#### Univers Portfolio (index.html, mariage.html)
```css
--cine-dark: #1a1410;      /* noir cinéma */
--cine-cream: #f5ecdf;     /* crème lumineuse */
--accent: #b08968;         /* bronze doré */
--accent-soft: #d4b896;    /* champagne */
--sage: #9aafa3;           /* vert sauge */
```
Polices : Cormorant Garamond + Montserrat

#### Univers Communication (dashboard, admin)
```css
/* Light */
--bg: #e9e4d9;            /* cream warm */
--surface: #efeae0;
--accent: #2a2620;        /* brun foncé */

/* Dark */
--bg: #181b20;            /* graphite bleuté */
--accent: #e8d8be;        /* ivoire chaud */
```
Polices : Instrument Serif + Manrope

### Néomorphisme (Neumorphic Design)

Le dashboard utilise un design néomorphique avec deux jeux de tokens (light/dark) :

```js
const NEU_LIGHT = {
  base:      { backgroundColor: '#e9e4d9' },
  raised:    { backgroundColor: '#efeae0', boxShadow: '10px 10px 24px rgba(168,156,134,0.32), -10px -10px 24px rgba(255,253,247,0.92)' },
  raisedSm:  { ... },  // ombres plus petites
  raisedXs:  { ... },  // ombres minimales
  pressed:   { ... },  // enfoncé (inset shadows)
  pressedSm: { ... },
  dark:      { backgroundColor: '#2a2620', ... },  // bouton primaire dark
  darkSm:    { ... },
};
```

Le pointeur `neu` est reasigné à chaque changement de thème (`neu = isDark ? NEU_DARK : NEU_LIGHT`) et les composants re-render.

### Toggle Dark Mode (SVG arc animé)

Composant `DarkToggle` unique et reconnaissable : un rectangle arrondi avec un arc SVG qui "voyage" le long du contour à chaque toggle.

```js
// L'arc est un stroke SVG avec strokeDasharray/strokeDashoffset
// Chaque toggle ajoute C_STEP (50) à l'offset, faisant voyager l'arc
const C_STEP = 50;
const C_INITIAL = -9.8;
// L'offset est persisté dans localStorage('th-c-offset')
```

---

## 14. Système d'authentification client

### Pas d'auth Supabase pour les clients
Les clients n'ont **pas de compte Supabase**. L'accès est basé sur un **code slug unique** :

1. Client saisit son code → normalisation/slugification → query Supabase
2. Si trouvé + actif → `sessionStorage.setItem('access_granted', code)`
3. Redirection vers la bonne page
4. Chaque page protégée vérifie `sessionStorage.getItem('access_granted')` au chargement

### Slug — règles de génération
```js
const slugify = (s) => s.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // supprime accents
  .replace(/[^a-z0-9]/g, '-')                         // tout sauf a-z0-9 → tiret
  .replace(/-+/g, '-')                                 // tirets multiples → un seul
  .replace(/^-|-$/g, '');                              // trim tirets
```

Exemple : `"Maison & Lumière"` → `"maison-lumiere"`

### Codes pour couples
Générés automatiquement depuis les prénoms :
- Partner1: `"Emma"` + Partner2: `"Lucas"` → code suggéré: `"emma-lucas"`
- L'admin peut toujours modifier manuellement

### Sécurité
Le code est la seule protection. Il doit être :
- Suffisamment unique et non devinable
- Communiqué de façon privée au client
- Les données en lecture sont publiques dans Supabase (RLS permissif en lecture), donc la sécurité repose entièrement sur la connaissance du code

---

## 15. Gestion du mode sombre

### Persistance
```js
localStorage.setItem('th-dark-mode', 'dark' | 'light');
```

### Application sans flash
Script inline avant `<body>` qui applique `data-theme="dark"` sur `<html>` si nécessaire :
```html
<script>
  (function(){
    try {
      if (localStorage.getItem('th-dark-mode') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch(e) {}
  })();
</script>
```

### Dans les fichiers HTML statiques (communication.html, etc.)
Override via sélecteurs CSS `[data-theme="dark"]` sur toutes les classes Tailwind utilisées.

### Dans les composants React
Hook `useDarkMode()` + context `ThemeContext` + mutable pointer `neu` reassigné.

---

## 16. Internationalisation (FR / EN)

### Système basique avec `data-lang`
```html
<span data-lang="fr">Bienvenue</span>
<span data-lang="en">Welcome</span>
```

CSS :
```css
[data-lang="en"] { display: none; }
body.en-mode [data-lang="fr"] { display: none; }
body.en-mode [data-lang="en"] { display: inline; }
/* Pour les div/p : */
div[data-lang="fr"] { display: block; }
body.en-mode div[data-lang="fr"] { display: none !important; }
body.en-mode div[data-lang="en"] { display: block !important; }
```

Toggle :
```js
function toggleLanguage() { document.body.classList.toggle('en-mode'); }
```

### Pages concernées
- `index.html` : labels des thèmes dans le THEMES array (objet `{fr, en}`)
- `mariage.html` : tout le contenu
- `communication.html` : textes du hero et de la modale

### Pages non traduites
- Dashboard client (`communication-dashboard.html` / `communication-app.jsx`) : français uniquement
- Admin (`communication-admin.html`) : français uniquement

---

## 17. Hébergement des médias (Cloudinary)

### URL de base Cloudinary
```
https://res.cloudinary.com/dyfa4zztq/image/upload/...
```

### Astuce poster vidéo
Pour obtenir l'image de couverture d'une vidéo Cloudinary, changer `.mp4` en `.jpg` dans l'URL :
```
https://res.cloudinary.com/.../upload/v123/video.mp4
→ https://res.cloudinary.com/.../upload/v123/video.jpg
```

### Vidéos externes supportées
Le lecteur vidéo du dashboard client supporte :
- **Cloudinary** : URL directe `.mp4`
- **Streamable** : `streamable.com/l/ID/mp4.mp4`
- **YouTube** : embed via iframe
- **MP4 direct** : tout autre hébergeur

### Téléchargement compatible iOS
```js
// Fetch → blob → URL objet → lien temporaire
const res = await fetch(url);
const blob = await res.blob();
const blobUrl = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = blobUrl;
a.download = filename;
a.click();
URL.revokeObjectURL(blobUrl);
```

---

## 18. Fichier supabase-config.js

Ce fichier **ne doit pas être versionné** (l'ajouter à `.gitignore`). Il doit être créé sur le serveur :

```js
// supabase-config.js
window.SUPABASE_URL = 'https://XXXX.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGci...';
```

Tous les fichiers HTML le chargent avec :
```html
<script src="supabase-config.js"></script>
```

Dans `communication-dashboard.html`, le client Supabase est aussi exposé :
```js
window.__SUPABASE = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
```

---

## 19. Flux complet d'un client Communication

### Onboarding (côté admin)

1. Aller sur `communication-admin.html` → se connecter avec le compte Supabase admin
2. Clients → "Nouveau client"
3. Remplir : univers = Communication, nom, code, email, secteur, modules activés
4. Sauvegarder → une ligne `clients` + une ligne `analytics` vide sont créées
5. Dans la fiche client → Médias → "Ajouter un média" → remplir URL, titre, tag, type
6. Optionnel : envoyer une notification email au client (bouton "Notifier")
7. Communicter le code au client

### Expérience client

1. Aller sur `communication.html` → bouton "Accéder à mon espace"
2. Saisir le code → validation → redirection vers `communication-dashboard.html`
3. Dashboard affiche : Accueil, Médias, Factures, Analytics, Calendrier, Documents
4. Le client peut :
   - Voir / télécharger ses médias
   - Approuver ou demander des changements sur chaque média
   - Laisser des commentaires par média
   - Consulter ses factures et télécharger les PDF
   - Voir ses analytics réseaux sociaux
   - Voir le calendrier de ses tournages
   - Télécharger ses documents contractuels

---

## 20. Flux complet d'un client Mariage/Événement

### Onboarding (côté admin)

1. Admin → "Nouveau client" → univers = Mariage (ou Fiançailles, Anniversaire)
2. Remplir prénoms des partenaires → code auto-généré (ex: `emma-lucas`)
3. Par défaut, Médias/Factures/Tournages/Documents sont désactivés pour les couples
4. Dans ContentTab : configurer les URLs vidéo (teaser, film complet, qualités 1080p/4K)
5. Activer Teaser et/ou Film
6. Optionnel : activer le bouton upsell si la vidéo n'est pas encore prête

### Expérience client

1. Aller sur `mariage.html` (ou directement sur `index.html`)
2. Cliquer "Espace Clients" → modale → saisir le code
3. Redirection vers la page configurée :
   - Mariage → `event-photos.html` ou `event-video.html`
   - Fiançailles → `event-engagement.html`
   - Anniversaire → `event-anniversary.html`
4. La page charge la config depuis Supabase
5. Si contenu pas prêt → écran "en cours de préparation" personnalisé
6. Si prêt → film/galerie s'affiche avec options de téléchargement

---

## 21. Checklist de mise en production

### Prérequis
- [ ] Compte Supabase créé, projet initialisé
- [ ] `schema.sql` exécuté dans le SQL Editor
- [ ] Compte admin créé (Supabase Auth → Users)
- [ ] `supabase-config.js` créé avec les bonnes valeurs
- [ ] Edge Function `notify-client` déployée (si notifications email souhaitées)
- [ ] Compte Resend configuré (ou autre provider email)

### Configuration Cloudinary
- [ ] Compte Cloudinary configuré
- [ ] Vidéos et photos uploadées
- [ ] URLs Cloudinary renseignées dans les fichiers/thèmes

### Configuration du site
- [ ] `CONTACT_EMAIL` dans `index.html` mis à jour si nécessaire
- [ ] `THEMES` array dans `index.html` : vérifier que seuls les univers prêts ont une `url`
- [ ] Méta OG dans `mariage.html` (url, image) mises à jour avec le vrai domaine
- [ ] `supabase-config.js` ajouté au `.gitignore`

### Premier client
- [ ] Créer un client test dans l'admin
- [ ] Vérifier la connexion par code
- [ ] Vérifier l'affichage du dashboard
- [ ] Tester le téléchargement d'un média
- [ ] Tester une notification email (si configurée)

---

## 22. Points d'extension et évolutions futures

### Univers désactivés à activer
Dans `index.html`, THEMES array :
- **Immobilier** : `url: null` → mettre `url: 'immobilier.html'` quand la page est prête
- **Court-Métrage** : idem
- **Commercial** : idem
- **Voyage** : idem

### Modules non encore développés
- Approbation client via email (lien direct depuis l'email → approval sans login)
- Galerie collaborative (plusieurs utilisateurs d'un même compte)
- Paiement en ligne intégré (Stripe)
- Signature électronique des contrats

### Analytics automatisées
Actuellement les analytics sont saisies manuellement dans l'admin. L'évolution naturelle serait de connecter l'API Instagram/Facebook/YouTube pour peupler automatiquement la table `analytics`.

### Base de données — table manquante possible
Une table `media_comments` est référencée dans le code admin (`sb.from('media_comments')`) mais n'est pas dans `schema.sql`. À créer si les commentaires sont utilisés :

```sql
create table if not exists media_comments (
  id         uuid primary key default gen_random_uuid(),
  media_id   uuid references media(id) on delete cascade,
  client_id  uuid references clients(id) on delete cascade,
  content    text not null,
  author     text default 'Client',
  created_at timestamptz default now()
);

alter table media_comments enable row level security;
create policy "public read media_comments" on media_comments for select using (true);
create policy "auth write media_comments" on media_comments for all using (auth.role() = 'authenticated');
```

### RPC Supabase manquante possible
La fonction RPC `update_media_approval` est appelée dans l'admin :
```js
await sb.rpc('update_media_approval', { p_media_id: id, p_status: status });
```
À créer si non existante :
```sql
create or replace function update_media_approval(p_media_id uuid, p_status text)
returns void language plpgsql security definer as $$
begin
  update media set approval_status = p_status where id = p_media_id;
end;
$$;
```

---

## Annexe — Variables d'environnement et constantes importantes

| Valeur | Emplacement | Description |
|---|---|---|
| `SUPABASE_URL` | `supabase-config.js` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | `supabase-config.js` | Clé anon publique Supabase |
| `CONTACT_EMAIL` | `index.html` ligne ~901 | `service@timelesshouse.org` |
| `dyfa4zztq` | Cloudinary cloud name | Dans les URLs d'images |
| `th-dark-mode` | localStorage key | `'dark'` ou `'light'` |
| `th-c-offset` | localStorage key | Position de l'arc du toggle |
| `access_granted` | sessionStorage key | Code d'accès du client connecté |

---

*Document généré le 19 mai 2026 à partir de l'analyse complète du code source du projet TimelessHouse.*
