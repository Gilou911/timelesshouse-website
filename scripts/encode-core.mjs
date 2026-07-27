// ════════════════════════════════════════════════════════════
// 🎬 Cœur du pipeline HLS — partagé CLI ↔ worker
// ════════════════════════════════════════════════════════════
// Extrait de scripts/encode-hls.mjs (qui garde son CLI intact) pour
// que le worker d'encodage automatique des locataires produise
// EXACTEMENT les mêmes fichiers que l'encodage manuel de la
// plateforme : mêmes paliers, mêmes réglages ffmpeg, même
// arborescence sur B2. Une seule vérité à maintenir.
//
// Rien ici ne parle à Supabase ni ne lit process.argv : ce module
// analyse, transcode et uploade. Qui décide quoi encoder et où
// écrire le résultat en base est l'affaire de l'appelant.
// ════════════════════════════════════════════════════════════

import { execFileSync, spawn } from "node:child_process";
import { createReadStream, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

/* ─── Client B2 (S3-compatible) ───────────────────────────── */
export function makeS3() {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    },
  });
}

export const publicUrl = (key) =>
  `${(process.env.B2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")}/${key}`;

export const CONTENT_TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  // Archive de galerie : sans cette entrée le zip repartait en
  // "video/mp4" (le repli de uploadOriginalFile).
  zip: "application/zip",
};

// execFileSync bufferise TOUT stdout+stderr en mémoire quand stdio="pipe".
// Le défaut Node (1 Mo) déborde sur un long film (des milliers de lignes de
// progression ffmpeg) → ENOBUFS → l'encodage échoue alors que la vidéo est
// saine. On plafonne large ET on coupe la progression en mode silencieux.
const FFMPEG_MAX_BUFFER = 256 * 1024 * 1024; // 256 Mo
const QUIET_LOG = ["-nostats", "-loglevel", "error"];

/* ─── Analyse de la source (ffprobe) ──────────────────────── */
export function probeVideo(inputPath) {
  const abs = resolve(inputPath);
  const inputSize = statSync(abs).size;
  const probe = (args) =>
    execFileSync("ffprobe", ["-v", "error", ...args, abs]).toString().trim();

  const [srcW, srcH] = probe([
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
  ]).split(",").map(Number);
  const durationSeconds = Math.round(
    parseFloat(probe(["-show_entries", "format=duration", "-of", "csv=p=0"])) || 0
  );
  const hasAudio = probe([
    "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0",
  ]).length > 0;

  if (!srcW || !srcH) throw new Error("Impossible de lire la résolution de la source (fichier vidéo valide ?)");

  return {
    inputPath: abs, inputSize, srcW, srcH, durationSeconds, hasAudio,
    portrait: srcH > srcW,
    shortSide: Math.min(srcW, srcH),
  };
}

/* ─── Échelle de qualités ─────────────────────────────────── */
// Le palier s'applique au PETIT côté : une vidéo verticale 1080×1920
// garde ainsi sa vraie qualité "1080p". On ne suréchantillonne jamais.
export const LADDER = [
  /* Plafond relevé de 15 à 20 Mbps le 27/07/2026, sur mesure VMAF d'un
     vrai film (extrait difficile de « je kiffe ») : la scène tombait à
     94,71 avec des creux à 88,67, et c'était le PLAFOND qui bridait, pas
     l'encodeur ni le preset. À 20 Mbps elle remonte à 96,49 (creux
     90,16) — dix fois le gain qu'apportait un changement de preset, qui
     lui ne rapportait que +0,02. Coûte du stockage, pas du temps. */
  { name: "2160p", side: 2160, vb: "17000k", maxrate: "20000k", bufsize: "30000k" },
  { name: "1080p", side: 1080, vb: "5000k",  maxrate: "5350k",  bufsize: "7500k"  },
  { name: "720p",  side: 720,  vb: "2800k",  maxrate: "3000k",  bufsize: "4200k"  },
  { name: "480p",  side: 480,  vb: "1200k",  maxrate: "1300k",  bufsize: "1800k"  },
];

export function rungsFor(shortSide) {
  const rungs = LADDER.filter((r) => r.side <= shortSide);
  return rungs.length ? rungs : [LADDER[LADDER.length - 1]]; // source < 480p : un seul palier
}

