# 📘 TimelessHouse — État du projet

> Document de référence à donner à Claude pour reprendre le contexte du projet.
> Dernière mise à jour : Mai 2026

---

## 🎯 Vue d'ensemble du projet

**TimelessHouse** est une agence française de vidéographie / photographie qui propose des espaces clients sécurisés. Le site gère **plusieurs univers de clientèle** avec des expériences différentes selon le type de prestation.

### Univers supportés

| Univers | Code DB | Page d'entrée | Destination par défaut |
|---|---|---|---|
| 💍 Mariage | `mariage` | `mariage.html` | `event-photos.html` |
| 💎 Fiançailles | `fiancailles` | `mariage.html` | `event-engagement.html` |
| 🎂 Anniversaire de mariage | `anniversaire-mariage` | `mariage.html` | `event-anniversary.html` |
| 🏠 Immobilier | `immobilier` | `immobilier.html` | (legacy via `redirect_url`) |
| 📊 Communication & Marketing | `communication` | `communication.html` | `communication-dashboard.html` |
| 📸 Commercial | `commercial` | (futur) | — |
| 🎬 Court-métrage | `court-metrage` | (futur) | — |
| ✈️ Voyage | `voyage` | (futur) | — |
| 📁 Autre | `autre` | (futur) | — |

**`mariage.html`** est la page d'entrée unique pour les 3 univers couples (mariage, fiançailles, anniversaire).

---

## 🏗 Architecture technique

### Stack
- **Frontend** : HTML statique + React via Babel standalone (pas de build)
- **Backend** : Supabase (PostgreSQL + Edge Functions Deno + RLS)
- **Emails** : Resend (domaine vérifié `noreply.timelesshouse.org`)
- **CDN images/vidéos** : Cloudinary (compte `dyfa4zztq`)
- **Hébergement** : timelesshouse.org

### Configuration Supabase
- Project ID : `vpbxeqjvaeiytxcpilxf`
- Variables d'env (secrets) : `RESEND_API_KEY`, `FROM_EMAIL`, `PORTAL_URL`, `ADMIN_EMAIL=service@timelesshouse.org`
- Cron job : `daily-notifications` à 7h UTC tous les jours

---

## 📂 Inventaire des fichiers

### Pages publiques (entrées)
| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil, accepte TOUS les codes d'univers |
| `mariage.html` | Page d'accueil couples (mariage + fiançailles + anniversaire) |
| `immobilier.html` | Page d'accueil immobilier |
| `communication.html` | Page d'accueil communication |

### Templates dynamiques (livraisons clients)
| Fichier | Pour | Charge config depuis |
|---|---|---|
| `event-photos.html` | Galerie photos (tous univers couples) | `event_pages` table |
| `event-video.html` | Lecteur vidéo mariage standard | `event_pages` table |
| `event-anniversary.html` | Lecteur vidéo anniversaire (avec NOCES) | `event_pages` table |
| `event-engagement.html` | Lecteur vidéo fiançailles | `event_pages` table |
| `communication-dashboard.html` | Loader du dashboard communication | Supabase clients + media + invoices + shoots + analytics |
| `communication-app.jsx` | App React du dashboard communication | `window.CLIENT_DATA` |

### Admin
| Fichier | Rôle |
|---|---|
| `communication-admin.html` | Espace admin SPA React (toutes les actions) |

### Backend
| Dossier/Fichier | Rôle |
|---|---|
| `supabase/functions/notify-client/index.ts` | Edge Function pour envoyer les emails (6 types) |
| `supabase/functions/scheduled-notifications/index.ts` | Cron job de rappels (tournages + factures) |
| `supabase-config.js` | URL + ANON_KEY publique |

---

## 🗄 Base de données Supabase

### Tables principales

**`clients`** — colonnes :
- `id`, `name`, `code` (unique, slug), `active`, `initials`, `sector`
- `greeting`, `client_email`, `agency_name`
- `universe` (mariage/fiancailles/anniversaire-mariage/communication/...)
- `redirect_url` (legacy, pour clients pré-templates dynamiques)
- `partner1`, `partner2` (pour les couples)
- `analytics_enabled`, `media_enabled`, `invoices_enabled`, `shoots_enabled` (toggles modules)

