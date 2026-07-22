# Deux sites, deux déploiements

Depuis le 22/07/2026, ce dépôt produit **deux sites distincts**. Avant,
un seul build servait toutes les pages sur tous les domaines : un client
de VisonMike pouvait afficher les tarifs de La Loge ou le portfolio de
TimelessHouse, et une page créée « pour un seul des deux sites » se
retrouvait de fait sur les deux.

| | Le studio | Le produit |
|---|---|---|
| Qui | TimelessHouse, le studio de Gil | La Loge, vendue aux vidéastes |
| Build | `npm run build:studio` → `dist-studio/` | `npm run build` → `dist/` |
| Config | `vite.config.studio.js` | `vite.config.js` |
| Domaine | `timelesshouse.org` | `laloge.app`, `laloge.house`, `*.laloge.house`, `app.timelesshouse.org` |
| Pages | index, mariage, immobilier, communication, photobooth ×2, portfolio | app, galerie, console, tableau de bord, event-*, offres, inscription, reinitialiser |

**Les clients de TimelessHouse sont sur `app.timelesshouse.org`** — le
studio est un locataire comme un autre, avec son domaine à lui. Les
anciens liens (`timelesshouse.org/galerie?c=…` envoyés par email avant
la séparation) y sont redirigés en 301 par `dist-studio/_redirects`,
généré au build : **ne jamais retirer ces redirections**, des clients
ont ces liens dans leur boîte mail.

## Ajouter une page

1. Créer le `.html` à la racine.
2. La déclarer dans **une seule** des deux configs Vite.
3. L'ajouter à la liste correspondante de `workers/laloge/worker.js`
   (`PAGES_LOGE`, `PAGES_VITRINE`, `PAGES_PARTOUT` ou `PAGES_TIMELESSHOUSE`).

```bash
node workers/laloge/test-portier.mjs
```

Le test refuse de passer si la page n'est déclarée nulle part, si elle
est dans les deux builds, ou si son build et son classement se
contredisent. Il vérifie aussi les 43 règles de routage du portier.

## Mise en service — ✅ FAITE le 22/07/2026

Les deux projets Cloudflare Pages existent et les domaines sont
répartis. La procédure ci-dessous est conservée pour mémoire (et pour
recréer un projet si besoin).



Le projet Cloudflare Pages existant devient **le produit** — rien à y
changer. Il faut créer le second, pour le studio :

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → le dépôt `timelesshouse-website`.
2. Nom : `timelesshouse-studio`.
   Build command : `npm run build:studio`
   Output directory : `dist-studio`
   Variables : les mêmes `VITE_*` que le projet existant.
3. Déployer, vérifier sur l'URL `*.pages.dev` fournie que la vitrine
   s'affiche (et **seulement** la vitrine).
4. **Custom domains** → ajouter `timelesshouse.org` et `www.timelesshouse.org`.
   Cloudflare bascule le domaine sur ce projet.
5. Vérifier aussitôt : `timelesshouse.org` → la vitrine ;
   `timelesshouse.org/app` → redirige vers `app.timelesshouse.org/app` ;
   `app.timelesshouse.org/communication-admin` → la console.

⚠️ L'étape 4 est la bascule. Tant qu'elle n'est pas faite, le studio
n'est visible que sur son URL `*.pages.dev` et rien ne change en
production — c'est le moment de tout vérifier tranquillement.
