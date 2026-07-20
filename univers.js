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

/** Les 3 univers proposés à une agence locataire. */
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
  if (isDashboardUniverse(data.universe)) {
    if (data.universe === 'autre' && data.has_delivery) return 'event-photos.html';
    return 'communication-dashboard.html';
  }
  if (data.universe === 'fiancailles' || data.universe === 'anniversaire-mariage') {
    return videoPageFor(data.universe);
  }
  return 'event-photos.html';
}

/**
 * Page « accueil » affichée depuis un espace de livraison.
 * Ne renvoie que des pages qui EXISTENT (l'ancien
 * `universe + '.html'` fabriquait des URL mortes comme `autre.html`).
 */
export function homeUrlFor(universe) {
  if (isCelebration(universe))     return 'mariage.html';
  if (universe === 'immobilier')   return 'immobilier.html';
  if (universe === 'communication') return 'communication.html';
  return 'index.html';
}

/* ── Gabarits de galerie (galleries.template) ───────────────── */

export const GALLERY_TEMPLATES = [
  { value: 'mariage',      label: '💍 Mariage' },
  { value: 'fiancailles',  label: '💎 Fiançailles' },
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
