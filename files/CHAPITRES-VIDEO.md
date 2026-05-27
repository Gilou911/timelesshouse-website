# Chapitres vidéo (timestamps style YouTube)

Ajout d'une option **Chapitres** sur le template dynamique `event-video.html`,
configurable depuis l'admin (`communication-admin.jsx`), aussi bien sur le
**Teaser** que sur le **Film complet** — chacun a sa propre liste.

---

## Fichiers modifiés

1. **`event-video.html`**
   - Nouvelle section UI sous le lecteur (`#chaptersSection`), masquée
     automatiquement si la liste est vide.
   - Module JS `Chapters` (parse, render, jump, highlight).
   - Clés par défaut ajoutées dans la config : `teaserChapitres: []`,
     `filmChapitres: []`.
   - Re-render automatique au switch Teaser ↔ Film complet.

2. **`communication-admin.jsx`**
   - 2 nouveaux champs `Textarea` (format YouTube) dans le formulaire vidéo :
     un sous l'URL teaser, un sous l'URL film.
   - Helpers `parseChapterTime`, `formatChapterTime`, `chaptersToText`,
     `textToChapters`.
   - `defaultVideoConfig` initialise les deux listes à `[]`.

> Aucune modification du **schema SQL** : les chapitres sont stockés dans la
> colonne `event_pages.config` (JSONB), sous deux clés
> `teaserChapitres` et `filmChapitres`. Les pages existantes restent
> compatibles : tant que la clé est absente, la section "Chapitres" est
> simplement masquée côté client.

---

## Format de saisie côté admin

Un chapitre par ligne, exactement comme YouTube :

```
0:00 Préparatifs
2:30 Cérémonie
8:00 Vin d'honneur
14:20 Discours
22:45 Première danse
```

**Tolérant aux variantes** :

- `MM:SS` ou `HH:MM:SS` (les deux fonctionnent).
- Séparateur libre entre l'heure et le titre : espace, `-`, `–`, `—`, `:`.
- Lignes vides ou mal formées → ignorées silencieusement.
- Tri chronologique automatique à la sauvegarde.

**Stockage** : la valeur est normalisée en `[{ time: <secondes>, titre: "<texte>" }, …]`
au moment de la saisie, donc le JSONB en base reste propre.

---

## Comportement côté client (`event-video.html`)

- La section **Chapitres** apparaît sous le lecteur uniquement si la vidéo
  active a au moins un chapitre. Si la liste est vide, rien ne s'affiche
  (et la mise en page reste inchangée pour les anciens clients).
- **Clic sur un chapitre** : la vidéo saute au timestamp et la lecture
  démarre automatiquement (avec un léger scroll vers le lecteur).
- Pendant la lecture, le chapitre courant est mis en surbrillance
  (filet doré à gauche + titre en accent).
- Au **switch Teaser ↔ Film complet**, la liste se met à jour pour
  refléter les chapitres de la vidéo qui passe à l'écran.

---

## Note d'implémentation : pourquoi pas de marqueurs sur la barre de progression ?

Le lecteur utilise les contrôles natifs HTML5 (`<video controls>`),
ce qui ne permet pas d'incruster de marqueurs sur la timeline elle-même
(contrairement à YouTube qui utilise ses propres contrôles).

Si tu veux des **marqueurs sur la barre** (style YouTube exact),
il faudrait remplacer les contrôles natifs par des contrôles custom —
c'est faisable mais c'est un chantier à part entière (UX, accessibilité,
plein écran, qualité, etc.). Dis-moi si tu veux qu'on y aille.

---

## Test rapide

1. Admin → fiche client → **Modifier la page vidéo**.
2. Coller dans le champ « Chapitres du film » :
   ```
   0:00 Préparatifs
   2:30 Cérémonie
   8:00 Vin d'honneur
   ```
3. **Enregistrer**.
4. Ouvrir l'espace client → page vidéo → la section **Chapitres** apparaît
   sous le lecteur. Cliquer sur "Cérémonie" → la vidéo saute à 2:30 et joue.
