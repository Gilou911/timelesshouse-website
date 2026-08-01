#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
// 🎬 Worker d'encodage HLS — La Loge (agences locataires)
// ════════════════════════════════════════════════════════════
// Le chaînon manquant entre l'upload d'un locataire et la lecture
// adaptative. La console dépose un ticket dans `encode_jobs` après
// chaque upload vidéo ; ce worker le ramasse, transcode avec le MÊME
// pipeline que la plateforme (scripts/encode-core.mjs), range le
// résultat sur B2 à côté de l'original, et écrit l'URL du master
// dans la fiche. Le client, lui, n'a rien vu : sa vidéo était déjà
// lisible en progressif, elle devient simplement adaptative.
//
//   npm run worker-encode              # boucle (30 s entre deux tours)
//   npm run worker-encode -- --once    # un seul job puis sortie (tests)
//   npm run worker-encode -- --verbose # sortie ffmpeg complète
//
// Tourne sur le Mac de Gil (LaunchAgent : files/launchd-worker-encode.plist)
// ou sur n'importe quel serveur Linux avec ffmpeg — le script est
// identique, seules les variables d'environnement changent.
// ════════════════════════════════════════════════════════════

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  makeS3, publicUrl, probeVideo, rungsFor, transcodeHls, stampedPrefix,
  uploadHlsDir, uploadOriginalFile, purgeStaleHls, fmtDuration, fmtSize,
  deleteB2Keys, listB2Prefixes, listB2Keys,
} from "../../scripts/encode-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
dotenv.config({ path: join(ROOT, ".env.local") });
dotenv.config({ path: join(ROOT, ".env") });

const ONCE    = process.argv.includes("--once");
const VERBOSE = process.argv.includes("--verbose");
const POLL_MS = 30_000;
const MAX_ATTEMPTS = 2;                       // au-delà : le job reste en erreur
const MAX_SOURCE_BYTES = 30 * 1024 ** 3;      // 30 Go — garde-fou disque

// ─── Environnement ──────────────────────────────────────────
const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const BUCKET = process.env.B2_BUCKET;
const PUBLIC_BASE = (process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
for (const [name, value] of Object.entries({
  "VITE_SUPABASE_URL (ou SUPABASE_URL)": SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  B2_ENDPOINT: process.env.B2_ENDPOINT,
  B2_REGION: process.env.B2_REGION,
  B2_BUCKET: BUCKET,
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APP_KEY: process.env.B2_APP_KEY,
  B2_PUBLIC_BASE_URL: PUBLIC_BASE,
})) {
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
}

const sb = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const s3 = makeS3();

// ─── Journal (jamais de secret : uniquement des identifiants) ─
const LOG_FILE = join(HERE, "worker.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch (_) {}
}

// ─── Arrêt propre : on finit le job en cours ────────────────
let stopping = false;
let busy = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (stopping) process.exit(1);       // 2ᵉ Ctrl-C : sortie immédiate
    stopping = true;
    log(busy ? "⏸ arrêt demandé — le job en cours va se terminer…" : "⏹ arrêt.");
    if (!busy) process.exit(0);
  });
}

// Erreur définitive : réessayer n'y changera rien (source hors
// périmètre, cible supprimée…). À l'inverse, une coupure réseau ou
// un B2 momentanément indisponible mérite une seconde chance.
class PermanentError extends Error {}
/* Ni une réussite ni un échec : une condition extérieure passagère
   (disque plein). Le job retourne en file SANS consommer de tentative —
   sinon trois disques pleins de suite condamneraient un film sain. */
class AttenteError extends Error {}

/* ════════════════════════════════════════════════════════════
   Téléchargement de l'original depuis B2
   ════════════════════════════════════════════════════════════ */
// La source doit venir de NOTRE bucket : un job dont l'URL pointe
// ailleurs est refusé (on ne transcode pas ce qu'on ne maîtrise pas).
function keyFromPublicUrl(url) {
  if (typeof url !== "string" || !url.startsWith(`${PUBLIC_BASE}/`)) return null;
  let key;
  try { key = decodeURIComponent(url.slice(PUBLIC_BASE.length + 1)); }
  catch { return null; }               // encodage % invalide → source refusée
  return key.includes("..") ? null : key;
}

async function downloadSource(key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const size = Number(res.ContentLength || 0);
  if (size > MAX_SOURCE_BYTES) {
    throw new Error(`source trop volumineuse (${fmtSize(size)}) — maximum ${fmtSize(MAX_SOURCE_BYTES)}`);
  }
  /* La place se vérifie AVANT le premier octet écrit. Erreur passagère
     et non définitive : le job reste en file et repartira tout seul
     quand le disque respirera. */
  const besoin = besoinPour(size);
  const libre = espaceLibre();
  if (libre < besoin) {
    alerter("Encodage en attente — disque plein",
      `Il faut ${fmtSize(besoin)} pour ce film (${fmtSize(size)}), il reste ${fmtSize(libre)}. `
      + `Libérez de la place : l'encodage repartira tout seul.`);
    throw new AttenteError(`espace disque insuffisant : ${fmtSize(libre)} libres, ${fmtSize(besoin)} nécessaires`);
  }
  mkdirSync(dirname(destPath), { recursive: true });
  await pipeline(res.Body, createWriteStream(destPath));
  return statSync(destPath).size;
}

