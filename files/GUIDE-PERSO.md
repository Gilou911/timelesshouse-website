# Espace perso — perso.timelesshouse.org

> Tes pages privées type Notion : des pages hiérarchiques faites de blocs,
> que tu écris et partages arbre par arbre. Construit le 29/07/2026.

## Ce que c'est

- **Toi (propriétaire)** : tu crées des pages racines, des sous-pages, des blocs
  (titres, texte, listes, cases à cocher, citation, séparateur, image, lien).
  Tout s'enregistre tout seul pendant que tu tapes.
- **Tes invités** : tu les invites par email depuis la modale « Partager » d'une
  page racine, en **Lecture** ou en **Édition**. Ils reçoivent un lien magique —
  aucun mot de passe à retenir. Chaque accès se révoque d'un geste.
- **Le lien secret** : chaque arbre peut aussi avoir un lien de lecture
  anonyme (`/?t=…`), activable/coupable/régénérable. Fermé par défaut.
- Personne d'autre ne voit rien : tout est verrouillé par RLS en base, la page
  est noindex (meta + en-tête `X-Robots-Tag`).

## Ce qui est déjà fait

- 3ᵉ build : `npm run build:perso` → `dist-perso/` (app dans `perso/`,
  config `vite.config.perso.js`) ; les builds studio et loge n'ont pas bougé
  (test-portier vert).
- Edge function **perso-invite déployée** sur Supabase (liens magiques +
  invitations, contrôles dans le code, `verify_jwt=false` dans config.toml).
- Migration SQL **écrite mais PAS exécutée** :
  `supabase/migrations/20260729000000_perso.sql`.

## Tes 3 actions, dans l'ordre

### ① SQL Editor (Supabase → SQL Editor)

1. Coller et exécuter `supabase/migrations/20260729000000_perso.sql`.
2. **Rejouer aussitôt `files/migration-2fa-rls.sql`** (la migration crée des
   tables → le verrou aal2 doit les couvrir). Vérifier que les `perso_%`
   sortent dans sa liste.
3. Lancer le bloc ✅ VÉRIFICATION en fin de migration. Le point 3 doit rendre
   **1** : c'est toi, semé par l'email `service@timelesshouse.org`. S'il rend 0,
   ton compte console vit sous une autre adresse — corriger l'email au ⑧ du
   fichier et rejouer (il est idempotent).

### ② Redirect URLs (Supabase → Authentication → URL Configuration)

Ajouter aux **Redirect URLs** (sans toucher au Site URL) :

- `https://perso.timelesshouse.org/**`
- `https://timelesshouse-perso.pages.dev/**`
- `http://localhost:4175/**`

⚠️ À faire AVANT tout test d'email : un `redirect_to` hors liste retombe en
silence sur le Site URL — le lien magique atterrirait sur La Loge.

### ③ Projet Cloudflare Pages (après le git push)

Recette DEUX-SITES.md § Mise en service, adaptée :

1. Workers & Pages → Create → Pages → **Connect to Git** → dépôt
   `timelesshouse-website`.
2. Nom du projet : **`timelesshouse-perso`**.
3. Build command : `npm run build:perso` · Output : `dist-perso`.
4. Variables d'environnement : les mêmes `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` que les deux autres projets.
5. Vérifier `timelesshouse-perso.pages.dev` : l'app s'affiche, et SEULEMENT elle.
6. Custom domains → **`perso.timelesshouse.org`** (le DNS suit tout seul).

## Comment tu t'y connectes

Comme tes invités (email → lien magique), ou par le repli « J'ai un mot de
passe » avec ton compte console. Ta double vérification TOTP s'applique : après
le lien ou le mot de passe, l'app te demande ton code à 6 chiffres.

## Recette après mise en service (on la fait ensemble)

- [ ] Connexion mot de passe + TOTP → accueil → créer une racine + 2 sous-pages
- [ ] Chaque type de bloc · réordonner ↑/↓ · recharger la page (autosave)
- [ ] Inviter un email de test en Lecture → l'email arrive → il ne voit QUE
      son arbre, aucun bouton d'édition
- [ ] Passer ce même invité en Édition → il modifie ; le révoquer → plus rien
- [ ] Lien secret : activer → ouvrir en navigation privée → couper → « Lien
      inactif » → régénérer → l'ancien lien est mort
- [ ] `curl -I https://perso.timelesshouse.org` → `X-Robots-Tag: noindex`

## v1 / v2

- **v1 — images par URL collée** : `b2-sign` est réservé aux membres d'agence
  avec une liste fermée de préfixes ; un invité serait rejeté. (Ta règle
  « jamais d'URL pour un locataire » vise les locataires — ici c'est ton espace
  privé.)
- **v2 — upload direct** : brancher un préfixe `perso/<racine_id>/` dans
  `b2-sign` (autorisé au propriétaire OU à un éditeur de l'arbre), ajouter
  `https://perso.timelesshouse.org` aux origines des DEUX scripts CORS
  (`setup-b2-cors-native.mjs` ET `setup-b2-cors.mjs`) puis exécuter
  `node scripts/setup-b2-cors-native.mjs`.
- Autres suites naturelles : commentaires, déplacement de pages entre arbres,
  drag-and-drop, bases de données (tables/kanban).
