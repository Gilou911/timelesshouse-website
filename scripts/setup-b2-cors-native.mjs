#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
// 🔓  CORS du bucket B2 — API NATIVE Backblaze
// ════════════════════════════════════════════════════════════
// Autorise, depuis chaque domaine où vit la console ou une galerie :
//   ▸ l'upload direct navigateur → B2 (PUT signé S3, voir b2-sign)
//   ▸ la lecture des segments HLS et le téléchargement des photos (GET)
//
// Pourquoi ce script REMPLACE setup-b2-cors.mjs : ce bucket porte des
// règles CORS *natives*, et l'API S3 (PutBucketCors) répond désormais
// « InvalidRequest — use B2 Native API ». On passe donc par
// b2_authorize_account + b2_update_bucket.
//
// ⚠️ b2_update_bucket REMPLACE toutes les règles : la liste ORIGINS
// ci-dessous doit contenir TOUTES les origines de prod, sinon on en
// efface. Ajout du 24/07/2026 : app.timelesshouse.org — la console
// plateforme y a déménagé lors de la séparation des deux sites, et
// son origine n'était plus autorisée (uploads « CORS du bucket »).
//
// Lancement (depuis la racine du projet, .env.local présent) :
//   npm run b2-cors
// La clé lue dans .env.local est la clé d'application du bucket, la
// même que le worker d'encodage — indépendante de ta connexion perso
// Backblaze. Elle doit avoir la capacité « writeBuckets » ; sinon B2
// répond « not allowed » et il faut une clé qui l'a (clé maître).
// ════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const KEY_ID = process.env.B2_KEY_ID;
const APP_KEY = process.env.B2_APP_KEY;
const BUCKET_NAME = process.env.B2_BUCKET;

if (!KEY_ID || !APP_KEY || !BUCKET_NAME) {
  console.error("✗ B2_KEY_ID / B2_APP_KEY / B2_BUCKET manquants dans .env.local");
  process.exit(1);
}

const ORIGINS = [
  "https://app.timelesshouse.org",              // ← console plateforme (déménagée le 23/07/2026)
  "https://timelesshouse.org",
  "https://www.timelesshouse.org",
  "https://laloge.app",
  "https://laloge.house",
  "https://*.laloge.house",                     // chaque loge d'agence
  "https://timelesshouse-website.pages.dev",    // projet Pages (produit)
  "https://*.timelesshouse-website.pages.dev",  // déploiements de preview
  "https://timelesshouse-studio.pages.dev",     // projet Pages (studio)
  "http://localhost:5173",                      // vite dev
  "http://localhost:4173",                      // vite preview
];

// Upload = PUT signé S3 ; lecture HLS / téléchargement = GET (S3 ou natif).
// On couvre les deux familles d'opérations.
const CORS_RULES = [{
  corsRuleName: "laLogeBrowser",
  allowedOrigins: ORIGINS,
  allowedOperations: [
    "s3_put", "s3_get", "s3_head", "s3_post",
    "b2_download_file_by_id", "b2_download_file_by_name",
    "b2_upload_file", "b2_upload_part",
  ],
  allowedHeaders: ["*"],
  exposeHeaders: ["etag"],   // ETag des parts : requis pour l'upload multipart
  maxAgeSeconds: 3600,
}];

const j = (res) => res.json();

// 1) Authentification
const basic = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString("base64");
const authRes = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: `Basic ${basic}` },
});
if (!authRes.ok) {
  console.error("✗ b2_authorize_account :", authRes.status, await authRes.text());
  process.exit(1);
}
const auth = await authRes.json();
const store = auth.apiInfo?.storageApi || {};
const apiUrl = store.apiUrl || auth.apiUrl;
const token = auth.authorizationToken;
const accountId = auth.accountId;
let bucketId = store.bucketId || auth.allowed?.bucketId || null;

// 2) Résoudre bucketId si la clé n'est pas scopée à un seul bucket
if (!bucketId) {
  const listRes = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, bucketName: BUCKET_NAME }),
  });
  const list = await j(listRes);
  bucketId = list.buckets?.[0]?.bucketId || null;
}
if (!bucketId) {
  console.error(`✗ bucketId introuvable pour « ${BUCKET_NAME} ».`);
  process.exit(1);
}

// 3) Mise à jour des règles CORS
const upRes = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
  method: "POST",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ accountId, bucketId, corsRules: CORS_RULES }),
});
const up = await j(upRes);
if (!upRes.ok) {
  console.error("✗ b2_update_bucket :", upRes.status, JSON.stringify(up, null, 2));
  if (up?.code === "unauthorized" || up?.status === 401) {
    console.error("\n⚠️  La clé lue dans .env.local n'a pas la capacité « writeBuckets ».");
    console.error("   Utilise une clé maître (ou une clé avec writeBuckets sur ce bucket).");
  }
  process.exit(1);
}

console.log("✓ CORS natif mis à jour. Origines autorisées :");
ORIGINS.forEach((o) => console.log("   ·", o));
console.log("\nRègles renvoyées par B2 :");
console.log(JSON.stringify(up.corsRules ?? up, null, 2));
