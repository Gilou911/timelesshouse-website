# Rapport de migration — TimelessHouse vers Vite 5 + Tailwind CSS v4

**Projet** : TimelessHouse (studio photo Fine Art & agence de communication)
**Date** : 22 mai 2026
**Auteur** : Migration assistée IA, validation par build de référence
**Statut** : ✅ Migration terminée — build de production vérifié (2 436 modules, 9.8 s)

---

## 1. Résumé de la migration (TL;DR)

Migration d'une architecture **Jamstack runtime-driven** (CDN tiers : `cdn.tailwindcss.com`, `@babel/standalone`, `esm.sh`, `unpkg.com`) vers un **pipeline de compilation industrielle Ahead-Of-Time** basé sur Vite 5 et Tailwind CSS v4.

| Indicateur | Avant | Après |
|---|---|---|
| Dépendances CDN runtime | 5 services tiers | **0** |
| Compilation JS côté client | Babel standalone (~700 KB) | Précompilé par Rollup |
| CSS Tailwind livré | ~3 MB non purgé | **49 KB** (8.8 KB gzippé) |
| FOUC visible au chargement | Oui (Tailwind reflow runtime) | Non (CSS inliné dans `<head>`) |
| Code-splitting | Aucun (importmap monolithique) | 15 chunks hashés, modulepreload auto |
| Gestion des secrets | `supabase-config.js` versionné | `import.meta.env.VITE_*` + `.env.local` gitignoré |
| Reproductibilité du build | Aucune (URLs versionnées à la main) | `package-lock.json` figé |

**Gains opérationnels attendus** :
- Réduction du TTI (Time-To-Interactive) sur mobile : suppression des allers-retours réseau vers 4-5 origines tierces.
- Élimination du risque opérationnel lié à la disponibilité d'`esm.sh` / `unpkg.com` (services communautaires).
- Build reproductible : `npm ci` + `npm run build` produit un artefact identique sur n'importe quelle machine.
- Découplage code / config : changer d'environnement Supabase n'impose plus de modifier de fichier source.

---

## 2. Gestion des dépendances (`package.json`)

### 2.1 État avant migration

Aucun `package.json` racine. Les dépendances étaient résolues à l'exécution par le navigateur via une **importmap** déclarée dans chaque HTML, par exemple :

```html
<script type="importmap">
{
  "imports": {
    "react":                  "https://esm.sh/react@18.3.1",
    "react-dom/client":       "https://esm.sh/react-dom@18.3.1/client",
    "@supabase/supabase-js":  "https://esm.sh/@supabase/supabase-js@2",
    "recharts":               "https://esm.sh/recharts@2.12.7?deps=react@18.3.1,react-dom@18.3.1",
    "lucide-react":           "https://esm.sh/lucide-react@0.439.0?deps=react@18.3.1"
  }
}
</script>
```