/* ─── Transcodage HLS + poster + aperçu au survol ─────────── */
// Produit dans workDir : master.m3u8, index_N.m3u8, seg_*.ts,
// poster.jpg, hover.mp4. Le contenu de ce dossier est ensuite
// uploadé tel quel par uploadHlsDir().
/* Lance ffmpeg en RENDANT COMPTE de son avancement.
   `-progress pipe:1` fait cracher à ffmpeg des lignes clé=valeur, dont
   `out_time_us` : la position atteinte dans le film. Rapportée à la
   durée, elle donne une fraction honnête — et surtout MONOTONE, parce
   que les quatre paliers sont produits en UNE passe. Une progression par
   palier serait repartie de zéro quatre fois, exactement le « 90 % en
   5 s puis 10 % en 5 min » que le guide proscrit.
   Remplace execFileSync : on ne peut pas lire un flux d'un processus
   synchrone. Le reste (poster, survol) tient en quelques secondes et
   garde son appel bloquant. */
function ffmpegSuivi(args, { quiet, durationSeconds, onProgress }) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-progress", "pipe:1", "-nostats", ...args], {
      stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
    });
    let reste = "";
    let dernier = -1;
    p.stdout.on("data", (buf) => {
      reste += buf.toString();
      const lignes = reste.split("\n");
      reste = lignes.pop() || "";
      for (const l of lignes) {
        const m = /^out_time_us=(\d+)/.exec(l.trim());
        if (!m || !durationSeconds || !onProgress) continue;
        // Plafonné à 98 : les 2 derniers points couvrent poster, survol
        // et envoi. Annoncer 100 avant la fin serait mentir.
        const pct = Math.max(0, Math.min(98,
          Math.round((Number(m[1]) / 1e6 / durationSeconds) * 100)));
        if (pct !== dernier) { dernier = pct; onProgress(pct); }
      }
    });
    let err = "";
    if (quiet && p.stderr) p.stderr.on("data", (b) => { err += b.toString(); });
    p.on("error", reject);
    p.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg a échoué (code ${code})${err ? ` : ${err.slice(-600)}` : ""}`)));
  });
}

export async function transcodeHls({ src, rungs, workDir, quiet = false, onProgress }) {
  const { inputPath, portrait, hasAudio, durationSeconds } = src;
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const n = rungs.length;
  const split = `[0:v]split=${n}${rungs.map((_, i) => `[v${i + 1}]`).join("")}`;
  const scales = rungs.map((r, i) => {
    // -2 = côté calculé automatiquement (pair). min() = garde-fou anti-upscale.
    const expr = portrait ? `scale='min(${r.side},iw)':-2` : `scale=-2:'min(${r.side},ih)'`;
    return `[v${i + 1}]${expr}[v${i + 1}o]`;
  });
  const filterComplex = [split, ...scales].join(";");

  const maps = rungs.flatMap((_, i) =>
    hasAudio ? ["-map", `[v${i + 1}o]`, "-map", "0:a:0"] : ["-map", `[v${i + 1}o]`]
  );
  const rates = rungs.flatMap((r, i) => [
    `-b:v:${i}`, r.vb, `-maxrate:v:${i}`, r.maxrate, `-bufsize:v:${i}`, r.bufsize,
  ]);
  const streamMap = rungs
    .map((r, i) => (hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`))
    .join(" ");

  await ffmpegSuivi([
    "-y",
    ...(quiet ? QUIET_LOG : []),
    "-i", inputPath,
    "-filter_complex", filterComplex,
    ...maps,
    "-c:v", "libx264", "-preset", "medium",
    "-pix_fmt", "yuv420p",              // sources 10-bit (log/HDR) → compatibles partout
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0", // keyframes régulières = bascules propres
    ...rates,
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
    "-f", "hls",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    "-hls_segment_filename", join(workDir, "seg_%v_%04d.ts"),
    join(workDir, "index_%v.m3u8"),
  ], { quiet, durationSeconds, onProgress });

  // Poster (frame nette à 2 s) + vidéo de survol (480p muette, légère)
  const posterAt = Math.min(2, Math.max(0, durationSeconds - 1));
  execFileSync("ffmpeg", [
    "-y", ...QUIET_LOG, "-ss", String(posterAt), "-i", inputPath,
    "-frames:v", "1", "-vf", portrait ? "scale='min(720,iw)':-2" : "scale=-2:'min(720,ih)'",
    "-q:v", "3", join(workDir, "poster.jpg"),
  ], { stdio: "pipe", maxBuffer: FFMPEG_MAX_BUFFER });
  execFileSync("ffmpeg", [
    "-y", ...QUIET_LOG, "-i", inputPath,
    "-vf", portrait ? "scale='min(480,iw)':-2" : "scale=-2:'min(480,ih)'",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    join(workDir, "hover.mp4"),
  ], { stdio: "pipe", maxBuffer: FFMPEG_MAX_BUFFER });
}

