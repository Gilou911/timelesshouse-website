#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════
   🧹  ORPHELINS — le croisement B2 ↔ application
   ════════════════════════════════════════════════════════════
   Répond à UNE question, fiablement : quels fichiers du bucket ne
   sont plus référencés NULLE PART — ni dans la base, ni dans le
   code du site — et peuvent donc être purgés ?

   COMMANDES :
     npm run orphelins              → le RAPPORT (rien n'est touché)
     npm run orphelins -- --purger  → supprime ce que le rapport
                                      montre (mêmes règles, re-calculées)

   LES QUATRE GARDE-FOUS, dans l'ordre :
   ① PÉRIMÈTRE FERMÉ : seuls les préfixes que l'application GÈRE
     sont candidats (PREFIXES_GERES). Les dépôts faits à la main
     par Transmit (Divers/, Joan/, Wed/, racine…) sont hors
     périmètre : jamais listés comme orphelins, jamais touchés.
   ② MOISSON SANS SCHÉMA : on ne fait pas confiance à une liste de
     colonnes. CHAQUE ligne de CHAQUE table est sérialisée en texte
     et fouillée au motif — colonnes texte, JSON, tableaux, tout.
     Une colonne créée l'an prochain sera moissonnée pareil. Le
     DÉPÔT GIT est moissonné aussi : les vieilles pages clients
     portent des URLs B2 en dur.
   ③ UNITÉS, PAS FICHIERS : un film HLS référence son master.m3u8,
     jamais ses segments ; une photo, ses variantes. On raisonne
     par DOSSIER-UNITÉ (media/<id>, weddings/<code>, agencies/<slug>/
     drive/<uuid>…) : une seule référence dedans, et TOUT le dossier
     vit. On sous-supprime plutôt que l'inverse.
   ④ GARDE D'ÂGE : rien de plus jeune que AGE_MIN_JOURS — un upload
     en cours n'est référencé qu'à la fin.
   ════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: join(ROOT, ".env.local") });
dotenv.config({ path: join(ROOT, ".env") });

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.B2_BUCKET;
const PUBLIC_BASE = (process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const PURGER = process.argv.includes("--purger");

const AGE_MIN_JOURS = 30;

/* Le périmètre : ce que l'APPLICATION gère, et la profondeur de
   l'unité (le dossier qui vit ou meurt d'un bloc). Tout préfixe
   absent d'ici est HORS PÉRIMÈTRE — intouchable. `perso/`,
   `photobooth/` et `diagnostics/` restent volontairement dehors
   pour cette première version : prudence d'abord. */
const PREFIXES_GERES = [
  { prefixe: "media/",     profondeur: 2 },  // media/<id>/…
  { prefixe: "weddings/",  profondeur: 2 },  // weddings/<code>/…
  { prefixe: "invoices/",  profondeur: 2 },  // invoices/<clientId>/…
  { prefixe: "documents/", profondeur: 2 },  // documents/<clientId>/…
  // agencies/<slug>/drive/<uuid>/… — l'unité est le dépôt, pas
  // l'agence : profondeur 4. Le reste d'agencies/ (logo…) est en
  // profondeur 3 via la même règle (voir uniteDe).
  { prefixe: "agencies/",  profondeur: 4 },
];

const fmt = (o) => o >= 1073741824 ? `${(o / 1073741824).toFixed(1)} Go`
  : o >= 1048576 ? `${Math.round(o / 1048576)} Mo` : `${Math.round(o / 1024)} Ko`;

/* ── L'unité d'une clé (le dossier qui vit ou meurt d'un bloc) ── */
function uniteDe(key) {
  const g = PREFIXES_GERES.find((p) => key.startsWith(p.prefixe));
  if (!g) return null;                               // hors périmètre
  const segs = key.split("/");
  // agencies/<slug>/drive/<uuid> = 4 ; agencies/<slug>/<autre> = 3
  const prof = g.prefixe === "agencies/" ? (segs[2] === "drive" ? 4 : 3) : g.profondeur;
  if (segs.length <= prof) return null;              // trop court : pas une unité pleine
  return segs.slice(0, prof).join("/") + "/";
}

/* ── ② La moisson : toutes les URLs B2, où qu'elles se nichent ── */
const MOTIFS = [
  /https:\/\/media\.timelesshouse\.org\/file\/[^\s"'\\)\]}>]+/g,
  /https:\/\/f\d{3}\.backblazeb2\.com\/file\/[^\s"'\\)\]}>]+/g,
];

function clesDe(texte, sac) {
  for (const motif of MOTIFS) {
    for (const m of texte.match(motif) || []) {
      // https://…/file/<bucket>/<clé> → <clé> (décodée : B2 liste en clair)
      const apres = m.split("/file/")[1] || "";
      const idx = apres.indexOf("/");
      if (idx < 0) continue;
      let cle = apres.slice(idx + 1);
      try { cle = decodeURIComponent(cle); } catch (_) {}
      sac.add(cle);
    }
  }
}

async function moissonBase(sac) {
  // La liste des tables vient du contrat OpenAPI de PostgREST :
  // aucune liste à entretenir à la main.
  const entetes = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  const spec = await fetch(`${SB_URL}/rest/v1/`, { headers: entetes }).then((r) => r.json());
  const tables = Object.keys(spec.definitions || {});
  let lignes = 0;
  for (const table of tables) {
    for (let offset = 0; ; offset += 100) {
      const r = await fetch(
        `${SB_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=100&offset=${offset}`,
        { headers: entetes },
      );
      if (!r.ok) break;                              // vue non lisible : on passe
      const rows = await r.json().catch(() => []);
      if (!Array.isArray(rows) || !rows.length) break;
      lignes += rows.length;
      clesDe(JSON.stringify(rows), sac);
      if (rows.length < 100) break;
    }
  }
  console.log(`  base : ${tables.length} tables, ${lignes} lignes fouillées`);
}

function moissonDepot(sac) {
  // Les vieilles pages clients portent des URLs B2 en dur — git grep
  // fouille tout le dépôt d'un coup, binaires exclus.
  for (const motif of ["https://media\\.timelesshouse\\.org/file/[^\"'[:space:])\\\\}>]+",
                       "https://f[0-9]{3}\\.backblazeb2\\.com/file/[^\"'[:space:])\\\\}>]+"]) {
    try {
      const sortie = execFileSync("git", ["grep", "-hoIE", motif], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
      clesDe(sortie, sac);
    } catch (_) { /* aucun résultat : git grep sort en erreur, c'est normal */ }
  }
  console.log(`  dépôt : moissonné`);
}

/* ── L'inventaire complet du bucket ── */
async function inventaire(s3) {
  const objets = [];
  let jeton;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, ContinuationToken: jeton, MaxKeys: 1000,
    }));
    for (const o of r.Contents || []) objets.push({ cle: o.Key, taille: o.Size || 0, date: o.LastModified });
    jeton = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (jeton);
  return objets;
}

/* ════════════════ La tournée ════════════════ */
const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT, region: process.env.B2_REGION,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APP_KEY },
});

