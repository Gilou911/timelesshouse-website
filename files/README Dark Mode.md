# 🌙 Dark Mode TimelessHouse — Intégration site complet

## 📦 Fichiers modifiés (à uploader tels quels)

| Fichier | Type | Modifs |
|---|---|---|
| `portal.jsx` | Artifact React | +156 lignes : tokens dark, `useDarkMode`, `DarkToggle`, override CSS |
| `communication-admin.html` | SPA admin React | +108 lignes : tokens dark, `useDarkMode`, `DarkToggle` dans sidebar + header mobile, override CSS |
| `communication-app.jsx` | App dashboard CLIENT | +86 lignes : tokens dark, `useDarkMode`, `DarkToggle` dans Sidebar + MobileHeader |
| `communication-dashboard.html` | Loader React | +35 lignes : pre-apply theme (zéro flash), override CSS pour l'app jsx |

## ✅ Ce qui est inclus

- **Toggle SVG raffiné** (42×22 px) : pill sombre, C qui voyage par le **haut** quand on passe en nuit, par le **bas** quand on revient en jour
- **Persistance localStorage** sous `th-dark-mode` et `th-c-offset` → préférence partagée entre toutes les pages, mémorisée entre visites
- **Zéro flash** au chargement grâce à l'attribut `data-theme` posé sur `<html>` avant le rendu React
- **Surcharge CSS** des classes Tailwind `text-stone-X`, `bg-white`, etc. pour adapter automatiquement tous les textes/fonds quand `data-theme="dark"`
- **Transitions fluides** (0.45s) sur tous les changements de couleur

---

## 🔧 Architecture technique

### Le pattern "mutable global pointer"

Dans `portal.jsx`, `communication-admin.html` et `communication-app.jsx`, les **30+ composants** font tous référence à `neu.X`. Plutôt que de modifier chaque composant pour utiliser un Context, j'ai transformé `neu` en variable **mutable** :

```jsx
const NEU_LIGHT = { base: {...}, raised: {...}, ... };
const NEU_DARK  = { base: {...}, raised: {...}, ... };
let neu = NEU_LIGHT;   // ← Variable mutable

function App() {
  const [isDark, toggleDark] = useDarkMode();
  neu = isDark ? NEU_DARK : NEU_LIGHT;   // ← Réassignée au render
  // ...
}
```

**Pourquoi ça marche :** React rend top-down, donc quand `App` se ré-exécute après un toggle, la réassignation se fait AVANT que les enfants soient évalués. Tous les `neu.X` des sous-composants lisent la nouvelle valeur.

### Le toggle SVG

Le C est un `<rect>` SVG avec `stroke-dasharray="50 50"` (moitié peinte / moitié vide). Le `stroke-dashoffset` ne fait que **monter** (`+50` à chaque toggle), donc le C se déplace toujours dans le même sens sur le pourtour → effet "haut pour aller en nuit / bas pour revenir en jour".

### Emplacement des toggles

| Fichier | Desktop | Mobile |
|---|---|---|
| `portal.jsx` | TopBar, entre la cloche et l'avatar | (idem, responsive) |
| `communication-admin.html` | Sidebar, au-dessus de "Espace client" / "Déconnexion" | Header sticky, à gauche du bouton déconnexion |
| `communication-app.jsx` | Sidebar, au-dessus de "Déconnexion" | Header sticky, à gauche du bouton déconnexion |

---

## 🚀 Déploiement

Uploader les **4 fichiers** du dossier `site-darkmode-final/` à la racine de ton hébergement, en remplacement des versions actuelles.

Aucune base de données à modifier. Aucune migration. Aucune dépendance ajoutée.

Tous les fichiers ont passé la **validation syntaxique Babel** (parsing JSX OK).

---

## 📝 Reste (optionnel)

### Pages cinéma (mariage, event-*, immobilier, communication, index)

Ces pages sont **déjà sombres** (thème cinéma `#0a0a0a` / `#1a1410`). Le dark mode ne s'y applique pas par défaut. Si tu veux qu'elles aient un "mode jour" alternatif (fond crème), c'est un autre chantier — fais-moi signe.

---

## 🎨 Personnalisation des couleurs dark

Toutes les couleurs du thème dark sont dans les objets `NEU_DARK` (au début de chaque fichier React) :

```js
const NEU_DARK = {
  base:      { backgroundColor: '#1c1d21' },   // fond principal
  raised:    { backgroundColor: '#23242a', ... },  // cartes
  pressed:   { backgroundColor: '#18191e', ... },  // inputs creux
  dark:      { backgroundColor: '#2d2e36', ... },  // boutons sombres (inversés)
  // ...
};
```

Et les overrides Tailwind dans le `<style>` du `<head>` (`communication-admin.html`, `communication-dashboard.html`) ou dans le `<style>` du App (`portal.jsx`).

