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
  /* ── SCÈNES — motif repris de la galerie d'Ezla & Davy ──────
     (event-photos-cinematic.html, la galerie TimelessHouse que Gil
     donne comme référence). Une catégorie n'est plus un titre posé à
     gauche au-dessus d'une grille : c'est une SCÈNE, annoncée au
     centre — son numéro en petites capitales espacées, son nom en
     italique, un filet court dessous. Le rythme du récit devient
     visible avant même de voir les photos. */
  .g-cat { margin: 0 0 clamp(38px, 6vw, 68px); }
  .g-cat-head {
    text-align: center; max-width: 720px;
    margin: 0 auto clamp(30px, 4.5vw, 56px);
    padding-top: clamp(24px, 5vw, 64px);
  }
  .g-cat-no {
    display: block; margin-bottom: 16px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 11px; letter-spacing: 0.5em; text-transform: uppercase;
    color: var(--accent);
  }
  .g-cat-name {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 300; font-style: italic;
    font-size: clamp(2rem, 5.2vw, 3.6rem); line-height: 1.05; color: var(--ink);
  }
  .g-cat-rule { width: 46px; height: 1px; background: var(--accent); opacity: 0.5; margin: 24px auto 0; }
  .g-cat-count { display: block; margin-top: 14px; font-size: 12px; color: var(--faint); letter-spacing: 0.08em; }

  /* L'en-tête se lève au moment où la scène entre dans le champ — la
     même dramaturgie que la référence. Retombe sur un simple fondu si
     l'utilisateur a demandé moins d'animations. */
  .g-cat-head { opacity: 0; transform: translateY(24px); }
  .g-cat.in .g-cat-head {
    opacity: 1; transform: none;
    transition: opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .g-cat-head { transform: none; }
    .g-cat.in .g-cat-head { transition: opacity .3s ease; }
  }
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

  /* ── Attente d'une photo ────────────────────────────────────
     Un reflet passe lentement sur la case tant que l'image n'est pas
     arrivée. But précis : dire « ça travaille » sur une galerie de
     plusieurs centaines de photos, où le lazy-loading laissait des
     rectangles vides et immobiles pendant le défilement.
     Le reflet est un pseudo-élément déplacé en transform — donc
     composité, à 60 fps, sans repeindre la case (§9 : jamais de
     background-position ni de left animés en continu). */
  .g-cell.attente::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(100deg,
      transparent 20%,
      color-mix(in srgb, var(--ink) 7%, transparent) 50%,
      transparent 80%);
    transform: translateX(-100%);
    animation: g-attente 1.4s ease-in-out infinite;
  }
  @keyframes g-attente { to { transform: translateX(100%); } }

  /* Mouvement réduit : pas de balayage — un simple battement de teinte,
     lent et sans déplacement (§9). */
  @media (prefers-reduced-motion: reduce) {
    .g-cell.attente::after {
      animation: g-attente-calme 2s ease-in-out infinite;
      transform: none; background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    @keyframes g-attente-calme { 0%,100% { opacity: .35 } 50% { opacity: .9 } }
  }

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
  /* L'apparition passe par une ANIMATION, pas par une transition armée
     dans un requestAnimationFrame. La transition ne démarrait que si une
     frame était rendue entre l'affichage et la pose de la classe : dans
     un onglet en arrière-plan (ou sur une frame sautée), la classe
     n'arrivait jamais et la visionneuse restait à opacité 0 — OUVERTE,
     cliquable, et parfaitement invisible. On voyait alors la grille au
     travers, et la photo agrandie semblait se superposer aux vignettes
     de la catégorie précédente (constaté par Gil).
     Une animation démarre dès que l'élément est affiché, sans dépendre
     d'aucune frame, et forwards retient l'état final. */
  .g-lb {
    position: fixed; inset: 0; z-index: 200; background: var(--bg-deep, #050505);
    display: none; flex-direction: column; opacity: 0;
  }
  .g-lb.open { display: flex; animation: g-lb-in 0.25s ease forwards; }
  .g-lb.closing { animation: g-lb-out 0.25s ease forwards; }
  @keyframes g-lb-in  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes g-lb-out { from { opacity: 1 } to { opacity: 0 } }
  @media (prefers-reduced-motion: reduce) {
    .g-lb.open, .g-lb.closing { animation-duration: 0.01ms; }
  }
  .g-lb-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  }
  /* Compteur en chiffres ITALIQUES, à gauche — la signature de la
     galerie d'Ezla & Davy, où « 3 / 320 » se lit comme une pagination
     de livre plutôt que comme un indicateur d'application. */
  .g-lb-cap {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 1.05rem; letter-spacing: 0.12em; color: var(--ink-soft, var(--muted));
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Nom de la scène SOUS la photo, en capitales espacées, sur un voile
     dégradé — il accompagne l'image au lieu de lui disputer le haut. */
  .g-lb-scene {
    flex: none; text-align: center;
    padding: 22px 20px calc(26px + env(safe-area-inset-bottom));
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.34em;
    color: var(--muted);
    background: linear-gradient(to top, color-mix(in srgb, var(--bg-deep, #000) 72%, transparent), transparent);
  }
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

  /* Corps du plein écran : la scène, et la frise des autres photos —
     COLONNE quand l'écran est en paysage, FRISE quand il est en
     portrait (demande de Gil, référence Mathijs Hanenkamp). On garde
     ainsi le reste de la série sous les yeux au lieu de naviguer à
     l'aveugle entre deux flèches. */
  .g-lb-body { flex: 1; display: flex; min-height: 0; gap: 10px; padding: 0 8px 8px; }

  .g-lb-stage {
    flex: 1; position: relative; min-width: 0; min-height: 0; overflow: hidden;
  }
  /* Trois emplacements qui défilent ensemble : précédente, courante,
     suivante. Un vrai glissement, pas un fondu — et le doigt tient le
     rail pendant tout le geste. */
  .g-lb-track { display: flex; height: 100%; will-change: transform; }
  .g-lb-track.anim { transition: transform 0.52s cubic-bezier(0.32, 0.72, 0, 1); }
  .g-slot {
    flex: 0 0 100%; height: 100%; display: flex;
    align-items: center; justify-content: center; padding: 0 6px;
  }
  .g-slot img {
    max-width: 100%; max-height: 100%; object-fit: contain; display: block;
    transition: filter 0.28s ease;
  }
  /* Vignette affichée le temps que la grande version arrive : un très
     léger flou dit « ce n'est pas encore la version nette » sans faire
     croire à une photo ratée. */
  .g-slot img.flou { filter: blur(6px); }
  @media (prefers-reduced-motion: reduce) {
    .g-slot img.flou { filter: none; }
    .g-lb-track.anim { transition-duration: 0.01ms; }
  }

  .g-strip { display: flex; gap: 8px; flex: 0 0 auto; scrollbar-width: thin; }
  .g-th {
    flex: 0 0 auto; border: none; padding: 0; background: none; cursor: pointer;
    border-radius: 6px; overflow: hidden; opacity: 0.42;
    outline: 2px solid transparent; outline-offset: -2px;
    transition: opacity 0.25s ease, outline-color 0.25s ease;
  }
  .g-th img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .g-th.on { opacity: 1; outline-color: var(--ink); }
  @media (hover: hover) and (pointer: fine) { .g-th:hover { opacity: 0.8; } }

  @media (orientation: landscape) {
    .g-strip { flex-direction: column; width: 88px; overflow-y: auto; overflow-x: hidden; }
    .g-th { width: 84px; height: 60px; }
  }
  @media (orientation: portrait) {
    .g-lb-body { flex-direction: column; }
    .g-strip { flex-direction: row; height: 64px; overflow-x: auto; overflow-y: hidden;
               padding-bottom: 2px; }
    .g-th { width: 58px; height: 60px; }
  }
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

  /* ── Retour en haut (motif d'Ezla & Davy) ───────────────────
     Sur une galerie de plusieurs centaines de photos, remonter au
     pouce est une corvée. Le bouton n'apparaît qu'une fois qu'on est
     descendu — avant, il n'aurait servi à rien et encombré l'écran. */
  .g-haut {
    position: fixed; z-index: 55;
    right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
    width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--ink); background: color-mix(in srgb, var(--bg-elev, var(--surface)) 82%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(18px); backdrop-filter: saturate(180%) blur(18px);
    box-shadow: 0 14px 34px -12px rgba(0,0,0,.55);
    opacity: 0; transform: translateY(16px) scale(.9); pointer-events: none;
    transition: opacity .3s ease-out, transform .38s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .g-haut.on { opacity: 1; transform: none; pointer-events: auto; }
  .g-haut svg { width: 20px; height: 20px; fill: none; stroke: currentColor;
                stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  @media (prefers-reduced-motion: reduce) {
    .g-haut { transform: none; transition: opacity .2s ease; }
  }

  /* ── Tiroir des scènes (motif d'Ezla & Davy) ────────────────
     Son bouton vit DANS la même barre que la pastille film, à sa
     gauche : sur la référence, le hamburger et la lecture cohabitent
     en haut à droite — demande de Gil. */
  .g-scenes-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 999px; cursor: pointer;
    color: var(--ink); background: color-mix(in srgb, var(--bg) 72%, transparent);
    border: 1px solid var(--line);
    -webkit-backdrop-filter: saturate(180%) blur(18px); backdrop-filter: saturate(180%) blur(18px);
    transition: transform .16s ease, background .3s ease, border-color .3s ease;
  }
  .g-scenes-btn:active { transform: scale(.96); }
  /* État de SURVOL, que son jumeau possédait déjà : deux boutons
     identiques côte à côte qui ne réagissent pas pareil se remarquent
     immédiatement, et le guide l'exige sur ordinateur (§14). */
  @media (hover: hover) and (pointer: fine) {
    .g-scenes-btn:hover { background: var(--bg); border-color: var(--accent); }
  }
  @media (prefers-reduced-motion: reduce) { .g-scenes-btn { transition: none; } }
  .g-scenes-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor;
                      stroke-width: 1.7; stroke-linecap: round; }

  .g-drawer {
    position: fixed; inset: 0; z-index: 210; display: flex; flex-direction: column;
    padding: clamp(20px, 5vw, 60px);
    padding-top: max(clamp(20px, 5vw, 60px), env(safe-area-inset-top));
    padding-bottom: max(clamp(20px, 5vw, 60px), env(safe-area-inset-bottom));
    overflow-y: auto; overscroll-behavior: contain;
    background: color-mix(in srgb, var(--bg-deep, var(--bg)) 94%, transparent);
    -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);
    opacity: 0; visibility: hidden;
    transition: opacity .34s cubic-bezier(0.16, 1, 0.3, 1), visibility .34s;
  }
  .g-drawer.open { opacity: 1; visibility: visible; }
  .g-drawer-top { display: flex; align-items: center; justify-content: space-between;
                  margin-bottom: clamp(26px, 5vw, 52px); }
  .g-drawer-title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: clamp(1.4rem, 4vw, 2.2rem); color: var(--ink);
  }
  .g-drawer-close {
    width: 46px; height: 46px; border-radius: 50%; cursor: pointer;
    background: none; border: 1px solid var(--line); color: var(--muted);
    display: flex; align-items: center; justify-content: center;
  }
  .g-drawer-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .g-scene-list {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: clamp(12px, 2.2vw, 26px); align-content: start;
  }
  .g-scene-card {
    position: relative; cursor: pointer; overflow: hidden; border-radius: 3px;
    aspect-ratio: 4 / 3; border: 1px solid var(--line-soft, var(--line));
    background: var(--bg-elev, var(--surface)); padding: 0;
  }
  .g-scene-card img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    filter: brightness(0.5) saturate(1.05);
    transition: transform 1s cubic-bezier(0.16, 1, 0.3, 1), filter .5s ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .g-scene-card:hover img { transform: scale(1.05); filter: brightness(0.62) saturate(1.1); }
  }
  .g-scene-card-cap {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px; padding: 14px;
    text-align: center; pointer-events: none;
  }
  .g-scene-card-no {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 11px; letter-spacing: 0.42em; text-transform: uppercase; color: var(--accent);
  }
  .g-scene-card-name {
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: clamp(1.2rem, 2.6vw, 1.8rem); color: #fff; line-height: 1.1;
    text-shadow: 0 2px 12px rgba(0,0,0,0.55);
  }
  .g-scene-card-count {
    font-size: 9.5px; letter-spacing: 0.28em; text-transform: uppercase;
    color: rgba(255,255,255,0.66); text-shadow: 0 2px 10px rgba(0,0,0,0.5);
  }
  @media (prefers-reduced-motion: reduce) {
    .g-drawer { transition: opacity .2s ease, visibility .2s; }
    .g-scene-card img { transition: none; }
  }
  body.g-locked { position: fixed; width: 100%; overflow: hidden; }
  /* La gouttière réservée en permanence évite que la page change de
     largeur quand le verrou retire la barre de défilement — sans elle,
     ouvrir la visionneuse élargissait la page de ~15 px sur ordinateur
     et forçait un recalcul complet de la grille. */
  html { scrollbar-gutter: stable; }

  /* Le navigateur saute le rendu des rangées hors écran. Sur une galerie
     de plusieurs milliers de photos, c'est la différence entre une page
     qui s'affiche tout de suite et une qui rame. La hauteur exacte de
     chaque rangée est donnée en variable : sans elle la barre de
     défilement sauterait pendant le parcours. */
  .g-row { content-visibility: auto; contain-intrinsic-size: auto var(--rh, 240px); }

  /* Film pas encore prêt, mais vignette posée : on la montre, assombrie
     pour que le message reste lisible par-dessus. */
  .g-slide-vignette { background-size: cover; background-position: center; position: relative; }
  .g-slide-vignette::before {
    content: ''; position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55);
  }
  .g-slide-vignette .g-soon { position: relative; z-index: 1; }

  .g-vide { padding: clamp(40px, 9vw, 90px) 20px; text-align: center; }
  .g-vide-t { font-size: 1.0625rem; color: var(--ink); margin-bottom: 10px; }
  .g-vide-s { font-size: 0.875rem; color: var(--muted); line-height: 1.7;
              max-width: 46ch; margin: 0 auto; }

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
  /* La VIGNETTE remplit toute la fenêtre de lecture, quel que soit son
     cadrage (demande de Gil) : sans ça, une image qui n'est pas en 16/9
     s'affichait contenue, avec des bandes noires autour.
     Le recadrage ne dure QUE jusqu'à la première image du film : au-delà
     on repasse en « contenu », sinon un film vertical ou en 4/3 serait
     rogné à la lecture. */
  .g-slide video.g-vignette-pleine { object-fit: cover; }
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

// Marqueur de build : change le hash du bundle pour contourner une URL
// d'asset empoisonnée au CDN (incident du 21/07/2026 — voir public/404.html).
if (typeof window !== 'undefined') window.__GALERIE_BUILD = '2026-07-21b';

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
  /* Galerie encore vide : on le DIT. Auparavant la fonction sortait en
     silence et le client voyait une page qui semblait cassée — sans
     savoir s'il devait attendre, recharger, ou rappeler son photographe. */
  if (!cats.length) {
    mount.innerHTML =
      `<div class="g-vide">` +
        `<p class="g-vide-t">Les photos arrivent bientôt.</p>` +
        `<p class="g-vide-s">Votre galerie est ouverte, elle sera remplie sous peu. ` +
        `Le lien reste le même : gardez-le, rien d'autre à faire.</p>` +
      `</div>`;
    return null;
  }

  /* Favoris — persistés localement, silencieux en navigation privée */
  const FAV_KEY = 'laloge_fav_' + (opts.favKey || 'x');
  let favs = new Set();
  try { favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (_) {}
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (_) {} };

  /* Liste à plat : l'ordre d'affichage EST l'ordre de la lightbox */
  const FLAT = [];
  /* Chaque photo garde son rang DANS SA CATÉGORIE. Le compteur de la
     visionneuse annonçait « 3 / 7 » sur l'ensemble des catégories : en
     ouvrant la 1re photo de « test » on lisait 3, et l'on croyait avoir
     changé de galerie. On compte donc là où le client compte. */
  cats.forEach(c => c.photos.forEach((p, i) => FLAT.push({
    ...p, category: c.category, rangCat: i + 1, totalCat: c.photos.length,
  })));
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
    /* `attente` allume le voile d'attente sur la cellule. Il s'éteint
       à l'arrivée de l'image — ou à son échec, sinon une photo cassée
       laisserait un scintillement perpétuel. */
    const pret = () => { cell.classList.remove('attente'); img.classList.add('on'); };
    if (img.complete && img.naturalWidth > 0) { pret(); return; }
    cell.classList.add('attente');
    img.addEventListener('load', pret, { once: true });
    img.addEventListener('error', () => { cell.style.display = 'none'; }, { once: true });
  };

  /* ── Construction ── */
  mount.innerHTML = '';
  const sections = [];
  const multi = cats.length > 1;
  let flatIdx = 0;
  cats.forEach((c, sIdx) => {
    const sec = document.createElement('section');
    sec.className = 'g-cat';
    if (multi) {
      /* En-tête de SCÈNE (motif d'Ezla & Davy) : numéro, nom en
         italique, filet. Le compte de photos passe SOUS le filet — au
         rang de détail, alors qu'il concurrençait le titre avant. */
      const head = document.createElement('div');
      head.className = 'g-cat-head';
      head.innerHTML =
        `<span class="g-cat-no">Scène ${String(sIdx + 1).padStart(2, '0')}</span>` +
        `<h2 class="g-cat-name"></h2>` +
        `<div class="g-cat-rule"></div>` +
        `<span class="g-cat-count">${c.photos.length} photo${c.photos.length > 1 ? 's' : ''}</span>`;
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

  /* Les scènes s'allument à l'approche. `once` : une scène déjà vue ne
     rejoue pas son entrée quand on remonte — sinon la galerie
     clignoterait à chaque aller-retour dans le défilement.
     Sans IntersectionObserver (très vieux navigateur), on allume tout
     d'emblée : mieux vaut pas d'animation qu'un en-tête invisible. */
  const toutesLesScenes = () => [...mount.querySelectorAll('.g-cat')];
  const allumer = (s) => s.classList.add('in');
  if (window.IntersectionObserver) {
    const veille = new IntersectionObserver((entrees) => {
      entrees.forEach((e) => {
        if (!e.isIntersecting) return;
        allumer(e.target);
        veille.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    toutesLesScenes().forEach((s) => veille.observe(s));

    /* FILET. Un en-tête part à opacité 0 et n'existe que si l'observateur
       parle. Or il ne parle pas dans un onglet en arrière-plan : une
       galerie ouverte dans un onglet de fond puis consultée resterait
       SANS AUCUN TITRE, et rien ne le signalerait.
       Si au bout d'une seconde et demie aucune scène n'a été allumée,
       on considère l'observateur muet et on montre tout. Une galerie
       sans animation reste une galerie ; une galerie sans titres, non.
       (Même parade que sur la page offres, et que pour la visionneuse
       qui restait transparente.) */
    setTimeout(() => {
      if (!mount.querySelector('.g-cat.in')) toutesLesScenes().forEach(allumer);
    }, 1500);
  } else {
    toutesLesScenes().forEach(allumer);
  }

  /* ── Tiroir des scènes ──────────────────────────────────────
     Sur une galerie de plusieurs centaines de photos réparties en
     scènes, sauter directement à « First Look » vaut mieux que faire
     défiler à l'aveugle. Chaque scène est représentée par sa première
     photo, comme sur la référence.
     N'existe qu'à partir de DEUX scènes : avec une seule, le tiroir
     n'offrirait qu'un seul choix — celui où l'on est déjà. */
  document.querySelector('.g-drawer')?.remove();
  document.querySelector('.g-scenes-btn')?.remove();
  if (multi) {
    const tiroir = document.createElement('div');
    tiroir.className = 'g-drawer';
    tiroir.setAttribute('role', 'dialog');
    tiroir.setAttribute('aria-modal', 'true');
    tiroir.setAttribute('aria-label', 'Les scènes de la galerie');
    tiroir.innerHTML =
      `<div class="g-drawer-top">
         <div class="g-drawer-title">Les scènes</div>
         <button type="button" class="g-drawer-close" aria-label="Fermer">
           <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
         </button>
       </div>
       <div class="g-scene-list"></div>`;
    const liste = tiroir.querySelector('.g-scene-list');
    cats.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-scene-card';
      const p0 = c.photos[0];
      b.innerHTML =
        `<img src="${escAttr(GRID(p0))}" alt="" loading="lazy" decoding="async" />` +
        `<span class="g-scene-card-cap">` +
          `<span class="g-scene-card-no">Scène ${String(i + 1).padStart(2, '0')}</span>` +
          `<span class="g-scene-card-name"></span>` +
          `<span class="g-scene-card-count">${c.photos.length} photo${c.photos.length > 1 ? 's' : ''}</span>` +
        `</span>`;
      b.querySelector('.g-scene-card-name').textContent = c.category || `Scène ${i + 1}`;
      b.addEventListener('click', () => {
        fermerTiroir();
        // On ferme AVANT de viser : le verrou de défilement doit être
        // levé, sinon le saut n'irait nulle part.
        const cible = mount.querySelectorAll('.g-cat')[i];
        if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      liste.appendChild(b);
    });
    document.body.appendChild(tiroir);

    const ouvrirTiroir = () => { tiroir.classList.add('open'); lockBody(); tiroir.querySelector('.g-drawer-close').focus(); };
    function fermerTiroir() { if (!tiroir.classList.contains('open')) return; tiroir.classList.remove('open'); unlockBody(); }
    tiroir.querySelector('.g-drawer-close').addEventListener('click', fermerTiroir);
    tiroir.addEventListener('click', (e) => { if (e.target === tiroir) fermerTiroir(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerTiroir(); });

    /* Le bouton se glisse DANS la barre de la galerie, à gauche de la
       pastille film — les deux cohabitent comme sur la référence. Si la
       barre n'existe pas (autre page hôte), il se pose seul en haut à
       droite plutôt que de disparaître. */
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-scenes-btn';
    btn.setAttribute('aria-label', 'Voir les scènes');
    btn.title = 'Voir les scènes';   // même repère au survol que la pastille film
    btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
    btn.addEventListener('click', ouvrirTiroir);
    const barre = document.getElementById('pagebar');
    if (barre) barre.prepend(btn);
    else {
      btn.style.cssText = 'position:fixed;z-index:60;top:max(14px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));';
      document.body.appendChild(btn);
    }
  }

  /* Bouton de retour en haut — un seul par page, même si la galerie
     est repeinte (le concepteur rejoue mountPhotos à chaque réglage). */
  let haut = document.querySelector('.g-haut');
  if (!haut) {
    haut = document.createElement('button');
    haut.type = 'button';
    haut.className = 'g-haut';
    haut.setAttribute('aria-label', 'Revenir en haut');
    haut.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    haut.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(haut);
    let t = null;
    window.addEventListener('scroll', () => {
      // Le seuil est une hauteur d'écran : on ne propose de remonter
      // que quand remonter veut dire quelque chose.
      clearTimeout(t);
      t = setTimeout(() => haut.classList.toggle('on', window.scrollY > window.innerHeight), 80);
    }, { passive: true });
  }

  /* Largeur du dernier calcul. La mise en page justifiée ne dépend QUE
     de la largeur : recalculer parce que la HAUTEUR a changé détruit et
     reconstruit toutes les cellules pour un résultat identique.
     Sur téléphone c'était visible et permanent : faire défiler masque la
     barre d'URL, ce qui change la hauteur de la fenêtre, déclenche
     `resize`, et 220 ms plus tard toutes les photos disparaissaient puis
     réapparaissaient en fondu (vidéo de Gil, 25/07/2026). */
  let largeurPosee = -1;

  function layoutAll(force) {
    const largeur = Math.floor(mount.getBoundingClientRect().width);
    if (!force && largeur === largeurPosee) return;
    largeurPosee = largeur;
    let poseesTotal = 0;

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
        // Hauteur réelle de la rangée, pour que le saut de rendu
        // hors écran ne fausse pas la barre de défilement.
        if (r[0]) rowEl.style.setProperty('--rh', Math.round(r[0].h) + 'px');
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
          /* Les toutes premières vignettes ne sont pas différées : ce
             sont elles que le client voit en arrivant, et « lazy » leur
             faisait attendre un tour de mise en page pour rien. */
          const pressee = poseesTotal++ < 4;
          cell.innerHTML =
            `<img src="${escAttr(GRID(p))}" alt="${escAttr(p.category || title)}"` +
            (pressee ? ` fetchpriority="high"` : ` loading="lazy"`) +
            ` decoding="async" />` +
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
     <div class="g-lb-body">
       <div class="g-lb-stage" data-el="stage">
         <button class="g-nav prev" data-el="prev" aria-label="Photo précédente">${ICON.prev}</button>
         <div class="g-lb-track" data-el="track">
           <div class="g-slot"><img alt="" /></div>
           <div class="g-slot"><img alt="" /></div>
           <div class="g-slot"><img alt="" /></div>
         </div>
         <button class="g-nav next" data-el="next" aria-label="Photo suivante">${ICON.next}</button>
       </div>
       <div class="g-strip" data-el="strip" role="tablist" aria-label="Autres photos"></div>
     </div>
     <div class="g-lb-scene" data-el="scene"></div>`;
  document.body.appendChild(lb);
  const $ = (n) => lb.querySelector(`[data-el="${n}"]`);
  const lbStage = $('stage'), lbTrack = $('track'), lbStrip = $('strip');
  const slots = [...lbTrack.querySelectorAll('.g-slot img')];   // [préc, courante, suiv]
  let lbIdx = 0, lbOpen = false;
  const preCache = [];

  const modulo = (i) => (i % FLAT.length + FLAT.length) % FLAT.length;
  // Le rail montre trois photos et reste centré sur celle du milieu :
  // toute navigation est un glissement, puis un recentrage instantané.
  const CENTRE = -100;
  const poserRail = (pct, anime) => {
    lbTrack.classList.toggle('anim', !!anime);
    lbTrack.style.transform = `translate3d(${pct}%, 0, 0)`;
  };

  let tFerme = null;
  function openLb(i) {
    lbIdx = i; lbOpen = true;
    clearTimeout(tFerme);              // réouverture pendant la fermeture
    lb.classList.remove('closing');
    lb.classList.add('open');
    lockBody();
    batirFrise();
    renderLb();
    $('close').focus();
  }
  function closeLb() {
    lbOpen = false;
    lb.classList.add('closing');
    tFerme = setTimeout(() => lb.classList.remove('open', 'closing'), 250);
    unlockBody();
    /* Retour à la photo qu'on vient de regarder. Sans ça, après avoir
       parcouru quarante photos on retombait à l'endroit d'où l'on était
       parti et il fallait tout re-chercher (checklist Galerie du guide :
       « position restaurée à la fermeture »). unlockBody() vient de
       replacer le défilement : on ne corrige qu'ensuite, et seulement si
       la photo n'est pas déjà à l'écran. */
    const p = FLAT[lbIdx];
    if (!p) return;
    const sel = window.CSS && CSS.escape ? CSS.escape(String(p.id)) : String(p.id);
    const cible = mount.querySelector(`.g-cell[data-id="${sel}"]`);
    if (!cible) return;
    const r = cible.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      cible.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }
  /* Jeton de course : une grande photo peut mettre plusieurs secondes à
     arriver. Sans lui, une image demandée puis dépassée par deux clics
     rapides écrasait celle qu'on regarde en arrivant en retard. */
  let jetonRendu = 0;

  /* Remplit UN emplacement du rail. La vignette de la grille est déjà
     dans le cache du navigateur : elle s'affiche immédiatement, un peu
     floutée, puis cède la place à la grande version. */
  function poserSlot(img, p) {
    if (!p) { img.removeAttribute('src'); return; }
    const jeton = ++jetonRendu;
    img.dataset.jeton = String(jeton);
    img.src = GRID(p);
    img.alt = p.category || title;
    img.classList.add('flou');
    const pic = new Image();
    pic.decoding = 'async';
    pic.onload = () => {
      if (img.dataset.jeton !== String(jeton)) return;   // emplacement réaffecté
      img.src = pic.src;
      img.classList.remove('flou');
    };
    pic.onerror = () => { if (img.dataset.jeton === String(jeton)) img.classList.remove('flou'); };
    pic.src = VIEW(p);
  }

  function renderLb() {
    const p = FLAT[lbIdx];
    if (!p) return;

    poserSlot(slots[0], FLAT[modulo(lbIdx - 1)]);
    poserSlot(slots[1], p);
    poserSlot(slots[2], FLAT[modulo(lbIdx + 1)]);
    poserRail(CENTRE, false);

    // Le compteur prend la place de l'ancienne légende (haut gauche),
    // et le nom de la scène descend sous la photo.
    $('cap').textContent = `${p.rangCat || (lbIdx + 1)} / ${p.totalCat || FLAT.length}`;
    $('scene').textContent = p.category || title;
    const dl = $('dl');
    dl.href = FULL(p);
    dl.setAttribute('download', fileNameOf(p, lbIdx));
    syncLbFav();
    marquerFrise();

    /* Précharge un peu plus loin que les voisins immédiats, déjà tenus
       par le rail. Le tableau était auparavant VIDÉ juste avant d'être
       rempli : les images en vol perdaient leur dernière référence et le
       navigateur pouvait abandonner le téléchargement. */
    [lbIdx + 2, lbIdx - 2].forEach(j => {
      const v = FLAT[modulo(j)];
      if (!v) return;
      const im = new Image();
      im.decoding = 'async';
      im.src = VIEW(v);
      preCache.push(im);
    });
    while (preCache.length > 6) preCache.shift();
  }

  function syncLbFav() {
    const p = FLAT[lbIdx];
    $('fav').classList.toggle('fav', !!p && favs.has(p.id));
  }

  /* ── Frise des autres photos ──────────────────────────────
     Construite au PREMIER plein écran seulement : sur une galerie de
     plusieurs milliers de photos, la bâtir au chargement de la page
     retarderait l'affichage de la grille pour un panneau que personne
     n'a encore ouvert. */
  let friseFaite = false;
  function batirFrise() {
    if (friseFaite) return;
    friseFaite = true;
    const frag = document.createDocumentFragment();
    FLAT.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-th';
      b.dataset.i = String(i);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Photo ${i + 1}`);
      b.innerHTML = `<img src="${escAttr(GRID(p))}" alt="" loading="lazy" decoding="async" />`;
      b.addEventListener('click', () => allerA(i));
      frag.appendChild(b);
    });
    lbStrip.appendChild(frag);
  }
  function marquerFrise() {
    const actif = lbStrip.querySelector('.g-th.on');
    if (actif) { actif.classList.remove('on'); actif.setAttribute('aria-selected', 'false'); }
    const b = lbStrip.children[lbIdx];
    if (!b) return;
    b.classList.add('on');
    b.setAttribute('aria-selected', 'true');
    // La vignette courante doit rester sous les yeux quand on avance.
    b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  /* Saut direct depuis la frise : pas de glissement (on peut sauter de
     la 2e à la 400e), on repose le rail sur la nouvelle photo. */
  function allerA(i) {
    lbIdx = modulo(i);
    renderLb();
  }

  /* Glissement d'une photo : le rail va jusqu'au voisin, PUIS on
     recentre sans animation en réaffectant les trois emplacements.
     C'est ce recentrage invisible qui permet d'enchaîner indéfiniment. */
  let enCoursDeGlisse = false;
  /* Clics pressés mis en attente. Sans cela, cinq appuis rapides sur la
     flèche n'avançaient que d'UNE photo : tous ceux tombés pendant le
     glissement étaient perdus, et la visionneuse paraissait sourde.
     Plafonné à 3 : au-delà, une rafale ferait défiler la galerie sans
     qu'on voie rien passer. */
  let enAttente = 0;
  function step(d) {
    if (!d) return;
    if (enCoursDeGlisse) {
      if (Math.abs(enAttente + d) <= 3) enAttente += d;
      return;
    }
    enCoursDeGlisse = true;
    poserRail(CENTRE - d * 100, true);
    const fin = () => {
      lbTrack.removeEventListener('transitionend', fin);
      clearTimeout(secours);
      lbIdx = modulo(lbIdx + d);
      enCoursDeGlisse = false;
      renderLb();
      if (enAttente) { const suite = Math.sign(enAttente); enAttente -= suite; step(suite); }
    };
    // Filet : transitionend ne se déclenche pas si l'onglet passe à
    // l'arrière-plan pendant l'animation — la visionneuse resterait
    // bloquée entre deux photos.
    const secours = setTimeout(fin, 700);
    lbTrack.addEventListener('transitionend', fin);
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
  // Fermeture au glissé : 22 % de la hauteur, franchement plus qu'un
  // frôlement — on ne ferme pas la photo de son mariage par accident.
  const SW_FERME = 0.22;
  let sx = 0, sy = 0, st = 0, sdx = 0, sdy = 0, swDir = null;
  lbStage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (enCoursDeGlisse) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    st = Date.now(); sdx = 0; sdy = 0; swDir = null;
    lbTrack.classList.remove('anim');       // le doigt tient le rail
  }, { passive: true });
  lbStage.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!swDir) {
      if (Math.abs(dx) < SW_LOCK && Math.abs(dy) < SW_LOCK) return;
      swDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swDir === 'h') {
      sdx = dx;
      // Le rail suit le doigt au pixel : la photo voisine entre déjà
      // dans le champ, comme sur un téléphone.
      lbTrack.style.transform = `translate3d(calc(${CENTRE}% + ${dx}px), 0, 0)`;
      return;
    }
    /* Glisser vers le BAS pour fermer : le geste attendu par tout le
       monde sur un téléphone, et le seul à portée du pouce — la croix
       est en haut de l'écran. Vers le haut, rien : on ne ferme pas une
       photo par un geste qu'on fait pour faire défiler.
       L'image suit le doigt et pâlit, pour que le geste s'annule sans
       surprise si on le relâche à mi-chemin. */
    if (dy > 0) {
      sdy = dy;
      lbTrack.style.transform = `translate3d(${CENTRE}%, ${dy}px, 0)`;
      lb.style.opacity = String(Math.max(0.35, 1 - dy / (window.innerHeight * 0.6)));
    }
  }, { passive: true });
  lbStage.addEventListener('touchend', () => {
    if (swDir === 'h') {
      const vel = Math.abs(sdx) / Math.max(Date.now() - st, 1);
      if (Math.abs(sdx) > lbStage.clientWidth * SW_RATIO || vel > SW_VEL) {
        step(sdx < 0 ? 1 : -1);
      } else {
        poserRail(CENTRE, true);      // retour en place, en douceur
      }
    } else if (swDir === 'v' && sdy > 0) {
      const vel = sdy / Math.max(Date.now() - st, 1);
      if (sdy > window.innerHeight * SW_FERME || vel > SW_VEL) {
        lb.style.opacity = '';
        closeLb();
      } else {
        poserRail(CENTRE, true);
        lb.style.opacity = '';
      }
    }
    sdx = 0; sdy = 0; swDir = null;
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
        // Vignette d'attente : l'image que le client voit AVANT de lancer
        // la lecture. Sans elle, le lecteur affiche un rectangle noir —
        // ou, selon le navigateur, une image tirée au hasard du film.
        poster: v.poster || '',
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
      /* La vignette sert AUSSI ici, et c'est même là qu'elle compte le
         plus : plutôt qu'un rectangle noir avec une phrase, le client
         voit déjà une image de son film pendant sa préparation. */
      if (v.poster) {
        slide.classList.add('g-slide-vignette');
        slide.style.backgroundImage = `url("${String(v.poster).replace(/"/g, '%22')}")`;
      }
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
    // Vignette d'attente. `preload=metadata` suffit alors : le navigateur
    // n'a plus besoin de télécharger une image du film pour avoir quelque
    // chose à montrer, et l'affichage est immédiat.
    if (v.poster) {
      video.setAttribute('poster', v.poster);
      video.classList.add('g-vignette-pleine');
      // `playing` et non `play` : on attend la PREMIÈRE IMAGE rendue,
      // sinon le retour au cadrage normal se voit comme un sursaut
      // pendant que la vidéo se met en route.
      video.addEventListener('playing', () => {
        video.classList.remove('g-vignette-pleine');
      }, { once: true });
    }
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
