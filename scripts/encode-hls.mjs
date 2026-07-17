#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
// 🎬 Pipeline HLS adaptatif — TimelessHouse (B2 uniquement)
// ════════════════════════════════════════════════════════════
// Transcode une vidéo livrée en échelle de qualités HLS (le lecteur
// bascule automatiquement selon la connexion du client), uploade le
// tout sur Backblaze B2, et met à jour la fiche média dans Supabase.
// Adapté du pipeline ylvfeet (sans chiffrement : les livrables sont
// derrière le code client, pas de contenu payant à protéger).
//
// À lancer en LOCAL (ffmpeg + ffprobe requis) :
//
//   ▸ Médiathèque client (table media) :
//       npm run encode -- --media-id <uuid> --input /chemin/film.mp4
//     Options :
//       --upload-original   uploade aussi le fichier source sur B2
//                           (multipart) et le définit comme URL de
//                           téléchargement (media.url)
//
//   ▸ Films de mariage (event_pages — URLs à coller dans l'admin) :
//       npm run encode -- --prefix weddings/ezla-davy/film --input /chemin/film.mp4 [--upload-original]
//
// Ce que produit le script :
//   master.m3u8 + variantes     → lecture adaptative (jusqu'à 4K)
//   poster.jpg                  → vignette (si aucune en base)
//   hover.mp4 (480p muet)       → aperçu au survol des cartes
//   métadonnées ffprobe         → résolution/durée/poids RÉELS de
//                                 l'original, affichés au client
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
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// ─── Arguments ──────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const mediaId        = arg("media-id");
const rawPrefix      = arg("prefix");
const input          = arg("input");
const uploadOriginal = hasFlag("upload-original");
const eventPage      = arg("event-page");   // id d'une page vidéo (event_pages)
const field          = arg("field");        // legacy : teaserHls | filmHls
const videoKey       = arg("video-key");    // actuel : clé dans config.videos[]

if ((!mediaId && !rawPrefix) || !input) {
  console.error(`Usage :
  npm run encode -- --media-id <uuid> --input <fichier> [--upload-original]
  npm run encode -- --prefix weddings/<slug>/<film|teaser> --input <fichier> [--upload-original]
  npm run encode -- --prefix weddings/<slug>/<clé> --input <fichier> --event-page <id> --video-key <clé>`);
  process.exit(1);
}
if (rawPrefix && !/^(media|weddings)\/[a-zA-Z0-9._\-/]+$/.test(rawPrefix)) {
  console.error("✗ --prefix doit commencer par media/ ou weddings/ (lettres, chiffres, - _ . /)");
  process.exit(1);
}
if (eventPage && !videoKey && !["teaserHls", "filmHls"].includes(field)) {
  console.error("✗ --event-page requiert --video-key <clé> (ou, en legacy, --field teaserHls|filmHls)");
  process.exit(1);
}

// ─── Environnement ──────────────────────────────────────────
const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
for (const [name, value] of Object.entries({
  "VITE_SUPABASE_URL (ou SUPABASE_URL)": SB_URL,
  B2_ENDPOINT: process.env.B2_ENDPOINT,
  B2_REGION: process.env.B2_REGION,
  B2_BUCKET: process.env.B2_BUCKET,
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APP_KEY: process.env.B2_APP_KEY,
  B2_PUBLIC_BASE_URL: process.env.B2_PUBLIC_BASE_URL,
})) {
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
    process.exit(1);
  }
}
if ((mediaId || eventPage) && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variable manquante : SUPABASE_SERVICE_ROLE_KEY (requise pour mettre à jour la base)");
  process.exit(1);
}
const PUBLIC_BASE = process.env.B2_PUBLIC_BASE_URL.replace(/\/+$/, "");
const pub = (key) => `${PUBLIC_BASE}/${key}`;

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
});

// ─── Vérification préalable de la fiche média ───────────────
const supabase = (mediaId || eventPage)
  ? createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;
// La page vidéo doit exister AVANT d'encoder (évite un encodage dans le vide)
if (eventPage) {
  const { data } = await supabase.from("event_pages").select("id").eq("id", eventPage).maybeSingle();
  if (!data) {
    console.error(`✗ Aucune page vidéo avec l'id ${eventPage} — vérifie l'identifiant.`);
    process.exit(1);
  }
}
let existingMedia = null;
if (mediaId) {
  const { data } = await supabase
    .from("media")
    .select("id, title, thumb_url, url")
    .eq("id", mediaId)
    .maybeSingle();
  if (!data) {
    console.error(`✗ Aucun média avec l'id ${mediaId} — vérifie l'identifiant (admin → média → copier l'id).`);
    process.exit(1);
  }
  existingMedia = data;
  console.log(`→ média : ${data.title}`);
}

// ─── Analyse de la source (ffprobe) ─────────────────────────
const inputPath = resolve(input);
const inputSize = statSync(inputPath).size;

