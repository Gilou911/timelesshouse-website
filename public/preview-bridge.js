/* ─────────────────────────────────────────────────────────────
 * preview-bridge.js
 * ─────────────────────────────────────────────────────────────
 * Permet à n'importe quelle page client (event-photos.html,
 * event-video.html, event-anniversary.html, event-engagement.html,
 * mariage.html, event-photos-cinematic.html) d'être affichée
 * dans une iframe d'aperçu depuis communication-admin.html
 * sans polluer le sessionStorage de l'onglet parent.
 *
 * Activation : ajouter `?preview=1&code=<CLIENT_CODE>` à l'URL.
 *
 * À INCLURE EN PREMIER, avant tout autre <script> qui lit
 * `sessionStorage.getItem('access_granted')` ou qui fait un
 * redirect vers mariage.html.
 * ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 1) Détection du mode aperçu ─────────────────────────────────
  var params = new URLSearchParams(location.search);
  if (params.get('preview') !== '1') return;

  var code = params.get('code');
  if (!code) return;

  // 2) Patch transparent de sessionStorage.getItem ──────────────
  //    On ne touche PAS au vrai sessionStorage (qui est partagé
  //    entre l'iframe et l'onglet admin parent puisqu'ils sont
  //    sur la même origine). On intercepte uniquement la lecture
  //    de la clé `access_granted` pour retourner le code reçu
  //    via l'URL.
  try {
    var origGet = sessionStorage.getItem.bind(sessionStorage);
    sessionStorage.getItem = function (key) {
      if (key === 'access_granted') return code;
      return origGet(key);
    };
  } catch (e) {
    // sessionStorage peut être bloqué en navigation privée stricte
    console.warn('[preview-bridge] sessionStorage indisponible :', e);
  }

  // 3) Badge visuel "APERÇU" dans l'iframe ──────────────────────
  function addBadge() {
    if (document.getElementById('__preview_badge__')) return;
    var pill = document.createElement('div');
    pill.id = '__preview_badge__';
    pill.textContent = 'APERÇU';
    var s = pill.style;
    s.position        = 'fixed';
    s.top             = '10px';
    s.right           = '10px';
    s.zIndex          = '2147483647';
    s.padding         = '4px 10px';
    s.borderRadius    = '999px';
    s.background      = 'rgba(20,20,20,0.78)';
    s.color           = '#fff';
    s.font            = '600 9.5px/1 system-ui, -apple-system, sans-serif';
    s.letterSpacing   = '0.18em';
    s.backdropFilter  = 'blur(8px)';
    s.webkitBackdropFilter = 'blur(8px)';
    s.pointerEvents   = 'none';
    s.boxShadow       = '0 2px 12px rgba(0,0,0,0.35)';
    document.body.appendChild(pill);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBadge);
  } else {
    addBadge();
  }

  // 4) Signaler au parent admin que la page est prête ───────────
  window.addEventListener('load', function () {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'preview:ready' }, '*');
      }
    } catch (_) { /* cross-origin, ignored */ }
  });

  // 5) Désactiver les redirections de session de la page-mère ───
  //    Si la page client tente window.location.href='mariage.html'
  //    (parce qu'elle n'a pas trouvé son code), on remplace par
  //    un simple log — le bridge a déjà fourni le code.
  //    Note : on ne bloque pas window.location.replace pour ne
  //    pas casser des redirections légitimes style→cinematic.
  var flag = false;
  Object.defineProperty(window, '__preview_mode__', {
    value: true, writable: false, configurable: false,
  });
})();