**`event_pages`** — pages dynamiques pour les couples :
- `client_id`, `page_type` (`'photos'` | `'video'`), `config` (JSONB)
- Un client peut avoir 0, 1 ou 2 pages (galerie photo et/ou vidéo)

**`media`** — photos/vidéos livrées (univers communication) :
- `client_id`, `shoot_id`, `type`, `title`, `url`, `thumb_url`
- `approval_status` (`pending` | `approved` | `changes_requested`)

**`media_comments`** — commentaires sur médias

**`invoices`** — factures :
- `client_id`, `reference`, `amount`, `status`, `pdf_url`, `due_date`

**`shoots`** — tournages programmés

**`analytics`** — analyses réseaux sociaux (option payante 49€/mois pour communication)

**`notifications`** — historique des emails envoyés avec `dedupe_key` pour éviter les doublons

### Historique des migrations

| Migration | Apport |
|---|---|
| v2 | `shoot_id`, `approval_status`, table `media_comments`, RPC `update_media_approval`, table `notifications` |
| v3 | `invoices.due_date` |
| v4 | `analytics_enabled` toggle (option payante communication) |
| v5 | `universe` + `redirect_url` columns, index sur universe |
| v6 | Table `event_pages` (config jsonb pour pages couples) |
| v7 | `partner1` + `partner2` columns |
| v8 | `media_enabled`, `invoices_enabled`, `shoots_enabled` toggles |
| `import-legacy-clients.sql` | Migration des anciens clients de `clients-data.js` |
| `migrate-to-dynamic.sql` | Helper pour basculer un client legacy en mode dynamique |

---

## 📧 Système de notifications email (Resend)

### 6 types d'emails

| `kind` | Déclencheur | Destinataire |
|---|---|---|
| `welcome` | Bouton "Email de bienvenue" dans fiche client admin | Client |
| `new_media` | Bouton 🔔 à côté d'un média | Client |
| `event_ready` | Bouton "Notifier le client" dans onglet Page client | Client |
| `shoot_reminder` | Cron auto J-2 d'un tournage | Client |
| `invoice_reminder` | Cron auto J-3 / J / J+7 / J+14 d'une facture impayée (max 4 envois, stop si payée) | Client |
| `admin_changes_requested` | Auto quand le client clique "Changements demandés" sur un média | Admin |

### Design des emails
- Fond crème `#f5ecdf`, accent doré `#b08968`, texte dark `#1a1410`
- Logo + bouton CTA dynamique selon le type
- `dedupe_key` empêche les doublons (par kind + media_id + reminder_type)

---

## 🎨 Logique de routing & redirections

### Quand un client tape son code sur `mariage.html`
```
mariage.html
  ↓ valide code via Supabase (filtre par univers couples)
  ↓ Si redirect_url rempli (legacy) → URL custom
  ↓ Sinon selon universe :
    - anniversaire-mariage → event-anniversary.html
    - fiancailles → event-engagement.html
    - mariage → event-photos.html
```

### Quand un client tape son code sur `index.html`
```
Accepte TOUS les univers
  ↓ Si redirect_url rempli → URL custom
  ↓ Sinon :
    - communication → communication-dashboard.html
    - anniversaire-mariage → event-anniversary.html
    - fiancailles → event-engagement.html
    - autres → event-photos.html
```

### Liens croisés automatiques dans les templates dynamiques
- Depuis `event-photos.html` → bouton "Voir le Film" pointe vers le bon template selon univers
- Depuis `event-video/anniversary/engagement.html` → bouton "Voir les Photos" pointe vers `event-photos.html`
- Bouton "Accueil/Logo" → `mariage.html` pour les couples, `<univers>.html` sinon

### Écrans d'erreur élégants dans les 4 templates événement
- **"Code non reconnu"** si la session est invalide
- **"Votre galerie est en cours de préparation"** si le client existe mais aucune `event_pages` n'est configurée

