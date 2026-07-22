# Échanger le domaine d'envoi Resend → `laloge.house`

**But** : que le client final d'un locataire reçoive
« **VisonMike** <noreply@laloge.house> » au lieu d'une adresse en
`@noreply.timelesshouse.org`. Le nom de l'agence est déjà correct ; c'est le
**domaine** qui trahit la plateforme.

**Choix retenu (22/07/2026)** : un domaine neutre unique pour tous les
locataires — zéro effort de leur côté — obtenu par **échange** de l'unique
emplacement du plan gratuit, plutôt qu'en payant un second domaine (20 €/mois).

**Aucun code à modifier.** La fonction `notify-client` lit le secret
`FROM_EMAIL`.

---

## État constaté le 22/07/2026

| Élément | Valeur |
|---|---|
| Domaine vérifié chez Resend | `noreply.timelesshouse.org` — **Verified**, Irlande (eu-west-1), créé il y a 3 mois |
| DNS de `laloge.house` | Cloudflare (`alberto` / `magnolia`.ns.cloudflare.com) |
| Enregistrements email sur `laloge.house` | **aucun** — domaine vierge, pas de conflit |
| Réception de `service@timelesshouse.org` | Google Workspace (`MX → smtp.google.com`) |

> **`service@timelesshouse.org` n'est pas concernée par cette opération.**
> Cette adresse vit entièrement dans Google Workspace : elle reçoit ton
> courrier et tu écris depuis Gmail avec. Resend ne l'a jamais utilisée —
> l'expéditeur technique est `@noreply.timelesshouse.org`.

---

## ⚠️ Fenêtre d'indisponibilité — à lire avant de commencer

Le plan gratuit n'autorise **qu'un seul domaine**. Impossible donc de
vérifier `laloge.house` avant de supprimer l'ancien : entre la suppression
et la vérification (10 à 30 minutes), **tous les envois échouent**.

Pour la réduire :

- Fais l'opération **juste après le passage du cron quotidien**
  (relances de factures et rappels de tournage), pour ne pas en perdre.
- Ne déclenche aucun email manuel depuis la console pendant l'opération.
- Bonne nouvelle : un envoi raté depuis la console affiche une **alerte
  explicite**, tu ne peux pas le manquer. Seul le cron échouerait en silence.

---

## Étape 1 — Libérer l'emplacement

Resend → **Domains** → `noreply.timelesshouse.org` → menu `…` → **Delete**.

Ses enregistrements DNS peuvent rester en place chez Cloudflare : inoffensifs,
et ils te feront gagner du temps si tu remets ce domaine plus tard.

---

## Étape 2 — Ajouter `laloge.house`

1. **Add Domain** → `laloge.house`
2. Région : **Ireland (eu-west-1)** — la même qu'avant, et cohérente avec
   l'hébergement européen annoncé dans les pages juridiques de La Loge.
3. Resend affiche **3 enregistrements** à poser :
   - un **TXT** de clé DKIM (nom du type `resend._domainkey`)
   - un **MX** sur le sous-domaine `send` (retour des rebonds)
   - un **TXT** SPF sur ce même `send`

> Recopie les valeurs **exactes** affichées par Resend : elles contiennent
> une clé publique propre à ton compte.

---

## Étape 3 — Poser les enregistrements dans Cloudflare

Cloudflare → `laloge.house` → **DNS** → **Add record**, un par enregistrement.

### Les trois pièges

**① Le champ « Name » ne prend pas le domaine complet.**
Cloudflare ajoute le domaine tout seul. Si Resend affiche
`resend._domainkey.laloge.house`, tu tapes **`resend._domainkey`**, rien de
plus. Coller le nom complet crée `resend._domainkey.laloge.house.laloge.house`
— et la vérification échoue sans explication. C'est l'erreur la plus fréquente.

**② Nuage GRIS, jamais orange.** Si un enregistrement propose le proxy,
mets-le sur **DNS only**. Les TXT et MX ne sont pas proxifiables, donc le
piège ne concerne qu'un éventuel CNAME.

**③ Email Routing.** S'il a été activé sur `laloge.house`, il pose ses
propres MX et peut entrer en conflit. Vérifie dans **Email → Email Routing** ;
en principe inactif, le domaine étant vierge.

### Recommandé : DMARC

`laloge.house` n'en a aucun. TXT · Name `_dmarc` · Content :

```
v=DMARC1; p=none; rua=mailto:service@timelesshouse.org
```

`p=none` = observation seule, aucun email rejeté.

---

## Étape 4 — Vérifier

Resend → le domaine → **Verify DNS Records**. Statut attendu : **Verified**.

Contrôle depuis un terminal :

```bash
dig +short TXT resend._domainkey.laloge.house; dig +short MX send.laloge.house; dig +short TXT send.laloge.house
```

Les trois lignes doivent renvoyer quelque chose. Une ligne vide = piège ①.

---

## Étape 5 — Poser le secret Supabase

**Seulement une fois le statut `Verified`.**

```bash
supabase secrets set FROM_EMAIL="La Loge <noreply@laloge.house>" --project-ref vpbxeqjvaeiytxcpilxf
```

Ou : Supabase → **Project Settings** → **Edge Functions** → **Secrets**.

Seule l'adresse entre chevrons compte : le nom affiché est **écrasé par
celui de l'agence** à chaque envoi. Le « La Loge » ne sert que de repli
quand aucune agence n'est rattachée.

---

## Étape 6 — Déployer et tester

```bash
supabase functions deploy notify-client --project-ref vpbxeqjvaeiytxcpilxf
```

Puis, dans la console admin, déclenche l'email de bienvenue sur une fiche
client dont l'adresse est la tienne. Sur le message reçu :

- [ ] expéditeur : **nom de l'agence** + adresse `@laloge.house`
- [ ] **logo de l'agence** en tête (fond blanc, filet coloré)
- [ ] « Répondre » pointe vers l'email de contact de l'agence
- [ ] pas en indésirables — sinon patience : la réputation d'un domaine
      neuf se construit sur quelques jours d'envois réguliers

---

## Revenir en arrière

Il faut refaire le chemin inverse (supprimer `laloge.house`, re-ajouter
`noreply.timelesshouse.org`, reposer ses enregistrements s'ils ont été
retirés, puis remettre le secret). D'où le conseil de l'étape 1 : **ne
supprime pas les anciens enregistrements DNS chez Cloudflare.**

---

## Le jour du premier encaissement

Passe au plan payant et ajoute `noreply.timelesshouse.org` en **second**
domaine : chaque marque retrouve alors son domaine exact, et il suffira de
faire dépendre l'expéditeur de l'agence au moment de l'envoi (`FROM_ADDR`
est calculé en un seul endroit dans `notify-client`).

---

## Verrous posés côté code

- Le repli de `FROM_EMAIL` pointe désormais vers `noreply@laloge.house`.
  L'ancienne valeur (`service@timelesshouse.org`) n'était **pas** un domaine
  vérifié chez Resend : si le secret avait disparu, tous les envois auraient
  échoué.
- Les slugs `send`, `resend`, `noreply`, `notifications`, `bounce`, `dmarc`…
  sont désormais **réservés** à l'inscription : un locataire qui aurait pris
  « send » comme adresse aurait cassé le chemin de retour des rebonds de
  toute la plateforme.
