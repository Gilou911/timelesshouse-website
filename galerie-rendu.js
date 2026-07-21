/**
 * galerie-rendu.js — moteur de rendu des GALERIES AUTONOMES (SaaS B.3, brique 13)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Module autonome (styles + comportement) monté par galerie.html :
 *   · mountPhotos(el, categories, opts) → grille justifiée + lightbox + favoris
 *                                          + téléchargement
 *   · mountVideos(el, videos, opts)     → lecteur HLS adaptatif (hls.js) ou MP4
 *   · normalizeVideos(config)           → config.videos[] ou champs legacy
 *
 * ── Pourquoi un module NEUF plutôt qu'un refactor de event-photos.html ? ──
 * Les pages event-*.html servent ~17 clients de PRODUCTION (dont une galerie
 * Cloudinary de 320 photos) et restent branchées sur `event_pages`, source de
 * vérité inchangée par la brique 13. Les refactorer pour qu'elles importent ce
 * module ferait porter un risque de régression réel à des livraisons déjà
 * remises, pour zéro gain fonctionnel aujourd'hui.
 * Ce module ne reprend donc PAS le code de event-photos.html tel quel : il n'en
 * garde que l'algorithme de rangées justifiées (`justify`/`closeRow`, la seule
 * partie réellement subtile) et repart à neuf sur le reste, parce que les deux
 * pages n'ont pas la même source (B2 uniquement ici, Cloudinary + B2 là-bas).
 * La CHARTE, elle, est désormais alignée sur les pages event
 * (Cormorant Garamond / Jost, fond #0a0a0a, accent #b08968) pour une
 * expérience visuelle cohérente d'un bout à l'autre.
 * La convergence des event-*.html vers ce module est explicitement au programme
 * de la session « console des galeries », une fois la bascule d'event_pages
 * faite — voir files/SAAS-ROADMAP.md.
 */

