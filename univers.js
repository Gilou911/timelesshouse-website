/* ════════════════════════════════════════════════════════════
   🧭 UNIVERS D'ESPACE CLIENT — sémantique centralisée
   (SaaS B.3, brique 14)

   Historique : `clients.universe` mélangeait le MÉTIER (mariage,
   immobilier, court-métrage…) et le GABARIT de rendu. Depuis la
   brique 13, le gabarit vit sur la GALERIE (`galleries.template`) :
   l'univers ne décrit plus que la FORME de l'espace client.

   Trois univers pour les locataires :
     · celebration   → espace de LIVRAISON (galeries / films)
     · communication → tableau de bord complet + option Analyses
     · neutre        → tableau de bord complet SANS Analyses,
                       + livraisons possibles
   La plateforme (agences.features_all_universes) garde en plus ses
   univers historiques, car elle a des pages vitrines par métier.

   ⚠️ AUCUNE MIGRATION DE DONNÉES : les valeurs héritées vivent leur
   vie normalement. Toute la compatibilité tient dans ce fichier —
   il est la SEULE source de vérité, importée par l'admin comme par
   les portes d'entrée. Ne pas réintroduire de comparaison
   `universe === 'communication'` ailleurs.
   ════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   💼 MÉTIERS — ce qu'une agence ACHÈTE (25/07/2026)
   ════════════════════════════════════════════════════════════
   Une loge se vend désormais PAR MÉTIER. Un métier est plus fin que
   la « forme » d'espace : Mariage et Filmmaker livrent tous deux des
   galeries, mais l'un s'adresse à un couple et l'autre à une marque.

   D'où la séparation, qui est le cœur de ce fichier :
     · FORME   = comment l'espace se comporte (livraison / tableau de bord)
     · MÉTIER  = à qui l'on parle (vocabulaire, gabarits, emails)

   ⚠️ `isCelebration()` mélangeait les deux : il servait à la fois à
   dire « espace de livraison » ET « c'est un couple » (champs Prénom 1 /
   Prénom 2). Un Filmmaker casserait ce raccourci. On garde donc
   `isCelebration` pour le sens COUPLE (son usage historique, inchangé)
   et on ajoute `isDelivery` pour la FORME.

   Ajouter un métier = ajouter une entrée ici. Rien d'autre à toucher.
   ════════════════════════════════════════════════════════════ */

/** @typedef {'livraison'|'dashboard'} Forme */

export const METIERS = [
  {
    value: 'celebration', label: 'Mariage & célébrations', forme: 'livraison',
    couple: true, analytics: false,
    hint: 'Galeries photos et films pour des couples et des familles.',
    templates: ['mariage', 'fiancailles', 'anniversaire', 'evenement'],
  },
  {
    value: 'filmmaker', label: 'Filmmaker', forme: 'livraison',
    couple: false, analytics: false,
    hint: 'Films de marque, clips, documentaires — livrés à des entreprises.',
    templates: ['corporate', 'evenement', 'mannequinat'],
  },
  {
    value: 'communication', label: 'Communication & Marketing', forme: 'dashboard',
    couple: false, analytics: true,
    hint: 'Tableau de bord complet, avec option Analyses réseaux sociaux.',
    templates: ['corporate', 'evenement'],
  },
  {
    value: 'neutre', label: 'Espace neutre', forme: 'dashboard',
    couple: false, analytics: false,
    hint: 'Tableau de bord complet et livraisons, sans Analyses.',
    templates: ['evenement', 'corporate', 'immobilier', 'mannequinat'],
  },
];

/** Le métier d'un univers donné (null si valeur héritée ou inconnue). */
export function metierOf(universe) {
  return METIERS.find(m => m.value === universe) || null;
}

/**
 * FORME de l'espace : livraison (galeries) ou tableau de bord ?
 * Les valeurs HÉRITÉES gardent exactement leur comportement d'avant —
 * c'est `isCelebration` qui les classait, on ne change rien pour elles.
 */
export function isDelivery(universe) {
  const m = metierOf(universe);
  if (m) return m.forme === 'livraison';
  return isCelebration(universe);       // héritage : mariage, fiancailles…
}

