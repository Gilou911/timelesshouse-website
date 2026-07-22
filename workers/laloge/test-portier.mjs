#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════
   🚪  TEST DU PORTIER — routage des domaines La Loge
   ════════════════════════════════════════════════════════════
   Le Worker ne peut pas être déployé à l'aveugle : une règle trop
   large casserait une galerie livrée à un client, ou servirait une
   page sans son style. Ce test rejoue la décision du portier sur
   tous les cas réels avant tout déploiement.

     node workers/laloge/test-portier.mjs

   Sort en code 1 au premier écart (utilisable en CI).
   ════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "..", "..");
const src = readFileSync(join(ICI, "worker.js"), "utf8")
  .replace(/^export default \{[\s\S]*$/m, ""); // on ne garde que les fonctions

const portee = {};
new Function("sortie", `${src}\n Object.assign(sortie, {
  redirectionPortier, nomDePage,
  PAGES_LOGE, PAGES_VITRINE, PAGES_PARTOUT, PAGES_TIMELESSHOUSE,
});`)(portee);
const { redirectionPortier } = portee;

const LOGE = "visonmike.laloge.house";
const NEUTRE = "laloge.house";
const VITRINE = "laloge.app";

// [hôte, chemin+query, attendu (null = laisser passer)]
const CAS = [
  // ── LA FUITE À COLMATER : la vitrine du SaaS chez un locataire ──
  [LOGE, "/offres",              `https://${LOGE}/app`],
  [LOGE, "/offres.html",         `https://${LOGE}/app`],
  [LOGE, "/inscription",         `https://${LOGE}/app`],
  [LOGE, "/portfolio",           `https://${LOGE}/app`],
  // Pages de VENTE TimelessHouse — la fuite du 22/07 : le nom de
  // l'agence, en haut de la galerie, y menait en un clic.
  [LOGE, "/mariage",             `https://${LOGE}/app`],
  [LOGE, "/immobilier",          `https://${LOGE}/app`],
  [LOGE, "/communication",       `https://${LOGE}/app`],
  [LOGE, "/photobooth",          `https://${LOGE}/app`],
  [LOGE, "/index.html",          `https://${LOGE}/app`],
  [LOGE, "/page-qui-nexiste-pas", `https://${LOGE}/app`],
  [NEUTRE, "/offres",            `https://${NEUTRE}/app`],

  // ── CE QUI DOIT CONTINUER DE MARCHER SUR UNE LOGE ──
  [LOGE, "/app",                 null],
  [LOGE, "/app?code=maison-lumiere", null],
  [LOGE, "/galerie?c=abc123",    null],
  [LOGE, "/communication-admin", null],
  [LOGE, "/communication-dashboard", null],
  [LOGE, "/event-photos",        null],
  [LOGE, "/event-video",         null],
  [LOGE, "/event-engagement",    null],
  [LOGE, "/event-anniversary",   null],
  [LOGE, "/event-photos-cinematic", null],
  [LOGE, "/reinitialiser",       null], // mot de passe oublié : jamais bloqué
  [NEUTRE, "/app",               null],
  [NEUTRE, "/galerie?c=abc",     null],

  // ── LES ASSETS : jamais redirigés, sinon page nue ──
  [LOGE, "/assets/app-CPxbPK6M.js", null],
  [LOGE, "/assets/style-abc.css",   null],
  [LOGE, "/icons/client-192.png",   null],
  [LOGE, "/favicon-th.png",         null],
  [LOGE, "/manifest-client.webmanifest", null],
  [LOGE, "/sw.js",                  null],
  [LOGE, "/robots.txt",             null],
  [VITRINE, "/assets/admin-9q1XcsOs.js", null],

  // ── LA VITRINE : ce qui est à sa place, et ce qui part ──
  [VITRINE, "/offres",           null],
  [VITRINE, "/inscription",      null],
  [VITRINE, "/laloge-cgv.html",  null],
  [VITRINE, "/laloge-confidentialite.html", null],
  [VITRINE, "/reinitialiser",    null], // repli de account-recovery
  [VITRINE, "/portfolio",        "https://laloge.app/offres"],
  [VITRINE, "/inconnu",          "https://laloge.app/offres"],
  // un lien d'espace client sur la vitrine garde son chemin ET son code
  [VITRINE, "/galerie?c=abc123", "https://laloge.house/galerie?c=abc123"],
  [VITRINE, "/app",              "https://laloge.house/app"],
  [VITRINE, "/communication-admin", "https://laloge.house/communication-admin"],

  // ── Les pages légales du SaaS restent lisibles, mais chez le SaaS ──
  [LOGE, "/laloge-cgv.html",     "https://laloge.app/laloge-cgv.html"],
];

let ratés = 0;
for (const [hote, cible, attendu] of CAS) {
  const [chemin, q] = cible.split("?");
  const search = q ? `?${q}` : "";
  const obtenu = redirectionPortier(hote, chemin, search);
  const ok = obtenu === attendu;
  if (!ok) {
    ratés++;
    console.log(`❌ ${hote}${cible}`);
    console.log(`     attendu : ${attendu ?? "laisser passer"}`);
    console.log(`     obtenu  : ${obtenu ?? "laisser passer"}`);
  }
}

/* ── CHAQUE PAGE EST DANS UN BUILD, ET DANS LE BON ─────────────
   Depuis la séparation du 22/07/2026, deux builds sont déployés :
   le produit (vite.config.js → dist) et le studio de Gil
   (vite.config.studio.js → dist-studio). Trois façons de se
   tromper, toutes silencieuses :
     · créer une page et ne la déclarer nulle part → elle n'existe
       sur aucun site, et on cherche pourquoi « elle ne marche pas » ;
     · la déclarer dans les deux → la séparation est annulée ;
     · la déclarer dans un build mais la classer dans l'autre côté
       du portier → elle est servie puis redirigée aussitôt.
   Ce contrôle compare les deux configurations Vite aux listes du
   portier et refuse tout désaccord. */
const entrees = (fichier) => {
  const src = readFileSync(join(RACINE, fichier), "utf8");
  return new Set([...src.matchAll(/resolve\(__dirname,\s*'([^']+)\.html'\)/g)].map((m) => m[1]));
};
const buildProduit = entrees("vite.config.js");
const buildStudio = entrees("vite.config.studio.js");

const pagesDuDepot = readdirSync(RACINE).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
const cotéProduit = new Set([...portee.PAGES_LOGE, ...portee.PAGES_VITRINE, ...portee.PAGES_PARTOUT]);

const soucis = [];
for (const p of pagesDuDepot) {
  const dansProduit = buildProduit.has(p);
  const dansStudio = buildStudio.has(p);
  if (!dansProduit && !dansStudio) {
    soucis.push(`${p}.html n'est déclarée dans AUCUN build — elle ne sera servie nulle part.` +
      `\n        → ajoutez-la à vite.config.js (produit) OU vite.config.studio.js (studio), et à la liste correspondante de worker.js`);
  } else if (dansProduit && dansStudio) {
    soucis.push(`${p}.html est déclarée dans les DEUX builds — la séparation est annulée pour elle.`);
  } else if (dansProduit && portee.PAGES_TIMELESSHOUSE.has(p)) {
    soucis.push(`${p}.html est construite avec le produit mais classée « studio » dans worker.js — elle serait servie puis redirigée.`);
  } else if (dansStudio && cotéProduit.has(p)) {
    soucis.push(`${p}.html est construite avec le studio mais classée « La Loge » dans worker.js.`);
  }
}

if (soucis.length) {
  console.log(`\n❌ ${soucis.length} page(s) mal rangée(s) :`);
  soucis.forEach((s) => console.log(`     ${s}`));
  ratés += soucis.length;
} else {
  console.log(`✅ rangement : ${buildProduit.size} page(s) côté produit, ${buildStudio.size} côté studio, aucune en double ni oubliée`);
}

console.log(`\n${CAS.length} cas contrôlés · ${ratés} écart(s)`);
if (ratés) {
  console.error("✗ Le portier ne fait pas ce qu'on attend — NE PAS DÉPLOYER.");
  process.exit(1);
}
console.log("✓ Portier conforme : aucune fuite, aucun asset bloqué.");
