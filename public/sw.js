// ════════════════════════════════════════════════════════════
// Service worker TimelessHouse — volontairement MINIMAL.
// Rôle : rendre l'app installable (PWA) sans risque de cache périmé.
// Stratégie : réseau d'abord, toujours — on ne met en cache que la
// coquille de secours hors-ligne. Les données (Supabase) et les médias
// (B2/Cloudinary) ne passent JAMAIS par un cache SW.
// ════════════════════════════════════════════════════════════
const VERSION = "th-pwa-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Uniquement les navigations de NOTRE origine : réseau, sinon message hors-ligne
  if (e.request.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          "<!doctype html><html lang='fr'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
          "<body style='font-family:-apple-system,sans-serif;background:#e9e4d9;color:#2a2620;display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;text-align:center;padding:24px'>" +
          "<div><div style='font-size:40px'>📡</div><h1 style='font-weight:600;font-size:20px'>Hors connexion</h1>" +
          "<p style='color:#6b6357;font-size:14px'>Reconnectez-vous à Internet puis réessayez.</p></div></body></html>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        )
      )
    );
  }
  // Tout le reste : comportement réseau normal (aucune interception)
});