---

## 🎛 Système de modules togglables

Dans l'admin, formulaire client, bloc **"Modules visibles dans l'espace client"** avec 4 toggles (disponible pour TOUS les univers, pas seulement communication) :

| Toggle | Par défaut couples | Par défaut autres | Ce que ça cache |
|---|---|---|---|
| 📷 Médias | OFF | ON | Onglet Médias + stats associées |
| 📄 Factures | OFF | ON | Onglet Factures + stats associées |
| 📅 Tournages & calendrier | OFF | ON | Onglet Calendrier + tournages à venir |
| 📊 Analyses réseaux sociaux *(option payante)* | OFF | OFF | Onglet Analyses (uniquement communication) |

**Auto-désactivation intelligente** : quand on crée un nouveau client couple, les 3 modules extras se désactivent automatiquement (pour ne montrer que la galerie/film). On peut les réactiver manuellement.

---

## 👫 Saisie des couples

Quand l'univers est mariage / fiançailles / anniversaire, le formulaire affiche **2 champs prénoms** au lieu d'un seul nom :
- Prénom 1 + Prénom 2 → auto-construit le `name` ("Précieuse & Ronny")
- Code d'accès auto-suggéré ("precieuse-ronny")
- Initiales auto-construites ("PR")
- Le `couple` dans event_pages se remplit automatiquement avec ce format

---

## 📱 Responsive design (mai 2026)

Tous les fichiers ont été audités et améliorés avec **5 niveaux de breakpoints** :
- 1100px (tablette landscape)
- 900px (tablette portrait)
- 768px (mobile large)
- 480px (mobile standard)
- 380px (très petits écrans)

### Bugs responsive corrigés récemment
- ✅ Lightbox vidéo qui débordait sur l'aside sur mobile (hauteur fixe 55vh)
- ✅ Boutons d'action qui se chevauchaient
- ✅ Filter-bar avec scroll horizontal propre
- ✅ Sélecteurs Teaser/Film qui flex sur 2 boutons côte à côte
- ✅ Modale code d'accès qui s'adapte sur tous écrans

---

## 🐛 Problèmes connus / Pièges fréquents

### 1. Cache navigateur très collant (surtout Safari iOS)
- **Symptôme** : modifs admin ne se reflètent pas côté client
- **Solution** : Réglages iPhone → Apps → Safari → Effacer historique et données

### 2. Clients legacy avec `redirect_url` rempli
- **Symptôme** : les modifs dans l'onglet "Page client" sont ignorées
- **Cause** : l'ancien fichier HTML statique se charge à la place du template dynamique
- **Solution** : vider le `redirect_url` dans l'admin (ou via SQL)

### 3. Fonction Edge `notify-client` non redéployée
- **Symptôme** : erreur "client_id et media_id requis" même sur l'email welcome
- **Cause** : ancienne version de la fonction sur Supabase
- **Solution** : `supabase functions deploy notify-client`

### 4. Migration v8 oubliée
- **Symptôme** : les toggles modules ne s'appliquent pas
- **Test** : `SELECT media_enabled FROM clients LIMIT 1;` → si erreur "column does not exist", relancer migration

### 5. Babel limitation
- Toujours utiliser `catch (e) {}`, jamais `catch {}` (Babel standalone refuse cette syntaxe)

### 6. `CLIENT.mediaEnabled` undefined (bug majeur résolu)
- **Cause** : l'objet `CLIENT` dans communication-app.jsx ne récupérait pas les flags depuis `CLIENT_DATA`
- **Solution** : ajout des 3 lignes `mediaEnabled: D.mediaEnabled !== false`, etc.

---

## 🎬 Configuration des templates dynamiques (event_pages)

### Page photos (`page_type = 'photos'`)
```json
{
  "couple": "Précieuse & Ronny",
  "date": "25 Avril 2026",
  "lieu": "Domaine de Versailles",
  "dateISO": "2026-04-25",
  "cloudName": "dyfa4zztq",
  "rootFolder": "Photos_precieuse-ronny",
  "categories": [
    { "name": "Préparatifs", "folder": "preparatifs", "count": 56 },
    { "name": "Cérémonie", "folder": "ceremonie", "count": 64 }
  ],
  "zipDriveId": "abcXYZ123"
}
```

