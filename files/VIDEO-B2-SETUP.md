# 🎬 Pipeline vidéo B2 — lecture adaptative + affichage qualité

> **Objectif :** héberger les vidéos livrées **uniquement sur Backblaze B2**
> (fini Streamable), avec une lecture dont la **qualité s'adapte à la
> connexion du client** (HLS) et un **badge de qualité** pour qu'il sache
> que l'original téléchargeable est supérieur à ce qu'il regarde.
>
> Même modèle que ylvfeet : upload direct depuis l'admin → B2, puis
> encodage HLS en local (ffmpeg ne tourne ni dans le navigateur ni sur
> Supabase).

## ✅ État du déploiement (fait le 16/07/2026)

L'infrastructure est **déjà en place et testée de bout en bout** :

- ✔ Migration SQL exécutée (colonnes qualité sur `media`)
- ✔ Bucket B2 **`Timelesshouse-org`** (déjà public) — CORS ajouté pour
  l'upload navigateur + la lecture. Les nouveaux fichiers vont sous
  `media/` et `weddings/`, séparés du contenu existant.
- ✔ Edge Function **`b2-sign` déployée** sur le projet `vpbxeqjvaeiytxcpilxf`,
  avec ses secrets B2 + `ADMIN_EMAILS=service@timelesshouse.org`
  (seul cet email peut signer un upload)
- ✔ `.env.local` rempli (clés B2 + `service_role`) pour `npm run encode`
- ✔ **Cloudflare devant B2** : `media.timelesshouse.org` (CNAME proxied)
  sert les fichiers → **egress gratuit** (Bandwidth Alliance) + URL de marque.
  `B2_PUBLIC_BASE_URL` pointe désormais vers ce domaine.
- ✔ Chaîne validée de bout en bout : upload signé → PUT B2 → encodage HLS
  → lecture hls.js adaptative via `media.timelesshouse.org` (badge qualité,
  CORS OK, cross-origin depuis timelesshouse.org)

**Il ne reste, côté toi, que l'usage quotidien** (ci-dessous).
Source de la fonction : `supabase/functions/b2-sign/index.ts`.

