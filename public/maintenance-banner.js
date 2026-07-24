/* ════════════════════════════════════════════════════════════
   🛠️  BANDEAU DE MAINTENANCE
   ════════════════════════════════════════════════════════════
   Affiché tant que MAINTENANCE = true, en tête des espaces admin et
   client. Posé le 24/07/2026 : l'accès au stockage média (B2) est
   momentanément suspendu au niveau du compte — galeries, vidéos,
   photos, uploads indisponibles.

   POUR LE RETIRER PARTOUT : passer MAINTENANCE à false ci-dessous
   et redéployer. Un seul geste, aucune page à rouvrir une par une.

   Texte volontairement NEUTRE (marque blanche) : ni « Backblaze »,
   ni « TimelessHouse » — les clients des locataires le voient aussi.
   ════════════════════════════════════════════════════════════ */
(function () {
  var MAINTENANCE = true;
  if (!MAINTENANCE) return;

  var MESSAGE = "Maintenance en cours — l'affichage et l'envoi des médias " +
                "sont momentanément indisponibles. Tout revient très bientôt, " +
                "merci de votre patience.";

  function injecter() {
    if (document.getElementById('th-maintenance')) return;   // idempotent
    var dark = false;
    try {
      dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
             (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {}

    var bar = document.createElement('div');
    bar.id = 'th-maintenance';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center', 'gap:9px',
      'padding:10px 16px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:13px', 'line-height:1.45', 'font-weight:600', 'text-align:center',
      'box-shadow:0 2px 14px rgba(0,0,0,0.14)',
      'background:' + (dark ? '#2a2620' : '#f4ead6'),
      'color:'      + (dark ? '#f0e9dc' : '#5a5040'),
      'border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,0.08)' : 'rgba(90,80,64,0.14)')
    ].join(';');
    bar.innerHTML =
      '<span aria-hidden="true" style="flex-shrink:0">🛠️</span>' +
      '<span>' + MESSAGE + '</span>';

    document.body.insertBefore(bar, document.body.firstChild);
    // Pousse le contenu sous le bandeau (hauteur réelle : le texte peut
    // passer sur deux lignes sur téléphone).
    document.body.style.paddingTop =
      ((bar.offsetHeight || 44)) + 'px';
  }

  if (document.body) injecter();
  else document.addEventListener('DOMContentLoaded', injecter);
})();
