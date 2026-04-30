# 📧 Activer les notifications par email (Resend)

Quand vous livrez un nouveau média, l'admin a un bouton 🔔 qui envoie automatiquement un email au client. Voici comment activer ce système.

**Temps total : ~10 minutes.** Resend est gratuit jusqu'à 3 000 emails/mois — largement suffisant.

---

## 1. Créer un compte Resend

1. Allez sur **[resend.com](https://resend.com)** → **Sign up** (gratuit, pas de carte requise).
2. Vérifiez votre email.

## 2. Récupérer une clé API

1. Dashboard Resend → menu **API Keys** → **Create API Key**.
2. Nom : `TimelessHouse — notifications client`. Permission : **Full access**. Domain : **All domains**.
3. **Copiez la clé** (commence par `re_…`) → vous ne pourrez plus la voir après.

## 3. (Optionnel mais recommandé) Vérifier votre domaine `timelesshouse.org`

Sans cette étape, les emails partiront depuis `onboarding@resend.dev` (fonctionnel mais pas pro).

1. Resend → **Domains** → **Add Domain** → `timelesshouse.org`.
2. Resend affiche 3 enregistrements DNS (1 MX, 2 TXT). Ajoutez-les dans votre registrar (OVH, Gandi, Cloudflare…).
3. Cliquez **Verify DNS Records** → attendez quelques minutes.
4. Une fois vérifié, vous pourrez envoyer depuis `noreply@timelesshouse.org`.

## 4. Installer Supabase CLI

Sur votre Mac (terminal) :

```bash
brew install supabase/tap/supabase
```

(ou `npm install -g supabase` si vous préférez npm)

Puis connectez-vous :

```bash
supabase login
```

## 5. Lier le projet local à votre projet Supabase

Dans le dossier de votre site :

```bash
cd /chemin/vers/timelesshouse
supabase link --project-ref VOTRE_PROJECT_REF
```

> Le `project-ref` se trouve dans l'URL de votre dashboard Supabase : `https://supabase.com/dashboard/project/<PROJECT_REF>`

## 6. Configurer les secrets

```bash
supabase secrets set RESEND_API_KEY=re_votre_cle_resend
supabase secrets set FROM_EMAIL="TimelessHouse <noreply@timelesshouse.org>"
supabase secrets set PORTAL_URL="https://timelesshouse.org/clients/communication.html"
```

> Si vous n'avez pas vérifié votre domaine (étape 3), utilisez `FROM_EMAIL="TimelessHouse <onboarding@resend.dev>"`.

## 7. Déployer la fonction

Le fichier `supabase/functions/notify-client/index.ts` est déjà fourni. Depuis la racine du projet :

```bash
supabase functions deploy notify-client --no-verify-jwt
```

> `--no-verify-jwt` est important : ça permet à l'admin (déjà authentifié côté Supabase) d'appeler la fonction sans réauthentification supplémentaire.

## 8. Tester

1. Ouvrez l'admin (`/clients/communication-admin.html`).
2. Modifiez un client → ajoutez un email valide dans le champ **Email du client**.
3. Allez dans l'onglet **Médias** de ce client.
4. Cliquez sur l'icône 🔔 à côté d'un média.
5. ✅ L'email arrive dans la boîte du client en 5-10 secondes.

---

## 🐛 Dépannage

| Problème | Cause | Solution |
|---|---|---|
| `Function not found` (404) | Pas déployée | Refaire l'étape 7 |
| `RESEND_API_KEY is not defined` | Secret manquant | Refaire l'étape 6 |
| Email non reçu | Spam, ou domaine non vérifié | Vérifier les spams, puis l'étape 3 |
| `403 Forbidden` | RLS bloque la lecture client | La fonction utilise `SUPABASE_SERVICE_ROLE_KEY` (auto), donc ne devrait pas arriver. Sinon : redéployer. |

**Logs de la fonction :** dashboard Supabase → **Edge Functions** → `notify-client` → **Logs**.

---

## 🚀 Aller plus loin

Une fois ce premier flux en place, vous pouvez réutiliser la même fonction pour :

- ✉️ **Notification quand le client demande des changements** : déclenchement automatique via un *trigger* SQL côté Supabase (à brancher plus tard).
- ✉️ **Récap hebdomadaire** : un cron Supabase qui appelle la fonction tous les lundis avec la liste des nouveaux médias.
- ✉️ **Rappel de tournage J-2** : cron qui parcourt la table `shoots`.

Demandez-moi quand vous voulez activer un de ces flux supplémentaires — c'est ~30 lignes de code par flux.
