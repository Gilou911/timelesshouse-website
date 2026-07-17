#!/usr/bin/env node
// Configure le CORS du bucket B2 pour :
//   ▸ l'upload direct navigateur → B2 (PUT signé depuis l'admin)
//   ▸ la lecture des segments HLS par hls.js (GET cross-origin)
// Usage :
//   node scripts/setup-b2-cors.mjs [origine1] [origine2] ...
// Sans argument : localhost (dev Vite). ⚠️ Avant la mise en prod,
// relancer avec les domaines réels, ex :
//   node scripts/setup-b2-cors.mjs https://timelesshouse.org https://www.timelesshouse.org http://localhost:5173
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// ⚠️ b2_update_bucket REMPLACE les règles : la liste par défaut doit contenir
// TOUTES les origines de prod, sinon un simple `npm run b2-cors` les efface.
const DEFAULT_ORIGINS = [
  "https://timelesshouse.org",
  "https://www.timelesshouse.org",
  "https://timelesshouse-website.pages.dev",              // URL Cloudflare Pages
  "https://*.timelesshouse-website.pages.dev",            // déploiements de preview
  "http://localhost:5173",                               // vite dev
  "http://localhost:4173",                               // vite preview
];

const origins = process.argv.slice(2);
if (origins.length === 0) {
  origins.push(...DEFAULT_ORIGINS);
  console.log("ℹ Aucune origine fournie — application de la liste par défaut (prod + previews + localhost).\n");
}

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
});

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: process.env.B2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["etag"], // requis pour l'upload multipart (ETag des parts)
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  const check = await s3.send(
    new GetBucketCorsCommand({ Bucket: process.env.B2_BUCKET })
  );
  console.log("✓ CORS configuré pour :", origins.join(", "));
  console.log(JSON.stringify(check.CORSRules, null, 2));
} catch (err) {
  console.error("✗", err.name, err.message);
  process.exit(1);
}