function probe(args) {
  return execFileSync("ffprobe", ["-v", "error", ...args, inputPath]).toString().trim();
}
const [srcW, srcH] = probe([
  "-select_streams", "v:0",
  "-show_entries", "stream=width,height",
  "-of", "csv=p=0",
]).split(",").map(Number);
const durationSeconds = Math.round(parseFloat(probe(["-show_entries", "format=duration", "-of", "csv=p=0"])) || 0);
const hasAudio = probe(["-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0"]).length > 0;

if (!srcW || !srcH) {
  console.error("✗ Impossible de lire la résolution de la source (fichier vidéo valide ?)");
  process.exit(1);
}
const portrait = srcH > srcW;
const shortSide = Math.min(srcW, srcH);
console.log(`→ source : ${srcW}×${srcH} (${portrait ? "vertical" : "horizontal"}) · ${fmtDuration(durationSeconds)} · ${fmtSize(inputSize)} · audio : ${hasAudio ? "oui" : "non"}`);

// ─── Échelle de qualités ────────────────────────────────────
// Le palier s'applique au PETIT côté : une vidéo verticale 1080×1920
// garde ainsi sa vraie qualité "1080p". On ne suréchantillonne jamais.
const LADDER = [
  { name: "2160p", side: 2160, vb: "14000k", maxrate: "15000k", bufsize: "21000k" },
  { name: "1080p", side: 1080, vb: "5000k",  maxrate: "5350k",  bufsize: "7500k"  },
  { name: "720p",  side: 720,  vb: "2800k",  maxrate: "3000k",  bufsize: "4200k"  },
  { name: "480p",  side: 480,  vb: "1200k",  maxrate: "1300k",  bufsize: "1800k"  },
];
let rungs = LADDER.filter((r) => r.side <= shortSide);
if (rungs.length === 0) rungs = [LADDER[LADDER.length - 1]]; // source < 480p : un seul palier
console.log(`→ paliers : ${rungs.map((r) => r.name).join(" / ")}`);

// ─── Transcodage ────────────────────────────────────────────
const workId = mediaId || rawPrefix.replace(/[^a-zA-Z0-9-]/g, "_");
const workDir = resolve("tmp-hls", workId);
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

console.log(`→ ffmpeg : transcodage HLS adaptatif en ${n} qualité${n > 1 ? "s" : ""}… (long pour un film complet, laisse tourner)`);
execFileSync(
  "ffmpeg",
  [
    "-y",
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
  ],
  { stdio: "inherit" }
);

// Poster (frame nette à 2 s) + vidéo de survol (480p muette, légère)
console.log("→ poster.jpg + hover.mp4…");
const posterAt = Math.min(2, Math.max(0, durationSeconds - 1));
execFileSync("ffmpeg", [
  "-y", "-ss", String(posterAt), "-i", inputPath,
  "-frames:v", "1", "-vf", portrait ? "scale='min(720,iw)':-2" : "scale=-2:'min(720,ih)'",
  "-q:v", "3", join(workDir, "poster.jpg"),
], { stdio: "pipe" });
execFileSync("ffmpeg", [
  "-y", "-i", inputPath,
  "-vf", portrait ? "scale='min(480,iw)':-2" : "scale=-2:'min(480,ih)'",
  "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  join(workDir, "hover.mp4"),
], { stdio: "pipe" });

// ─── Upload vers B2 ─────────────────────────────────────────
// Préfixe horodaté : un ré-encodage n'écrase jamais les anciens
// fichiers (le CDN Cloudflare peut les avoir en cache).
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const basePrefix = mediaId ? `media/${mediaId}` : rawPrefix;
const hlsPrefix = `${basePrefix}/hls-${stamp}`;

const CONTENT_TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

