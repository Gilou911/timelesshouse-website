# Basculer les emails sur un domaine neutre (`laloge.house`)

**But** : que le client final d'un locataire reçoive
« **VisonMike** <notifications@laloge.house> » au lieu de
« **VisonMike** <service@timelesshouse.org> ». Le nom de l'agence est déjà
correct ; c'est le **domaine** qui trahit la plateforme.

**Choix retenu (22/07/2026)** : un domaine neutre unique pour tous les
locataires, plutôt que de demander à chacun de vérifier le sien — zéro
effort de leur côté, au prix d'un domaine qui n'est pas le leur.

**Aucun code à modifier.** La fonction `notify-client` lit déjà le secret
`FROM_EMAIL`. Tout se joue dans Resend, Cloudflare et les secrets Supabase.

---

## Avant de commencer — état constaté le 22/07/2026

| Vérification | Résultat |
|---|---|
| DNS de `laloge.house` | Cloudflare (`alberto` / `magnolia`.ns.cloudflare.com) |
| MX / SPF / DKIM sur `laloge.house` | **aucun** — domaine vierge, pas de conflit à craindre |
| MX de `timelesshouse.org` | `smtp.google.com` (réception Google Workspace) |

⚠️ **À vérifier au passage** : aucun enregistrement Resend n'est visible sur
`timelesshouse.org` (ni `resend._domainkey`, ni sous-domaine `send`), alors
que c'est l'expéditeur actuel en production. Soit la vérification y est
faite autrement, soit les envois partent d'un domaine de repli Resend.
Un coup d'œil au tableau de bord Resend le dira — c'est utile à savoir
**avant** de bouger quoi que ce soit.

---

## Étape 1 — Déclarer le domaine dans Resend

1. [resend.com](https://resend.com) → **Domains** → **Add Domain**
2. Domaine : `laloge.house`
3. Région : choisir **EU (Ireland)** — cohérent avec l'hébergement européen
   annoncé dans la politique de confidentialité et le contrat de
   sous-traitance de La Loge.
4. Resend affiche alors **3 enregistrements DNS** à poser :
   - un **TXT** de clé DKIM, sur un nom du type `resend._domainkey`
   - un **MX** sur le sous-domaine `send` (chemin de retour des rebonds)
   - un **TXT** SPF sur ce même sous-domaine `send`

> **Recopie les valeurs exactes affichées par Resend.** Elles contiennent
> une clé publique et une région propres à ton compte : ne les invente
> pas, ne reprends pas celles d'un tutoriel.

---

## Étape 2 — Poser les enregistrements dans Cloudflare

Cloudflare → domaine `laloge.house` → **DNS** → **Add record**, une fois
par enregistrement donné par Resend.

### Les trois pièges Cloudflare

**① Le champ « Name » ne prend pas le domaine complet.**
Cloudflare ajoute le domaine tout seul. Si Resend affiche
`resend._domainkey.laloge.house`, tu tapes **`resend._domainkey`**, rien de
plus. Coller le nom complet crée
`resend._domainkey.laloge.house.laloge.house` — et la vérification échoue
sans explication. C'est l'erreur la plus fréquente.

**② Nuage GRIS, jamais orange.**
Si un enregistrement propose le commutateur de proxy, mets-le sur **DNS
only** (nuage gris). Un enregistrement email proxifié par Cloudflare ne
fonctionne pas. Les TXT et MX ne sont pas proxifiables, donc le piège ne
concerne qu'un éventuel CNAME.

**③ Email Routing de Cloudflare.**
Si tu l'as activé un jour sur `laloge.house`, il pose ses propres MX et
peut entrer en conflit. Vérifie dans **Email** → **Email Routing** ; en
principe c'est inactif ici, le domaine étant vierge.

### Recommandé au passage : DMARC

`laloge.house` n'a aucun DMARC. En poser un améliore la délivrabilité :

- **Type** : TXT
- **Name** : `_dmarc`
- **Content** : `v=DMARC1; p=none; rua=mailto:service@timelesshouse.org`

`p=none` = mode observation, aucun email n'est rejeté. On pourra durcir
plus tard une fois les rapports lus.

---

## Étape 3 — Faire vérifier par Resend

Retour dans Resend → le domaine → **Verify DNS Records**.

La propagation Cloudflare est quasi immédiate (moins d'une minute en
général), mais Resend peut mettre quelques minutes à valider. Le statut
doit passer à **Verified** sur les trois enregistrements.

Contrôle en ligne de commande, si tu veux voir par toi-même :

```bash
dig +short TXT resend._domainkey.laloge.house; dig +short MX send.laloge.house; dig +short TXT send.laloge.house
```

Les trois doivent renvoyer quelque chose. Tant qu'une ligne est vide,
l'enregistrement correspondant n'est pas (bien) posé — revois le piège ①.

---

## Étape 4 — Poser le secret Supabase

**Ne fais cette étape qu'une fois le domaine `Verified`.** Un domaine non
vérifié fait échouer **tous** les envois, pas seulement les nouveaux.

En ligne de commande :

```bash
supabase secrets set FROM_EMAIL="La Loge <notifications@laloge.house>" --project-ref vpbxeqjvaeiytxcpilxf
```

Ou par l'interface : Supabase → **Project Settings** → **Edge Functions** →
**Secrets** → `FROM_EMAIL`.

Seule la partie entre chevrons compte techniquement : le nom affiché est
**écrasé par celui de l'agence** à chaque envoi (`VisonMike <…>`). Le
« La Loge » du secret ne sert que de repli quand aucune agence n'est
rattachée.

---

## Étape 5 — Redéployer et tester

```bash
supabase functions deploy notify-client --project-ref vpbxeqjvaeiytxcpilxf
```

Puis un test réel : dans la console admin, ouvre une fiche client dont
l'email est le tien, et déclenche l'email de bienvenue. Vérifie sur le
message reçu :

- [ ] l'expéditeur affiche **le nom de l'agence** et l'adresse `@laloge.house`
- [ ] le **logo de l'agence** apparaît en tête (fond blanc, filet coloré)
- [ ] **Répondre** pointe vers l'email de contact de l'agence, pas vers La Loge
- [ ] le message n'est pas en indésirables (sinon : DMARC, puis patience —
      la réputation d'un domaine neuf se construit sur quelques jours)

---

## Revenir en arrière

Si quoi que ce soit cloche, supprime le secret : le code repart sur son
repli `TimelessHouse <service@timelesshouse.org>` sans redéploiement de
code.

```bash
supabase secrets unset FROM_EMAIL --project-ref vpbxeqjvaeiytxcpilxf
```

---

## Et si un locataire veut SON propre domaine ?

Rien n'est fermé. Il faudrait alors stocker un domaine vérifié par agence
et choisir l'expéditeur au moment de l'envoi — le code est déjà organisé
pour ça (`FROM_ADDR` est calculé en un seul endroit). Mais cela suppose
que le locataire pose des enregistrements DNS de son côté : c'est
exactement l'effort que ce choix de domaine neutre vise à lui éviter.
