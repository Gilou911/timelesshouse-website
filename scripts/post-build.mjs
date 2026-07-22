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

/* Racine du produit — DÉPEND DE LA PHASE, et se tromper casse un site :
   · pendant la transition, `index.html` est encore dans ce build parce
     que timelesshouse.org y pointe. Poser « / → /app » ferait alors
     disparaître la vitrine de Gil derrière une redirection.
   · une fois le domaine basculé, index.html quitte ce build : sans la
     redirection, la racine de app.timelesshouse.org rendrait une 404.
   Le script tranche sur un fait plutôt que sur une intention : la
   présence du fichier dans le dossier qui vient d'être construit. */
const racineDejaServie = (dossier) => existsSync(join(dossier, "index.html"));
const logeRedirects = (dossier) => [
  "# Généré par scripts/post-build.mjs — ne pas éditer à la main.",
  racineDejaServie(dossier)
    ? "# (aucune redirection de racine : index.html est encore dans ce build)"
    : "/  /app  302",
  "",
].join("\n");

const CIBLES = {
  studio: { dossier: "dist-studio", contenu: () => STUDIO },
  loge:   { dossier: "dist",        contenu: logeRedirects },
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
const contenu = choix.contenu(dossier);
writeFileSync(join(dossier, "_redirects"), contenu, "utf8");
console.log(`✓ ${choix.dossier}/_redirects écrit (${contenu.trim().split("\n").length} lignes)`);
