# 📊 Analytics réseaux sociaux en temps réel — Roadmap

> **TL;DR :** brancher de vraies analytics Meta + TikTok n'est pas une fonctionnalité de quelques heures, c'est un **mini-projet** à part entière (1 à 3 semaines de dev + délais administratifs Meta). Voici le plan réaliste.

---

## 🎯 Pourquoi c'est plus complexe qu'il n'y paraît

Les API Meta (Instagram, Facebook) et TikTok ne sont **pas comme une API publique classique** :

1. **OAuth obligatoire par client** — chaque client doit explicitement autoriser votre app à lire ses données. Ce n'est pas comme connecter une seule clé API : il faut une page "Connecter mon Instagram" dans l'espace client, qui redirige vers Meta, et stocker les tokens.
2. **App Review Meta** — pour récupérer les insights (engagement, reach, démographie), Meta exige une revue manuelle de votre application (~2 à 4 semaines, screencasts à fournir). Sans cette revue, vous êtes limité à 25 utilisateurs de test.
3. **Tokens qui expirent** — les tokens longs durent 60 jours, il faut un système de rafraîchissement automatique.
4. **Rate limits** — Meta limite à ~200 appels/heure/utilisateur. Un polling temps réel n'est pas possible : on récupère les données toutes les 1-6h max.
5. **TikTok Business API** — moins mature, accès plus restrictif, format de données différent (il faut tout normaliser).

---

## 🗺 Plan en 3 phases

### **Phase A — État actuel** ✅
Données saisies manuellement dans Supabase via l'admin. Pratique pour démarrer, montrer la valeur du portail au client, et capturer ses besoins exacts.

**Avantage :** vous décidez de ce qui s'affiche. **Limite :** vous mettez à jour à la main.

---

### **Phase B — Intégration "no-code" via Make ou n8n** ⏳ *(recommandée comme étape suivante)*

**Coût :** ~10-30 €/mois pour Make (illimité avec n8n self-hosted). **Délai :** 2-3 jours de configuration.

**Idée :** au lieu de coder l'OAuth Meta vous-même, utilisez un outil qui le gère :

1. Le client connecte son compte Instagram à votre scénario Make/n8n (une seule fois).
2. Toutes les 6h, Make appelle l'API Meta → récupère abonnés, posts, engagement.
3. Make écrit dans Supabase (table `analytics` + nouvelle table `social_posts`).
4. Le dashboard client affiche déjà ces données (notre code est prêt).

**Avantages :**
- Pas de code OAuth à écrire.
- Pas d'App Review Meta (Make a déjà la sienne).
- Vous pouvez ajouter TikTok, LinkedIn, YouTube avec les mêmes outils.

**Limites :**
- Si vous avez 50+ clients, le coût Make monte vite.
- Les données ne sont pas vraiment "temps réel" (rafraîchies toutes les 6h max — c'est de toute façon la limite imposée par Meta).

---

### **Phase C — Intégration custom complète** 🚀 *(idéal long terme, 3+ clients récurrents)*

**Coût :** ~0 € (Supabase free tier suffit). **Délai :** 2-3 semaines de dev + 2-4 semaines de validation Meta.

**Architecture :**

```
┌────────────────────────────────────────────────────┐
│  Espace client : bouton "Connecter Instagram"      │
│  → redirige vers Meta OAuth                        │
└────────────────┬───────────────────────────────────┘
                 │ token reçu
                 ▼
┌────────────────────────────────────────────────────┐
│  Edge Function : oauth-callback                    │
│  → stocke le token (chiffré) dans social_accounts  │
└────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Cron Supabase (toutes les 6h)                     │
│  → Edge Function : sync-social-analytics           │
│      ├─ pour chaque client connecté                │
│      ├─ Meta Graph API : insights, posts récents   │
│      ├─ TikTok Business API : video_list, stats    │
│      ├─ analyse post-par-post                      │
│      └─ écrit dans analytics + social_posts        │
└────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Dashboard client : affiche analytics + top posts  │
│  (vue déjà construite, juste les données changent) │
└────────────────────────────────────────────────────┘
```

**Tables Supabase à ajouter :**

```sql
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  platform text,            -- 'instagram', 'facebook', 'tiktok'
  access_token text,        -- chiffré
  refresh_token text,
  expires_at timestamptz,
  account_name text,
  account_id text
);

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  platform text,
  post_id text,
  posted_at timestamptz,
  caption text,
  media_url text,
  thumbnail_url text,
  reach int,
  impressions int,
  likes int,
  comments int,
  saves int,
  shares int,
  engagement_rate numeric,
  ai_analysis jsonb,        -- analyse GPT/Claude (efficacité, suggestions)
  fetched_at timestamptz default now()
);
```

**Analyse post-par-post (efficacité) :**

Pour donner une vraie valeur ajoutée, on appelle Claude/GPT après chaque sync :

```typescript
// Pour chaque nouveau post :
const analysis = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: [{
    role: "user",
    content: `Voici les stats d'un post Instagram :
      Reach: ${post.reach}, Likes: ${post.likes}, Comments: ${post.comments}
      Engagement rate: ${post.engagement_rate}%
      Moyenne du compte: ${avgEngagement}%
      Caption: "${post.caption}"

      En 3 phrases, dis :
      1. Comment ce post a performé vs la moyenne
      2. Pourquoi (hypothèse)
      3. Une suggestion concrète pour le prochain post`
  }]
});
```

Résultat affiché au client : *"Ce post a généré +47% d'engagement vs votre moyenne. Probablement grâce à la question dans la caption qui a stimulé les commentaires. Pour le prochain : ajoutez un sondage en story dans les 30 min après publication."*

---

## ✅ Ma recommandation concrète

**Maintenant** → Restez sur la Phase A (données manuelles). Le portail démontre déjà la valeur, vos clients voient le travail.

**Dans 2-3 mois**, quand vous avez 3-5 clients récurrents et qu'ils demandent les analytics :
→ Faites la **Phase B avec Make**. Coût raisonnable, démarre en quelques jours.

**Dans 6-12 mois**, quand vous voulez industrialiser à 10+ clients :
→ Lancez la **Phase C** (App Review Meta en parallèle pendant que vous codez).

---

## 💰 Estimation des coûts par phase

| Phase | Coût mensuel | Effort dev | Délai |
|---|---|---|---|
| A. Manuel | 0 € | 0h | Immédiat |
| B. Make / n8n | 10-30 € | 2-3 jours | 1 semaine |
| C. Custom + Meta API | 0-25 € (Anthropic API si IA) | 2-3 semaines | 1-2 mois (Meta review) |

---

## 📚 Ressources si vous voulez creuser

- **Meta Graph API** — [developers.facebook.com/docs/instagram-api](https://developers.facebook.com/docs/instagram-api)
- **Meta App Review** — [developers.facebook.com/docs/app-review](https://developers.facebook.com/docs/app-review)
- **TikTok Business API** — [business-api.tiktok.com](https://business-api.tiktok.com/)
- **Make** — [make.com](https://make.com) (templates Instagram → Supabase déjà existants)
- **n8n** — [n8n.io](https://n8n.io) (alternative open-source, self-hosted gratuit)

---

Quand vous serez prêt à passer en Phase B ou C, dites-le moi : je vous écris les scénarios Make ou les Edge Functions complètes. C'est un projet qui mérite ses propres sessions de dev dédiées.
