# 📡 Analytics sociales réelles — Instagram + TikTok (setup)

> **État (17/07/2026) : tout le code est déployé et testé.** Il ne manque que
> les **2 apps développeur** (Meta + TikTok) que toi seul peux créer avec tes
> comptes, puis leurs 4 identifiants. Ensuite : test avec tes propres comptes.

## Ce qui est déjà en place ✅

- Edge Function **`social-oauth`** : le client clique « Connecter Instagram /
  TikTok » dans son espace → OAuth → tokens stockés **chiffrés** (AES-GCM).
- Edge Function **`sync-social`** : rafraîchit les tokens, récupère profil
  (abonnés…), posts récents + insights → tables `social_accounts`,
  `social_posts`, `social_stat_snapshots`. **Cron toutes les 6 h** déjà planifié.
- Espace client : boutons de connexion (onglet Analytics), affichage des
  stats déjà câblé (il se remplit dès la première sync).
- Sécurité : lecture publique des tokens **révoquée** (la faille a été fermée),
  état OAuth signé, sync réservée au cron + admin.

## 🔑 Étape 1 — App Meta (Instagram) — ~15 min

Prérequis : ton compte Instagram doit être **Professionnel ou Créateur**
(Réglages Instagram → Type de compte). Pas besoin de Page Facebook (on utilise
« Instagram API with Instagram Login »).

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps →
   Create App** → cas d'usage **« Other »** → type **Business**.
2. Dans l'app : **Add Product → Instagram → API setup with Instagram login**.
3. Section **Business login settings** → **OAuth redirect URIs**, ajoute :
   ```
   https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/social-oauth/callback/instagram
   ```
4. Récupère l'**Instagram App ID** et l'**Instagram App Secret** (affichés dans
   la section API setup — ⚠️ ce sont ceux « Instagram », pas ceux de l'app Meta
   parente).
5. Pour tester sans App Review : **App roles → Roles** → ajoute ton compte
   Instagram comme **Instagram Tester**, puis accepte l'invitation dans
   Instagram (Réglages → Site web et apps → Invitations de testeur).

> L'App Review Meta (pour tes vrais clients, au-delà des comptes testeurs)
> se demandera plus tard — le mode développement suffit pour la phase de test.

## 🔑 Étape 2 — App TikTok — ~15 min

1. [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps →
   Connect an app**.
2. Ajoute les produits **Login Kit** et **Display API** (scopes : `user.info.basic`,
   `user.info.profile`, `user.info.stats`, `video.list`).
3. **Redirect URI** :
   ```
   https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/social-oauth/callback/tiktok
   ```
4. Récupère **Client Key** et **Client Secret**.
5. Pour tester avant validation : active le **Sandbox** et ajoute ton compte
   TikTok comme **Target user**.

## 🔑 Étape 3 — Colle les 4 identifiants

Dans `.env.local` (jamais commité) :
```
META_APP_ID=...
META_APP_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```
Puis dis-le moi : je pousse ces secrets sur les Edge Functions et on lance le
test avec tes comptes (connexion depuis un espace client de test → vérif des
stats en base → affichage dans le portail).

## 🧪 Étape 4 — Le test (ensemble)

1. Ouvre l'espace client d'un client de test → onglet **Analytics** →
   **Connecter Instagram** → autorise avec TON compte.
2. Retour automatique sur le portail ; la première sync part toute seule.
3. On vérifie : abonnés + posts remontés, badge « Sync · il y a X min », et
   la sync 6 h qui tourne.

## 📌 Limites connues (v1)

- **Instagram** : reach/saves/shares par post selon ce que Meta expose ;
  démographie d'audience non incluse (droits supplémentaires à demander à
  l'App Review).
- **TikTok** : l'API publique donne profil + stats par vidéo (vues, likes,
  commentaires, partages) — pas le watch time ni les sources de trafic
  (réservés à l'API Business, accès très restrictif).
- Mode développement : seuls les comptes ajoutés comme testeurs peuvent se
  connecter. Pour ouvrir à tes clients → App Review Meta (~2-4 semaines) et
  audit TikTok ; on préparera les 2 dossiers quand le test sera concluant.

## 🔧 Référence technique

- Secrets déjà posés : `SOCIAL_CRYPTO_KEY` (chiffrement), `CRON_SECRET` (cron).
- Cron : `sync-social-6h` (pg_cron, `0 */6 * * *`).
- Sync manuelle (admin connecté) : POST `/functions/v1/sync-social`
  body `{ "client_id": "…" }` (optionnel) — ou attendre le cron.
- Migration : `files/migration-social-sync.sql` (déjà exécutée).
