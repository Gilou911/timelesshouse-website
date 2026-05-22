# TimelessHouse — Migration vers Vite + Tailwind v4

> **Statut : ✅ migration finalisée — plus aucune dépendance CDN runtime.**
> Build vérifié en local (2436 modules transformés, 9.8 s, dist ≈ 1.7 MB).

---

## 🎯 Ce qui a changé

### 1. Suppression complète des CDN runtime
- `cdn.tailwindcss.com` (Play CDN Tailwind)
- `unpkg.com/@babel/standalone` (Babel navigateur)
- `esm.sh/react`, `esm.sh/react-dom`, `esm.sh/@supabase/supabase-js`,
  `esm.sh/lucide-react`, `esm.sh/recharts`
- Les blocs `<script type="importmap">` ne sont plus nécessaires

### 2. Mise en place du pipeline Vite multi-pages
- `package.json` — déclare les dépendances (React 18.3, Supabase JS 2, Lucide,
  Recharts, Tailwind 4, Vite 5) et expose les scripts `dev` / `build` / `preview`.
- `vite.config.js` — configuration multi-pages déclarant **les 12 fichiers HTML**
  du projet en entrée (et pas seulement les 5 du plan initial : `event-*.html`,
  `immobilier.html`, `demo-toggle.html` sont inclus).
- `style.css` — feuille de style maîtresse avec `@import "tailwindcss";`
  (le compilateur natif Tailwind v4 scanne automatiquement les HTML/JSX pour
  ne livrer que les classes utilisées).

### 3. Variables d'environnement Vite (`.env`)
- Remplacement de l'ancien fichier statique `supabase-config.js` par les
  variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` lues via
  `import.meta.env`.
- Voir `.env.example` pour le template.
- Sécurité : la clé `anon` est conçue pour être publique (protégée par RLS).
  Ne **jamais** mettre la clé `service_role` dans un `VITE_*`.

### 4. Extraction du JSX inline
- Tout le code React de `communication-admin.html` (3 220 lignes dans un
  `<script type="text/babel">`) a été extrait dans **`communication-admin.jsx`**.
- Le HTML l'appelle désormais via :
  ```html
  <script type="module" src="./communication-admin.jsx"></script>
  ```

### 5. Refactor de `communication-dashboard.html`
- L'injection dynamique d'un script Babel a été remplacée par un import
  dynamique ES standard :
  ```js
  await import('./communication-app.jsx');
  ```
- Avantage : Vite compile ça en un vrai `import("./communication-app-<hash>.js")`
  pointant vers le bundle minifié. L'ordre d'exécution est garanti :
  `window.CLIENT_DATA` / `window.__SUPABASE` / `window.__CLIENT` sont déjà
  définis quand le bundle de l'app charge.

### 6. Réécriture des imports `esm.sh` dans les 9 autres pages
- `communication.html`, `index.html`, `mariage.html`, `immobilier.html`,
  `event-engagement.html`, `event-anniversary.html`, `event-video.html`,
  `event-photos.html`, `event-photos-cinematic.html`.
- Chacune utilisait :
  ```js
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
  ```
- Remplacé par le bare specifier que Vite résout au build :
  ```js
  import { createClient } from '@supabase/supabase-js'
  ```

### 7. Injection des variables d'env + rétrocompat
Chaque `<script type="module">` qui consomme Supabase reçoit en préambule :
```js
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Rétrocompatibilité pour les scripts non-module qui lisent window.SUPABASE_*
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
```
Cela permet aux scripts `<script>` classiques (notamment ceux des pages
`event-photos.html` / `event-photos-cinematic.html` qui font des fetch
en bas de page) de continuer à lire `window.SUPABASE_*` comme avant.

### 8. Dossier `public/`
- `preview-bridge.js` y est placé (script classique, non-module, copié
  verbatim vers `dist/`).
- Tout fichier dans `public/` est servi tel quel à la racine du site.

### 9. `portal.jsx`
- Préservé tel quel à la racine en tant que **référence design uniquement**.
- N'est volontairement pas déclaré dans `vite.config.js`, donc non compilé.

---

## 🚀 Commandes

```bash
# 1) Configurer l'environnement (une seule fois)
cp .env.example .env.local
# édite .env.local avec tes vraies clés Supabase

# 2) Installer les dépendances (une seule fois)
npm install

# 3) Mode développement avec hot-reload
npm run dev          # ouvre http://localhost:5173/index.html

# 4) Build de production
npm run build        # génère /dist

# 5) Prévisualiser le build de production en local
npm run preview
```

---

## ☁️ Déploiement Cloudflare Pages

Dans l'interface Cloudflare Pages (Settings → Builds & deployments) :

| Paramètre               | Valeur                |
|-------------------------|-----------------------|
| Build command           | `npm run build`       |
| Build output directory  | `dist`                |
| Root directory          | `/` (laisse vide)     |
| Node.js version         | `≥ 20` (recommandé)   |

Puis dans **Settings → Environment variables → Production** :

| Nom                      | Valeur                                          |
|--------------------------|-------------------------------------------------|
| `VITE_SUPABASE_URL`      | `https://<ton-projet>.supabase.co`              |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (clé anon publique, pas service_role)  |

> Une fois le repo poussé sur GitHub, Cloudflare relance le build automatiquement.

---

## 🔒 Backlog sécurité (rappel du document de passation)

- **RLS Supabase** : vérifier que les politiques sur `clients`, `media`,
  `invoices`, `documents`, `shoots`, `analytics`, `media_comments`
  interdisent à un client d'accéder aux données d'un autre via la clé anon.
- **Edge Functions** : conserver une copie locale du script TypeScript
  `notify-client` pour documenter le contrat des payloads.

---

## 📁 Structure finale

```
timelesshouse/
├── .env.example              # template des variables d'env
├── .gitignore                # ignore .env.local, dist, node_modules…
├── package.json              # deps + scripts Vite
├── vite.config.js            # 12 entrées HTML
├── style.css                 # @import "tailwindcss";
├── README-MIGRATION.md       # ce fichier
│
├── index.html                # — page d'accueil
├── mariage.html              # — landing mariage
├── immobilier.html           # — landing immobilier
├── communication.html        # — entrée espace client
├── communication-admin.html  # — console agence (charge le .jsx via module)
├── communication-admin.jsx   # — code React de la console (3 220 lignes extraites)
├── communication-dashboard.html  # — coquille du dashboard client
├── communication-app.jsx     # — code React du dashboard client (chargé via import dynamique)
├── event-*.html              # — 5 galeries événement
├── demo-toggle.html          # — page démo isolée
│
├── portal.jsx                # — référence design (non compilé)
├── schema.sql                # — schéma Supabase
├── DOCUMENTS-ET-NOTIF-FACTURE.md  # — doc fonctionnelle
│
└── public/
    └── preview-bridge.js     # — script vanilla copié verbatim dans dist/
```