/* ════════════════════════════════════════════════════════════
   Écriture du résultat
   ════════════════════════════════════════════════════════════ */

/** « Votre film est prêt » — envoyé au client à la PREMIÈRE mise à
 *  disposition (le drapeau d'attente était levé), jamais lors d'un
 *  ré-encodage. Best effort : un email raté ne fait pas échouer le job. */
async function notifyVideoReady({ clientId, title, url }) {
  if (!clientId) return;
  try {
    const res = await fetch(`${SB_URL}/functions/v1/notify-client`, {
      method: "POST",
      headers: {
        // Jeton DÉDIÉ, partagé avec notify-client. La clé de service ne
        // convenait plus : celle injectée dans la fonction ne vaut plus
        // celle d'ici, et les trois envois ont été refusés en silence.
        Authorization: `Bearer ${process.env.WORKER_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "video_ready", client_id: clientId,
        extra: { title, ...(url ? { url } : {}) },
      }),
    });
    const j = await res.json().catch(() => ({}));
    log(j?.ok ? "  ✉ client prévenu — « votre film est prêt »"
              : `  ✉ email non parti (${j?.error || j?.skipped || res.status})`);
  } catch (e) { log(`  ✉ email non parti (${e.message})`); }
}

async function applyToMedia(job, { masterUrl, posterUrl, hoverUrl, src }) {
  const { data: row } = await sb.from("media")
    .select("id, thumb_url, awaiting_encode, client_id, title").eq("id", job.media_id).maybeSingle();
  if (!row) throw new Error("le média a été supprimé pendant l'encodage");

  const patch = {
    preview_url:      masterUrl,
    hover_url:        hoverUrl,
    awaiting_encode:  false,          // la vidéo devient visible par le client
    duration_seconds: src.durationSeconds || null,
    duration:         fmtDuration(src.durationSeconds),
    source_width:     src.srcW,
    source_height:    src.srcH,
    source_size_bytes: src.inputSize,
    size_label:       fmtSize(src.inputSize),
  };
  if (!row.thumb_url) patch.thumb_url = posterUrl;

  const { error } = await sb.from("media").update(patch).eq("id", job.media_id);
  if (error) throw new Error(`mise à jour du média : ${error.message}`);

  if (row.awaiting_encode === true) {
    await notifyVideoReady({ clientId: row.client_id, title: row.title || "Votre film" });
  }
}

async function applyToGalleryVideo(job, { masterUrl, leger, octetsOriginal }) {
  // Relecture JUSTE avant l'écriture : l'admin a pu modifier la
  // galerie pendant l'encodage (qui dure des minutes). On ne
  // réécrit que la clé `hls` de la vidéo concernée.
  const { data: g } = await sb.from("galleries")
    .select("config, client_id, agency_id, title, access_code, share_enabled")
    .eq("id", job.gallery_id).maybeSingle();
  if (!g) throw new Error("la galerie a été supprimée pendant l'encodage");

  const config = g.config || {};
  const list = Array.isArray(config.videos) ? config.videos : [];
  const idx = list.findIndex((v) => v && v.key === job.video_key);
  if (idx === -1) throw new Error(`vidéo « ${job.video_key} » absente de la galerie (supprimée ?)`);

  const etaitEnAttente = list[idx].awaitingEncode === true;

  // `awaitingEncode` disparaît : la vidéo devient visible par le client.
  const videos = list.map((v, i) => {
    if (i !== idx) return v;
    const { awaitingEncode, ...rest } = v;
    /* `leger` peut manquer (encodage d'avant cette version, ou remuxage
       qui a échoué) : on ne pose alors RIEN plutôt qu'une clé vide, et
       la galerie retombe sur le seul bouton d'origine. */
    return {
      ...rest,
      hls: masterUrl,
      ...(leger ? { download1080: leger } : {}),
      ...(octetsOriginal ? { originalOctets: octetsOriginal } : {}),
    };
  });
  const { error } = await sb.from("galleries")
    .update({ config: { ...config, videos } })
    .eq("id", job.gallery_id);
  if (error) throw new Error(`mise à jour de la galerie : ${error.message}`);

  if (etaitEnAttente) {
    // CTA idéal : le lien de partage de la galerie (si le partage est
    // actif) — sinon notify-client retombe sur la porte de l'espace.
    let url = null;
    if (g.share_enabled !== false && g.access_code && g.agency_id) {
      const { data: ag } = await sb.from("agencies").select("slug").eq("id", g.agency_id).maybeSingle();
      if (ag?.slug && ag.slug !== "timelesshouse") url = `https://${ag.slug}.laloge.house/galerie?c=${g.access_code}`;
      else if (ag?.slug === "timelesshouse") url = `https://timelesshouse.org/galerie?c=${g.access_code}`;
    }
    await notifyVideoReady({
      clientId: g.client_id,
      title: list[idx].title || g.title || "Votre film",
      url,
    });
  }
}

/* ════════════════════════════════════════════════════════════
   Compteur de stockage de l'agence (delta, phase 2)
   ════════════════════════════════════════════════════════════ */
// Le worker écrit le HLS DIRECTEMENT sur B2 (il ne passe pas par b2-sign) :
// sans ceci, ces octets échappaient au compteur d'usage jusqu'au prochain
// scan complet. On tient donc le compteur à jour à la source.

/** Agence propriétaire du job (média ou galerie). */
async function agencyForJob(job) {
  if (job.kind === "media") {
    const { data } = await sb.from("media").select("agency_id").eq("id", job.media_id).maybeSingle();
    return data?.agency_id || null;
  }
  const { data } = await sb.from("galleries").select("agency_id").eq("id", job.gallery_id).maybeSingle();
  return data?.agency_id || null;
}

/** Ajuste storage_used_bytes de l'agence du delta indiqué (peut être
 *  négatif si la purge dépasse l'ajout). Atomique via la RPC bump_storage
 *  — pas de course entre encodages simultanés ; repli lecture-écriture tant
 *  que la RPC n'est pas installée. TOUJOURS best-effort : une erreur ici ne
 *  doit jamais faire échouer un encodage réussi (le scan complet rattrape). */
async function bumpAgencyStorage(job, deltaBytes) {
  try {
    const delta = Math.round(Number(deltaBytes) || 0);
    if (!delta) return;
    const agencyId = await agencyForJob(job);
    if (!agencyId) return;
    const { error } = await sb.rpc("bump_storage", { p_agency: agencyId, p_delta: delta });
    if (error) {
      const { data } = await sb.from("agencies").select("storage_used_bytes").eq("id", agencyId).maybeSingle();
      const cur = data?.storage_used_bytes || 0;
      await sb.from("agencies").update({ storage_used_bytes: Math.max(0, cur + delta) }).eq("id", agencyId);
    }
    log(`  ⚖ stockage agence ${delta >= 0 ? "+" : "−"}${fmtSize(Math.abs(delta))}`);
  } catch (e) {
    log(`  ⚖ compteur stockage non mis à jour (${e.message}) — corrigé au prochain scan`);
  }
}

/* ════════════════════════════════════════════════════════════
   Espace disque — la garde avant de commencer
   ════════════════════════════════════════════════════════════
   Un encodage écrit BEAUCOUP : l'original, les quatre paliers, puis le
   MP4 léger. Sur un disque plein, ffmpeg meurt en pleine écriture sans
   pouvoir dire pourquoi (constaté le 29/07 : 12 Go libres sur 926).
   On mesure AVANT, on prévient, et le job reste en file — il repartira
   dès que la place est là, sans perdre une tentative. */

/** Octets libres sur le volume du dépôt. */
function espaceLibre() {
  try {
    const sortie = execFileSync("/bin/df", ["-k", ROOT]).toString().trim().split("\n").pop();
    return Number(sortie.split(/\s+/)[3]) * 1024;
  } catch (_) {
    return Infinity;              // mesure impossible : on ne bloque pas
  }
}

/** Ce qu'un job va écrire, au pire : l'original + ses dérivés (~1,6×)
 *  plus une marge de sécurité. Généreux à dessein — mieux vaut attendre
 *  une heure que perdre deux heures d'encodage à 99 %. */
const MARGE_DISQUE = 8 * 1024 ** 3;
const besoinPour = (octetsSource) => Math.round(octetsSource * 2.6) + MARGE_DISQUE;

/** Prévient Gil SUR SA MACHINE — le journal ne se lit que si on l'ouvre.
 *  Une même alerte ne se répète pas avant une heure : la boucle tourne
 *  toutes les 30 s, sans ce frein un disque plein produirait 120
 *  notifications par heure et on cesserait de les lire. */
const derniereAlerte = new Map();
function alerter(titre, texte) {
  const t = Date.now();
  if (t - (derniereAlerte.get(titre) || 0) < 3600_000) return;
  derniereAlerte.set(titre, t);
  log(`⚠ ${titre} — ${texte}`);
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(texte)} with title ${JSON.stringify(titre)} sound name "Basso"`,
    ], { stdio: "ignore" });
  } catch (_) { /* pas de session graphique : le journal suffit */ }
}

/* ════════════════════════════════════════════════════════════
   Traitement d'un job
   ════════════════════════════════════════════════════════════ */
async function processJob(job) {
  const label = job.kind === "media"
    ? `média ${job.media_id}`
    : `galerie ${job.gallery_id} · vidéo « ${job.video_key} »`;
  log(`▶ job ${job.id} — ${label} (tentative ${job.attempts})`);

  const key = keyFromPublicUrl(job.source_url);
  if (!key) throw new PermanentError("source hors du stockage de la plateforme — refusée");

  const workRoot = join(ROOT, "tmp-hls", `job-${job.id}`);
  const srcPath  = join(workRoot, "source", key.split("/").pop() || "source.mp4");
  const outDir   = join(workRoot, "out");

  try {
    const bytes = await downloadSource(key, srcPath);
    log(`  ↓ original récupéré (${fmtSize(bytes)})`);

    const src = probeVideo(srcPath);
    const rungs = rungsFor(src.shortSide);
    log(`  ⚙ ${src.srcW}×${src.srcH} · ${fmtDuration(src.durationSeconds)} → paliers ${rungs.map((r) => r.name).join(" / ")}`);

    /* Progression rendue à celui qui a déposé la vidéo. Écriture
       BRIDÉE : ffmpeg crache une ligne par image, on n'écrit qu'au
       changement de point de pourcentage ET pas plus d'une fois toutes
       les 3 s — sinon un film de 2 h produirait des milliers d'UPDATE
       pour un chiffre que personne ne lit aussi vite. */
    let dernierEcrit = 0, dernierPct = -1;
    const rendu = await transcodeHls({
      src, rungs, workDir: outDir, quiet: !VERBOSE,
      onProgress: (pct) => {
        const t = Date.now();
        if (pct === dernierPct || t - dernierEcrit < 3000) return;
        dernierPct = pct; dernierEcrit = t;
        // Best effort : un échec d'écriture ne doit pas casser l'encodage.
        sb.from("encode_jobs").update({ progress: pct }).eq("id", job.id)
          .then(() => {}, () => {});
      },
    });

    // Le HLS se range À CÔTÉ de l'original : media/<id>/hls-… pour un
    // média, weddings/<code>/galerie/videos/<uuid>/hls-… pour une galerie.
    const basePrefix = key.replace(/\/[^/]+$/, "");
    const hlsPrefix = stampedPrefix(basePrefix);
    const up = await uploadHlsDir({ s3, bucket: BUCKET, workDir: outDir, hlsPrefix });
    log(`  ↑ ${up.count} fichiers HLS envoyés (${hlsPrefix}/)`);

    const urls = {
      masterUrl: publicUrl(`${hlsPrefix}/master.m3u8`),
      posterUrl: publicUrl(`${hlsPrefix}/poster.jpg`),
      hoverUrl:  publicUrl(`${hlsPrefix}/hover.mp4`),
      src,
      /* Le MP4 léger, à proposer au client à côté du rush d'origine.
         Sa taille est mesurée ici : sans elle, « version légère » ne
         voudrait rien dire pour des mariés — c'est le poids qui décide. */
      leger: rendu?.telechargement ? {
        url: publicUrl(`${hlsPrefix}/${rendu.telechargement.fichier}`),
        octets: rendu.telechargement.octets,
        palier: rendu.telechargement.palier,
      } : null,
      octetsOriginal: bytes,
    };
    if (urls.leger) {
      log(`  ⇩ version légère ${urls.leger.palier} : ${fmtSize(urls.leger.octets)} (original ${fmtSize(bytes)})`);
    }
    if (job.kind === "media") await applyToMedia(job, urls);
    else                      await applyToGalleryVideo(job, urls);

    // Le résultat est en base : les encodages précédents de CETTE
    // vidéo sont orphelins (ré-encodage après remplacement du fichier).
    const purged = await purgeStaleHls({ s3, bucket: BUCKET, basePrefix, keepPrefix: hlsPrefix });
    if (purged.count) log(`  ⌫ ${purged.count} anciens fichiers HLS supprimés (${fmtSize(purged.bytes)})`);

    // Compteur de stockage : net réellement ajouté sur B2 par CE job
    // (nouveaux segments − anciens purgés). Best-effort, jamais bloquant.
    await bumpAgencyStorage(job, up.bytes - purged.bytes);

    await sb.from("encode_jobs")
      .update({ status: "done", done_at: new Date().toISOString(), error: null })
      .eq("id", job.id);
    log(`✓ job ${job.id} terminé — qualité adaptative active (${rungs.map((r) => r.name).join(" / ")})`);
  } finally {
    /* Le ménage ne doit JAMAIS faire échouer un job réussi. Constaté le
       29/07/2026 : un ENOTEMPTY sur ce rmSync, jeté depuis un `finally`,
       a remplacé la réussite du job par une erreur — le worker a
       remis en file un film 4K de 29 minutes DÉJÀ encodé et publié, et
       reparti pour deux heures. Un dossier temporaire qui survit coûte
       du disque ; une erreur ici coûtait tout le travail.
       maxRetries : macOS rend ENOTEMPTY quand un descripteur se ferme
       encore pendant la suppression — quelques reprises suffisent. */
    try {
      rmSync(workRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch (e) {
      log(`  ⚠ dossier de travail non supprimé (${e.code || e.message}) — le prochain démarrage s'en charge`);
    }
  }
}

