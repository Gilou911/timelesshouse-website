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

### Démarrage automatique au login (macOS) — INSTALLÉ le 20/07/2026

Le service `org.timelesshouse.worker-encode` tourne en permanence sur le
Mac de Gil : démarrage au login, relance automatique, priorité basse.
Il travaille depuis `~/Desktop/timelesshouse-website`.

```bash
# état
launchctl print gui/$(id -u)/org.timelesshouse.worker-encode | grep -E "state|pid"

# redémarrer (OBLIGATOIRE après toute modification du worker — voir plus bas)
launchctl kickstart -k gui/$(id -u)/org.timelesshouse.worker-encode

# désactiver définitivement
launchctl bootout gui/$(id -u)/org.timelesshouse.worker-encode

# réinstaller depuis zéro
cp files/launchd-worker-encode.plist ~/Library/LaunchAgents/org.timelesshouse.worker-encode.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.timelesshouse.worker-encode.plist
```

⚠️ **Le service exécute le code chargé à son démarrage.** Après une
modification de `worker-encode.mjs` ou `encode-core.mjs` — et après
tout `git pull` qui les touche — il faut le relancer (`kickstart -k`),
sinon il continue silencieusement avec l'ancienne version. Le symptôme
est déroutant : les jobs se traitent correctement, mais le comportement
ne correspond pas au code qu'on vient d'écrire.

⚠️ **Si la modification a été poussée depuis une branche ou un
worktree** (cas des sessions Claude), un `git pull` ne suffit pas
forcément : le service lit le fichier du checkout PRINCIPAL
(`~/Desktop/timelesshouse-website`). Le réflexe sûr, depuis le
principal :

```bash
git fetch origin main
git checkout origin/main -- workers/encoder/worker-encode.mjs
launchctl kickstart -k gui/$(id -u)/org.timelesshouse.worker-encode
```

Le plist pointe sur `/opt/homebrew/bin/node` et déclare un `PATH`
explicite : launchd n'hérite pas de l'environnement du shell, sans quoi
`ffmpeg` serait introuvable au premier encodage.

**Anti-veille (depuis le 22/07/2026)** : le Mac étant réglé pour
s'endormir après 1 minute d'inactivité, le worker lance `caffeinate -i`
au début de chaque job et l'arrête à la fin. La machine reste donc
éveillée pendant un encodage, et dort normalement le reste du temps.
Limite : `caffeinate` n'agit pas si on ferme le capot — le job gèlera
et reprendra au réveil (aucune perte, la file attend).

---

## Ce qu'il faut savoir

**Le worker ne tourne que quand ton Mac est allumé.** C'est le
compromis assumé du départ : zéro coût, zéro serveur à gérer. Les
vidéos uploadées pendant que la machine dort attendent dans la file et
sont traitées au réveil.

**Pendant l'attente, le client ne voit PAS la vidéo** (décision de Gil,
20/07/2026) : la page affiche « Votre film est en cours de
préparation », sans lecteur ni téléchargement. Servir le master brut
ferait une mauvaise première impression — lourd, saccadé sur une
connexion moyenne — sur une livraison qu'on ne fait qu'une fois. Le
basculement est automatique dès qu'une qualité est prête.

Concrètement, c'est ce qui rend le redémarrage du service critique : si
le worker est arrêté, les films restent invisibles pour les clients.
Un coup d'œil à la file de temps en temps ne fait pas de mal :

```sql
select status, count(*) from encode_jobs group by status;
```

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
