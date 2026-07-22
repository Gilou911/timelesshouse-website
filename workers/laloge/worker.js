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

// ════════════════════════════════════════════════════════════
// 🚪  LE PORTIER — chaque domaine n'ouvre que SES pièces
// ════════════════════════════════════════════════════════════
// Un seul site est déployé, et il répondait à TOUT sur TOUS les
// domaines. Conséquence mesurée le 22/07/2026 :
//   · visonmike.laloge.house/offres  → les TARIFS de La Loge (29 €,
//     49 €…) s'affichaient chez un locataire, sous sa marque ;
//   · visonmike.laloge.house/portfolio → le portfolio TimelessHouse ;
//   · laloge.app/galerie, /app, /communication-admin → les espaces
//     clients sur la vitrine commerciale.
// C'est aussi la racine des bugs de liens d'email : quand la console
// vit à quatre adresses, `window.location.origin` ne veut plus rien
// dire (deux corrections le même jour, mêmes causes).
//
// Le portier ne DÉPLACE rien : il regarde par quelle porte on entre
// et renvoie à la bonne adresse ce qui n'a rien à faire là.

/** Pages du PRODUIT : espaces clients, galeries, console.
 *  ⚠️ NE JAMAIS y remettre `mariage`, `immobilier`, `communication`
 *  ni `index` : ce sont les pages de VENTE de TimelessHouse. Elles
 *  figuraient ici au premier jet parce que `homeUrlFor()` les
 *  référençait — et un client de VisonMike tombait donc sur le site
 *  d'un autre studio (trouvé par Gil, 22/07/2026). */
const PAGES_LOGE = new Set([
  "app", "galerie",
  "communication-dashboard", "communication-admin",
  "event-photos", "event-photos-cinematic", "event-video",
  "event-engagement", "event-anniversary",
]);

/** Pages de la VITRINE La Loge : ce qu'on montre aux studios. */
const PAGES_VITRINE = new Set([
  "offres", "inscription",
  "laloge-cgv", "laloge-confidentialite", "laloge-sous-traitance",
]);

/** Pages valables partout (réinitialisation : `account-recovery`
 *  retombe sur laloge.app/reinitialiser, un locataire la demande
 *  depuis sa loge — la bloquer d'un côté casserait un mot de passe
 *  oublié). */
const PAGES_PARTOUT = new Set(["reinitialiser", "404"]);

/** Pages du STUDIO TimelessHouse — servies sur timelesshouse.org
 *  seulement. Ce Worker ne couvre pas ce domaine : cette liste ne
 *  sert pas au routage, elle sert à ce qu'AUCUNE page du dépôt ne
 *  reste non classée. `test-portier.mjs` compare les .html du dépôt
 *  aux quatre listes et échoue sur toute page inconnue — sans ça,
 *  une page créée demain serait silencieusement redirigée sur les
 *  loges, sans que personne comprenne pourquoi (crainte de Gil,
 *  22/07/2026, parfaitement fondée). */
const PAGES_TIMELESSHOUSE = new Set([
  "index", "portfolio", "mariage", "immobilier", "communication",
  "photobooth", "photobooth-inscription",

]);

/** Nom de page, ou null si ce n'est pas une page (asset, image,
 *  manifest, fichier d'un sous-dossier…) — ceux-là passent toujours,
 *  sinon la page servie arriverait sans son style ni son code. */
function nomDePage(pathname) {
  const p = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p) return null;               // racine : traitée séparément
  if (p.includes("/")) return null;  // /assets/…, /icons/…
  if (p.endsWith(".html")) return p.slice(0, -5);
  if (/\.[a-z0-9]+$/i.test(p)) return null; // .js, .png, .txt…
  return p;                          // URL propre : /offres
}

/** Destination si la page n'est pas à sa place ici, sinon null. */
function redirectionPortier(hostname, pathname, search) {
  const nom = nomDePage(pathname);
  if (nom === null || PAGES_PARTOUT.has(nom)) return null;

  if (hostname === "laloge.app") {
    if (PAGES_VITRINE.has(nom)) return null;
    // Un lien d'espace client sur la vitrine : on l'emmène à la porte
    // neutre des clients EN GARDANT le chemin et le code — un vieux
    // lien de galerie doit continuer de mener à la galerie.
    if (PAGES_LOGE.has(nom)) return `https://laloge.house${pathname}${search}`;
    return "https://laloge.app/offres";
  }

  // laloge.house et <slug>.laloge.house — les loges.
  if (PAGES_LOGE.has(nom)) return null;
  // Les pages légales du SaaS restent lisibles, mais chez le SaaS.
  if (nom.startsWith("laloge-")) return `https://laloge.app${pathname}`;
  // Tarifs, inscription, portfolio, photobooth, page inconnue… :
  // rien de tout ça n'existe pour le client d'un locataire. Il est
  // ramené à la porte de SA loge, jamais vers La Loge.
  return `https://${hostname}/app`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const sub = url.hostname.match(/^([a-z0-9-]+)\.laloge\.house$/);
    const slug = sub && !["www", "app"].includes(sub[1]) ? sub[1] : null;

    // ── Racines : les deux domaines ont des publics distincts ──
    //  · laloge.app   → la vitrine du produit (les AGENCES qui s'abonnent)
    //  · laloge.house → la porte des CLIENTS finaux : connexion à leur
    //    espace ou à une galerie, jamais la vitrine (ils ne doivent pas
    //    sentir qu'un SaaS existe derrière leur studio)
    if (url.pathname === "/") {
      if (slug) return Response.redirect(`https://${url.hostname}/app`, 302);
      if (url.hostname === "laloge.house") {
        return Response.redirect(`https://${url.hostname}/app`, 302);
      }
      if (url.hostname === "laloge.app") {
        return Response.redirect(`https://${url.hostname}/offres`, 302);
      }
    }

    // ── Le portier : cette page a-t-elle sa place ici ? ──
    // (après les racines, avant le manifest : un asset n'est jamais
    //  redirigé, `redirectionPortier` le laisse passer.)
    const ailleurs = redirectionPortier(url.hostname, url.pathname, url.search);
    if (ailleurs) return Response.redirect(ailleurs, 302);

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