### Page vidéo standard mariage
```json
{
  "couple": "...", "date": "...", "lieu": "...", "dateISO": "...",
  "afficherTeaser": true, "afficherFilm": true,
  "teaserUrls": {"1080p": "...", "4K": "..."},
  "filmUrls": {"1080p": "...", "4K": "..."},
  "teaserDownloadUrl": "...", "filmDownloadUrl": "...",
  "defaultVideo": "film",
  "upsellBouton": false, "upsellTexte": "...", "upsellLien": "..."
}
```

### Page vidéo anniversaire (champs spécifiques)
```json
{
  "...": "(champs vidéo standard +)",
  "nombreAnnees": 50,
  "typeNoces": "",
  "dateCelebration": "20 Septembre 2025",
  "dateCelebrationISO": "2025-09-20",
  "lieuCelebration": "...",
  "dateMariageOriginal": "20 Septembre 1975"
}
```
La table NOCES est intégrée dans le template (auto-détecte Cuir/Étain/Argent/Or/Diamant…).

### Page vidéo fiançailles (champs spécifiques)
```json
{
  "...": "(champs vidéo standard +)",
  "dateDemande": "14 Février 2026",
  "dateDemandeISO": "2026-02-14",
  "lieuDemande": "Paris, Pont des Arts",
  "dateMariagePrevu": "12 Juin 2027"
}
```

---

## 🧠 Pattern technique important : chargement dynamique

Les templates événement utilisent un pattern spécifique pour attendre la config Supabase :

```js
// Le module charge la config et dispatche un événement
window.WEDDING_CONFIG = cfg;
window.dispatchEvent(new CustomEvent('config-ready'));

// Le script principal est wrappé pour attendre
function __runApp() {
  // ... tout le code ...
}
if (window.WEDDING_CONFIG) __runApp();
else window.addEventListener('config-ready', __runApp);
```

Les fonctions HTML onclick doivent être exposées globalement :
```js
window.closeLightbox = closeLightbox;
window.changeImage = changeImage;
```

---

## 🚧 Sujets en cours / À investiguer

- **Problème notifications** : l'email de bienvenue retourne "client_id et media_id requis" → solution = redéployer la fonction Edge
- (à compléter selon les discussions futures)

---

## 📝 Liste des SQL migrations à avoir lancées

Dans l'ordre :
1. ✅ `migration-v2.sql`
2. ✅ `migration-v3.sql`
3. ✅ `migration-v4.sql`
4. ✅ `migration-v5.sql`
5. ✅ `migration-v6.sql`
6. ✅ `migration-v7.sql`
7. ✅ `migration-v8.sql`
8. ⚙️ `import-legacy-clients.sql` (optionnel, pour migrer les anciens clients)
9. ⚙️ `migrate-to-dynamic.sql` (optionnel, pour basculer un legacy en dynamique)

---

## 📦 À uploader / déployer après chaque grosse modif

**Fichiers HTML / JSX** (sur l'hébergement timelesshouse.org) :
- `index.html`, `mariage.html`, `immobilier.html`, `communication.html`
- `communication-admin.html`, `communication-dashboard.html`, `communication-app.jsx`
- `event-photos.html`, `event-video.html`, `event-anniversary.html`, `event-engagement.html`
- `supabase-config.js`

**Edge Functions** (depuis le terminal local) :
```bash
cd ~/timelesshouse-functions
supabase functions deploy notify-client
supabase functions deploy scheduled-notifications
```

---

## 🎨 Identité visuelle

- Couleur crème principale : `#f5ecdf`
- Accent doré : `#b08968`
- Dark : `#1a1410`
- Base neumorphism : `#e8e9ec`
- Polices : Cormorant Garamond (serif), Manrope / Montserrat (sans-serif)
