# Tester toutes les notifications et emails

Guide de recette des **18 envois** de La Loge, du plus simple (cliquer un
bouton) au plus technique (simuler une échéance). Écrit le 22/07/2026,
après la bascule sur `noreply@laloge.house`.

---

## Préparation — 2 minutes

**1. Un client de test qui pointe vers TOI.**
Dans la console, ouvre une fiche client (ou crée-en une) et mets **ton
adresse email** dans son champ Email. Sans email dans la fiche, la
plupart des envois sont refusés — c'est voulu.

**2. Récupérer son identifiant** (nécessaire seulement pour les tests en
ligne de commande). Supabase → **SQL Editor** :

```sql
select id, name, client_email from clients order by created_at desc limit 5;
```

**3. La clé publique**, pour les commandes `curl`. Elle est déjà dans ton
projet — ne la recopie pas à la main :

```bash
cd ~/Desktop/timelesshouse-website && source .env.local && export K="$VITE_SUPABASE_ANON_KEY"
```

> Cette clé est **publique par nature** (elle est dans le JavaScript du
> site). Ce qui protège les envois, ce n'est pas elle, mais l'obligation
> de viser un client réel et les gardes de propriété.

---

## Le mode « à blanc » — teste sans envoyer

`notify-client` accepte `"dry_run": true`. Il construit l'email en
entier — destinataire, sujet, expéditeur, adresse de réponse — puis
**n'envoie rien**. Idéal pour vérifier la marque blanche sans polluer
ta boîte, et **sans consommer le quota anti-bombardement**.

```bash
curl -s -X POST "https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/notify-client" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $K" \
  -d '{"kind":"welcome","client_id":"COLLE-ICI-L-ID","dry_run":true}'
```

Réponse attendue :

```json
{"ok":true,"dry_run":true,"to":"toi@exemple.fr",
 "subject":"…","from":"VisonMike <noreply@laloge.house>",
 "reply_to":"contact@visonmike.fr"}
```

**Les trois choses à vérifier sur cette réponse :**
- `from` → le **nom de l'agence** + `@laloge.house` *(marque blanche OK)*
- `reply_to` → l'email de **l'agence**, pas celui de La Loge
- `to` → bien ton adresse

Retire `"dry_run": true` pour recevoir l'email pour de vrai.

---

## Les 18 envois, et comment les déclencher

### A. Par l'interface — les plus simples (8)