/**
 * Les univers qu'une agence a le droit d'utiliser.
 * `owned` = valeurs actives lues dans `agency_universes` (voir la
 * migration 20260725000000). Une agence plateforme (allUniverses) n'est
 * jamais bridée ; une agence sans ligne du tout retombe sur `celebration`
 * pour ne JAMAIS bloquer une console existante (aucune régression).
 */
export function metiersDisponibles(owned, allUniverses) {
  if (allUniverses) return METIERS.slice();
  const list = (owned || []).filter(Boolean);
  if (!list.length) return METIERS.filter(m => m.value === 'celebration');
  return METIERS.filter(m => list.includes(m.value));
}

/** Les 3 univers proposés à une agence locataire (compat — voir METIERS). */
export const UNIVERSES_TENANT = [
  { value: 'celebration',   label: '💍 Mariage & célébrations',
    hint: 'Espace de livraison : galeries photos et films.' },
  { value: 'communication', label: '📊 Communication & Marketing',
    hint: 'Tableau de bord complet, avec option Analyses.' },
  { value: 'neutre',        label: '📁 Espace neutre',
    hint: 'Tableau de bord complet et livraisons, sans Analyses.' },
];

/** Univers historiques, réservés à la plateforme (pages vitrines par métier). */
export const UNIVERSES_LEGACY = [
  { value: 'mariage',              label: '💍 Mariage (héritage)' },
  { value: 'fiancailles',          label: '💎 Fiançailles (héritage)' },
  { value: 'anniversaire-mariage', label: '🎂 Anniversaire de mariage (héritage)' },
  { value: 'immobilier',           label: '🏠 Immobilier (héritage)' },
  { value: 'commercial',           label: '📸 Commercial (héritage)' },
  { value: 'court-metrage',        label: '🎬 Court-métrage (héritage)' },
  { value: 'voyage',               label: '✈️ Voyage (héritage)' },
  { value: 'autre',                label: '📁 Autre (héritage)' },
];

/** Libellé lisible d'un univers, pour l'AFFICHAGE (jamais la valeur brute).
 *  Les cartes clients montraient « celebration » ou « anniversaire-mariage »
 *  — de la plomberie technique servie au locataire (HIG §15). */
export function universeLabel(universe) {
  const all = [...UNIVERSES_TENANT, ...UNIVERSES_LEGACY];
  const found = all.find(u => u.value === universe);
  if (!found) return universe || 'Espace';
  // Sans l'émoji : la carte porte déjà ses propres repères visuels.
  return found.label.replace(/^\p{Extended_Pictographic}+\s*/u, '').replace(' (héritage)', '');
}

/** Liste offerte dans le formulaire client, selon les droits de l'agence. */
export function universeOptions(allUniverses) {
  return allUniverses ? [...UNIVERSES_TENANT, ...UNIVERSES_LEGACY] : UNIVERSES_TENANT;
}

/* ── Familles ───────────────────────────────────────────────── */

// Célébrations : `celebration` + les 3 valeurs « couple » héritées.
// C'est cette famille qui affiche les champs Prénom 1 / Prénom 2 et
// qui coupe par défaut les modules extras à la création.
const CELEBRATIONS = ['celebration', 'mariage', 'fiancailles', 'anniversaire-mariage'];

/** Espace de livraison (galerie/film) plutôt que tableau de bord ? */
export function isCelebration(universe) {
  return CELEBRATIONS.includes(universe);
}

/** L'espace client est-il un TABLEAU DE BORD (communication-dashboard.html) ? */
export function isDashboardUniverse(universe) {
  return universe === 'communication' || universe === 'neutre'
      || universe === 'autre' || !universe;
}

/**
 * L'option « Analyses réseaux sociaux » est-elle proposable ?
 * `communication` UNIQUEMENT — `neutre` ne l'a JAMAIS, même si
 * l'agence dispose du drapeau features_analytics.
 */
export function allowsAnalytics(universe) {
  return universe === 'communication';
}

/**
 * L'onglet « Page client » (pages événement + console des galeries)
 * est-il disponible ? Tout sauf la communication pure — `neutre` y a
 * droit, et les univers hérités gardent exactement leur comportement.
 */
export function hasDeliveryTab(universe) {
  return !!universe && universe !== 'communication';
}