async function failJob(job, err) {
  const message = String(err?.message || err).slice(0, 500);
  // Une panne passagère (réseau, B2 indisponible) mérite un 2ᵉ essai ;
  // au-delà — ou d'emblée si l'erreur est définitive — on s'arrête pour
  // ne pas boucler sur un fichier corrompu.
  if (err instanceof AttenteError) {
    // La tentative est RENDUE : claim_encode_job l'avait incrémentée.
    await sb.from("encode_jobs")
      .update({ status: "pending", error: message, attempts: Math.max(0, job.attempts - 1) })
      .eq("id", job.id);
    log(`⏸ job ${job.id} en attente — ${message}`);
    return;
  }
  const retry = !(err instanceof PermanentError) && job.attempts < MAX_ATTEMPTS;
  await sb.from("encode_jobs")
    .update({ status: retry ? "pending" : "error", error: message })
    .eq("id", job.id);
  log(`✗ job ${job.id} — ${message}${retry ? " → nouvelle tentative au prochain tour" : " (abandon)"}`);
}

/* ════════════════════════════════════════════════════════════
   Boucle
   ════════════════════════════════════════════════════════════ */
/* ─── Archive d'une galerie (téléchargement groupé) ──────────────
   Le client téléchargeait photo par photo. Sur 400 photos de mariage ce
   n'est pas tenable, et rien ne pouvait se faire dans le navigateur :
   3 Go ne s'assemblent pas en mémoire sur un iPhone, et l'écriture en
   flux vers le disque n'existe pas sur Safari. Le worker est déjà relié
   à B2 et déjà là — c'est lui qui prépare l'archive, et le client reçoit
   un simple lien, qui marche partout.
   `zip -0` : les JPEG sont déjà compressés, recompresser ne gagne rien
   et coûte du temps. On ne fait qu'emballer. */
