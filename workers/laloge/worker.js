// ════════════════════════════════════════════════════════════
// 🎭  WORKER — laloge-proxy (SaaS B.3, étage 2)
// ════════════════════════════════════════════════════════════
// Sert les domaines LA LOGE en façade du site Cloudflare Pages :
//   · laloge.app, laloge.house, *.laloge.house → proxy vers l'origine
//     Pages (le front lit location.hostname pour appliquer la marque
//     de l'agence — voir app.html)
//   · GET /manifest-client.webmanifest sur <slug>.laloge.house →
//     MANIFEST PWA DYNAMIQUE : l'app installée porte le nom et les
//     couleurs de l'AGENCE (marque blanche jusqu'à l'écran d'accueil)
//
// ROUTES (dashboard Cloudflare → Workers Routes, zones laloge.*) :
//   laloge.app/*  ·  laloge.house/*  ·  *.laloge.house/*
// VARIABLES :
//   PAGES_HOST        → hôte d'origine Pages (ex : xxx.pages.dev)
//   SUPABASE_URL      → https://vpbxeqjvaeiytxcpilxf.supabase.co
//   SUPABASE_ANON_KEY → clé anon (publique par nature)
// ════════════════════════════════════════════════════════════

const DEFAULT_ICONS = [
  { src: "/icons/client-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/client-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icons/client-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const sub = url.hostname.match(/^([a-z0-9-]+)\.laloge\.house$/);
    const slug = sub && !["www", "app"].includes(sub[1]) ? sub[1] : null;

    // ── Racines : vitrine sur les apex, connexion sur les sous-domaines ──
    if (url.pathname === "/") {
      if (slug) return Response.redirect(`https://${url.hostname}/app`, 302);
      if (/^laloge\.(app|house)$/.test(url.hostname)) {
        return Response.redirect(`https://${url.hostname}/offres`, 302);
      }
    }

    // ── Manifest PWA aux couleurs de l'agence ──
    if (slug && url.pathname === "/manifest-client.webmanifest") {
      try {
        const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/resolve_agency_brand`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_slug: slug }),
        });
        const b = await r.json();
        if (b && b.name) {
          return new Response(JSON.stringify({
            name: b.name,
            // ≤ 12 caractères, coupé au MOT entier (« Studio », pas « Studio Lumiè »)
            short_name: b.name.length <= 12 ? b.name
              : (b.name.slice(0, 13).split(" ").slice(0, -1).join(" ") || b.name.slice(0, 12)),
            description: `Espace privé ${b.name}`,
            id: "/",
            start_url: "/app",
            scope: "/",
            display: "standalone",
            background_color: b.bg_color || "#e9e4d9",
            theme_color: b.bg_color || "#e9e4d9",
            icons: DEFAULT_ICONS,
          }), {
            headers: {
              "Content-Type": "application/manifest+json",
              "Cache-Control": "public, max-age=300",
            },
          });
        }
      } catch (_) { /* marque introuvable → manifest d'origine */ }
    }

    // ── Proxy transparent vers l'origine Pages ──
    url.hostname = env.PAGES_HOST;
    const res = await fetch(new Request(url, req));
    return res;
  },
};
