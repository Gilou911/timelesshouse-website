#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════
   🔗  AUDIT DES LIENS D'EMAIL — marque blanche
   ════════════════════════════════════════════════════════════
   Rejoue TOUS les gabarits de notify-client pour chaque univers et
   chaque type d'agence, puis vérifie qu'aucun lien n'envoie le client
   d'un locataire chez la plateforme.

   Né du bug du 22/07/2026 : 13 boutons renvoyaient vers
   timelesshouse.org depuis les emails d'un locataire (des URL en dur
   dans les gabarits, invisibles tant qu'on ne cliquait pas).

   USAGE — à lancer avant tout déploiement de notify-client :
     node scripts/audit-liens-emails.mjs
   Sort en code 1 si une fuite est détectée (utilisable en CI).
   ════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, "..", "supabase", "functions", "notify-client", "index.ts");

// Le fichier est écrit en JS dans un .ts : on retire les imports Deno
// et on l'évalue avec un environnement simulé. Aucune requête réseau
// n'est faite : seuls les CONSTRUCTEURS de gabarits sont appelés.
const src = readFileSync(SOURCE, "utf8").replace(/^import .*$/gm, "");
const portee = {};
new Function("Deno", "serve", "sortie", `${src}
  Object.assign(sortie, {
    buildWelcome, buildNewMedia, buildEventReady, buildInvoiceReady,
    buildInvoiceReminder, buildInvoicePaid, buildShootScheduled,
    buildShootUpdated, buildShootReminder, buildGalleryReady,
    buildVideoReady, buildAccessExpiring, buildAdminNewComment,
    buildAdminApproval, buildAdminClientExpiring,
    filetMarqueBlanche,
    // ⚠️ Une FONCTION, pas un getter : Object.assign copierait la VALEUR
    // au moment de la copie (l'espace initial), ce qui donnait un faux
    // « rattrapé par le filet » sur l'email de fin d'accès.
    espaceCourant: () => CURRENT_ESPACE,
  });
`)({ env: { get: () => null } }, () => {}, portee);

const UNIVERS = ["celebration", "communication", "neutre"];
const AGENCES = [
  { slug: "visonmike",     nom: "VisonMike",     hote: "visonmike.laloge.house" },
  { slug: "timelesshouse", nom: "TimelessHouse", hote: null /* *.timelesshouse.org */ },
];

const facture = { reference: "FAC-1", description: "Prestation", amount: 1200, status: "payée" };
const tournage = { title: "Shooting", type: "photo", date_iso: "2026-09-01", time_label: "9h", location: "Paris" };

const client = (ag, univers) => ({
  universe: univers, greeting: "Camille", name: "Maison Lumière", code: "maison-lumiere",
  partner1: univers === "celebration" ? "Éléa" : null,
  partner2: univers === "celebration" ? "David" : null,
  client_email: "client@exemple.fr",
  __brand: {
    name: ag.nom, email: "contact@exemple.fr", accent: "#1f4d3f", logo: null,
    slug: ag.slug, site: ag.slug === "timelesshouse" ? "https://timelesshouse.org" : null,
  },
});

let liensTotal = 0, fuites = 0;