> **Bonus optionnel — cache CDN.** Aujourd'hui `cf-cache-status: DYNAMIC`
> (Cloudflare relaie sans cacher ; l'egress reste gratuit). Pour cacher les
> segments et accélérer les revisionnages, ajouter **une Cache Rule** dans le
> dashboard Cloudflare : *Rules → Cache Rules → Create* → si `Hostname eq
> media.timelesshouse.org` → *Eligible for cache* + *Edge TTL : respect origin*.
> (Le token API fourni n'avait pas la permission Rules ; ça se fait en 1 min
> à la main, ou en me redonnant un token avec `Cache Rules → Edit`.)

---

## 🗺 Architecture

```
ADMIN (navigateur)                    B2 (bucket public)
  │  1. choisit le fichier              media/<id>/original/…   ← téléchargement client
  │  2. Edge Function b2-sign           media/<id>/hls-…/master.m3u8 ← lecture adaptative
  │     signe l'URL (JWT admin)         media/<id>/hls-…/poster.jpg  ← vignette auto
  │  3. PUT direct navigateur → B2      media/<id>/hls-…/hover.mp4   ← survol des cartes
  ▼
TERMINAL (Mac, une commande)
  npm run encode -- --media-id <id> --input <fichier>
  → ffmpeg : 4K/1080p/720p/480p (HLS) + poster + hover
  → upload B2 + fiche média remplie (durée, poids, résolution EXACTS)
  ▼
CLIENT (portail)
  lecteur hls.js : qualité auto selon la connexion
  badge « AUTO · 720p » + menu manuel (Auto / 1080p / 720p / 480p)
  note : « Votre original (4K · 2,3 Go) est disponible au téléchargement »
```

Colonnes `media` réutilisées : `url` = original (téléchargement),
`preview_url` = master.m3u8 (lecture), `thumb_url` = poster.
Nouvelles colonnes (migration) : `source_width/height/size_bytes`,
`duration_seconds`, `hover_url`.

---

## ⚙️ Setup (une seule fois)

### 1. Bucket Backblaze B2
1. Créer un bucket **public** (ex : `timelesshouse-media`) — région EU.
2. Créer une clé d'application limitée à ce bucket → noter `keyID` + `applicationKey`.
3. Noter l'endpoint S3 (ex : `https://s3.eu-central-003.backblazeb2.com`).

### 2. Cloudflare devant B2 (fortement recommandé — egress gratuit)
Sans ça, B2 facture la bande passante au-delà de 3× le stockage/mois.
Avec Cloudflare (Bandwidth Alliance), l'egress B2 → Cloudflare est **gratuit**
et le CDN cache les segments près des clients.
1. Dans Cloudflare (le domaine y est déjà pour Pages) : créer un
   enregistrement **CNAME proxifié** `media` → `f003.backblazeb2.com`
   (adapter `f003` à la région du bucket).
2. Créer une **Cache Rule** : host `media.timelesshouse.org` → Eligible for cache.
3. La base publique devient : `https://media.timelesshouse.org/file/timelesshouse-media`

### 3. Migration SQL
Exécuter `files/migration-video-b2.sql` dans Supabase → SQL Editor.

### 4. Edge Function b2-sign
La fonction vit dans `supabase/functions/b2-sign/index.ts` :
```bash
supabase functions deploy b2-sign --project-ref <ref> --no-verify-jwt
```
Secrets à définir (Dashboard → Edge Functions → Secrets) :
`B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APP_KEY`,
`B2_PUBLIC_BASE_URL` (la base publique de l'étape 2, sans slash final),
et `ADMIN_EMAILS` (emails autorisés à uploader, séparés par des virgules).

### 5. Variables locales + CORS
1. Compléter `.env.local` avec le bloc B2 de `.env.example`
   (+ `SUPABASE_SERVICE_ROLE_KEY` pour le script d'encodage).
2. Autoriser le navigateur à uploader/lire sur le bucket :
   ```bash
   npm run b2-cors -- https://timelesshouse.org https://www.timelesshouse.org http://localhost:5173
   ```

### 6. ffmpeg (si absent du Mac)
```bash
brew install ffmpeg
```

---

## 🔁 Workflow quotidien

### Médiathèque client (communication)
1. **Admin → client → Médias → Ajouter** : type Vidéo, choisir le **fichier
   original** (et une vignette si tu veux forcer une image précise).
   → Upload direct vers B2 avec barre de progression. Les fichiers > 4 Go
   passent automatiquement en multipart. Durée/poids/résolution sont
   pré-remplis depuis le fichier.
2. À l'enregistrement, l'admin affiche la **commande d'encodage** (bouton
   copier) :
   ```bash
   npm run encode -- --media-id <id> --input "/chemin/vers/le/fichier.mp4"
   ```
3. La lancer dans le Terminal. Elle génère les qualités (jusqu'au 4K),
   le poster, la vidéo de survol, uploade tout sur B2, remplit la fiche
   et **supprime les anciens encodages** du média.
   → La carte du média passe en « ✅ Lecture adaptative active ».

### Films de mariage / pages vidéo (tous univers)
Depuis l'admin, dans la page vidéo, chaque bloc **Teaser** et **Film** a un
champ **« Fichier … — upload direct sur B2 »** :
1. Choisis le fichier → il s'uploade sur B2 (`weddings/<code>/<teaser|film>/
   original/`), le **lien de téléchargement** se remplit et la page est
   sauvegardée. L'admin affiche alors une **commande d'encodage** avec
   `--event-page` (bouton copier).
2. Lance-la sur ton Mac :
   ```bash
   npm run encode -- --prefix weddings/<code>/film --input "/chemin/film.mp4" --event-page <id> --field filmHls
   ```
   Elle génère les qualités HLS **et réécrit l'URL HLS directement dans la
   page** (`teaserHls`/`filmHls`) — plus aucun copier-coller. Recharge la
   page dans l'admin pour voir le champ rempli.
3. Alternative manuelle (sans passer par l'admin) :
   ```bash
   npm run encode -- --prefix weddings/<slug>/film --input "/chemin/film.mp4" --upload-original
   ```
   puis coller l'URL HLS affichée dans « URL HLS adaptative ».
4. Les anciens champs 1080p/4K restent fonctionnels — l'URL HLS est
   prioritaire quand elle est renseignée.

### Anciennes vidéos (Streamable, Cloudinary…)
Rien ne casse : les liens existants continuent d'être lus (iframe/MP4).
Pour les faire passer au nouveau système, relancer simplement l'encodage
avec le fichier d'origine.

---

## 👁 Ce que voit le client

- **Badge en haut à droite du lecteur** : `AUTO · 720p` — la qualité
  réellement jouée, mise à jour en direct quand elle change.
- **Menu au clic sur le badge** : Auto (recommandé) / 1080p / 720p / 480p —
  le changement est instantané, sans recharger la vidéo.
- **Sous le bouton Télécharger** : « La lecture s'adapte à votre
  connexion — la qualité affichée n'est pas celle du fichier final.
  Votre original (4K · 2,3 Go), non compressé, est disponible au
  téléchargement. » (valeurs réelles mesurées par ffprobe).
- **Pages mariage** : boutons AUTO/4K/1080p sur le lecteur + note dans la
  section Téléchargements.

---

## 💶 Coûts (ordre de grandeur)

| Poste | Prix |
|---|---|
| Stockage B2 | ~6 $/To/mois (original + HLS ≈ 1,5–2× l'original) |
| Bande passante via Cloudflare | **0 $** (Bandwidth Alliance) |
| Bande passante B2 directe (sans CF) | gratuite jusqu'à 3× le stockage/mois, puis 0,01 $/Go |
| Edge Function b2-sign | inclus dans le plan Supabase (appels très légers) |

---

## 🛠 Dépannage

| Symptôme | Cause probable |
|---|---|
| « Upload B2 échoué — réseau ou CORS » dans l'admin | CORS du bucket pas configuré pour ce domaine → relancer `npm run b2-cors -- <origines>` |
| « Session admin requise » | Session Supabase expirée → se reconnecter à l'admin |
| La vidéo ne se lit pas mais se télécharge | Encodage pas encore lancé (`preview_url` vide ou non-m3u8) → lancer `npm run encode` |
| Lecture cassée après ré-encodage | Impossible normalement (préfixes `hls-<horodatage>` uniques) — vider le cache Cloudflare au besoin |
| `ffmpeg: command not found` | `brew install ffmpeg` |
| Badge bloqué sur « AUTO » sans palier | Vieux Safari iOS (HLS natif) : l'adaptation marche mais le palier n'est pas exposé — comportement attendu |