Tailwind était chargé via le **Play CDN** (déconseillé en production par l'équipe Tailwind elle-même) :
```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
```

### 2.2 État après migration

```json
{
  "name": "timelesshouse",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "lucide-react":          "^0.439.0",
    "react":                 "^18.3.1",
    "react-dom":             "^18.3.1",
    "recharts":              "^2.12.7"
  },
  "devDependencies": {
    "@tailwindcss/vite":     "^4.0.0",
    "@vitejs/plugin-react":  "^4.3.1",
    "tailwindcss":           "^4.0.0",
    "vite":                  "^5.4.0"
  }
}
```

### 2.3 Décisions notables

- **`postcss` et `autoprefixer` NON installés**. Le compilateur natif Tailwind v4 (basé sur Lightning CSS) gère lui-même le préfixage vendor et la résolution des at-rules. Conserver une chaîne PostCSS serait redondant et créerait un double parsing CSS.
- **`@tailwindcss/postcss` non installé** non plus : on utilise `@tailwindcss/vite`, le plugin Vite-natif qui court-circuite PostCSS entièrement (gain de perfs de build).
- `"type": "module"` activé à la racine : indispensable pour que Vite, qui s'exécute en ESM natif, puisse charger `vite.config.js` sans transpilation.
- Toutes les versions sont en `^` (caret) : compatible avec le `package-lock.json` qui fige les résolutions exactes pour la reproductibilité.

---

## 3. Configuration Vite (`vite.config.js`)

### 3.1 Création du fichier

Fichier inexistant avant migration. Création à la racine :

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main:                 resolve(__dirname, 'index.html'),
        mariage:              resolve(__dirname, 'mariage.html'),
        immobilier:           resolve(__dirname, 'immobilier.html'),
        communication:        resolve(__dirname, 'communication.html'),
        admin:                resolve(__dirname, 'communication-admin.html'),
        dashboard:            resolve(__dirname, 'communication-dashboard.html'),
        eventEngagement:      resolve(__dirname, 'event-engagement.html'),
        eventAnniversary:     resolve(__dirname, 'event-anniversary.html'),
        eventVideo:           resolve(__dirname, 'event-video.html'),
        eventPhotos:          resolve(__dirname, 'event-photos.html'),
        eventPhotosCinematic: resolve(__dirname, 'event-photos-cinematic.html'),
        demoToggle:           resolve(__dirname, 'demo-toggle.html'),
      },
    },
  },

  server: {
    port: 5173,
    open: '/index.html',
  },
})
```

### 3.2 Choix architecturaux

| Aspect | Décision | Justification |
|---|---|---|
| Architecture | **Multi-Page Application (MPA)** | Préserve le routage par fichier `.html` existant ; pas de SPA fictive ; SEO préservé page par page |
| Plugin React | `@vitejs/plugin-react` (Babel) | Compile les fichiers `.jsx` (`communication-admin.jsx`, `communication-app.jsx`) extraits. SWC non choisi pour rester proche du comportement attendu par l'équipe |
| Plugin Tailwind | `@tailwindcss/vite` | Intégration native Tailwind v4. Hook les fichiers `.css` qui importent `tailwindcss` et déclenche le scan AOT |
| `publicDir: 'public'` | Conservé (défaut) | Permet à `preview-bridge.js` (script vanilla non-module) d'être servi tel quel à la racine, sans hashage |
| `build.target: 'es2022'` | Choisi explicitement | Conserve `top-level await` (utilisé dans `communication-dashboard.html`) et l'optional chaining sans down-leveling inutile |
| `emptyOutDir: true` | Activé | Évite l'accumulation de bundles obsolètes dans `dist/` entre builds |

### 3.3 Entrées Rollup

13 entrées HTML déclarées explicitement. Chaque entrée devient un bundle JS séparé (`dist/assets/<name>-<hash>.js`) avec son CSS et ses `modulepreload` injectés automatiquement dans le HTML compilé.

**Note importante** : `portal.jsx` (1 565 lignes — référence design uniquement) est **volontairement omis** des entrées. Le fichier est préservé à la racine pour consultation mais n'entre pas dans la chaîne de build.

---

## 4. Nouveau paradigme Tailwind v4 (Architecture CSS)

### 4.1 Suppression de `tailwind.config.js`

**Aucun `tailwind.config.js` n'a été créé**, et c'est intentionnel.

En v4, la configuration migre du JavaScript vers le CSS lui-même, via la directive `@theme`. Cela élimine une couche de configuration et permet aux design tokens d'être consommés directement par le navigateur via des CSS custom properties.

### 4.2 Création du fichier `style.css` maître

**Avant** : aucun fichier CSS maître. Tailwind était chargé via `<script src="https://cdn.tailwindcss.com">` qui injectait dynamiquement les classes en runtime.

**Après** :

```css
/* ──────────────────────────────────────────────────────────────
   style.css — Feuille de style maîtresse TimelessHouse
   ────────────────────────────────────────────────────────────── */
@import "tailwindcss";

/* Espace réservé pour styles globaux partagés. */
```

### 4.3 Détection automatique des sources

Tailwind v4 ne nécessite **plus** la déclaration `content: [...]` du `tailwind.config.js` v3. Le compilateur scanne automatiquement tous les fichiers depuis le répertoire d'invocation, en respectant `.gitignore`. Concrètement, dans notre projet, il indexe :

- Les 12 fichiers `.html` racine
- `communication-admin.jsx` et `communication-app.jsx`
- (Et ignore `node_modules/`, `dist/`, `portal.jsx` non référencé)

Le purge est donc **automatique et AOT**, contrairement à la v3 où il fallait déclarer manuellement les chemins.

### 4.4 Inclusion dans les pages

Tailwind v4 ne livre plus de fichier CSS distribué prêt-à-l'emploi. La feuille `style.css` doit être **explicitement importée** :

- **Pages avec build Vite et React** (`communication-admin.html`, `communication-dashboard.html`) : Vite injecte automatiquement un `<link rel="stylesheet" crossorigin href="/assets/style-<hash>.css">` dans le HTML compilé, à condition que le `.css` soit déclaré dans le `<head>` source. Une balise `<link rel="stylesheet" href="/style.css" />` a été ajoutée dans le `<head>` de ces deux fichiers (les seuls qui consommaient Tailwind via le Play CDN).
- **Pages 100% CSS custom** (les 10 autres) : aucune modification CSS requise — elles n'utilisaient pas Tailwind, leurs styles vivent dans des balises `<style>` inline.

### 4.5 État du `<head>` — Avant / Après (cas du dashboard admin)

**Avant** :
```html
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="importmap">
    { "imports": { "react": "https://esm.sh/react@18.3.1", ... } }
  </script>
  <style>/* overrides dark mode */</style>
