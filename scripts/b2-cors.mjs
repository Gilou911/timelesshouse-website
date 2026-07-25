#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════
   🌐 RÈGLES CORS DU BUCKET B2 — lecture et ajout d'origine
   ════════════════════════════════════════════════════════════
   Pourquoi ce script existe : l'API B2 REMPLACE l'intégralité des
   règles CORS à chaque mise à jour. Ajouter une origine « à la main »
   avec un corps JSON écrit de tête efface toutes les autres — et les
   envois qui fonctionnaient cessent, sans erreur visible ailleurs que
   dans le navigateur des clients.
   Ce script fait donc une lecture-modification-écriture : il repart
   TOUJOURS des règles réellement en place, et se contente d'ajouter
   l'origine demandée aux règles qui autorisent déjà une origine de
   référence — en gardant leurs opérations et en-têtes à l'identique
   (les deviner serait le meilleur moyen de casser le multipart).

   Constat du 25/07/2026 : app.timelesshouse.org n'était dans aucune
   règle. Résultat, tout envoi de photo ou de film depuis la console
   ou le concepteur servis sur ce domaine échouait sur « Upload B2
   échoué — réseau ou CORS du bucket », alors que la signature côté
   serveur répondait 200. C'est le navigateur qui refusait le PUT.

   USAGE
     node scripts/b2-cors.mjs                      → lit et affiche
     node scripts/b2-cors.mjs --ajouter <origine>  → montre le projet
     node scripts/b2-cors.mjs --ajouter <origine> --appliquer
                                                   → écrit vraiment
   ════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';

// ── .env.local, sans dépendance ──────────────────────────────
function chargerEnv() {
  try {
    for (const ligne of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* variables déjà dans l'environnement */ }
}
chargerEnv();

const BUCKET = process.env.B2_BUCKET;
if (!BUCKET) { console.error('✗ B2_BUCKET est introuvable (.env.local).'); process.exit(1); }

const args = process.argv.slice(2);
const lire = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
const AJOUT     = lire('--ajouter');
const APPLIQUER = args.includes('--appliquer');
// Origine dont on recopie les réglages : elle fonctionne déjà, donc ses
// opérations et en-têtes sont exactement ceux dont un envoi a besoin.
const REFERENCE = lire('--reference') || 'https://laloge.house';

/* Deux jeux de clés existent : la clé applicative (restreinte aux
   fichiers) et la clé de configuration. Seule une clé portant
   `writeBuckets` peut modifier les règles — on essaie donc la seconde
   en premier, et on dit laquelle a servi. */
const JEUX = [
  { nom: 'B2_SETUP_*', id: process.env.B2_SETUP_KEY_ID, cle: process.env.B2_SETUP_APP_KEY },
  { nom: 'B2_*',       id: process.env.B2_KEY_ID,       cle: process.env.B2_APP_KEY },
].filter((j) => j.id && j.cle);

async function autoriser(jeu) {
  const r = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: 'Basic ' + Buffer.from(`${jeu.id}:${jeu.cle}`).toString('base64') },
  });
  if (!r.ok) throw new Error(`${jeu.nom} refusée par B2 (${r.status})`);
  return r.json();
}

async function api(auth, chemin, corps) {
  const r = await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v3/${chemin}`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${chemin} → ${r.status} ${j.message || ''}`);
  return j;
}

const montrer = (regles) => {
  if (!regles || !regles.length) { console.log('   (aucune règle CORS)'); return; }
  for (const c of regles) {
    console.log(`   • ${c.corsRuleName}`);
    console.log(`     origines   : ${(c.allowedOrigins || []).join(', ')}`);
    console.log(`     opérations : ${(c.allowedOperations || []).join(', ')}`);
    console.log(`     en-têtes   : ${(c.allowedHeaders || []).join(', ') || '—'}`
      + `  · exposés : ${(c.exposeHeaders || []).join(', ') || '—'}`
      + `  · cache : ${c.maxAgeSeconds ?? '—'} s`);
  }
};

(async () => {
  let auth = null, jeuUtilise = null;
  for (const jeu of JEUX) {
    try { auth = await autoriser(jeu); jeuUtilise = jeu.nom; break; }
    catch (e) { console.log(`· ${e.message}`); }
  }
  if (!auth) { console.error('✗ Aucune clé B2 utilisable.'); process.exit(1); }

  /* En API v3 les capacités vivent sous apiInfo.storageApi — et NON
     sous `allowed` comme en v2. Lues au mauvais endroit, la liste
     revient vide et le script annonce à tort qu'il ne peut pas écrire. */
  const caps = auth.apiInfo?.storageApi?.capabilities || auth.allowed?.capabilities || [];
  console.log(`Clé utilisée : ${jeuUtilise}${caps.includes('writeBuckets') ? ' (peut écrire les buckets ✓)' : ' (SANS writeBuckets ✗)'}`);

  const { buckets } = await api(auth, 'b2_list_buckets', {
    accountId: auth.accountId, bucketName: BUCKET,
  });
  const b = buckets[0];
  if (!b) { console.error(`✗ Bucket « ${BUCKET} » introuvable pour cette clé.`); process.exit(1); }

  console.log(`\nBucket : ${b.bucketName}\nRègles CORS actuelles :`);
  montrer(b.corsRules);

  if (!AJOUT) {
    console.log('\nPour ajouter une origine :');
    console.log(`   node scripts/b2-cors.mjs --ajouter https://app.timelesshouse.org`);
    return;
  }

  const dejaLa = (b.corsRules || []).some((c) => (c.allowedOrigins || []).includes(AJOUT));
  if (dejaLa) { console.log(`\n✓ ${AJOUT} est DÉJÀ autorisée — rien à faire.`); return; }

  const cibles = (b.corsRules || []).filter((c) => (c.allowedOrigins || []).includes(REFERENCE));
  if (!cibles.length) {
    console.error(`\n✗ Aucune règle ne contient l'origine de référence ${REFERENCE}.`);
    console.error('  Relancez avec --reference <une origine listée ci-dessus>.');
    process.exit(1);
  }

  // Copie profonde : on ne touche QUE allowedOrigins.
  const nouvelles = (b.corsRules || []).map((c) =>
    (c.allowedOrigins || []).includes(REFERENCE)
      ? { ...c, allowedOrigins: [...c.allowedOrigins, AJOUT] }
      : c);

  console.log(`\nProjet — ${AJOUT} ajoutée à ${cibles.length} règle(s), tout le reste inchangé :`);
  montrer(nouvelles);

  if (!APPLIQUER) {
    console.log('\n⚠️  Rien n\'a été écrit. Pour appliquer :');
    console.log(`   node scripts/b2-cors.mjs --ajouter ${AJOUT} --appliquer`);
    return;
  }
  if (!caps.includes('writeBuckets')) {
    console.error('\n✗ Cette clé ne peut pas modifier le bucket (capacité writeBuckets absente).');
    console.error('  Créez une clé applicative « master » ou avec writeBuckets sur backblaze.com.');
    process.exit(1);
  }

  await api(auth, 'b2_update_bucket', {
    accountId: auth.accountId, bucketId: b.bucketId, corsRules: nouvelles,
  });
  console.log(`\n✓ Écrit. ${AJOUT} est maintenant autorisée.`);
  console.log('  Vérifiez : node scripts/b2-cors.mjs');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