/* ── Destinations ───────────────────────────────────────────── */

/**
 * Page vidéo d'un client. Le gabarit vit désormais sur la galerie :
 * seules les valeurs HÉRITÉES imposent encore une page dédiée.
 */
export function videoPageFor(universe) {
  if (universe === 'anniversaire-mariage') return 'event-anniversary.html';
  if (universe === 'fiancailles')          return 'event-engagement.html';
  return 'event-video.html';
}

/**
 * Où atterrit un client après saisie de son code ?
 * `data` = réponse de la RPC resolve_client_code
 *          ({ universe, redirect_url, has_delivery }).
 *
 * Règles :
 *   1. `redirect_url` (héritage) l'emporte toujours ;
 *   2. univers de tableau de bord → communication-dashboard.html.
 *      EXCEPTION `autre` : valeur héritée portée par de vrais clients,
 *      dont une livraison pure (page photos, modules coupés). Elle ne
 *      part au tableau de bord que si le client n'a AUCUNE livraison —
 *      sinon elle garde sa destination d'aujourd'hui. `neutre`, valeur
 *      neuve, n'a pas cette réserve ;
 *   3. valeurs héritées `fiancailles` / `anniversaire-mariage` → leur
 *      page dédiée, exactement comme avant (andry-elio31ans, client
 *      réel, doit continuer d'arriver sur event-anniversary.html) ;
 *   4. sinon → event-photos.html, qui redirige lui-même vers la page
 *      vidéo quand il n'y a pas de galerie photos. C'est exactement la
 *      règle voulue pour `celebration` : photos si elles existent,
 *      film sinon — sans que la porte d'entrée ait à le savoir.
 */
export function routeForClient(data) {
  if (!data) return 'index.html';
  if (data.redirect_url) return data.redirect_url;
  // Le code d'accès ouvre l'ESPACE du client, quel que soit l'univers
  // (retour de Gil du 22/07/2026 : un couple de VisonMike arrivait sur
  // « votre galerie est en cours de préparation » alors qu'il avait 1
  // document et 3 factures qui l'attendaient — la livraison était le
  // seul monde qu'on lui montrait).
  //
  // L'expérience « on arrive droit sur ses photos » n'est pas perdue :
  // l'espace la rétablit lui-même quand le client n'a QUE de la
  // livraison (voir la bascule dans communication-dashboard.html) —
  // il a toutes les données en main pour en décider, pas la porte.
  return 'communication-dashboard.html';
}

/**
 * Page de LIVRAISON d'un client (galerie photos / film) — l'ancienne
 * destination du code d'accès, désormais choisie par l'espace client
 * une fois qu'il sait ce que le client possède réellement.
 */
export function routeForDelivery(universe) {
  if (universe === 'fiancailles' || universe === 'anniversaire-mariage') {
    return videoPageFor(universe);
  }
  // event-photos redirige lui-même vers la page vidéo s'il n'y a pas
  // de galerie photos : « photos si elles existent, film sinon ».
  return 'event-photos.html';
}

/**
 * Page « accueil » affichée depuis un espace de livraison — c'est le
 * lien porté par le NOM DE LA MARQUE en haut de la galerie.
 *
 * ⚠️ Marque blanche : `mariage.html`, `immobilier.html` et
 * `index.html` sont les pages de VENTE de TimelessHouse. Servies au
 * client d'un locataire, elles lui apprenaient l'existence d'un autre
 * studio en un clic sur le nom de SON photographe (trouvé par Gil le
 * 22/07/2026). Pour un locataire, l'accueil est donc SON espace.
 *
 * @param {string} universe
 * @param {string|null} agencySlug — slug de l'agence propriétaire
 */
export function homeUrlFor(universe, agencySlug) {
  // `?espace=1` : le client DEMANDE son espace. Sans ce drapeau, un
  // client qui n'a que sa galerie serait aussitôt renvoyé vers elle
  // par la bascule du tableau de bord — le lien ne ferait rien.
  if (agencySlug && agencySlug !== 'timelesshouse') return 'communication-dashboard.html?espace=1';
  if (isCelebration(universe))     return 'mariage.html';
  if (universe === 'immobilier')   return 'immobilier.html';
  if (universe === 'communication') return 'communication.html';
  return 'index.html';
}