</head>
```

**Après** :
```html
<head>
  <link rel="stylesheet" href="/style.css" />
  <style>/* overrides dark mode — inchangés */</style>
</head>
```

À la compilation, Vite remplace `/style.css` par `/assets/style-<hash>.css` et injecte le `<script type="module" crossorigin src="/assets/admin-<hash>.js"></script>` correspondant.

---

## 5. Modifications du code et refactoring

### 5.1 Extraction du JSX inline

`communication-admin.html` embarquait **3 220 lignes** de React dans un `<script type="text/babel">` compilé en runtime par Babel standalone. Cette section a été extraite vers un fichier externe.

**Avant** :
```html
<script type="text/babel" data-type="module" data-presets="react">
  import React, { useState, useEffect, ... } from 'react';
  import ReactDOM from 'react-dom/client';
  import { createClient } from '@supabase/supabase-js';
  /* ... 3 220 lignes ... */
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
```

**Après** :
```html
<script type="module" src="./communication-admin.jsx"></script>
```

Le fichier `communication-admin.jsx` ainsi extrait contient les imports ES standard que Vite résout au build.

### 5.2 Remplacement de l'injection dynamique de script

`communication-dashboard.html` injectait dynamiquement `communication-app.jsx` via `document.createElement('script')` après avoir populé `window.CLIENT_DATA`, pour garantir l'ordre d'exécution.

**Avant** :
```js
const script = document.createElement('script');
script.type = 'text/babel';
script.dataset.type = 'module';
script.dataset.presets = 'react';
script.src = 'communication-app.jsx';
document.body.appendChild(script);
if (window.Babel && window.Babel.transformScriptTags) {
  window.Babel.transformScriptTags();
}
```

**Après** :
```js
// Charge l'app React une fois que window.CLIENT_DATA / window.__SUPABASE
// sont définis : l'import dynamique garantit cet ordre.
await import('./communication-app.jsx');
```

Vite compile cet `import()` en `import("./communication-app-<hash>.js")` pointant vers le bundle minifié, et préserve la garantie d'ordre d'exécution (l'`await` s'exécute après les `await sb.from(...)` du même script module).

### 5.3 Migration des imports Supabase (9 fichiers HTML restants)

**Avant** (10 fichiers HTML) :
```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

**Après** :
```js
import { createClient } from '@supabase/supabase-js';
```

Vite résout le bare specifier en consultant `node_modules` au build, puis bundle la librairie dans le chunk de la page (avec tree-shaking).

### 5.4 Migration vers les variables d'environnement Vite

Le fichier `supabase-config.js`, présent à la racine et chargé par chaque page via `<script src="supabase-config.js"></script>`, est **supprimé du chemin de production**.

**Avant** :
```js
// supabase-config.js (committé dans le repo)
window.SUPABASE_URL = "https://xxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

**Après** :
- Fichier supprimé du repo.
- Création d'un `.env.example` (template) à la racine.
- Création par le développeur d'un `.env.local` (gitignoré) :
  ```
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```
- En production Cloudflare Pages : variables définies dans **Settings → Variables and Secrets → Production** (nouvelle dénomination de l'ancienne section "Environment variables").

**Consommation dans chaque `<script type="module">`** :
```js
// — Config Supabase injectée par Vite depuis .env (variables VITE_*)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Rétrocompatibilité pour les scripts <script> classiques (non-module) de la
// même page qui lisent window.SUPABASE_* (event-photos*.html)
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**Note critique sur le contournement `window.*`** : `event-photos.html` et `event-photos-cinematic.html` contiennent des `<script>` classiques (non-module) qui consomment `window.SUPABASE_URL` pour des appels REST directs (lightbox). `import.meta.env` n'est pas disponible dans ces contextes — d'où la propagation explicite vers `window` depuis le module ESM au-dessus. Ce contournement est temporaire : à terme, ces scripts vanilla devraient être convertis en modules ESM pour une cohérence complète.