const files = readdirSync(workDir).filter((f) => /\.(m3u8|ts|jpg|mp4)$/.test(f));
console.log(`→ upload de ${files.length} fichiers vers B2 (${hlsPrefix}/)…`);
let done = 0;
const queue = [...files];
async function uploadWorker() {
  while (queue.length > 0) {
    const file = queue.shift();
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.B2_BUCKET,
        Key: `${hlsPrefix}/${file}`,
        Body: readFileSync(join(workDir, file)),
        ContentType: CONTENT_TYPES[file.split(".").pop()],
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    done++;
    process.stdout.write(`\r   ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, uploadWorker));
console.log();

// Original (téléchargement) — multipart automatique via lib-storage
let originalKey = null;
if (uploadOriginal) {
  const safeName = basename(inputPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  originalKey = `${basePrefix}/original/${safeName}`;
  console.log(`→ upload de l'original (${fmtSize(inputSize)}) vers ${originalKey}…`);
  const up = new Upload({
    client: s3,
    params: {
      Bucket: process.env.B2_BUCKET,
      Key: originalKey,
      Body: createReadStream(inputPath),
      ContentType: CONTENT_TYPES[safeName.split(".").pop()] || "video/mp4",
      // Content-Disposition : force le téléchargement (même mécanique que
      // les fichiers B2 actuels du site)
      ContentDisposition: `attachment; filename="${safeName}"`,
    },
    queueSize: 4,
    partSize: 100 * 1024 * 1024,
  });
  up.on("httpUploadProgress", (p) => {
    if (p.loaded && inputSize) process.stdout.write(`\r   ${Math.round((p.loaded / inputSize) * 100)}%`);
  });
  await up.done();
  console.log();
}

// ─── Mise à jour de la fiche média / récap ──────────────────
const masterUrl = pub(`${hlsPrefix}/master.m3u8`);
const posterUrl = pub(`${hlsPrefix}/poster.jpg`);
const hoverUrl  = pub(`${hlsPrefix}/hover.mp4`);

if (mediaId) {
  const patch = {
    preview_url: masterUrl,                    // lecture adaptative
    hover_url: hoverUrl,                       // aperçu au survol
    duration_seconds: durationSeconds || null,
    duration: fmtDuration(durationSeconds),    // libellé legacy affiché
    source_width: srcW,
    source_height: srcH,
    source_size_bytes: inputSize,
    size_label: fmtSize(inputSize),            // libellé legacy affiché
  };
  if (!existingMedia.thumb_url) patch.thumb_url = posterUrl;
  if (originalKey) patch.url = pub(originalKey);

  const { data: updated, error } = await supabase
    .from("media").update(patch).eq("id", mediaId).select("id");
  if (error || !updated || updated.length === 0) {
    console.error("✗ Mise à jour de la base ÉCHOUÉE :", error?.message ?? "aucune ligne modifiée");
    process.exit(1);
  }

  // Ménage : suppression des anciens encodages hls-* de ce média
  // (la nouvelle version est en base, les vieux segments sont orphelins)
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.B2_BUCKET, Prefix: `${basePrefix}/hls-` })
  );
  const stale = (Contents ?? [])
    .map((o) => o.Key)
    .filter((k) => k && !k.startsWith(`${hlsPrefix}/`));
  for (let i = 0; i < stale.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: process.env.B2_BUCKET,
        Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
      })
    );
  }
  if (stale.length) console.log(`→ ${stale.length} anciens fichiers HLS supprimés`);

  console.log(`\n✓ Lecture adaptative active pour « ${existingMedia.title} »`);
  console.log(`  Qualités : ${rungs.map((r) => r.name).join(" / ")} (auto selon la connexion)`);
  console.log(`  Original affiché au client : ${qualityLabel(srcW, srcH)} · ${fmtSize(inputSize)}`);
} else if (eventPage) {
  // Réécriture automatique de l'URL HLS dans la config de la page vidéo
  const { data: page } = await supabase.from("event_pages").select("config").eq("id", eventPage).maybeSingle();
  const config = page?.config || {};
  let newConfig, cible;

  if (videoKey) {
    // Modèle actuel : liste videos[] (titres libres)
    const list = Array.isArray(config.videos) ? config.videos : [];
    const idx = list.findIndex((v) => v && v.key === videoKey);
    if (idx === -1) {
      console.error(`✗ Aucune vidéo « ${videoKey} » dans cette page (clés : ${list.map((v) => v && v.key).join(", ") || "aucune"}).`);
      console.log(`  URL HLS générée, à renseigner manuellement : ${masterUrl}`);
      process.exit(1);
    }
    const videos = list.map((v, i) => (i === idx ? { ...v, hls: masterUrl } : v));
    newConfig = { ...config, videos };
    cible = `« ${list[idx].title || videoKey} »`;
  } else {
    // Legacy : champ teaserHls / filmHls
    newConfig = { ...config, [field]: masterUrl };
    cible = field;
  }

  const { error } = await supabase.from("event_pages").update({ config: newConfig }).eq("id", eventPage);
  if (error) {
    console.error("✗ Mise à jour de la page ÉCHOUÉE :", error.message);
    console.log(`  À renseigner manuellement (${cible}) : ${masterUrl}`);
    process.exit(1);
  }
  console.log(`\n✓ Lecture adaptative active — ${cible} mis à jour automatiquement sur la page.`);
  console.log(`  URL HLS : ${masterUrl}`);
  console.log(`  Qualités : ${rungs.map((r) => r.name).join(" / ")} · original ${qualityLabel(srcW, srcH)} · ${fmtSize(inputSize)}`);
  console.log(`  → Recharge la page vidéo dans l'admin pour voir le champ rempli.`);
} else {
  console.log(`\n✓ Encodage terminé — à coller dans l'admin (page vidéo) :`);
  console.log(`  URL HLS (lecture adaptative) : ${masterUrl}`);
  if (originalKey) console.log(`  URL de téléchargement         : ${pub(originalKey)}`);
  console.log(`  Poster (si besoin)            : ${posterUrl}`);
  console.log(`  Qualités : ${rungs.map((r) => r.name).join(" / ")} · original ${qualityLabel(srcW, srcH)} · ${fmtSize(inputSize)}`);
}

rmSync(workDir, { recursive: true, force: true });

// ─── Helpers de format (mêmes règles que l'app client) ──────
function fmtDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`;
  return `${Math.round(bytes / 1e6)} Mo`;
}
function qualityLabel(w, h) {
  const side = Math.min(w, h);
  if (side >= 2160) return "4K";
  if (side >= 1440) return "1440p";
  if (side >= 1080) return "1080p";
  if (side >= 720) return "720p";
  return `${side}p`;
}