async function processZipJob(job) {
  log(`▶ archive ${job.id} — galerie ${job.gallery_id}`);
  const workRoot = join(ROOT, "tmp-zip", `zip-${job.id}`);
  const dossier  = join(workRoot, "photos");
  mkdirSync(dossier, { recursive: true });

  const majProgress = async (p) => {
    try { await sb.from("zip_jobs").update({ progress: p }).eq("id", job.id); } catch (_) {}
  };

  try {
    /* select("*") et filtre côté JS, PAS un .eq("hidden", false) : si ce
       worker redémarre avant que la migration du masquage soit passée,
       une colonne nommée dans la requête la ferait échouer entière —
       ici, `hidden` absent vaut simplement « visible ». */
    const { data: brut, error } = await sb.from("gallery_photos")
      .select("*")
      .eq("gallery_id", job.gallery_id)
      .order("position", { ascending: true });
    if (error) throw new Error(`lecture des photos : ${error.message}`);
    /* Deux sortes d'archives. COMPLÈTE (photo_ids nul) : jamais une
       photo masquée — c'est la vue des invités, l'empreinte se périme à
       chaque bascule. DE SÉLECTION (photo_ids posé) : exactement ces
       photos, masquées comprises — c'est l'outil d'album du photographe,
       un favori masqué ensuite reste un favori. */
    const selection = Array.isArray(job.photo_ids) && job.photo_ids.length
      ? new Set(job.photo_ids) : null;
    const photos = (brut || []).filter((p) => selection ? selection.has(p.id) : !p.hidden);
    if (!photos.length) throw new PermanentError(selection
      ? "sélection introuvable — photos supprimées depuis ?"
      : "galerie sans photo visible — rien à archiver");

    log(`  ↓ ${photos.length} photo(s) à rassembler`);
    /* Noms de fichiers RANGÉS PAR CATÉGORIE, comme dans la galerie : le
       client retrouve ses « Préparatifs » et sa « Soirée » en dossiers
       plutôt qu'un tas de 400 fichiers. */
    const compte = new Map();
    let faites = 0;
    for (const ph of photos) {
      const url = ph.url_original || ph.url_view;
      if (!url) continue;
      const cat = slugDossier(ph.category || "photos");
      const n = (compte.get(cat) || 0) + 1; compte.set(cat, n);
      const sousDossier = join(dossier, cat);
      mkdirSync(sousDossier, { recursive: true });
      const cle = keyFromPublicUrl(url);
      if (!cle) continue;
      await downloadSource(cle, join(sousDossier, `${cat}-${String(n).padStart(3, "0")}.jpg`));
      faites++;
      // 0 → 85 pendant la collecte ; l'emballage et l'envoi font le reste.
      if (faites % 5 === 0) await majProgress(Math.round((faites / photos.length) * 85));
    }
    if (!faites) throw new PermanentError("aucune photo téléchargeable");

    await majProgress(88);
    const nomZip = `galerie-${job.gallery_id.slice(0, 8)}.zip`;
    const cheminZip = join(workRoot, nomZip);
    log(`  ⧉ emballage de ${faites} photo(s)`);
    // -0 : stocké, sans recompression. -r : récursif. -q : silencieux.
    execFileSync("zip", ["-0", "-r", "-q", cheminZip, "."], { cwd: dossier });

    await majProgress(92);
    const octets = statSync(cheminZip).size;
    /* uploadOriginalFile existe déjà et pose le bon en-tête de
       téléchargement (Content-Disposition) — inutile d'en écrire une
       seconde. Le préfixe est horodaté : une archive périmée n'écrase
       pas la nouvelle pendant qu'un client télécharge encore l'ancienne. */
    const cleZip = await uploadOriginalFile({
      s3, bucket: BUCKET, inputPath: cheminZip,
      basePrefix: `weddings/archives/${job.gallery_id}/${Date.now()}`,
    });
    const lien = publicUrl(cleZip);
    log(`  ↑ archive envoyée (${fmtSize(octets)})`);

    await sb.from("zip_jobs").update({
      status: "done", url: lien, taille: octets, progress: 100, done_at: new Date().toISOString(),
    }).eq("id", job.id);
    log(`✓ archive ${job.id} prête — ${fmtSize(octets)}`);
  } finally {
    // Déjà protégé, on ajoute seulement les reprises (même ENOTEMPTY).
    try { rmSync(workRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (_) {}
  }
}

const slugDossier = (s) => (s || "photos").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "photos";

/* ─── Ménage des archives ────────────────────────────────────────
   Une archive périmée n'est plus atteignable — request_gallery_zip ne
   regarde que l'empreinte COURANTE — mais elle occupe le quota de
   l'agence pour toujours. Deux cas, et le second est le plus sournois :

     · empreinte dépassée : la galerie a changé depuis. On attend 7 jours
       avant de supprimer, car un client peut être EN TRAIN de télécharger
       plusieurs Go ; couper le fichier sous lui serait incompréhensible.
     · galerie supprimée : la ligne zip_jobs part en CASCADE, donc plus
       rien en base ne pointe vers le fichier. Personne ne le retrouverait
       jamais. On compare donc les dossiers présents sur B2 aux galeries
       encore vivantes.

   Best effort, toujours : un ménage raté ne doit rien interrompre. */
let dernierMenage = 0;
const MENAGE_MS = 6 * 60 * 60 * 1000;      // au plus une fois toutes les 6 h

async function menageArchives() {
  if (Date.now() - dernierMenage < MENAGE_MS) return;
  dernierMenage = Date.now();
  try {
    // ① Empreinte dépassée, passé le délai de grâce.
    const { data: perimees } = await sb.rpc("stale_zip_jobs", { p_grace_days: 7 });
    if (perimees?.length) {
      const cles = perimees.map((z) => keyFromPublicUrl(z.url)).filter(Boolean);
      const n = await deleteB2Keys({ s3, bucket: BUCKET, keys: cles });
      await sb.from("zip_jobs").delete().in("id", perimees.map((z) => z.id));
      log(`🧹 ${n} archive(s) périmée(s) supprimée(s)`);
    }

    // ② Galeries disparues : leurs dossiers d'archives sont orphelins.
    const { data: vivantes } = await sb.rpc("gallery_ids_vivants");
    if (Array.isArray(vivantes)) {
      const connues = new Set(vivantes.map((x) => (typeof x === "string" ? x : x.gallery_ids_vivants)));
      const dossiers = await listB2Prefixes({ s3, bucket: BUCKET, prefix: "weddings/archives/" });
      const orphelins = dossiers.filter((d) => {
        const id = d.replace("weddings/archives/", "").replace(/\/$/, "");
        return id && !connues.has(id);
      });
      for (const d of orphelins) {
        const cles = await listB2Keys({ s3, bucket: BUCKET, prefix: d });
        const n = await deleteB2Keys({ s3, bucket: BUCKET, keys: cles });
        log(`🧹 archive orpheline supprimée (galerie disparue) — ${n} fichier(s)`);
      }
    }
  } catch (e) { log(`⚠ ménage des archives : ${e.message}`); }
}

/* Dossiers de travail laissés par un job interrompu (Mac endormi,
   ménage en échec) : ils ne servent plus à rien et pèsent des dizaines
   de Go. Balayés au démarrage, jamais pendant — un job en cours écrit
   dans le sien. */
function balayerDossiersOrphelins() {
  for (const base of ["tmp-hls", "tmp-zip", "tmp-drive"]) {
    const racine = join(ROOT, base);
    let noms = [];
    try { noms = readdirSync(racine); } catch (_) { continue; }
    let n = 0, octets = 0;
    for (const nom of noms) {
      const d = join(racine, nom);
      try {
        octets += Number(execFileSync("/usr/bin/du", ["-sk", d]).toString().split(/\s+/)[0]) * 1024;
        rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
        n++;
      } catch (_) {}
    }
    if (n) log(`🧹 ${n} dossier(s) de travail orphelin(s) supprimé(s) dans ${base} (${fmtSize(octets)})`);
  }
}

async function claimZip() {
  const { data, error } = await sb.rpc("claim_zip_job");
  if (error) return null;                 // table absente : migration pas passée
  return data && data.id ? data : null;
}

/* ════════════════════════════════════════════════════════════
   Drive : versions allégées (01/08/2026)
   ════════════════════════════════════════════════════════════
   Les vidéos déposées dans le Drive d'une agence reçoivent une
   version 720p légère et une affiche : c'est ELLE qu'on regarde au
   clic — l'original ne bouge que pour un téléchargement. Priorité
   la plus basse : un client qui attend son film passe toujours
   avant le rangement interne d'une équipe. */
async function claimDriveProxy() {
  try {
    const { data: cand } = await sb.from("drive_items")
      .select("id, agency_id, nom, url")
      .eq("genre", "video").eq("encodage", "pending")
      .order("created_at").limit(1);
    const c = cand?.[0];
    if (!c) return null;
    // Réclamation optimiste : un seul worker tourne, la condition
    // d'égalité suffit à ne jamais prendre deux fois le même.
    const { data: pris } = await sb.from("drive_items")
      .update({ encodage: "processing" })
      .eq("id", c.id).eq("encodage", "pending").select("id");
    return pris?.length ? c : null;
  } catch (_) { return null; }            // table absente : migration pas passée
}

async function putDriveFile(localPath, key, contentType) {
  const up = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET, Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
    },
    queueSize: 4, partSize: 100 * 1024 * 1024,
  });
  await up.done();
  return `${PUBLIC_BASE}/${key}`;
}

