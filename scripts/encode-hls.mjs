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
// Le CŒUR (ffprobe, paliers, ffmpeg, upload B2) vit dans
// scripts/encode-core.mjs — partagé avec le worker d'encodage
// automatique des agences locataires (workers/encoder/). Ce fichier
// n'est plus que le CLI de la plateforme : arguments, garde-fous et
// écritures en base.
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

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  makeS3, publicUrl, probeVideo, rungsFor, transcodeHls, stampedPrefix,
  uploadHlsDir, uploadOriginalFile, purgeStaleHls,
  fmtDuration, fmtSize, qualityLabel,
} from "./encode-core.mjs";

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
const BUCKET = process.env.B2_BUCKET;
const s3 = makeS3();

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
const src = probeVideo(input);
const { srcW, srcH, durationSeconds, inputSize, hasAudio, portrait, shortSide } = src;
console.log(`→ source : ${srcW}×${srcH} (${portrait ? "vertical" : "horizontal"}) · ${fmtDuration(durationSeconds)} · ${fmtSize(inputSize)} · audio : ${hasAudio ? "oui" : "non"}`);

const rungs = rungsFor(shortSide);
console.log(`→ paliers : ${rungs.map((r) => r.name).join(" / ")}`);

// ─── Transcodage ────────────────────────────────────────────
const workId = mediaId || rawPrefix.replace(/[^a-zA-Z0-9-]/g, "_");
const workDir = resolve("tmp-hls", workId);

const n = rungs.length;
console.log(`→ ffmpeg : transcodage HLS adaptatif en ${n} qualité${n > 1 ? "s" : ""}… (long pour un film complet, laisse tourner)`);
transcodeHls({ src, rungs, workDir });
console.log("→ poster.jpg + hover.mp4 générés");

// ─── Upload vers B2 ─────────────────────────────────────────
const basePrefix = mediaId ? `media/${mediaId}` : rawPrefix;
const hlsPrefix = stampedPrefix(basePrefix);

console.log(`→ upload vers B2 (${hlsPrefix}/)…`);
const uploaded = await uploadHlsDir({
  s3, bucket: BUCKET, workDir, hlsPrefix,
  onProgress: (done, total) => process.stdout.write(`\r   ${done}/${total}`),
});
console.log(`\n   ${uploaded} fichiers envoyés`);

// Original (téléchargement) — multipart automatique via lib-storage
let originalKey = null;
if (uploadOriginal) {
  console.log(`→ upload de l'original (${fmtSize(inputSize)})…`);
  originalKey = await uploadOriginalFile({
    s3, bucket: BUCKET, inputPath: src.inputPath, basePrefix,
    onProgress: (pct) => process.stdout.write(`\r   ${pct}%`),
  });
  console.log();
}

// ─── Mise à jour de la fiche média / récap ──────────────────
const masterUrl = publicUrl(`${hlsPrefix}/master.m3u8`);
const posterUrl = publicUrl(`${hlsPrefix}/poster.jpg`);
const hoverUrl  = publicUrl(`${hlsPrefix}/hover.mp4`);

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
  if (originalKey) patch.url = publicUrl(originalKey);

  const { data: updated, error } = await supabase
    .from("media").update(patch).eq("id", mediaId).select("id");
  if (error || !updated || updated.length === 0) {
    console.error("✗ Mise à jour de la base ÉCHOUÉE :", error?.message ?? "aucune ligne modifiée");
    process.exit(1);
  }

  const purged = await purgeStaleHls({ s3, bucket: BUCKET, basePrefix, keepPrefix: hlsPrefix });
  if (purged) console.log(`→ ${purged} anciens fichiers HLS supprimés`);

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
  if (originalKey) console.log(`  URL de téléchargement         : ${publicUrl(originalKey)}`);
  console.log(`  Poster (si besoin)            : ${posterUrl}`);
  console.log(`  Qualités : ${rungs.map((r) => r.name).join(" / ")} · original ${qualityLabel(srcW, srcH)} · ${fmtSize(inputSize)}`);
}

rmSync(workDir, { recursive: true, force: true });
