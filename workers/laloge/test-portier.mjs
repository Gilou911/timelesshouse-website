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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ICI, "worker.js"), "utf8")
  .replace(/^export default \{[\s\S]*$/m, ""); // on ne garde que les fonctions

const portee = {};
new Function("sortie", `${src}\n Object.assign(sortie, { redirectionPortier, nomDePage });`)(portee);
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
  [LOGE, "/mariage",             null],
  [LOGE, "/immobilier",          null],
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

console.log(`\n${CAS.length} cas contrôlés · ${ratés} écart(s)`);
if (ratés) {
  console.error("✗ Le portier ne fait pas ce qu'on attend — NE PAS DÉPLOYER.");
  process.exit(1);
}
console.log("✓ Portier conforme : aucune fuite, aucun asset bloqué.");
