#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════
   🔀  REDIRECTIONS DE DÉPLOIEMENT (_redirects Cloudflare Pages)
   ════════════════════════════════════════════════════════════
   Depuis la séparation du 22/07/2026, deux projets Pages sont
   déployés depuis ce dépôt. Chacun a besoin de ses propres
   redirections, et elles ne peuvent PAS vivre dans `public/` :
   ce dossier est partagé par les deux builds, et un `/app` renvoyé
   vers TimelessHouse expédierait les clients des locataires chez
   un autre studio. Elles sont donc écrites ici, après le build.

     node scripts/post-build.mjs studio    → dist-studio/_redirects
     node scripts/post-build.mjs loge      → dist/_redirects
   ════════════════════════════════════════════════════════════ */

import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const cible = process.argv[2];

/* Le studio ne sert plus que la vitrine. Or des clients ont dans
   leur boîte mail des liens vers timelesshouse.org/galerie?c=…,
   /app, /event-photos… envoyés avant la séparation. Ces liens
   DOIVENT continuer d'ouvrir leur espace : ils sont renvoyés vers
   app.timelesshouse.org, qui sert le produit. Cloudflare Pages
   conserve la chaîne de requête (le ?c= d'une galerie survit). */
const APP = "https://app.timelesshouse.org";
const STUDIO = [
  "# Généré par scripts/post-build.mjs — ne pas éditer à la main.",
  "# Anciens liens d'espace client (emails déjà envoyés, favoris) :",
  "# la vitrine ne les sert plus, le produit oui.",
  ...[
    "app", "galerie", "communication-admin", "communication-dashboard",
    "event-photos", "event-photos-cinematic", "event-video",
    "event-engagement", "event-anniversary", "reinitialiser",
  ].flatMap((p) => [
    `/${p}      ${APP}/${p}      301`,
    `/${p}.html ${APP}/${p}      301`,
  ]),
  "",
].join("\n");

/* Le produit n'a plus de page d'accueil : `index.html` appartient au
   studio. Sur les domaines La Loge, le Worker redirige déjà la racine
   (vers /offres ou /app selon le domaine) et ce fichier n'est jamais
   atteint ; sur app.timelesshouse.org, il n'y a pas de Worker — sans
   cette ligne, la racine renverrait une 404. */
const LOGE = [
  "# Généré par scripts/post-build.mjs — ne pas éditer à la main.",
  "/  /app  302",
  "",
].join("\n");

const CIBLES = {
  studio: { dossier: "dist-studio", contenu: STUDIO },
  loge:   { dossier: "dist",        contenu: LOGE },
};

const choix = CIBLES[cible];
if (!choix) {
  console.error(`Cible inconnue : « ${cible ?? ""} ». Attendu : studio | loge`);
  process.exit(1);
}
const dossier = join(RACINE, choix.dossier);
if (!existsSync(dossier)) {
  console.error(`✗ ${choix.dossier}/ n'existe pas — lancez le build d'abord.`);
  process.exit(1);
}
writeFileSync(join(dossier, "_redirects"), choix.contenu, "utf8");
console.log(`✓ ${choix.dossier}/_redirects écrit (${choix.contenu.trim().split("\n").length} lignes)`);