/* ════════════════════════════════════════════════════════════
   Styles — injectés une seule fois, portés par les variables
   CSS de la page hôte (--ink, --accent…) pour suivre la marque
   de l'agence sans que le module connaisse ses couleurs.
   ════════════════════════════════════════════════════════════ */
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
  .g-cat { margin: 0 0 clamp(38px, 6vw, 68px); }
  .g-cat-head {
    display: flex; align-items: baseline; gap: 14px;
    margin: 0 0 clamp(14px, 2vw, 20px);
  }
  .g-cat-name {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
    font-size: clamp(1.35rem, 3.4vw, 1.9rem); letter-spacing: -0.01em; color: var(--ink);
  }
  .g-cat-count { font-size: 12px; color: var(--faint); letter-spacing: 0.04em; }
  .g-rows { display: flex; flex-direction: column; gap: var(--g-gap, 10px); }
  .g-row  { display: flex; gap: var(--g-gap, 10px); }

  .g-cell {
    position: relative; overflow: hidden; border-radius: 4px;
    background: var(--surface); cursor: zoom-in; flex-shrink: 0;
  }
  .g-cell img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    opacity: 0; transition: opacity 0.5s ease;
  }
  .g-cell img.on { opacity: 1; }
  .g-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  /* Outils au survol (desktop) / toujours visibles au doigt (tactile) */
  .g-tools {
    position: absolute; right: 8px; bottom: 8px; display: flex; gap: 8px;
    opacity: 0; transition: opacity 0.18s ease;
  }
  .g-cell:hover .g-tools, .g-cell:focus-within .g-tools { opacity: 1; }
  @media (hover: none) { .g-tools { opacity: 1; } }
  .g-tool {
    /* HIG : 44 px de cible tactile réelle, visuel 34 px centré dedans */
    width: 44px; height: 44px; padding: 5px; margin: -5px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: none; cursor: pointer; color: #fff;
  }
  .g-tool > span {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(12, 12, 12, 0.55); backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.18); transition: background 0.18s ease;
  }
  .g-tool:active > span { transform: scale(0.93); }
  .g-tool svg { width: 15px; height: 15px; fill: none; stroke: #fff; stroke-width: 1.9;
                stroke-linecap: round; stroke-linejoin: round; }
  .g-tool.fav > span { background: var(--accent); border-color: var(--accent); }
  .g-tool.fav svg { fill: #fff; }

  .g-fav-badge {
    position: absolute; left: 8px; top: 8px; width: 22px; height: 22px;
    border-radius: 50%; background: var(--accent); display: none;
    align-items: center; justify-content: center; pointer-events: none;
  }
  .g-fav-badge svg { width: 12px; height: 12px; fill: #fff; }
  .g-cell.is-fav .g-fav-badge { display: flex; }

  /* ── Lightbox ── */
  .g-lb {
    position: fixed; inset: 0; z-index: 200; background: var(--bg-deep, #050505);
    display: none; flex-direction: column;
    opacity: 0; transition: opacity 0.25s ease;
  }
  .g-lb.open { display: flex; }
  .g-lb.shown { opacity: 1; }
  .g-lb-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  }
  .g-lb-cap { font-size: 12.5px; color: var(--muted); min-width: 0;
              overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g-lb-acts { display: flex; align-items: center; gap: 4px; }
  .g-ic {
    width: 44px; height: 44px; border-radius: 50%; border: none; background: none;
    color: var(--ink); display: flex; align-items: center; justify-content: center;
    cursor: pointer; text-decoration: none; transition: background 0.16s ease;
  }
  .g-ic:hover { background: rgba(127, 127, 127, 0.16); }
  .g-ic:active { transform: scale(0.94); }
  .g-ic svg { width: 19px; height: 19px; fill: none; stroke: currentColor;
              stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .g-ic.fav { color: var(--accent); }
  .g-ic.fav svg { fill: var(--accent); }

  .g-lb-stage {
    flex: 1; position: relative; display: flex; align-items: center;
    justify-content: center; min-height: 0; padding: 0 8px 8px;
  }
  .g-lb-img {
    max-width: 100%; max-height: 100%; object-fit: contain; display: block;
    opacity: 0; transition: opacity 0.28s ease;
  }
  .g-lb-img.on { opacity: 1; }
  .g-nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(20, 20, 20, 0.5); color: #fff; backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
  }
  .g-nav:active { transform: translateY(-50%) scale(0.94); }
  .g-nav.prev { left: 10px; } .g-nav.next { right: 10px; }
  .g-nav svg { width: 20px; height: 20px; fill: none; stroke: #fff;
               stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 640px) { .g-nav { display: none; } }
  .g-lb-count {
    text-align: center; font-size: 12px; color: var(--faint);
    padding: 0 0 max(12px, env(safe-area-inset-bottom)); letter-spacing: 0.08em;
  }
  body.g-locked { position: fixed; width: 100%; overflow: hidden; }

  /* ── Lecteur vidéo — mécanique event-video.html ──
     Une SCÈNE unique (cadre cinéma) où les vidéos se fondent l'une dans
     l'autre, un track sélecteur à indicateur glissant pour en changer,
     et le sélecteur de qualité en OVERLAY sur la vidéo. */
  .g-video { margin: 0 auto clamp(46px, 7vw, 84px); max-width: 1200px; }
  .g-video-title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
    font-size: clamp(1.5rem, 3.6vw, 2.2rem); letter-spacing: -0.01em; line-height: 1.15;
    color: var(--ink); margin: 0 0 18px; text-align: center;
  }

  /* Track sélecteur : pilule vitrée, indicateur accent qui GLISSE sous
     l'onglet actif (position/largeur calées en JS — titres libres). */
  .g-selector { display: flex; justify-content: center; margin: 0 0 26px; }
  .g-sel-track {
    display: inline-flex; position: relative; padding: 4px; max-width: 100%;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    background: rgba(244, 240, 235, 0.03);
    border: 1px solid var(--hair, rgba(242,239,233,0.12)); border-radius: 2px;
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  }
  .g-sel-ind {
    position: absolute; top: 4px; bottom: 4px; left: 0; width: 0;
    background: var(--accent, #b08968); border-radius: 1px;
    transition: transform 0.6s cubic-bezier(0.65,0.05,0.35,1), width 0.6s cubic-bezier(0.65,0.05,0.35,1);
  }
  .g-sel-btn {
    position: relative; z-index: 1; background: none; border: none; cursor: pointer;
    color: var(--muted); padding: 12px 26px; min-height: 44px;
    font-family: 'Jost', inherit; font-size: 10.5px; font-weight: 400;
    letter-spacing: 0.28em; text-transform: uppercase; white-space: nowrap;
    transition: color 0.6s cubic-bezier(0.65,0.05,0.35,1);
  }
  .g-sel-btn.active { color: #0a0a0a; font-weight: 500; }

  /* Scène : cadre cinéma (ombre profonde + halo chaud + liseré) —
     les slides se fondent dedans, façon event-video. */
  .g-stage {
    position: relative; aspect-ratio: 16 / 9; background: #000;
    border-radius: 2px; overflow: hidden;
    box-shadow:
      0 40px 80px rgba(0,0,0,0.7),
      0 0 0 1px rgba(242,239,233,0.10),
      0 0 120px rgba(176,137,104,0.10);
  }
  .g-slide {
    position: absolute; inset: 0; opacity: 0; visibility: hidden;
    transition: opacity 0.8s cubic-bezier(0.65,0.05,0.35,1), visibility 0.8s cubic-bezier(0.65,0.05,0.35,1);
  }
  .g-slide.active { opacity: 1; visibility: visible; }
  .g-slide video { width: 100%; height: 100%; display: block; background: #000; }
  .g-slide .g-soon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

  /* Qualité en overlay (haut-droit) : fond noir vitré, actif = accent. */
  .g-qc {
    position: absolute; top: 14px; right: 14px; z-index: 10;
    display: flex; gap: 4px; padding: 4px; border-radius: 4px;
    background: rgba(10, 10, 10, 0.75);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    border: 1px solid var(--hair, rgba(242,239,233,0.12));
  }
  .g-qc:empty { display: none; }
  .g-qb {
    background: transparent; border: none; cursor: pointer;
    color: var(--muted); padding: 6px 10px; border-radius: 2px;
    font-family: 'Jost', inherit; font-size: 10px; font-weight: 500; letter-spacing: 0.1em;
    transition: background 0.3s ease, color 0.3s ease;
  }
  .g-qb:hover { color: var(--ink); }
  .g-qb.active { background: var(--accent, #b08968); color: #0a0a0a; }
  /* HIG : cibles tactiles ≥ 44 px sur écrans tactiles */
  @media (hover: none) and (pointer: coarse) {
    .g-qb { min-height: 44px; min-width: 44px; }
  }

  .g-video-bar {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; flex-wrap: wrap; margin-top: 20px;
  }
  .g-video-bar:empty { display: none; }

  /* Chapitres — liste sous le lecteur, mécanique event-video :
     clic = saut dans la vidéo, chapitre courant surligné pendant la
     lecture (liseré accent + fond). */
  .g-chapters { max-width: 880px; margin: clamp(30px, 5vw, 48px) auto 0; }
  .g-chapters:empty { display: none; }
  .g-chap-head {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 20px; margin-bottom: 18px; padding-bottom: 14px;
    border-bottom: 1px solid var(--hair, rgba(242,239,233,0.12));
  }
  .g-chap-label {
    display: block; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.4em; color: var(--accent, #b08968); margin-bottom: 6px;
  }
  .g-chap-title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 1.5rem; font-weight: 400; color: var(--ink); line-height: 1; margin: 0;
  }
  .g-chap-count {
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.35em;
    color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .g-chap-list { display: flex; flex-direction: column; }
  .g-chap {
    display: flex; align-items: baseline; gap: 20px; width: 100%;
    min-height: 44px; padding: 14px 16px; text-align: left; cursor: pointer;
    background: transparent; border: none; font-family: inherit; color: var(--ink);
    border-top: 1px solid var(--hair, rgba(242,239,233,0.12));
    border-left: 2px solid transparent;
    transition: background 0.35s ease, border-left-color 0.35s ease;
  }
  .g-chap:hover { background: rgba(244, 240, 235, 0.03); }
  .g-chap.active { background: rgba(244, 240, 235, 0.05); border-left-color: var(--accent, #b08968); }
  .g-chap-time {
    font-family: 'Jost', inherit; font-size: 11px; font-weight: 500;
    color: var(--accent, #b08968); letter-spacing: 0.08em;
    min-width: 56px; flex-shrink: 0; font-variant-numeric: tabular-nums;
  }
  .g-chap-titre {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 1.1rem; line-height: 1.4;
  }
  .g-dl {
    min-height: 44px; padding: 0 18px; border-radius: 999px; display: inline-flex;
    align-items: center; gap: 8px; text-decoration: none;
    background: var(--accent); color: #fff; font-size: 12px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .g-soon {
    display: flex; align-items: center; justify-content: center; aspect-ratio: 16/9;
    border-radius: 6px; background: var(--surface); color: var(--faint);
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
  }
  /* display:flex bat le [hidden] du navigateur : sans cette règle, le
     « Bientôt disponible » s'affiche SOUS un film parfaitement lisible. */
  .g-soon[hidden] { display: none; }
  `;
  document.head.appendChild(s);
}

/* ── Icônes (inline, aucun réseau) ─────────────────────────── */
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  heartFull: '<svg viewBox="0 0 24 24" stroke="none"><path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
};

/* ── Verrou de scroll (compteur : lightbox empilable) ──────── */
let lockCount = 0, savedScrollY = 0;
function lockBody() {
  if (lockCount++ === 0) {
    savedScrollY = window.scrollY;
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add('g-locked');
  }
}
function unlockBody() {
  if (--lockCount <= 0) {
    lockCount = 0;
    document.body.classList.remove('g-locked');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY); // restauration exacte
  }
}

/* ════════════════════════════════════════════════════════════
   Layout justifié — rangées de hauteur égale, pleine largeur.
   Seul emprunt littéral à event-photos.html : cet algorithme est
   éprouvé sur la galerie de 320 photos en production, le
   réécrire ne ferait que réintroduire ses cas limites.
   ════════════════════════════════════════════════════════════ */
function justify(photos, containerW, targetH, gap) {
  const rows = [];
  let row = [], arSum = 0;
  const maxH = targetH * 1.45;
  photos.forEach((p) => {
    const ar = (p.width && p.height) ? (p.width / p.height) : 1.5;
    row.push({ p, ar });
    arSum += ar;
    if (arSum * targetH + (row.length - 1) * gap >= containerW) {
      rows.push(closeRow(row, arSum, containerW, gap, maxH));
      row = []; arSum = 0;
    }
  });
  if (row.length) {
    // Dernière rangée : ne pas étirer démesurément
    const naturalH = (containerW - (row.length - 1) * gap) / arSum;
    const h = Math.min(naturalH, targetH * 1.12);
    rows.push(row.map(it => ({ p: it.p, w: Math.floor(it.ar * h), h })));
  }
  return rows;
}
function closeRow(row, arSum, containerW, gap, maxH) {
  // Hauteur de remplissage exacte : somme des largeurs + espaces = containerW.
  // Pas de plancher : il ferait déborder les rangées à fort arSum (paysages).
  const h = Math.min((containerW - (row.length - 1) * gap) / arSum, maxH);
  return row.map(it => ({ p: it.p, w: Math.floor(it.ar * h), h }));
}

/* ── URLs B2 : figées, aucune transformation à la volée ─────── */
const GRID = p => p.url_grid || p.url_view || p.url_original || '';
const VIEW = p => p.url_view || p.url_original || p.url_grid || '';
const FULL = p => p.url_original || p.url_view || p.url_grid || '';

// Échappement d'ATTRIBUT : les URLs et noms de fichiers viennent de la config
// de galerie (posée par l'admin) et sont injectés dans du innerHTML. On neutralise
// toute rupture d'attribut (guillemet, chevron) pour qu'aucune valeur ne puisse
// injecter de balisage/handler.
const escAttr = v => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/* ── Téléchargement DIRECT d'une photo ──
   L'attribut `download` est IGNORÉ en cross-origin : les photos vivent sur
   le stockage média (autre domaine), le clic ouvrait donc un onglet au lieu
   d'enregistrer le fichier. On récupère la photo en blob (quelques Mo — sans
   commune mesure avec les vidéos) puis on déclenche un vrai téléchargement
   depuis une URL de même origine. Échec (CORS, réseau) → repli sur
   l'ancien comportement (ouverture d'onglet). */
async function downloadPhoto(url, filename) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob();
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = filename || 'photo.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 4000);
}

/**
 * Monte une galerie photos.
 * @param {HTMLElement} mount      conteneur (vidé)
 * @param {Array} categories       [{ category, photos: [{id,width,height,url_*}] }]
 * @param {Object} opts            { favKey, title }
 */
export function mountPhotos(mount, categories, opts = {}) {
  injectStyles();
  const title = opts.title || 'Galerie';
  const cats = (categories || []).filter(c => c && Array.isArray(c.photos) && c.photos.length);
  if (!cats.length) return null;

  /* Favoris — persistés localement, silencieux en navigation privée */
  const FAV_KEY = 'laloge_fav_' + (opts.favKey || 'x');
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (_) {}
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (_) {} };

  /* Liste à plat : l'ordre d'affichage EST l'ordre de la lightbox */
  const FLAT = [];
  cats.forEach(c => c.photos.forEach(p => FLAT.push({ ...p, category: c.category })));
  const fileNameOf = (p, i) => {
    const base = (p.category || 'photo').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
    return base + '-' + String(i + 1).padStart(3, '0') + '.jpg';
  };

  /* ── Chargement paresseux : loading="lazy" NATIF ──
     Deux raisons de ne PAS reprendre l'IntersectionObserver de
     event-photos.html :
     1. son blur-up + recyclage mémoire n'a de sens qu'avec les
        transformations Cloudinary (variante floue 36 px à la volée) ;
        les photos B2 portent des URLs figées dont url_grid est déjà la
        plus petite — il n'y a rien à dégrader ;
     2. sans variante à dégrader, l'observer ne ferait que réimplémenter
        `loading="lazy"` à la main — donc du code en plus, un chemin de
        panne en plus (un observer qui ne se déclenche pas laisse la
        galerie vide), pour le même résultat. Le moteur de rendu fait
        déjà ce travail, et mieux (il tient compte de la vitesse de
        défilement et du type de connexion).
     Le fondu reste piloté par la classe .on, posée au load. */
  const fadeIn = (cell) => {
    const img = cell.querySelector('img');
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) { img.classList.add('on'); return; }
    img.addEventListener('load', () => img.classList.add('on'), { once: true });
    img.addEventListener('error', () => { cell.style.display = 'none'; }, { once: true });
  };

  /* ── Construction ── */
  mount.innerHTML = '';
  const sections = [];
  const multi = cats.length > 1;
  let flatIdx = 0;
  cats.forEach(c => {
    const sec = document.createElement('section');
    sec.className = 'g-cat';
    if (multi) {
      const head = document.createElement('div');
      head.className = 'g-cat-head';
      head.innerHTML = `<h2 class="g-cat-name"></h2><span class="g-cat-count">${c.photos.length} photo${c.photos.length > 1 ? 's' : ''}</span>`;
      head.querySelector('.g-cat-name').textContent = c.category || 'Photos';
      sec.appendChild(head);
    }
    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'g-rows';
    sec.appendChild(rowsWrap);
    mount.appendChild(sec);
    sections.push({ rowsWrap, photos: c.photos, from: flatIdx });
    flatIdx += c.photos.length;
  });

  function layoutAll() {
    sections.forEach(({ rowsWrap, photos, from }) => {
      rowsWrap.innerHTML = '';
      // Mesure après vidage : largeur sous-pixel exacte. -1 px absorbe
      // les erreurs d'arrondi float → px qui feraient déborder la rangée.
      const bcr = rowsWrap.getBoundingClientRect();
      const containerW = Math.max(Math.floor(bcr.width > 1 ? bcr.width : rowsWrap.offsetWidth) - 1, 80);

      // Le gabarit suit la largeur RÉELLE du conteneur, pas window.innerWidth :
      // c'est la seule mesure qui décrit la place dont la grille dispose. Les
      // deux divergent dès que la galerie n'occupe pas toute la fenêtre (colonne
      // étroite, aperçu admin) — s'appuyer sur innerWidth produit alors des
      // rangées calibrées pour un écran large dans un conteneur étroit, qui
      // débordent horizontalement.
      const gap = containerW <= 760 ? 6 : 10;
      const targetH = containerW <= 480 ? 200
                    : containerW <= 760 ? 240
                    : containerW <= 1200 ? 320 : 380;
      rowsWrap.style.setProperty('--g-gap', gap + 'px');

      justify(photos, containerW, targetH, gap).forEach(r => {
        const rowEl = document.createElement('div');
        rowEl.className = 'g-row';
        r.forEach(({ p, w, h }) => {
          const gi = from + photos.indexOf(p);
          const cell = document.createElement('div');
          cell.className = 'g-cell' + (favs.has(p.id) ? ' is-fav' : '');
          cell.style.width = w + 'px';
          cell.style.height = Math.round(h) + 'px';
          cell.dataset.grid = GRID(p);
          cell.dataset.id = p.id;
          cell.tabIndex = 0;
          cell.setAttribute('role', 'button');
          cell.setAttribute('aria-label', 'Ouvrir la photo en grand');
          cell.innerHTML =
            `<img src="${escAttr(GRID(p))}" alt="${escAttr(p.category || title)}" loading="lazy" decoding="async" />` +
            `<div class="g-fav-badge">${ICON.heartFull}</div>` +
            `<div class="g-tools">` +
              `<button class="g-tool${favs.has(p.id) ? ' fav' : ''}" data-act="fav" aria-label="Ajouter aux favoris"><span>${ICON.heart}</span></button>` +
              `<a class="g-tool" data-act="dl" href="${escAttr(FULL(p))}" download="${escAttr(fileNameOf(p, gi))}" aria-label="Télécharger"><span>${ICON.dl}</span></a>` +
            `</div>`;

          cell.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (act) {
              e.stopPropagation();
              if (act.dataset.act === 'fav') { e.preventDefault(); toggleFav(p.id); }
              else if (act.dataset.act === 'dl') {
                // Téléchargement direct (blob) — jamais d'onglet qui s'ouvre.
                e.preventDefault();
                downloadPhoto(act.href, act.getAttribute('download'))
                  .catch(() => { window.open(act.href, '_blank'); });
              }
              return;
            }
            openLb(gi);
          });
          cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(gi); }
          });

          rowEl.appendChild(cell);
          fadeIn(cell);
        });
        rowsWrap.appendChild(rowEl);
      });
    });
  }

  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    saveFavs();
    const on = favs.has(id);
    const sel = window.CSS && CSS.escape ? CSS.escape(id) : id;
    mount.querySelectorAll(`.g-cell[data-id="${sel}"]`).forEach(c => {
      c.classList.toggle('is-fav', on);
      const b = c.querySelector('.g-tool[data-act="fav"]');
      if (b) b.classList.toggle('fav', on);
    });
    syncLbFav();
  }

  /* ── Lightbox ── */
  const lb = document.createElement('div');
  lb.className = 'g-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML =
    `<div class="g-lb-bar">
       <div class="g-lb-cap" data-el="cap"></div>
       <div class="g-lb-acts">
         <button class="g-ic" data-el="fav" aria-label="Favori">${ICON.heart}</button>
         <a class="g-ic" data-el="dl" download aria-label="Télécharger">${ICON.dl}</a>
         <button class="g-ic" data-el="close" aria-label="Fermer">${ICON.close}</button>
       </div>
     </div>
     <div class="g-lb-stage" data-el="stage">
       <button class="g-nav prev" data-el="prev" aria-label="Photo précédente">${ICON.prev}</button>
       <img class="g-lb-img" data-el="img" alt="" />
       <button class="g-nav next" data-el="next" aria-label="Photo suivante">${ICON.next}</button>
     </div>
     <div class="g-lb-count"><span data-el="i">1</span> / <span data-el="n">1</span></div>`;
  document.body.appendChild(lb);
  const $ = (n) => lb.querySelector(`[data-el="${n}"]`);
  const lbImg = $('img'), lbStage = $('stage');
  let lbIdx = 0, lbOpen = false;
  const preCache = []; // cache circulaire, écrasé à chaque navigation

  function openLb(i) {
    lbIdx = i; lbOpen = true;
    lb.classList.add('open');
    requestAnimationFrame(() => lb.classList.add('shown'));
    lockBody();
    renderLb();
    $('close').focus();
  }
  function closeLb() {
    lbOpen = false;
    lb.classList.remove('shown');
    setTimeout(() => lb.classList.remove('open'), 250);
    unlockBody();
  }
  function renderLb() {
    const p = FLAT[lbIdx];
    if (!p) return;
    lbImg.classList.remove('on');
    lbImg.style.transform = '';
    const pic = new Image();
    pic.onload = () => {
      lbImg.src = pic.src;
      lbImg.alt = p.category || title;
      requestAnimationFrame(() => lbImg.classList.add('on'));
    };
    pic.src = VIEW(p);
    $('cap').textContent = p.category || title;
    $('i').textContent = lbIdx + 1;
    $('n').textContent = FLAT.length;
    const dl = $('dl');
    dl.href = FULL(p);
    dl.setAttribute('download', fileNameOf(p, lbIdx));
    syncLbFav();
    // Précharge les voisins immédiats (2 slots max)
    preCache.length = 0;
    [lbIdx + 1, lbIdx - 1].forEach(j => {
      if (FLAT[j]) { const im = new Image(); im.src = VIEW(FLAT[j]); preCache.push(im); }
    });
  }
  function syncLbFav() {
    const p = FLAT[lbIdx];
    $('fav').classList.toggle('fav', !!p && favs.has(p.id));
  }
  function step(d) {
    lbIdx = (lbIdx + d + FLAT.length) % FLAT.length;
    renderLb();
  }

  $('close').addEventListener('click', closeLb);
  $('prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
  $('next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
  $('fav').addEventListener('click', () => { const p = FLAT[lbIdx]; if (p) toggleFav(p.id); });
  $('dl').addEventListener('click', (e) => {
    // Téléchargement direct (blob) — même mécanique que la grille.
    e.preventDefault();
    e.stopPropagation();
    const a = $('dl');
    downloadPhoto(a.href, a.getAttribute('download'))
      .catch(() => { window.open(a.href, '_blank'); });
  });

  document.addEventListener('keydown', (e) => {
    if (!lbOpen) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  /* Swipe mobile : l'image suit le doigt, flick OU drag > 20 % = photo
     suivante. Sortie stricte — un geste vertical ne ferme PAS. */
  const SW_LOCK = 8, SW_RATIO = 0.20, SW_VEL = 0.5;
  let sx = 0, sy = 0, st = 0, sdx = 0, swDir = null;
  lbStage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    st = Date.now(); sdx = 0; swDir = null;
    lbImg.style.transition = 'none';
  }, { passive: true });
  lbStage.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!swDir) {
      if (Math.abs(dx) < SW_LOCK && Math.abs(dy) < SW_LOCK) return;
      swDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swDir !== 'h') return;
    sdx = dx;
    lbImg.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  lbStage.addEventListener('touchend', () => {
    lbImg.style.transition = '';
    if (swDir !== 'h') return;
    const vel = Math.abs(sdx) / Math.max(Date.now() - st, 1);
    if (Math.abs(sdx) > window.innerWidth * SW_RATIO || vel > SW_VEL) step(sdx < 0 ? 1 : -1);
    else lbImg.style.transform = '';
    sdx = 0; swDir = null;
  });

  layoutAll();
  let rsT;
  const onResize = () => { clearTimeout(rsT); rsT = setTimeout(layoutAll, 220); };
  window.addEventListener('resize', onResize, { passive: true });
  // Le conteneur peut changer de largeur SANS que la fenêtre bouge (rotation
  // gérée en CSS, colonne repliée, barre d'outils mobile). ResizeObserver
  // observe la vraie cause ; l'écouteur `resize` reste le filet des
  // navigateurs qui ne l'ont pas.
  if (window.ResizeObserver) {
    let first = true;
    new ResizeObserver(() => {
      if (first) { first = false; return; } // l'observation initiale n'est pas un changement
      onResize();
    }).observe(mount);
  }

  return { relayout: layoutAll, count: FLAT.length };
}

/* ════════════════════════════════════════════════════════════
   VIDÉO
   ════════════════════════════════════════════════════════════ */

/**
 * Normalise la config vidéo. Modèle courant : config.videos = [{ key,
 * title, hls, urls, downloadUrl }]. Les configs migrées depuis
 * `event_pages` peuvent encore porter les champs legacy « teaser… / film… »
 * — on les reconstruit à l'identique (même logique que event-video.html).
 */
export function normalizeVideos(c) {
  c = c || {};
  const safeKey = (k, i) => String(k || '').replace(/[^a-zA-Z0-9_-]/g, '') || ('v' + i);
  if (Array.isArray(c.videos) && c.videos.length) {
    const seen = new Set();
    return c.videos.filter(v => v && (v.title || v.key)).map((v, i) => {
      let key = safeKey(v.key, i);
      while (seen.has(key)) key += '-' + i;
      seen.add(key);
      return {
        key,
        title: v.title || ('Vidéo ' + (i + 1)),
        hls: v.hls || '',
        urls: v.urls || {},
        downloadUrl: v.downloadUrl || '',
        chapitres: Array.isArray(v.chapitres) ? v.chapitres : [],
        // Drapeau d'attente d'encodage : sans ce report, la vidéo
        // s'afficherait malgré tout (l'objet est reconstruit ici).
        awaitingEncode: v.awaitingEncode === true,
      };
    });
  }
  const list = [];
  if (c.afficherTeaser) list.push({
    key: 'teaser', title: 'Teaser', hls: c.teaserHls || '',
    urls: c.teaserUrls || {}, downloadUrl: c.teaserDownloadUrl || '',
    chapitres: c.teaserChapitres || [],
  });
  if (c.afficherFilm) list.push({
    key: 'film', title: 'Film complet', hls: c.filmHls || '',
    urls: c.filmUrls || {}, downloadUrl: c.filmDownloadUrl || '',
    chapitres: c.filmChapitres || [],
  });
  return list;
}

/**
 * Monte les lecteurs vidéo.
 * @param {HTMLElement} mount
 * @param {Array} videos  sortie de normalizeVideos()
 */
export async function mountVideos(mount, videos, opts = {}) {
  injectStyles();
  const list = (videos || []).filter(Boolean);
  if (!list.length) return null;

  // hls.js chargé UNIQUEMENT si au moins une vidéo est en HLS
  let Hls = null;
  if (list.some(v => v.hls)) {
    try { Hls = (await import('hls.js')).default; }
    catch (e) { console.warn('[galerie] hls.js indisponible :', e); }
  }

  mount.innerHTML = '';
  const single = list.length === 1;

  const sec = document.createElement('section');
  sec.className = 'g-video';
  mount.appendChild(sec);

  // Titre : seulement en vidéo unique (en multi, le SÉLECTEUR porte les
  // titres — exactement la logique d'event-video).
  if (single && opts.forceTitles) {
    const h = document.createElement('h2');
    h.className = 'g-video-title';
    h.textContent = list[0].title || '';
    sec.appendChild(h);
  }

  // ── Track sélecteur (multi) : indicateur accent glissant ──
  let ind = null;
  const btns = [];
  if (!single) {
    const wrap = document.createElement('div');
    wrap.className = 'g-selector';
    const track = document.createElement('div');
    track.className = 'g-sel-track';
    ind = document.createElement('span');
    ind.className = 'g-sel-ind';
    ind.setAttribute('aria-hidden', 'true');
    track.appendChild(ind);
    list.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-sel-btn' + (i === 0 ? ' active' : '');
      b.textContent = v.title || 'Vidéo ' + (i + 1);
      b.addEventListener('click', () => select(i));
      track.appendChild(b);
      btns.push(b);
    });
    wrap.appendChild(track);
    sec.appendChild(wrap);
  }

  // ── Scène unique : un slide par vidéo, fondu croisé ──
  const stage = document.createElement('div');
  stage.className = 'g-stage';
  sec.appendChild(stage);

  const bar = document.createElement('div');
  bar.className = 'g-video-bar';
  sec.appendChild(bar);

  const slides = list.map((v, i) => {
    const slide = document.createElement('div');
    slide.className = 'g-slide' + (i === 0 ? ' active' : '');
    stage.appendChild(slide);

    const hasHls  = v.hls && v.hls.trim();
    const has1080 = v.urls && v.urls['1080p'] && v.urls['1080p'].trim();
    const has4K   = v.urls && v.urls['4K']   && v.urls['4K'].trim();

    // Vidéo d'un locataire en attente d'encodage : on ne la montre pas
    // encore (le client verrait le master brut, lourd et parfois saccadé).
    // Le worker lève ce drapeau dès qu'une qualité est prête.
    if ((v.awaitingEncode && !hasHls) || (!has1080 && !has4K && !hasHls)) {
      const soon = document.createElement('div');
      soon.className = 'g-soon';
      soon.textContent = v.awaitingEncode
        ? 'Votre film est en cours de préparation'
        : 'Bientôt disponible';
      slide.appendChild(soon);
      return { el: slide, video: null };
    }

    const video = document.createElement('video');
    video.setAttribute('controls', '');
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    slide.appendChild(video);

    // Sélecteur de qualité en OVERLAY (haut-droit de la vidéo)
    const qc = document.createElement('div');
    qc.className = 'g-qc';
    slide.appendChild(qc);

    if (hasHls) {
      setupHls(video, qc, v.hls.trim(), Hls);
    } else {
      const srcs = [];
      if (has1080) srcs.push({ label: '1080p', url: v.urls['1080p'].trim() });
      if (has4K)   srcs.push({ label: '4K',    url: v.urls['4K'].trim() });
      video.src = srcs[0].url;
      if (srcs.length > 1) {
        srcs.forEach((s, k) => {
          const b = document.createElement('button');
          b.className = 'g-qb' + (k === 0 ? ' active' : '');
          b.textContent = s.label;
          b.onclick = () => {
            if (b.classList.contains('active')) return;
            // Reprise à l'identique : position et état de lecture conservés
            const t = video.currentTime, paused = video.paused;
            qc.querySelectorAll('.g-qb').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            video.src = s.url;
            video.currentTime = t;
            if (!paused) video.play().catch(() => {});
          };
          qc.appendChild(b);
        });
      }
    }
    return { el: slide, video };
  });

  // Téléchargement : celui de la vidéo ACTIVE, sous la scène.
  function renderBar(i) {
    bar.innerHTML = '';
    const v = list[i];
    if (v.downloadUrl) {
      const a = document.createElement('a');
      a.className = 'g-dl'; a.href = v.downloadUrl; a.setAttribute('download', '');
      a.innerHTML = ICON.dl + '<span>Télécharger</span>';
      bar.appendChild(a);
    }
  }

  // ── Chapitres de la vidéo active (mécanique event-video) ──
  const chapWrap = document.createElement('div');
  chapWrap.className = 'g-chapters';
  sec.appendChild(chapWrap);

  const parseT = (input) => {
    if (typeof input === 'number' && isFinite(input)) return Math.max(0, input);
    if (!input) return 0;
    const parts = String(input).trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };
  const fmtT = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      : m + ':' + String(s).padStart(2, '0');
  };
  const chapsOf = (v) => (Array.isArray(v.chapitres) ? v.chapitres : [])
    .map(c => ({ time: parseT(c.time ?? c.temps ?? c.start), titre: String(c.titre ?? c.title ?? '').trim() }))
    .filter(c => c.titre)
    .sort((a, b) => a.time - b.time);

  let chapItems = [];
  function renderChapters(i) {
    chapWrap.innerHTML = '';
    chapItems = [];
    const chs = chapsOf(list[i]);
    if (!chs.length) return;
    const head = document.createElement('div');
    head.className = 'g-chap-head';
    head.innerHTML =
      '<div><span class="g-chap-label">Chapitres</span><h3 class="g-chap-title"></h3></div>' +
      '<span class="g-chap-count">' + chs.length + ' chapitre' + (chs.length > 1 ? 's' : '') + '</span>';
    head.querySelector('.g-chap-title').textContent = list[i].title || 'Parcourir';
    chapWrap.appendChild(head);
    const ul = document.createElement('div');
    ul.className = 'g-chap-list';
    chs.forEach((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-chap';
      b.setAttribute('aria-label', 'Lire à ' + fmtT(ch.time) + ' — ' + ch.titre);
      b.innerHTML = '<span class="g-chap-time">' + fmtT(ch.time) + '</span><span class="g-chap-titre"></span>';
      b.querySelector('.g-chap-titre').textContent = ch.titre;
      b.addEventListener('click', () => {
        const vid = slides[current].video;
        if (!vid) return;
        try { vid.currentTime = ch.time; } catch (e) {}
        vid.play().catch(() => {});
        stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      ul.appendChild(b);
      chapItems.push({ el: b, time: ch.time });
    });
    chapWrap.appendChild(ul);
  }
  function updateActiveChap() {
    if (!chapItems.length) return;
    const vid = slides[current].video;
    if (!vid) return;
    const t = vid.currentTime || 0;
    let idx = -1;
    for (let k = 0; k < chapItems.length; k++) {
      if (t + 0.25 >= chapItems[k].time) idx = k; else break;
    }
    chapItems.forEach((c, k) => c.el.classList.toggle('active', k === idx));
  }

  let current = 0;
  function placeIndicator() {
    if (!ind || !btns[current]) return;
    const b = btns[current];
    ind.style.width = b.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  }
  function select(i) {
    if (i === current) return;
    const prev = slides[current];
    if (prev.video && !prev.video.paused) prev.video.pause();
    prev.el.classList.remove('active');
    if (btns[current]) btns[current].classList.remove('active');
    current = i;
    slides[i].el.classList.add('active');
    if (btns[i]) btns[i].classList.add('active');
    placeIndicator();
    renderBar(i);
    renderChapters(i);
  }

  renderBar(0);
  renderChapters(0);
  // Surlignage du chapitre courant pendant la lecture (vidéo active seule)
  slides.forEach((s) => {
    if (s.video) s.video.addEventListener('timeupdate', () => {
      if (slides[current] === s) updateActiveChap();
    });
  });
  if (!single) {
    // L'indicateur se cale après la mise en page (et se recale quand la
    // police charge ou que la fenêtre change : les largeurs bougent).
    requestAnimationFrame(placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);
    window.addEventListener('resize', placeIndicator);
  }
  return { count: list.length };
}

function setupHls(video, bar, src, Hls) {
  const sideOf = (l) => Math.min(l.width || 0, l.height || 0) || (l.height || 0);
  const labelOf = (side) => side >= 2160 ? '4K' : side + 'p';

  // hls.js absent ou navigateur sans MSE : lecture HLS native (Safari) —
  // adaptative aussi, mais sans palier lisible.
  if (!Hls || !Hls.isSupported()) {
    video.src = src;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const b = document.createElement('button');
      b.className = 'g-qb active'; b.textContent = 'Auto'; b.disabled = true;
      bar.insertBefore(b, bar.firstChild);
    }
    return;
  }

  const autoBtn = document.createElement('button');
  autoBtn.className = 'g-qb active'; autoBtn.textContent = 'Auto';
  bar.insertBefore(autoBtn, bar.firstChild);

  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);

  hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
    const levels = (data.levels || []).map((l, i) => ({ i, side: sideOf(l) }))
      .sort((a, b) => b.side - a.side);
    const btns = [autoBtn];
    const activate = (btn) => { btns.forEach(x => x.classList.remove('active')); btn.classList.add('active'); };
    levels.forEach(({ i, side }) => {
      const b = document.createElement('button');
      b.className = 'g-qb'; b.textContent = labelOf(side);
      b.onclick = () => { hls.currentLevel = i; activate(b); autoBtn.textContent = 'Auto'; };
      bar.insertBefore(b, autoBtn.nextSibling);
      btns.push(b);
    });
    autoBtn.onclick = () => { hls.currentLevel = -1; activate(autoBtn); };
  });

  // Le palier réellement joué s'affiche dans le bouton Auto
  hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
    const l = hls.levels[data.level];
    if (l && hls.autoLevelEnabled) autoBtn.textContent = 'Auto · ' + labelOf(sideOf(l));
  });

  // Résilience réseau / décodage (coupures Wi-Fi…)
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
  });
}