/* ─── Préfixe horodaté ────────────────────────────────────── */
// Un ré-encodage n'écrase jamais les anciens fichiers (le CDN
// Cloudflare peut les avoir en cache) : le ménage vient après.
export const stampedPrefix = (basePrefix) =>
  `${basePrefix}/hls-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

/* ─── Upload du dossier HLS vers B2 ───────────────────────── */
export async function uploadHlsDir({ s3, bucket, workDir, hlsPrefix, onProgress }) {
  const files = readdirSync(workDir).filter((f) => /\.(m3u8|ts|jpg|mp4)$/.test(f));
  const queue = [...files];
  let done = 0;
  let bytes = 0;                                // octets réellement envoyés (compteur delta)
  const worker = async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      const body = readFileSync(join(workDir, file));
      bytes += body.length;                    // lecture sync → pas de course entre les 6 workers
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${hlsPrefix}/${file}`,
        Body: body,
        ContentType: CONTENT_TYPES[file.split(".").pop()],
        CacheControl: "public, max-age=31536000, immutable",
      }));
      done++;
      onProgress?.(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { count: files.length, bytes };
}

/* ─── Upload de l'original (multipart au-delà de 100 Mo) ──── */
export async function uploadOriginalFile({ s3, bucket, inputPath, basePrefix, onProgress }) {
  const safeName = basename(inputPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${basePrefix}/original/${safeName}`;
  const size = statSync(inputPath).size;
  const up = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(inputPath),
      ContentType: CONTENT_TYPES[safeName.split(".").pop()] || "video/mp4",
      // Content-Disposition : force le téléchargement (même mécanique
      // que les fichiers B2 actuels du site)
      ContentDisposition: `attachment; filename="${safeName}"`,
    },
    queueSize: 4,
    partSize: 100 * 1024 * 1024,
  });
  up.on("httpUploadProgress", (p) => {
    if (p.loaded && size) onProgress?.(Math.round((p.loaded / size) * 100));
  });
  await up.done();
  return key;
}

/* ─── Suppression d'objets B2 (archives périmées) ─────────── */
export async function deleteB2Keys({ s3, bucket, keys }) {
  if (!keys?.length) return 0;
  let n = 0;
  // L'API accepte 1000 clés par appel ; on découpe pour ne pas dépendre
  // du nombre d'archives accumulées.
  for (let i = 0; i < keys.length; i += 1000) {
    const lot = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    const r = await s3.send(new DeleteObjectsCommand({
      Bucket: bucket, Delete: { Objects: lot, Quiet: true },
    }));
    n += lot.length - (r.Errors?.length || 0);
  }
  return n;
}

/* Les « dossiers » présents sous un préfixe (un niveau). Sert à repérer
   les archives dont la galerie a été supprimée : leur ligne part en
   cascade, le fichier resterait sinon orphelin pour toujours. */
export async function listB2Prefixes({ s3, bucket, prefix }) {
  const out = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix, Delimiter: "/", ContinuationToken: token,
    }));
    (r.CommonPrefixes || []).forEach((p) => out.push(p.Prefix));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/* Toutes les clés sous un préfixe. */
export async function listB2Keys({ s3, bucket, prefix }) {
  const out = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix, ContinuationToken: token,
    }));
    (r.Contents || []).forEach((o) => out.push(o.Key));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/* ─── Ménage des encodages précédents ─────────────────────── */
// La nouvelle version est en base : les anciens segments hls-* du
// même média sont orphelins et occupent le quota pour rien.
export async function purgeStaleHls({ s3, bucket, basePrefix, keepPrefix }) {
  // Pagination : au fil des ré-encodages, un même média peut cumuler
  // plus de 1000 objets hls-* ; sans le jeton de continuation, on en
  // laisserait derrière soi (quota grignoté par des orphelins).
  const stale = [];
  let bytes = 0;                               // octets libérés (compteur delta)
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: `${basePrefix}/hls-`, ContinuationToken: token,
    }));
    for (const o of page.Contents ?? []) {
      if (o.Key && !o.Key.startsWith(`${keepPrefix}/`)) {
        stale.push(o.Key);
        bytes += Number(o.Size) || 0;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  for (let i = 0; i < stale.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
    }));
  }
  return { count: stale.length, bytes };
}

/* ─── Helpers de format (mêmes règles que l'app client) ───── */
export function fmtDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`;
  return `${Math.round(bytes / 1e6)} Mo`;
}

export function qualityLabel(w, h) {
  const side = Math.min(w, h);
  if (side >= 2160) return "4K";
  if (side >= 1440) return "1440p";
  if (side >= 1080) return "1080p";
  if (side >= 720) return "720p";
  return `${side}p`;
}
