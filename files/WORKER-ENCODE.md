# Worker d'encodage HLS — La Loge

Comment les vidéos des agences locataires passent automatiquement de
« lisible » à « lisible partout, quelle que soit la connexion ».

---

## Le problème que ça résout

Quand un locataire uploade un MP4, le fichier est **immédiatement
lisible** : le navigateur le télécharge en continu et le joue (lecture
dite *progressive*). Ça marche très bien… tant que la connexion suit.
Un master 4K de 8 Go regardé dans un train, c'est un film qui saccade.

La lecture **adaptative** (HLS) résout ça : on fabrique à l'avance
plusieurs versions du film (2160p / 1080p / 720p / 480p) découpées en
segments de 6 s, et le lecteur change de qualité à la volée selon le
débit réel — le principe de Netflix ou YouTube.

Fabriquer ces versions demande `ffmpeg`, qui ne tourne ni dans le
navigateur ni sur Supabase. D'où ce worker.

---

## Le circuit, de bout en bout

1. **L'admin locataire uploade** un MP4 (galerie ou médiathèque). Le
   fichier part du navigateur directement vers B2. La vidéo est déjà
   visible par le client, en progressif.
2. **La console dépose un ticket** dans la table `encode_jobs`
   (brique 15). Silencieux et non bloquant : si l'insertion échoue, la
   vidéo reste lisible, on a juste perdu l'optimisation.
3. **Le worker ramasse le ticket**, télécharge l'original, encode avec
   le même pipeline que la plateforme (`scripts/encode-core.mjs`),
   renvoie les segments sur B2 **à côté** de l'original.
4. **Le worker écrit le résultat** : `media.preview_url` pour un média,
   `galleries.config.videos[].hls` pour une vidéo de galerie.
5. **Le lecteur bascule tout seul** : `galerie-rendu.js` charge `hls.js`
   dès qu'une URL `.m3u8` est présente et affiche le sélecteur de
   qualité (AUTO / 1080p / 720p / 480p).

Le client final ne voit jamais la couture : sa vidéo marchait avant,
elle marche mieux après.

**La plateforme (TimelessHouse) n'enfile rien** : Gil garde son
`npm run encode` manuel, avec ses options (`--upload-original`,
`--event-page`…). Le garde-fou est le drapeau `features_all_universes`.

---

## Lancer le worker

```bash
npm run worker-encode              # boucle, 30 s entre deux tours
npm run worker-encode -- --once    # traite un seul job puis sort
npm run worker-encode -- --verbose # sortie ffmpeg complète (débogage)
```

Il lit `.env.local` (Supabase service role + clés B2). `Ctrl-C` demande
un arrêt propre : le job en cours se termine d'abord (un second `Ctrl-C`
coupe net).

### Démarrage automatique au login (macOS)

`files/launchd-worker-encode.plist` est fourni **mais pas installé** —
c'est un réglage de ta machine, à toi de décider :

```bash
cp files/launchd-worker-encode.plist ~/Library/LaunchAgents/org.timelesshouse.worker-encode.plist
launchctl load  ~/Library/LaunchAgents/org.timelesshouse.worker-encode.plist   # activer
launchctl unload ~/Library/LaunchAgents/org.timelesshouse.worker-encode.plist  # désactiver
```

Vérifie d'abord que le chemin du projet dans le fichier correspond bien
au tien, et que `node` est là où le plist l'attend (`which node`).

---

## Ce qu'il faut savoir

**Le worker ne tourne que quand ton Mac est allumé.** C'est le
compromis assumé du départ : zéro coût, zéro serveur à gérer. Les
vidéos uploadées pendant que la machine dort attendent sagement dans la
file et sont traitées au réveil — et pendant ce temps, elles restent
lisibles en progressif. Rien n'est jamais cassé pour le client.

**Migration vers un serveur, le jour venu.** Le script est écrit pour
tourner tel quel sur un Linux avec `ffmpeg` : `git clone`, `npm ci`, le
même `.env.local`, et `npm run worker-encode` sous systemd. Aucune
ligne à changer. Un petit VPS (~5 €/mois) suffit pour encoder en
continu — le signal qu'il est temps, c'est quand la file dépasse
régulièrement quelques heures d'attente.

**Coût de stockage.** L'encodage multiplie environ par 1,6 le poids
d'une vidéo (l'original + toutes les qualités). C'est à surveiller avec
les quotas par agence : la mesure nocturne (`measure-storage`) le prend
déjà en compte.

---

## Dépannage

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Badge « Optimisation en cours » figé | le worker ne tourne pas | lancer `npm run worker-encode` |
| `status = error` sur un job | voir la colonne `error` | corriger, puis repasser le job en `pending` |
| « source hors du stockage de la plateforme » | l'URL ne pointe pas sur notre bucket | vérifier que le fichier a bien été uploadé |
| « source trop volumineuse » | fichier > 30 Go | ajuster `MAX_SOURCE_BYTES` dans le worker |
| ffmpeg introuvable | pas installé / pas dans le PATH | `brew install ffmpeg` |

Le journal est dans `workers/encoder/worker.log` (ignoré par git, aucun
secret dedans). Pour relancer un job en échec :

```sql
update encode_jobs set status = 'pending', attempts = 0 where id = '<uuid>';
```

Un job est réessayé **une fois** en cas de panne passagère (réseau, B2
indisponible), mais abandonné immédiatement si l'erreur est définitive
(source hors périmètre, cible supprimée) — inutile de boucler.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/encode-core.mjs` | le cœur : ffprobe, paliers, ffmpeg, upload B2 (partagé) |
| `scripts/encode-hls.mjs` | CLI manuel de la plateforme (inchangé) |
| `workers/encoder/worker-encode.mjs` | le démon : file d'attente, reprises, écritures |
| `files/launchd-worker-encode.plist` | démarrage automatique macOS (à installer soi-même) |
| `files/migration-saas-b3-agences.sql` | brique 15 : table `encode_jobs`, RLS, `claim_encode_job()` |