| # | Email | Où cliquer |
|---|---|---|
| 1 | **Bienvenue** (code d'accès) | Fiche client → bouton d'envoi de bienvenue |
| 2 | **Galerie en ligne** ✨ | Onglet Page client → une galerie **partagée** → **« Envoyer au client »** |
| 3 | **Nouveau média** | Onglet Médias → icône cloche sur un média |
| 4 | **Facture disponible** | Onglet Factures → bouton d'envoi sur une facture |
| 5 | **Reçu de paiement** ✨ | Onglet Factures → passer une facture à **« payée »** → la console propose le reçu |
| 6 | **Tournage programmé** | Onglet Tournages → créer un tournage → proposition d'envoi |
| 7 | **Tournage modifié** | Modifier la date d'un tournage existant |
| 8 | **Contenu disponible** | Page événement (plateforme uniquement) |

> ⑤ ne se propose **que** si la facture n'était pas déjà payée — c'est
> volontaire, pour ne jamais envoyer deux reçus.
> ② est masqué si le partage de la galerie est coupé (le lien serait mort).

### B. Depuis l'espace client — vérifie le retour vers toi (3)

Connecte-toi à l'espace client avec le code de ta fiche de test, puis :

| # | Email reçu par l'agence | Action côté client |
|---|---|---|
| 9 | **Nouveau commentaire** | Commenter un média |
| 10 | **Média validé** | Valider un média |
| 11 | **Retouches demandées** | Demander des modifications |

### C. Automatiques — à provoquer (7)

**12. « Votre film est prêt » ✨** — le plus satisfaisant à tester en réel :
téléverse un MP4 dans une galerie, attends la fin de l'encodage
(quelques minutes). L'email part tout seul. Suis l'opération :

```bash
tail -f ~/Desktop/timelesshouse-website/workers/encoder/worker.log
```

Tu dois voir `✉ client prévenu — « votre film est prêt »`.
*Il ne part qu'à la **première** mise à disposition, jamais lors d'un ré-encodage.*

**13-14. Fin d'accès (client + locataire) ✨** — impossible à provoquer
naturellement sans un client vieux de 75 jours exactement. Teste le
contenu directement :

```bash
# ⑬ au client final
curl -s -X POST "https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/notify-client" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $K" \
  -d '{"kind":"access_expiring","client_id":"ID","extra":{"days":15,"dateLabel":"5 octobre 2026"}}'
```

```bash
# ⑭ au locataire
curl -s -X POST "https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/notify-client" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $K" \
  -d '{"kind":"admin_client_expiring","client_id":"ID","extra":{"days":15,"dateLabel":"5 octobre 2026"}}'
```

**15-16. Rappels tournage et facture** — le cron quotidien ne tire qu'à
une date exacte (J-7/J-1 pour un tournage, J-3/J0/J+7/J+14 pour une
facture). Pour un vrai test bout en bout : crée un tournage daté dans
**exactement 7 jours**, ou une facture dont l'échéance est dans
**exactement 3 jours**, puis déclenche le cron à la main :

```bash
curl -s -X POST "https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/scheduled-notifications"
```

La réponse est un journal détaillé (`log`) qui indique, pour chaque
client, ce qui a été envoyé, ignoré ou raté. **Sans date correspondante,
le journal sera vide — c'est le comportement normal, pas une panne.**

**17-18. Alertes stockage 80 % / 100 % ✨** — elles partent quand la
mesure nocturne **franchit** le seuil. Deux façons :

- déclencher la mesure depuis Supabase → **Integrations → Cron** ;
- ou en ligne de commande, si tu connais `CRON_SECRET` :

```bash
curl -s -X POST "https://vpbxeqjvaeiytxcpilxf.supabase.co/functions/v1/measure-storage" -H "x-cron-key: TON_CRON_SECRET"
```

Si tu as oublié ce secret, redéfinis-en un :
`supabase secrets set CRON_SECRET="…" --project-ref vpbxeqjvaeiytxcpilxf`
(pense à le mettre à jour aussi dans la définition du cron).

> ⚠️ L'alerte ne part qu'au **franchissement** : si une agence est déjà
> au-dessus de 80 %, une nouvelle mesure ne renvoie rien. C'est ce qui
> évite un email par nuit. Pour re-tester, il faut repasser sous le seuil
> (ou changer d'offre, ce qui change le quota).

### D. Inscription locataire (2)

Crée une agence de test sur `laloge.app/inscription` avec une adresse à
toi : tu reçois **« Votre loge est ouverte 🎭 »**, et la plateforme (toi)
reçoit la **notification d'inscription**. Pense à supprimer l'agence de
test ensuite.

---

## Les trois habillages — l'email suit l'univers du client

Depuis le 22/07/2026, l'habillage d'un email est choisi automatiquement
selon l'**univers du client** (la marque de l'agence — logo, couleurs,
adresse de réponse — reste identique dans les trois cas) :

| Univers | Habillage | Signes distinctifs à vérifier |
|---|---|---|
| **Mariage & célébrations** | Faire-part éditorial | papier crème, monogramme du couple (É & D), ornement filet + losange, titre centré, bouton bordé à lettres espacées, photo de couverture de l'album en tête |
| **Communication & Marketing** | **Neumorphique** (modèle de Gil — le style de l'app) | marque hors de la boîte (« VisonMike. / ESPACE CLIENT »), grande boîte extrudée à ombres jumelles, code d'accès et montants **en creux**, bouton pilule extrudé |
| **Espace neutre** (et repli) | Classique | en-tête coloré à l'accent de l'agence, boîte blanche |

Les 15 gabarits (bienvenue, galerie, film, factures, tournages, fin
d'accès…) existent dans les trois habillages — **seul l'habit change,
le contenu reste propre à chaque type**. Pour la recette : crée un
client par univers avec ton email, et envoie-lui le même email de
bienvenue — tu dois recevoir trois mises en scène différentes du même
message.

---

## Les pièges

**Le garde-fou anti-bombardement.** Au-delà de **12 emails vers le même
client en 10 minutes**, la fonction refuse et répond
`{"ok":true,"skipped":"rate_limited"}` avec un code 429. En recette
intensive, c'est vite atteint : espace tes tests, utilise `dry_run`
(qui ne compte pas), ou change de client de test.

**Les réponses « skipped » ne sont pas des erreurs.** Elles disent que la
fonction a **volontairement** renoncé :

| Réponse | Signification |
|---|---|
| `gallery_share_disabled` | Le partage de la galerie est coupé |
| `invoice_paid` | La facture a été réglée entre-temps (rappel annulé) |
| `invoice_not_paid` | Reçu demandé sur une facture non payée |
| `strategy_not_published` | Stratégie encore en brouillon |
| `rate_limited` | Trop d'envois récents vers ce client |
| `already_sent` | Ce rappel exact est **déjà parti** (clé anti-doublon) |

**Le cron peut être rejoué sans risque.** Depuis le 22/07/2026, chaque
rappel planifié porte une clé unique (`inv:<id>:j-3`…) vérifiée avant
l'envoi. Relancer `scheduled-notifications` dix fois dans la journée
n'enverra jamais deux fois la même relance.

**Le premier email peut tomber en indésirables.** `laloge.house` est un
domaine d'envoi neuf : sa réputation se construit sur quelques jours.
Le DMARC posé aide. Si ça arrive, marque « non indésirable » et continue.

**Où lire ce qui s'est réellement passé :**
- Resend → **Logs** : chaque envoi, son statut, son contenu
- Supabase → **Edge Functions → notify-client → Logs** : les erreurs serveur
- Table `notifications` : le journal interne (`sent_at` à `null` = échec)

---

## Checklist de recette

Sur chaque email reçu, vérifie ces cinq points :

- [ ] **Expéditeur** : nom de l'agence + `@laloge.house`
- [ ] **Logo de l'agence** en tête (fond blanc + filet à sa couleur) — ou
      le nom sur fond coloré si l'agence n'a pas de logo
- [ ] **Répondre** → email de contact de l'agence, jamais La Loge
- [ ] **Bouton d'action** → mène au bon endroit (galerie, espace, console)
- [ ] **Aucune mention de TimelessHouse** dans un email de locataire

Et pour couvrir l'essentiel en cinq minutes, teste dans cet ordre :
**② galerie en ligne** (le geste le plus fréquent), **⑫ film prêt** (le
seul entièrement automatique), **① bienvenue** (le premier contact),
**⑤ reçu de paiement**, puis **⑬ fin d'accès** en ligne de commande.

---

## Ce qui n'est pas testable ici

- **La planification des crons** n'est pas versionnée dans le dépôt :
  vérifie dans Supabase → Integrations → Cron que `daily-notifications`
  (09:00) et la mesure de stockage (02:30 UTC) existent toujours. Voir
  [CRONS.md](CRONS.md).
- **« Votre client n'a jamais ouvert son espace »** n'existe pas encore :
  la brique SQL 18 est préparée dans `files/migration-saas-b3-agences.sql`,
  en attente d'un accès SQL pour ajouter la colonne `last_seen_at`.
