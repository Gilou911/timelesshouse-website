/* ═══════════════════════════════════════════════════════════════════
   Worker « telechargement » — enregistrer au lieu d'ouvrir
   ═══════════════════════════════════════════════════════════════════
   Cliquer « Télécharger » sous un film ouvrait un lecteur dans un
   nouvel onglet : l'attribut `download` d'un lien est IGNORÉ dès que le
   fichier vient d'un autre domaine, et les médias vivent sur
   media.timelesshouse.org. Le détour par la mémoire du navigateur, qui
   règle le cas des photos, ne tient pas ici — un film de mariage pèse
   plus d'un Go, aucun téléphone ne le garde entier en mémoire.

   Ce Worker sert donc le MÊME fichier, au même endroit, en ajoutant le
   seul en-tête qui manquait : Content-Disposition: attachment.

   PÉRIMÈTRE — il ne répond QUE sur /telecharger/*. La lecture des
   films, les segments HLS, les vignettes et les photos ne passent
   jamais par lui : s'il tombe, seul le bouton Télécharger tombe.

   PAS UN RELAIS — il ne sait fabriquer qu'une URL de ce domaine, sous
   /file/. Aucune adresse fournie par l'appelant n'est suivie, donc il
   ne peut pas servir à récupérer autre chose que nos propres médias.

   ROUTE : media.timelesshouse.org/telecharger/*
   Le chemin reprend celui du fichier — /file/<seau>/<clé> devient
   /telecharger/<seau>/<clé> — ce qui le rend valable pour TOUTE
   galerie, la nôtre comme celle d'un locataire, aujourd'hui et demain :
   rien n'y est écrit en dur.

   DÉPLOIEMENT (depuis ce dossier) :
     npx wrangler deploy
   ═══════════════════════════════════════════════════════════════════ */

const HOTE_MEDIA = 'media.timelesshouse.org';
const PREFIXE = '/telecharger/';

/* Backblaze refuse une requête sans User-Agent (constaté : 403 sans,
   200 avec). Un sous-appel de Worker n'en pose pas forcément — on
   relaie celui du visiteur, avec un filet. */
const AGENT_PAR_DEFAUT = 'laloge-telechargement/1.0';

/* Seuls ces en-têtes sont relayés vers le stockage. `range` est le plus
   important : sans lui, un téléchargement d'un Go interrompu repartirait
   de zéro. Les cookies et l'authentification restent à la porte. */
const A_RELAYER = ['range', 'if-range', 'if-modified-since', 'if-none-match', 'accept-encoding'];

/* Nom du fichier proposé à l'enregistrement. Deux formes, comme le veut
   la norme : une repli en ASCII pour les navigateurs anciens, et la
   version UTF-8 pour que « Manon & Charles — film.mp4 » garde ses
   accents et son tiret cadratin. */
function enteteNom(nom) {
  const propre = String(nom).replace(/[\r\n"\\]/g, '').trim().slice(0, 180) || 'telechargement';
  /* Le repli ASCII sert les navigateurs qui ignorent filename*. Sans
     traduire d'abord la ponctuation typographique, « Manon & Charles —
     Film » y perdait son tiret ET gardait la double espace autour. */
  const repli = propre
    .replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[«»“”]/g, '')
    .normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ').trim() || 'telechargement';
  return `attachment; filename="${repli}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Méthode non autorisée.', {
        status: 405, headers: { Allow: 'GET, HEAD' },
      });
    }
    if (!url.pathname.startsWith(PREFIXE)) {
      return new Response('Rien à cette adresse.', { status: 404 });
    }

    const cle = url.pathname.slice(PREFIXE.length);
    // Un `..` remonterait hors du seau ; un chemin vide n'a pas de sens.
    if (!cle || cle.includes('..')) {
      return new Response('Chemin invalide.', { status: 400 });
    }

    const amont = new URL(`https://${HOTE_MEDIA}/file/${cle}`);

    const entetes = new Headers();
    for (const k of A_RELAYER) {
      const v = request.headers.get(k);
      if (v) entetes.set(k, v);
    }
    entetes.set('user-agent', request.headers.get('user-agent') || AGENT_PAR_DEFAUT);

    let amontRep;
    try {
      amontRep = await fetch(amont.toString(), { method: request.method, headers: entetes });
    } catch (e) {
      return new Response('Le stockage est injoignable. Réessayez dans un instant.', { status: 502 });
    }

    /* Fichier absent ou stockage en erreur : on renvoie l'échec tel
       quel, SANS l'en-tête de pièce jointe — sinon le navigateur
       enregistrerait la page d'erreur sous le nom du film. */
    if (!amontRep.ok && amontRep.status !== 206) {
      return new Response(
        amontRep.status === 404 ? 'Ce fichier n\'est plus disponible.' : 'Le fichier n\'a pas pu être récupéré.',
        { status: amontRep.status },
      );
    }

    // Le corps est relayé en flux : rien n'est mis en mémoire, quelle
    // que soit la taille du film.
    const sortie = new Response(amontRep.body, amontRep);
    const nom = url.searchParams.get('nom') || decodeURIComponent(cle.split('/').pop() || '');
    sortie.headers.set('Content-Disposition', enteteNom(nom));
    // Le nom du fichier vient de l'URL : deux noms différents pour le
    // même média ne doivent pas se servir l'un l'autre depuis le cache.
    sortie.headers.append('Vary', 'Accept-Encoding');
    return sortie;
  },
};