/* ── Gabarits de galerie (galleries.template) ───────────────── */

export const GALLERY_TEMPLATES = [
  { value: 'mariage',      label: '💍 Mariage' },
  { value: 'fiancailles',  label: '💎 Fiançailles' },
  // Pré-wedding : gabarit ajouté le 25/07/2026 (demande de Gil). Le
  // moteur le connaît aussi (TEMPLATES dans galerie.html) — sans quoi
  // il retomberait silencieusement sur « Votre événement ».
  { value: 'prewedding',   label: '💐 Pré-wedding' },
  { value: 'anniversaire', label: '🎂 Anniversaire' },
  { value: 'evenement',    label: '🎉 Événement' },
  { value: 'mannequinat',  label: '📸 Mannequinat' },
  { value: 'immobilier',   label: '🏠 Immobilier' },
  { value: 'corporate',    label: '🏢 Corporate' },
];

export const GALLERY_KINDS = [
  { value: 'photos', label: '🖼️ Photos' },
  { value: 'video',  label: '🎬 Film' },
  { value: 'mixte',  label: '✨ Photos + film' },
];

/** Libellé d'un gabarit ; un gabarit inconnu retombe sur « Événement ». */
export function templateLabel(value) {
  return (GALLERY_TEMPLATES.find(t => t.value === value) || GALLERY_TEMPLATES[3]).label;
}

/** Libellé d'un type de galerie. */
export function kindLabel(value) {
  return (GALLERY_KINDS.find(k => k.value === value) || GALLERY_KINDS[0]).label;
}

/* ════════════════════════════════════════════════════════════
   💍 NOCES — table de la tradition française
   ════════════════════════════════════════════════════════════
   Reprise TELLE QUELLE de event-anniversary.html, qui en garde une
   copie en ligne : son script n'est pas un module, et le convertir
   pour un simple import ferait courir un risque à une page qui
   fonctionne. Les deux tables doivent donc bouger ensemble — c'est le
   prix assumé pour ne pas toucher à cette page.
   Ici elle sert au concepteur (calcul en direct pendant la saisie) et
   à la galerie (affichage au client). */
export const NOCES = {
  1: "Noces de Coton", 2: "Noces de Cuir", 3: "Noces de Froment",
  4: "Noces de Cire", 5: "Noces de Bois", 6: "Noces de Chypre",
  7: "Noces de Laine", 8: "Noces de Coquelicot", 9: "Noces de Faïence",
  10: "Noces d'Étain", 11: "Noces de Corail", 12: "Noces de Soie",
  13: "Noces de Muguet", 14: "Noces de Plomb", 15: "Noces de Cristal",
  16: "Noces de Saphir", 17: "Noces de Rose", 18: "Noces de Turquoise",
  19: "Noces de Cretonne", 20: "Noces de Porcelaine", 21: "Noces d'Opale",
  22: "Noces de Bronze", 23: "Noces de Béryl", 24: "Noces de Satin",
  25: "Noces d'Argent", 30: "Noces de Perle", 35: "Noces de Rubis",
  40: "Noces d'Émeraude", 45: "Noces de Vermeil", 50: "Noces d'Or",
  55: "Noces d'Orchidée", 60: "Noces de Diamant", 65: "Noces de Palissandre",
  70: "Noces de Platine", 75: "Noces d'Albâtre", 80: "Noces de Chêne",
};

/** Type de noces pour un nombre d'années. Même règle qu'event-anniversary :
 *  au-delà des paliers listés, on annonce le dernier palier franchi.
 *  Renvoie '' si l'entrée n'est pas un nombre d'années exploitable —
 *  le concepteur n'affiche alors rien plutôt qu'un libellé faux. */
export function typeDeNoces(annees, override) {
  if (override && String(override).trim()) return String(override).trim();
  const n = parseInt(annees, 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (NOCES[n]) return NOCES[n];
  const palier = Object.keys(NOCES).map(Number)
    .filter((k) => k <= n)
    .sort((a, b) => b - a)[0];
  return palier ? `Au-delà des ${NOCES[palier]}` : '';
}
