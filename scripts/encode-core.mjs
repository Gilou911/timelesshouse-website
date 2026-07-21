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

import { execFileSync } from "node:child_process";
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
  { name: "2160p", side: 2160, vb: "14000k", maxrate: "15000k", bufsize: "21000k" },
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
export function transcodeHls({ src, rungs, workDir, quiet = false }) {
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

  const stdio = quiet ? "pipe" : "inherit";
  execFileSync("ffmpeg", [
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
  ], { stdio, maxBuffer: FFMPEG_MAX_BUFFER });

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
  const worker = async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${hlsPrefix}/${file}`,
        Body: readFileSync(join(workDir, file)),
        ContentType: CONTENT_TYPES[file.split(".").pop()],
        CacheControl: "public, max-age=31536000, immutable",
      }));
      done++;
      onProgress?.(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return files.length;
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

/* ─── Ménage des encodages précédents ─────────────────────── */
// La nouvelle version est en base : les anciens segments hls-* du
// même média sont orphelins et occupent le quota pour rien.
export async function purgeStaleHls({ s3, bucket, basePrefix, keepPrefix }) {
  // Pagination : au fil des ré-encodages, un même média peut cumuler
  // plus de 1000 objets hls-* ; sans le jeton de continuation, on en
  // laisserait derrière soi (quota grignoté par des orphelins).
  const stale = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: `${basePrefix}/hls-`, ContinuationToken: token,
    }));
    for (const o of page.Contents ?? []) {
      if (o.Key && !o.Key.startsWith(`${keepPrefix}/`)) stale.push(o.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  for (let i = 0; i < stale.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
    }));
  }
  return stale.length;
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