for (const ag of AGENCES) {
  const galerieUrl = ag.hote
    ? `https://${ag.hote}/galerie?c=abc`
    : "https://timelesshouse.org/galerie?c=abc";

  for (const univers of UNIVERS) {
    const c = client(ag, univers);
    const p = portee;
    const gabarits = {
      "bienvenue":         p.buildWelcome(c),
      "nouveau média":     p.buildNewMedia(c, { title: "Photo" }, {}),
      "contenu prêt":      p.buildEventReady(c, { hasPhotos: true }),
      "facture dispo":     p.buildInvoiceReady(c, { reference: "FAC-1", amount: 1200 }),
      "relance facture":   p.buildInvoiceReminder(c, facture, "before_due"),
      "reçu paiement":     p.buildInvoicePaid(c, facture),
      "tournage prévu":    p.buildShootScheduled(c, tournage),
      "tournage modifié":  p.buildShootUpdated(c, tournage),
      "rappel tournage":   p.buildShootReminder(c, { ...tournage, daysBefore: 7 }),
      "galerie photos":    p.buildGalleryReady(c, { title: "G", kind: "photos" }, galerieUrl, null),
      "galerie film":      p.buildGalleryReady(c, { title: "G", kind: "video" }, galerieUrl, null),
      "galerie mixte":     p.buildGalleryReady(c, { title: "G", kind: "mixte" }, galerieUrl, null),
      "film prêt":         p.buildVideoReady(c, { title: "F" }, galerieUrl),
      "accès expire":      p.buildAccessExpiring(c, { days: 15, dateLabel: "5 octobre" }, p.espaceCourant()),
      "admin commentaire": p.buildAdminNewComment(c, { title: "M" }, "Bravo"),
      "admin validé":      p.buildAdminApproval(c, { title: "M" }, "admin_media_approved"),
      "admin expire":      p.buildAdminClientExpiring(c, { days: 15, dateLabel: "5 octobre" }),
    };

    const mauvais = [];
    const rattrapes = [];
    for (const [nom, mail] of Object.entries(gabarits)) {
      // On contrôle le HTML APRÈS le filet — c'est ce qui part vraiment.
      const html = p.filetMarqueBlanche(mail.html, c.__brand);
      // …mais on signale quand le filet a dû intervenir : l'email part
      // juste, la SOURCE est fautive et doit être corrigée.
      if (ag.hote && html !== mail.html) rattrapes.push(nom);
      const liens = [...html.matchAll(/href="([^"]+)"/g)]
        .map(m => m[1]).filter(u => !u.startsWith("mailto:"));
      liensTotal += liens.length;
      for (const lien of liens) {
        const hote = (lien.match(/^https:\/\/([^/]+)/) || [])[1] || "";
        const ok = ag.hote ? hote === ag.hote : /(^|\.)timelesshouse\.org$/.test(hote);
        if (!ok) { mauvais.push(`${nom} → ${lien}`); fuites++; }
      }
    }
    const etat = mauvais.length ? "❌" : (rattrapes.length ? "⚠️ " : "✅");
    console.log(`${etat} ${ag.nom.padEnd(14)} · ${univers.padEnd(14)} ${Object.keys(gabarits).length} gabarits`);
    mauvais.forEach(m => console.log(`     FUITE → ${m}`));
    rattrapes.forEach(n => console.log(`     rattrapé par le filet (source à corriger) → ${n}`));
  }
}

/* ── ÉPREUVE DU FILET (bug n°2 du 22/07/2026) ──────────────────
   La console envoyait `loginUrl`/`deliveryUrl` bâtis sur l'origine de
   l'onglet : ouverte sur laloge.app, chaque email menait le client à
   la page Offres de la vitrine. La source est corrigée (la console
   n'envoie plus d'URL), mais on prouve ici que même un appelant
   hostile ne peut plus produire ce lien : extras empoisonnés → le
   filet doit replier l'URL entière sur la loge. */
{
  const ag = AGENCES[0]; // locataire
  const hostile = "https://laloge.app/index.html#clients";
  const c = client(ag, "communication");
  const epreuves = {
    "nouveau média":    portee.buildNewMedia(c, { title: "Photo" }, { loginUrl: hostile }),
    "contenu prêt":     portee.buildEventReady(c, { hasPhotos: true, deliveryUrl: hostile }),
    "facture dispo":    portee.buildInvoiceReady(c, { reference: "FAC-1", amount: 1200, loginUrl: hostile }),
    "tournage prévu":   portee.buildShootScheduled(c, { ...tournage, loginUrl: hostile }),
    "rappel tournage":  portee.buildShootReminder(c, { ...tournage, daysBefore: 7, loginUrl: hostile }),
  };
  let repliés = 0, ratés = [];
  for (const [nom, mail] of Object.entries(epreuves)) {
    const html = portee.filetMarqueBlanche(mail.html, c.__brand);
    if (html !== mail.html) repliés++;
    for (const [, lien] of html.matchAll(/href="([^"]+)"/g)) {
      if (lien.startsWith("mailto:")) continue;
      liensTotal++;
      const hote = (lien.match(/^https:\/\/([^/]+)/) || [])[1] || "";
      if (hote !== ag.hote) { ratés.push(`${nom} → ${lien}`); fuites++; }
    }
  }
  if (ratés.length) {
    console.log(`❌ épreuve du filet : ${ratés.length} lien(s) hostile(s) passé(s)`);
    ratés.forEach((r) => console.log(`     FUITE → ${r}`));
  } else if (repliés === 0) {
    // Aucune réécriture = l'épreuve n'a rien exercé : le filet est mort.
    console.log("❌ épreuve du filet : aucun repli constaté, le filet ne réécrit plus");
    fuites++;
  } else {
    console.log(`✅ épreuve du filet : extras hostiles (console sur laloge.app) repliés sur la loge (${repliés}/${Object.keys(epreuves).length} gabarits)`);
  }
}

console.log(`\n${liensTotal} liens contrôlés · ${fuites} fuite(s)`);
if (fuites > 0) {
  console.error("\n✗ Des emails de locataire renvoient vers la plateforme.");
  console.error("  Cherchez les URL en dur dans les gabarits et remplacez-les");
  console.error("  par CURRENT_ESPACE ou CURRENT_CONSOLE.");
  process.exit(1);
}
console.log("✓ Aucune fuite de marque blanche.");
