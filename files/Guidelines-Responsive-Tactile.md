# 📱 Bible Responsive & Tactile — Guidelines & Checklist

> **Document de référence** pour garantir que chaque page (actuelle et future) soit 100 % responsive et **irréprochable au doigt**.
> À injecter dès la première ligne de code. Mobile-first par défaut.

---

## Sommaire

1. [Les bases du responsive moderne](#1--les-bases-du-responsive-moderne)
2. [L'excellence sur appareils tactiles](#2--lexcellence-sur-appareils-tactiles)
3. [Les anti-patterns à bannir](#3--les-anti-patterns-à-bannir)
4. [Fluidité & performances perçues](#4--fluidité--performances-perçues)
5. [Le Reset CSS à injecter partout](#5--le-reset-css-à-injecter-partout)
6. [Checklist de validation finale (10 points)](#6--checklist-de-validation-finale)

---

## 1. 📐 Les bases du responsive moderne

### 1.1 La balise `<meta viewport>` — les règles d'or

C'est la fondation. Une seule ligne, mais elle conditionne tout le reste.

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Les règles non négociables :**

- ✅ **Toujours** `width=device-width, initial-scale=1.0`.
- ✅ **Ajouter `viewport-fit=cover`** : indispensable pour gérer les encoches (notch) et les coins arrondis. Débloque l'usage de `env(safe-area-inset-*)`.
- 🚫 **Ne JAMAIS** mettre `user-scalable=no` ni `maximum-scale=1.0`. Cela **bloque le zoom à deux doigts** des utilisateurs malvoyants → violation d'accessibilité (WCAG) et expérience punitive. Le zoom accidentel se gère par d'autres moyens (voir §2.3), pas en mutilant le viewport.

### 1.2 Typographie fluide avec `clamp()`

`clamp(MIN, VALEUR_IDÉALE, MAX)` permet une taille de police qui grandit avec l'écran, sans media queries et sans paliers brutaux.

```css
:root {
  /* La valeur idéale combine TOUJOURS une part fixe (rem) + une part fluide (vw) */
  --fs-body:    clamp(1rem,    0.95rem + 0.4vw, 1.125rem);
  --fs-titre:   clamp(1.75rem, 1.2rem  + 2.8vw, 3.5rem);
  --fs-display: clamp(2.5rem,  1.5rem  + 5vw,   6rem);
}

body { font-size: var(--fs-body); }
h1   { font-size: var(--fs-display); line-height: 1.1; }
```

**Le piège à éviter :** ne jamais écrire une valeur idéale en `vw` pur (ex. `clamp(1rem, 4vw, 2rem)`). Il **faut** une part en `rem` au milieu (`0.95rem + 0.4vw`). Sinon, le texte **ne grossit plus quand l'utilisateur zoome** sur la page → blocage d'accessibilité.

> 💡 Astuce : `line-height` se règle bien en valeur **sans unité** (`1.1`, `1.5`) — il s'adapte alors proportionnellement à chaque taille de police.

### 1.3 Unités relatives & dynamiques — quoi utiliser et quand

| Unité | Usage recommandé | Pourquoi |
|---|---|---|
| `rem` | Tailles de police, marges, paddings, rayons | Respecte la taille de police système de l'utilisateur. **L'unité par défaut.** |
| `em` | Espacement **relatif au texte courant** (icône à côté d'un mot) | Suit la taille du parent. |
| `%` / `fr` / `minmax()` | Largeurs de colonnes, grilles | Fluide par nature. `fr` (Grid) et `minmax()` évitent les débordements. |
| `ch` | Largeur de lignes de texte (`max-width: 65ch`) | Lisibilité optimale (~45-75 caractères). |
| `dvh` / `svh` / `lvh` | Hauteurs « plein écran » sur mobile | **Remplace `vh`** (voir le piège du `100vh` en §3.3). |
| `px` | Bordures de 1px, ombres fines, détails non-scalables | Quand le pixel exact compte vraiment. |
| `vw` | À manier avec prudence | ⚠️ Provoque souvent du scroll horizontal (inclut la barre de scroll). Préférer `%`. |

**Règle d'or anti-cassure :** pour les largeurs, raisonner en **`max-width` + `%`** plutôt qu'en `width` fixe. Un bloc ne doit jamais pouvoir être plus large que son conteneur.

```css
.conteneur {
  width: 100%;
  max-width: 1200px;   /* plafond sur grand écran */
  margin-inline: auto; /* centré */
  padding-inline: clamp(1rem, 4vw, 3rem); /* gouttières fluides */
}
```

---

## 2. 👆 L'excellence sur appareils tactiles

> **Le cœur du sujet.** Un doigt n'est pas une souris : pas de survol, pas de précision au pixel, et des gestes natifs (zoom, pull-to-refresh) qui peuvent parasiter l'interface.

### 2.1 Gérer les hovers — bannir les effets fantômes

Sur tactile, un `:hover` reste « collé » après le tap (effet fantôme), ou exige un **double tap** (premier tap = survol, second = clic). La solution est d'**isoler tous les styles de survol** dans une media query qui ne cible que les vrais dispositifs de pointage fin.

```css
/* Style de base : valable partout (mobile + desktop) */
.bouton {
  background: var(--graphite);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

/* ✅ Le survol N'EST appliqué QUE sur souris / trackpad précis */
@media (hover: hover) and (pointer: fine) {
  .bouton:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }
}

/* Sur tactile, on donne un retour visuel au TAP (état actif) à la place */
.bouton:active {
  transform: scale(0.97);
}
```

**À retenir :**

- `hover: hover` → l'appareil peut survoler de façon fiable (souris).
- `pointer: fine` → le pointeur est précis (souris/stylet), par opposition à `coarse` (doigt).
- Sur mobile, **remplacer le feedback de hover par un feedback de `:active`** (effet d'enfoncement au tap). C'est plus naturel.

### 2.2 Zones de clic (Tap Targets) — tailles & espacement

Un doigt fait environ **9-10 mm** de large. Une cible trop petite = clics ratés et frustration.

**Standards officiels :**

| Référentiel | Taille minimale |
|---|---|
| Apple (Human Interface Guidelines) | **44 × 44 pt** |
| Google (Material Design) | **48 × 48 dp** |
| WCAG 2.1 (niveau AAA, critère 2.5.5) | **44 × 44 px CSS** |

**Recommandation pratique : viser 48 px, avec au moins 8 px d'espacement entre deux cibles.**

```css
.tap-target {
  min-height: 48px;
  min-width: 48px;
  /* Centrer le contenu visuel dans la zone tactile */
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Astuce : agrandir la zone tactile SANS agrandir le visuel,
   via un pseudo-élément invisible (utile pour petites icônes) */
.icone-action {
  position: relative;
}
.icone-action::after {
  content: "";
  position: absolute;
  inset: -12px; /* étend la zone cliquable de 12px tout autour */
}

/* Espacement entre éléments interactifs adjacents */
.liste-actions > * + * {
  margin-top: 8px;
}
```

> 💡 Penser aussi aux **liens dans le texte** et aux **petits boutons de fermeture (×)** : ce sont les coupables les plus fréquents de clics ratés.

### 2.3 Gestuelle & scroll avec `touch-action`

`touch-action` indique au navigateur quels gestes natifs il a le droit d'interpréter sur un élément. C'est l'outil clé pour **supprimer le double-tap-zoom, le zoom accidentel et le pull-to-refresh parasite**.

```css
/* Sur les éléments interactifs : supprime le délai de 300ms du
   double-tap-pour-zoomer, sans casser le scroll/pinch global */
button, a, .clickable, .tap-target {
  touch-action: manipulation;
}

/* Sur un carrousel/galerie horizontal : autoriser UNIQUEMENT
   le swipe vertical de la page → pas de conflit avec le drag horizontal */
.carrousel {
  touch-action: pan-y;
}

/* Sur une zone de dessin / signature / lightbox custom :
   le navigateur ne fait RIEN, tout est géré en JS */
.canvas-custom {
  touch-action: none;
}
```

| Valeur | Effet |
|---|---|
| `manipulation` | Autorise scroll + pinch-zoom, **supprime le double-tap-zoom et le délai 300ms**. ✅ À mettre sur quasi tous les boutons/liens. |
| `pan-y` | N'autorise que le défilement vertical. Idéal sous un slider horizontal. |
| `pan-x` | N'autorise que le défilement horizontal. |
| `none` | Bloque tous les gestes natifs (zoom, scroll, swipe). À réserver aux composants 100 % gérés en JS. |

**Pull-to-refresh parasite** (la page se recharge quand on tire vers le bas en haut de l'écran) :

```css
html, body {
  overscroll-behavior-y: contain; /* coupe le pull-to-refresh natif */
}

/* Sur une zone scrollable interne (modale, panneau), éviter que le
   scroll « fuie » vers la page derrière (scroll chaining) */
.modale-scrollable {
  overscroll-behavior: contain;
}
```

---

## 3. 🚫 Les anti-patterns à bannir

### 3.1 Éradiquer le scroll horizontal accidentel

Le scroll horizontal « fantôme » vient quasi toujours d'**un seul élément trop large** qui dépasse de quelques pixels. La stratégie est défensive : empêcher tout débordement à la source.

**Les 4 causes habituelles et leurs parades :**

1. **`box-sizing` non réinitialisé** → un padding/border ajoute de la largeur.
2. **Médias sans plafond** → une image plus large que l'écran.
3. **Enfants flex/grid qui refusent de rétrécir** → débordement de texte/contenu.
4. **Valeurs en `100vw`** → `vw` inclut la barre de scroll, donc dépasse de ~15px.

```css
/* 1. box-sizing universel : la largeur inclut padding + border */
*, *::before, *::after {
  box-sizing: border-box;
}

/* 2. Tout média reste dans son conteneur */
img, video, svg, canvas, iframe {
  max-width: 100%;
  height: auto; /* préserve le ratio (attention aux exceptions Tailwind, cf. note) */
  display: block;
}

/* 3. Le piège n°1 du flex/grid : les enfants ont min-width: auto par défaut,
   ce qui les empêche de rétrécir sous leur contenu → débordement */
.flex-enfant, .grid > * {
  min-width: 0;
}

/* 4. Garde-fou global, en DERNIER recours (voir avertissement ci-dessous) */
html, body {
  overflow-x: hidden;
  width: 100%;
}
```

> ⚠️ **`overflow-x: hidden` global n'est PAS la solution, c'est le filet de sécurité.** Il masque le symptôme mais peut **casser `position: sticky`** et empêcher de repérer l'élément fautif. Toujours d'abord **trouver et corriger le coupable** (les points 1 à 3). Pour le débusquer :
> ```css
> /* Outil de debug à activer temporairement : entoure tout en rouge */
> * { outline: 1px solid red !important; }
> ```
> ou en console : repérer l'élément dont `scrollWidth > clientWidth`.

> 📝 **Note pour ton stack (Tailwind v4) :** tu as déjà rencontré des conflits entre une règle globale `height: auto` et les utilitaires Tailwind. Si `height: auto` sur les médias entre en conflit avec une classe de hauteur Tailwind, cible le cas précis plutôt que de généraliser, comme tu le fais déjà avec des exceptions ciblées.

### 3.2 Éviter le Scroll-Jacking

Le **scroll-jacking** = détourner le comportement de défilement natif (vitesse imposée, défilement par « sections » forcé, inertie remplacée). C'est une **mauvaise pratique UX** :

- ❌ Casse l'inertie/momentum naturel auquel l'utilisateur s'attend (surtout sur tactile et trackpad).
- ❌ Désoriente, donne une impression de « lag » ou de perte de contrôle.
- ❌ Rend la barre de scroll mensongère (la position ne correspond plus au contenu).
- ❌ Catastrophique pour l'accessibilité (navigation clavier, lecteurs d'écran).

**Les règles :**

- ✅ Laisser le scroll natif faire son travail. Pour des effets liés au défilement, utiliser les outils **passifs** : `position: sticky`, l'**`IntersectionObserver`** (apparition d'éléments), et les **Scroll-driven animations** CSS (`animation-timeline: scroll()` / `view()`) là où c'est supporté.
- ✅ **Toujours** respecter la préférence système de réduction de mouvement :

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- 🚫 Ne pas remplacer le scroll par un `wheel` event handler qui repositionne la page manuellement.
- ⚠️ `scroll-behavior: smooth` (pour les ancres) est acceptable et léger — mais le neutraliser sous `prefers-reduced-motion` comme ci-dessus.

### 3.3 Le piège du `100vh` sur mobile

**Le problème :** sur mobile, les barres d'interface (URL en haut sur Safari/Chrome, barre d'outils en bas) apparaissent et disparaissent au scroll. L'unité `vh` correspond à la **plus grande** hauteur possible (barres masquées). Résultat : un élément en `height: 100vh` est **plus grand que l'écran visible** au chargement → le contenu du bas (souvent un bouton CTA) passe **sous la barre du navigateur**, et la page « saute » au premier scroll.

**La solution moderne : les unités viewport dynamiques.**

| Unité | Hauteur correspondante |
|---|---|
| `svh` (*small*) | Plus petite vue (barres **visibles**) — le « plancher » garanti |
| `lvh` (*large*) | Plus grande vue (barres **masquées**) — équivalent de l'ancien `vh` |
| `dvh` (*dynamic*) | S'ajuste **en temps réel** selon l'état des barres |

```css
.hero-pleine-hauteur {
  min-height: 100vh;  /* Fallback pour vieux navigateurs */
  min-height: 100dvh; /* La valeur moderne : suit l'UI du navigateur */
}
```

**Recommandations :**

- ✅ Privilégier **`min-height`** plutôt que `height` (laisse le bloc grandir si le contenu déborde).
- ✅ Utiliser **`dvh`** pour les sections plein écran.
- ⚠️ `dvh` se recalcule pendant le scroll → si cela cause un effet de « tremblement » sur un layout critique, **`svh`** (hauteur garantie minimale) est souvent plus stable car constant.
- 💡 Fallback historique (si tu dois supporter de très vieux navigateurs) : variable JS `--vh` mise à jour sur `resize`. Mais en 2025+, `dvh`/`svh` sont largement supportés — la solution CSS pure suffit dans la quasi-totalité des cas.

**Gérer les encoches (notch) sur les éléments collés aux bords :**

```css
.barre-fixe-bas {
  padding-bottom: env(safe-area-inset-bottom);
}
.header-fixe {
  padding-top: env(safe-area-inset-top);
}
/* (nécessite viewport-fit=cover dans le meta viewport, cf. §1.1) */
```

---

## 4. ⚡ Fluidité & performances perçues

### 4.1 N'animer QUE `transform` et `opacity`

Le navigateur dessine une page en plusieurs étapes : **Layout** (calcul des positions/tailles) → **Paint** (remplissage des pixels) → **Composite** (assemblage des couches). Plus on déclenche d'étapes par frame, plus ça saccade — surtout sur un téléphone d'entrée de gamme.

- 🚫 Animer `width`, `height`, `top`, `left`, `margin`, `padding` → déclenche un **Layout** complet à chaque frame = saccades.
- 🚫 Animer `box-shadow`, `background-color`, `color` → déclenche un **Paint** coûteux.
- ✅ Animer **`transform`** (translate, scale, rotate) et **`opacity`** → traités directement par le GPU au **Composite**, sans Layout ni Paint. Fluide même sur mobile faible.

```css
/* 🚫 MAUVAIS : provoque des recalculs de layout à chaque frame */
.carte-lente:hover { left: 10px; width: 320px; }

/* ✅ BON : 100 % GPU, 60 fps garantis */
.carte-rapide {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.carte-rapide.actif {
  transform: translateX(10px) scale(1.03);
  opacity: 1;
}
```

**Équivalences à connaître :**

| Au lieu d'animer… | Animer plutôt… |
|---|---|
| `left` / `top` / `margin` | `transform: translate(x, y)` |
| `width` / `height` | `transform: scale()` |
| `display: none → block` | `opacity` (+ `visibility` en transition) |

### 4.2 Optimisations complémentaires

```css
/* Indiquer au navigateur de préparer une couche AVANT l'animation.
   À utiliser avec parcimonie : trop de will-change sature la mémoire GPU.
   L'ajouter au survol, le retirer quand l'animation est finie. */
.element-anime {
  will-change: transform;
}

/* Isoler un sous-arbre pour limiter la portée des recalculs */
.carte {
  contain: layout paint;
}

/* Réservation de place pour les images → zéro layout shift (CLS) au chargement */
img {
  aspect-ratio: 16 / 9; /* ou width/height en attributs HTML */
}
```

**À retenir :**

- ✅ Durées de transition **courtes** (150–300 ms). Au-delà, l'interface paraît molle.
- ✅ Pour faire apparaître/disparaître un élément, transitionner `opacity` (+ `transform`), pas `display`.
- ✅ Toujours définir `width`/`height` (ou `aspect-ratio`) sur les images → évite les sauts de mise en page (CLS).
- ⚠️ `will-change` n'est pas magique : c'est un coût mémoire. Ne pas le laisser en permanence sur de nombreux éléments.

---

## 5. 🧱 Le Reset CSS à injecter partout

> À placer **tout en haut** de chaque projet (avant tes styles, et avant Tailwind si tu veux qu'il prenne le dessus sur les utilitaires — sinon dans `@layer base`). Ce reset neutralise à lui seul la majorité des problèmes décrits ci-dessus.

```css
/* ============================================================
   RESET RESPONSIVE & TACTILE — base universelle
   ============================================================ */

/* 1. box-sizing universel + reset marges */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
}

/* 2. Racine : pas de scroll horizontal, scroll vertical fluide */
html {
  -webkit-text-size-adjust: 100%; /* iOS : pas de grossissement auto du texte */
  text-size-adjust: 100%;
  scroll-behavior: smooth;        /* neutralisé plus bas si reduced-motion */
  -webkit-tap-highlight-color: transparent; /* supprime le flash gris au tap iOS */
}

body {
  min-height: 100vh;
  min-height: 100dvh;             /* hauteur fiable mobile */
  overflow-x: hidden;             /* filet de sécurité anti-scroll horizontal */
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  line-height: 1.5;
  overscroll-behavior-y: contain; /* coupe le pull-to-refresh parasite */
}

/* 3. Médias responsives par défaut */
img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
  height: auto;
}

/* 4. Enfants flex/grid : autoriser le rétrécissement (anti-débordement) */
/* (à appliquer au besoin sur tes conteneurs : .flex > *, .grid > * { min-width: 0 } ) */

/* 5. Formulaires : hériter de la typo, supprimer le zoom iOS au focus */
input, button, textarea, select {
  font: inherit;
  color: inherit;
}
/* iOS zoome automatiquement si la police d'un champ < 16px → on force >= 16px */
input, textarea, select {
  font-size: max(16px, 1rem);
}

/* 6. Cibles tactiles confortables + suppression double-tap-zoom */
button, a, [role="button"], input, label, select, summary {
  touch-action: manipulation;
}
button, a, [role="button"] {
  cursor: pointer;
}

/* 7. Hovers réservés aux pointeurs précis (souris/trackpad) */
/* → écris tes :hover À L'INTÉRIEUR de ce bloc dans tes composants :
@media (hover: hover) and (pointer: fine) {
  .mon-bouton:hover { ... }
}
*/

/* 8. Typographie fluide de base */
:root {
  --fs-body: clamp(1rem, 0.95rem + 0.4vw, 1.125rem);
}
body { font-size: var(--fs-body); }

/* 9. Largeur de lecture confortable pour les blocs de texte */
p, li { max-width: 70ch; }

/* 10. Respect de la préférence « réduire les animations » */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

> 💡 **Pour ton stack Tailwind v4 :** rappelle-toi que les règles écrites **hors de tout `@layer`** l'emportent sur `@layer utilities`. Si tu veux que ce reset reste surchargeable par tes classes Tailwind, place-le dans `@layer base`. Si au contraire une règle doit gagner à coup sûr, garde-la hors layer — c'est ton échappatoire fiable, comme tu l'as documenté.

---

## 6. ✅ Checklist de validation finale

> À dérouler systématiquement **avant chaque mise en production**. Tester sur **vrai appareil** (au minimum un iPhone Safari + un Android Chrome), pas seulement dans le simulateur du navigateur.

| # | Point à vérifier | OK |
|---|---|:--:|
| **1** | **Meta viewport** présent avec `width=device-width, initial-scale=1, viewport-fit=cover`, et **sans** `user-scalable=no`. | ☐ |
| **2** | **Zéro scroll horizontal** sur toutes les pages, à toutes les largeurs (320px → 1920px). Test au doigt : aucun mouvement latéral parasite. | ☐ |
| **3** | **Pas de saut de layout au scroll** lié au `100vh` : les sections plein écran utilisent `dvh`/`svh`, le CTA du bas reste visible au chargement. | ☐ |
| **4** | **Aucun effet de survol fantôme** sur tactile : les `:hover` sont isolés dans `@media (hover: hover) and (pointer: fine)` ; un feedback `:active` existe sur mobile. | ☐ |
| **5** | **Toutes les cibles tactiles ≥ 44–48px** avec ≥ 8px d'espacement (boutons, liens, croix de fermeture, icônes). Aucun clic raté. | ☐ |
| **6** | **Pas de zoom involontaire** : `touch-action: manipulation` sur les interactifs ; **champs de formulaire en ≥ 16px** (pas de zoom iOS au focus). | ☐ |
| **7** | **Pas de pull-to-refresh parasite** (`overscroll-behavior`), et le scroll des modales/panneaux ne « fuit » pas vers la page derrière. | ☐ |
| **8** | **Animations fluides** : seules `transform` et `opacity` sont animées (pas de `width`/`top`/`box-shadow`). 60 fps testés sur un téléphone modeste. | ☐ |
| **9** | **Aucun scroll-jacking** ; `prefers-reduced-motion` respecté ; les images ont `width`/`height` ou `aspect-ratio` (zéro layout shift). | ☐ |
| **10** | **Encoches gérées** : aucun contenu ni bouton masqué par l'encoche ou la barre d'accueil (`env(safe-area-inset-*)` sur les éléments fixes en bord d'écran). | ☐ |

---

### 🔎 Test final express (60 secondes, sur vrai mobile)

1. Charger la page → le bas de l'écran (CTA) est-il visible **sans scroller** ?
2. Glisser le doigt **horizontalement** partout → ça bouge ? → bug.
3. Tirer la page vers le bas depuis le haut → rechargement parasite ? → bug.
4. Taper deux fois rapidement sur du texte → ça zoome ? → manque `touch-action`.
5. Taper un champ de formulaire → l'écran zoome ? → police de champ < 16px.
6. Faire pivoter en paysage → tout reste-t-il lisible et accessible ?

---

*Document vivant — à compléter au fil des cas rencontrés en production.*