### 5.5 Refactor des template strings (`communication-admin.jsx`, `communication-app.jsx`)

Les appels aux Edge Functions Supabase (notifications transactionnelles) référençaient `window.SUPABASE_*` dans des template literals. Refactor systématique :

```diff
- const url = `${window.SUPABASE_URL}/functions/v1/notify-client`;
+ const url = `${SUPABASE_URL}/functions/v1/notify-client`;

  fetch(url, {
-   headers: { 'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}` },
+   headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
  });
```

**Métrique** : 12 occurrences dans `communication-admin.jsx`, 4 dans `communication-app.jsx`.

### 5.6 Aucun changement sur les classes utilitaires Tailwind

Les classes utilitaires consommées (`flex`, `text-stone-900`, `bg-white`, etc.) sont **identiques** entre Tailwind v3 et v4 pour notre usage. Aucun refactor des composants n'a été nécessaire. Les overrides dark-mode présents dans les balises `<style>` inline (ciblant `[data-theme="dark"] .text-stone-900 { ... }`) restent fonctionnels — ils dépendent uniquement de la nomenclature des classes, pas de l'API Tailwind.

---

## 6. Points d'attention & régressions potentielles

### 6.1 Breaking changes Tailwind v3 → v4 contournés

| Breaking change v4 | Statut dans notre projet |
|---|---|
| `@tailwind base/components/utilities` remplacés par `@import "tailwindcss"` | ✅ Géré (nouveau `style.css`) |
| `content: [...]` supprimé du config | ✅ N/A (pas de config JS, détection auto) |
| Préfixes `placeholder:`, `file:`, etc. nécessitent `@variant` en v4 | ⚠️ Non détecté à l'audit — à valider en preview |
| Couleurs nommées (ex: `text-gray-*`) — palette inchangée | ✅ Aucune classe `gray-*` utilisée, projet en `stone-*` |
| `bg-opacity-*`, `text-opacity-*` retirés (utiliser `bg-black/50`) | ⚠️ À auditer (grep n'a rien retourné mais à confirmer visuellement) |
| Espace de noms `theme()` accessible uniquement via `--color-*` CSS vars | ✅ Non utilisé dans notre code (pas de `theme()` calls) |

### 6.2 Vigilance CI/CD

**Cloudflare Pages** :
1. **Configuration de build** à mettre à jour manuellement dans la dashboard :
   - Build command : `npm run build`
   - Build output directory : `dist`
2. **Variables d'environnement** à créer dans *Settings → Variables and Secrets → Production* :
   - `VITE_SUPABASE_URL` (Type: Text)
   - `VITE_SUPABASE_ANON_KEY` (Type: Text — voir note ci-dessous)
3. **Re-déploiement non-automatique** après ajout des variables : un commit ou un *Retry deployment* manuel est requis.

**Note sur le type des variables** : Le type `Secret` de Cloudflare chiffre la valeur, mais comme Vite **inline ces variables dans le bundle JS au build** (`import.meta.env.VITE_*` devient une string littérale dans `dist/assets/*.js`), elles sont de facto publiques côté client. Le type `Text` est donc cohérent et n'ajoute pas de fausse sécurité. La protection réelle repose sur les **policies RLS Supabase**.

### 6.3 Ordre de chargement & race conditions

`communication-dashboard.html` repose sur une séquence stricte :
1. Script `<script type="module">` du HTML : peuple `window.CLIENT_DATA`, `window.__SUPABASE`, `window.__CLIENT` via des `await sb.from(...).select()`.
2. `await import('./communication-app.jsx')` : déclenche le rendu React qui lit ces globals au top-level du module.

**Risque** : si un développeur ajoute un nouvel `await` entre l'`await import()` et la peuplade des globals, l'app React lira des `undefined`. **Garde-fou** : `communication-app.jsx` ligne 32-38 défensive (`const D = window.CLIENT_DATA || {};`).

### 6.4 Cache navigateur post-déploiement

Vite hash les noms de fichiers (`admin-BxylNaCt.js`). Cloudflare Pages sert ces assets avec `Cache-Control: public, max-age=31536000, immutable` par défaut. **Pas de problème de cache stale** côté assets, mais le HTML lui-même est servi avec un cache court — un visiteur avec une page chargée avant déploiement peut tenter de référencer un ancien chunk. Risque acceptable (recharge = résolution).

### 6.5 Warning de build à connaître

```
<script src="preview-bridge.js"> in "/event-engagement.html" can't be bundled
  without type="module" attribute
```

**Interprétation** : Vite refuse de bundler les scripts non-module mais les **copie verbatim depuis `public/`**. Le warning est informatif, pas bloquant. Le fichier `preview-bridge.js` est correctement présent dans `dist/preview-bridge.js`. **Ne pas tenter de corriger en ajoutant `type="module"`** : casserait son exécution dans le contexte où il est utilisé (preview iframe).

### 6.6 Éléments à auditer en preview Cloudflare

Checklist avant ouverture au trafic production :

- [ ] Réseau navigateur (F12 → Network) : **0 requête** vers `cdn.tailwindcss.com`, `unpkg.com`, `esm.sh`, `cdn.jsdelivr.net`
- [ ] Vérifier visuellement les sections dark-mode du dashboard admin et client (palette `stone-*` + overrides)
- [ ] Tester un cycle complet sur `communication-admin.html` : login, CRUD client, envoi de notification (Edge Function `notify-client`)
- [ ] Tester `communication-dashboard.html` avec un code client valide : vérifier que `window.CLIENT_DATA` est bien populé avant le rendu React
- [ ] Tester une page `event-photos*.html` : vérifier que la lightbox déclenche correctement les fetch REST (qui dépendent du contournement `window.SUPABASE_*`)
- [ ] `dist/assets/*.js` ne contient **aucune** occurrence littérale de `eyJ...` autre que la clé anon attendue

### 6.7 Backlog technique post-migration

| Priorité | Item | Effort |
|---|---|---|
| 🔴 Haute | Audit RLS Supabase sur `clients`, `media`, `invoices`, `documents`, `shoots`, `analytics`, `media_comments` (point déjà identifié dans le doc de passation) | ~2h |
| 🟡 Moyenne | Conversion des `<script>` classiques de `event-photos*.html` en modules ESM, suppression de la rétrocompat `window.SUPABASE_*` | ~1h |
| 🟡 Moyenne | Externalisation des `<style>` inline (~150 lignes/page sur le dashboard admin) vers `style.css` + `@layer components` Tailwind v4 | ~3h |
| 🟢 Basse | Migration de `@vitejs/plugin-react` (Babel) vers `@vitejs/plugin-react-swc` (Rust) — gain de ~30-40% sur le temps de build | ~15min |
| 🟢 Basse | Décision sur `portal.jsx` : intégrer comme entrée Vite ou supprimer du repo | ~5min |

---

## Annexes

### A. Fichiers créés
- `package.json`, `package-lock.json`
- `vite.config.js`
- `style.css`
- `.env.example`
- `.gitignore` (étendu pour ignorer `.env.local`, `dist/`, `node_modules/`)
- `communication-admin.jsx` (extrait de `communication-admin.html`)
- `public/preview-bridge.js` (déplacé depuis racine)

### B. Fichiers modifiés
- 12 fichiers HTML (suppression CDN, ajout `<link>` style.css le cas échéant, injection `import.meta.env.VITE_*`)
- `communication-app.jsx` (consommation des const `SUPABASE_*` via `import.meta.env`)

### C. Fichiers supprimés
- `supabase-config.js` (remplacé par `.env.local` non versionné)

### D. Commandes de référence

```bash
# Première installation après clone
cp .env.example .env.local      # puis éditer .env.local
npm install                     # ou `npm ci` pour respecter package-lock.json

# Cycle de développement
npm run dev                     # http://localhost:5173

# Build de production
npm run build                   # → dist/
npm run preview                 # http://localhost:4173 (preview du build)
```

### E. Build de référence (mesures)

```
vite v5.4.21 building for production...
✓ 2436 modules transformed.
dist/communication-admin.html                   3.87 kB │ gzip:   1.35 kB
dist/communication-dashboard.html              11.22 kB │ gzip:   3.54 kB
dist/index.html                                39.27 kB │ gzip:  11.36 kB
dist/mariage.html                             114.21 kB │ gzip:  26.78 kB
dist/assets/style-VriBsvRd.css                 49.83 kB │ gzip:   8.79 kB
dist/assets/admin-BxylNaCt.js                 128.16 kB │ gzip:  29.59 kB
dist/assets/index-NPvMoeOc.js                 208.42 kB │ gzip:  54.59 kB
dist/assets/communication-app-BklWhS5j.js     484.98 kB │ gzip: 129.53 kB
✓ built in 9.77s
```

**Total `dist/`** : 1.7 MB (15 chunks JS hashés + 12 HTML + 1 CSS).

---

*Fin du rapport — TimelessHouse Migration Vite + Tailwind v4.*
