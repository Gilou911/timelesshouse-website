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

import { spawn } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  makeS3, publicUrl, probeVideo, rungsFor, transcodeHls, stampedPrefix,
  uploadHlsDir, purgeStaleHls, fmtDuration, fmtSize,
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

async function applyToGalleryVideo(job, { masterUrl }) {
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
    return { ...rest, hls: masterUrl };
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
    await transcodeHls({
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
    };
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
    rmSync(workRoot, { recursive: true, force: true });
  }
}

async function failJob(job, err) {
  const message = String(err?.message || err).slice(0, 500);
  // Une panne passagère (réseau, B2 indisponible) mérite un 2ᵉ essai ;
  // au-delà — ou d'emblée si l'erreur est définitive — on s'arrête pour
  // ne pas boucler sur un fichier corrompu.
  const retry = !(err instanceof PermanentError) && job.attempts < MAX_ATTEMPTS;
  await sb.from("encode_jobs")
    .update({ status: retry ? "pending" : "error", error: message })
    .eq("id", job.id);
  log(`✗ job ${job.id} — ${message}${retry ? " → nouvelle tentative au prochain tour" : " (abandon)"}`);
}

/* ════════════════════════════════════════════════════════════
   Boucle
   ════════════════════════════════════════════════════════════ */
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

  if (ONCE) { log("· aucun job en attente."); break; }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

log("⏹ worker arrêté.");
process.exit(0);