console.log(`🧹 orphelins — ${PURGER ? "PURGE" : "rapport seul, rien ne sera touché"}`);
console.log("① moisson des références…");
const refs = new Set();
await moissonBase(refs);
moissonDepot(refs);
console.log(`  ${refs.size} clés référencées`);

console.log("② inventaire du bucket…");
const objets = await inventaire(s3);
console.log(`  ${objets.length} objets, ${fmt(objets.reduce((s, o) => s + o.taille, 0))}`);

// ③ Les unités VIVANTES : celles qui abritent au moins une référence.
const vivantes = new Set();
for (const cle of refs) {
  const u = uniteDe(cle);
  if (u) vivantes.add(u);
}

// ④ Tri de chaque objet : hors périmètre / vivant / trop jeune / orphelin.
const seuil = Date.now() - AGE_MIN_JOURS * 86400000;
const horsPerimetre = { n: 0, taille: 0 };
const orphelins = new Map();   // unité → { taille, n, plusRecent }
let tropJeunes = 0;
for (const o of objets) {
  const u = uniteDe(o.cle);
  if (!u) { horsPerimetre.n++; horsPerimetre.taille += o.taille; continue; }
  if (vivantes.has(u)) continue;
  if (o.date && o.date.getTime() > seuil) { tropJeunes++; vivantes.add(u); continue; }
  const e = orphelins.get(u) || { taille: 0, n: 0, plusRecent: 0 };
  e.taille += o.taille; e.n++;
  if (o.date) e.plusRecent = Math.max(e.plusRecent, o.date.getTime());
  orphelins.delete(u); orphelins.set(u, e);
}
// Un objet jeune ré-anime son unité : on retire les unités re-vivantes.
for (const u of [...orphelins.keys()]) if (vivantes.has(u)) orphelins.delete(u);

/* ── Le rapport, par familles lisibles ── */
const familles = {};
let totalTaille = 0, totalN = 0;
for (const [u, e] of orphelins) {
  const fam = u.split("/")[0] + "/";
  (familles[fam] = familles[fam] || []).push({ u, ...e });
  totalTaille += e.taille; totalN += e.n;
}
const lignesRapport = [];
const dire = (s) => { console.log(s); lignesRapport.push(s); };
dire("");
dire(`═══ ORPHELINS : ${orphelins.size} dossier(s), ${totalN} fichier(s), ${fmt(totalTaille)} ═══`);
for (const [fam, liste] of Object.entries(familles)) {
  liste.sort((a, b) => b.taille - a.taille);
  dire(`\n── ${fam} — ${liste.length} dossier(s), ${fmt(liste.reduce((s, x) => s + x.taille, 0))} ──`);
  for (const x of liste) {
    dire(`  ${x.u}  ·  ${x.n} fichier(s), ${fmt(x.taille)}, dernier du ${new Date(x.plusRecent).toLocaleDateString("fr-FR")}`);
  }
}
dire("");
dire(`Hors périmètre (Transmit, racine, perso/, photobooth/, diagnostics/…) : ${horsPerimetre.n} objets, ${fmt(horsPerimetre.taille)} — JAMAIS touchés.`);
if (tropJeunes) dire(`Trop jeunes (< ${AGE_MIN_JOURS} j) : ${tropJeunes} objets épargnés par la garde d'âge.`);

const cheminRapport = join(ROOT, "workers", "encoder", "rapport-orphelins.txt");
writeFileSync(cheminRapport, lignesRapport.join("\n") + "\n");
console.log(`\n📄 rapport écrit : ${cheminRapport}`);

/* ── La purge — uniquement sur ordre explicite ── */
if (PURGER && orphelins.size) {
  console.log(`\n⚠ purge de ${orphelins.size} dossier(s)…`);
  const aSupprimer = objets.filter((o) => orphelins.has(uniteDe(o.cle))).map((o) => o.cle);
  for (let i = 0; i < aSupprimer.length; i += 1000) {
    const lot = aSupprimer.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: lot.map((cle) => ({ Key: cle })), Quiet: true },
    }));
    console.log(`  ${Math.min(i + 1000, aSupprimer.length)}/${aSupprimer.length}`);
  }
  console.log(`✓ ${aSupprimer.length} fichier(s) supprimé(s), ${fmt(totalTaille)} libérés.`);
  console.log("  Les compteurs de stockage se recaleront au scan nocturne.");
} else if (PURGER) {
  console.log("\nRien à purger.");
}