async function processDriveProxy(item) {
  log(`▶ drive ${item.id} — version allégée de « ${item.nom} »`);
  const key = keyFromPublicUrl(item.url);
  if (!key) throw new Error("source hors du bucket");
  const { data: ag } = await sb.from("agencies").select("slug").eq("id", item.agency_id).maybeSingle();
  if (!ag?.slug) throw new Error("agence introuvable");

  const workDir = join(ROOT, "tmp-drive", `drive-${item.id}`);
  const srcPath = join(workDir, "source");
  try {
    await downloadSource(key, srcPath);   // garde d'espace incluse (AttenteError)
    const meta = probeVideo(srcPath);

    // 720p au maximum (jamais agrandie), H.264 rapide, prête au clic.
    const proxyPath = join(workDir, "leger.mp4");
    execFileSync("ffmpeg", ["-y", "-i", srcPath,
      "-vf", "scale=w=-2:h='min(720,ih)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      proxyPath], { stdio: ["ignore", "ignore", "ignore"] });

    // L'affiche : une image nette prise après la première seconde.
    const posterPath = join(workDir, "affiche.jpg");
    execFileSync("ffmpeg", ["-y",
      "-ss", String(Math.min(1, Math.max(0, meta.durationSeconds - 1))),
      "-i", srcPath, "-frames:v", "1",
      "-vf", "scale=w=-2:h='min(540,ih)'",
      posterPath], { stdio: ["ignore", "ignore", "ignore"] });

    const base = `agencies/${ag.slug}/drive/${item.id}`;
    const legerUrl = await putDriveFile(proxyPath, `${base}/leger.mp4`, "video/mp4");
    const apercuUrl = await putDriveFile(posterPath, `${base}/affiche.jpg`, "image/jpeg");
    const octets = statSync(proxyPath).size + statSync(posterPath).size;

    await sb.from("drive_items").update({
      leger_url: legerUrl, apercu_url: apercuUrl,
      duree: meta.durationSeconds, encodage: "done", erreur: null,
    }).eq("id", item.id);

    // Le compteur de stockage suit (best effort, comme partout).
    try {
      const { error } = await sb.rpc("bump_storage", { p_agency: item.agency_id, p_delta: octets });
      if (error) throw error;
    } catch (_) { /* le scan nocturne rattrape */ }

    log(`  ✓ version allégée en ligne (${fmtSize(octets)}, ${meta.durationSeconds}s)`);
  } finally {
    // Non fatal, comme les autres files : un verrou résiduel ne doit
    // jamais transformer un encodage réussi en échec (leçon ENOTEMPTY).
    try { rmSync(workDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
    catch (e) { log(`  ⚠ ménage ${workDir} : ${e.message}`); }
  }
}

async function claim() {
  const { data, error } = await sb.rpc("claim_encode_job");
  if (error) { log(`⚠ réclamation impossible : ${error.message}`); return null; }
  return data && data.id ? data : null;
}

// Filet de sécurité mono-instance : si le Mac s'est endormi / a redémarré en
// plein encodage, le job est resté « processing » sans que personne ne le
// reprenne (la fiche reste `awaiting_encode`, le client ne voit rien). Comme un
// seul worker tourne, AUCUN job n'est légitimement en cours au démarrage : on
// remet donc les orphelins en file. Best effort — jamais bloquant.
async function requeueOrphans() {
  try {
    const { data, error } = await sb.from("encode_jobs")
      .update({ status: "pending" }).eq("status", "processing").select("id");
    if (error) { log(`⚠ requeue des orphelins impossible : ${error.message}`); return; }
    if (data?.length) log(`↺ ${data.length} job(s) orphelin(s) « processing » remis en file`);
    /* Les archives ont la même fragilité : une machine endormie en plein
       zip laisse un job « processing » que personne ne reprendra. La
       table peut ne pas exister (migration pas encore passée) — l'erreur
       est ignorée, comme le reste de ce filet. */
    const { data: z } = await sb.from("zip_jobs")
      .update({ status: "pending" }).eq("status", "processing").select("id");
    if (z?.length) log(`↺ ${z.length} archive(s) orpheline(s) remise(s) en file`);
    // Les versions allégées du Drive ont la même fragilité.
    const { data: d } = await sb.from("drive_items")
      .update({ encodage: "pending" }).eq("encodage", "processing").select("id");
    if (d?.length) log(`↺ ${d.length} version(s) allégée(s) orpheline(s) remise(s) en file`);
  } catch (e) { log(`⚠ requeue des orphelins : ${e.message}`); }
}

/* ── Veille : rester éveillé PENDANT un encodage seulement ──
   macOS suspend les processus quand la machine s'endort. Un job en
   cours reprendrait au réveil, mais des heures plus tard — et une
   connexion coupée en plein téléversement B2 le ferait échouer.
   `caffeinate -i` (sommeil d'inactivité) est lancé au début d'un job
   et tué à la fin : aucun effet sur la veille normale du Mac.
   Best effort — si caffeinate manque, le worker continue sans. */
let cafeine = null;
function empecherSommeil() {
  if (cafeine) return;
  try { cafeine = spawn("caffeinate", ["-i"], { stdio: "ignore", detached: false }); }
  catch (_) { cafeine = null; }
}
function autoriserSommeil() {
  if (!cafeine) return;
  try { cafeine.kill(); } catch (_) {}
  cafeine = null;
}

log(`🎬 worker d'encodage démarré (${ONCE ? "mode --once" : `boucle ${POLL_MS / 1000} s`})`);
balayerDossiersOrphelins();
await requeueOrphans();

while (!stopping) {
  const job = await claim();

  if (job) {
    busy = true;
    // Le Mac est réglé pour s'endormir après 1 min d'inactivité : sans
    // ça, un encodage lancé la nuit gèlerait en plein vol (le client
    // attendrait son film jusqu'au réveil). `caffeinate -i` empêche le
    // sommeil d'inactivité UNIQUEMENT le temps du job — la machine
    // continue de dormir normalement le reste du temps.
    empecherSommeil();
    try { await processJob(job); }
    catch (err) { await failJob(job, err); }
    finally { autoriserSommeil(); }
    busy = false;
    if (ONCE) break;
    continue;                       // enchaîne sans attendre : la file peut être pleine
  }

  /* Les archives passent APRÈS les encodages, jamais avant : un client
     qui attend son film compte plus qu'un autre qui attend son zip, et
     l'encodage est de loin le plus long des deux. On ne les regarde donc
     que lorsque la file d'encodage est vide. */
  const zip = await claimZip();
  if (zip) {
    busy = true;
    empecherSommeil();
    try { await processZipJob(zip); }
    catch (err) {
      log(`✗ archive ${zip.id} : ${err.message}`);
      try {
        await sb.from("zip_jobs").update({
          status: err instanceof PermanentError || zip.attempts >= 3 ? "error" : "pending",
          erreur: String(err.message).slice(0, 400),
        }).eq("id", zip.id);
      } catch (_) {}
    }
    finally { autoriserSommeil(); }
    busy = false;
    if (ONCE) break;
    continue;
  }

  /* Le Drive passe en DERNIER : le rangement interne d'une équipe
     n'a jamais la priorité sur un client qui attend. */
  const proxy = await claimDriveProxy();
  if (proxy) {
    busy = true;
    empecherSommeil();
    try { await processDriveProxy(proxy); }
    catch (err) {
      log(`✗ drive ${proxy.id} : ${err.message}`);
      try {
        await sb.from("drive_items").update(
          err instanceof AttenteError
            ? { encodage: "pending" }   // disque plein : on repassera
            : { encodage: "error", erreur: String(err.message).slice(0, 400) },
        ).eq("id", proxy.id);
      } catch (_) {}
    }
    finally { autoriserSommeil(); }
    busy = false;
    if (ONCE) break;
    continue;
  }

  if (ONCE) { log("· aucun job en attente."); break; }
  // File vide : c'est le moment du ménage, jamais devant un vrai travail.
  await menageArchives();
  await new Promise((r) => setTimeout(r, POLL_MS));
}

log("⏹ worker arrêté.");
process.exit(0);
