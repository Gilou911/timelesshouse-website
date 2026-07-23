# Chat bêta — Gil ↔ ses locataires

Un fil de discussion privé entre la plateforme et chaque agence
labellisée « bêta testeur », pour recueillir contraintes et idées sans
quitter la console.

## Mise en service — une seule étape

Le code est déployé, mais **le chat reste invisible tant que la
migration n'est pas appliquée** (c'est voulu : rien ne casse en
attendant).

1. Supabase → **SQL Editor** → **New query**
2. Coller tout le contenu de
   `supabase/migrations/20260722000000_beta_chat.sql`
3. **Run**

La migration est idempotente : la relancer ne casse rien.

Ensuite, dans la console : section **Agences** → sur une agence, le
bouton **« Passer en bêta »** apparaît. Un clic, et le chat s'ouvre
dans SA console.

## Ce que voit chacun

| | Gil | Un locataire bêta | Un locataire non bêta |
|---|---|---|---|
| Bouton flottant | toujours | oui | **aucun** |
| Contenu | la liste de ses testeurs, puis le fil choisi | son fil, uniquement | — |
| Fil d'un autre locataire | — | **jamais** | — |

Le cloisonnement est porté par la base (RLS), pas par l'interface :
même en bricolant les requêtes depuis son navigateur, un locataire ne
peut ni lire le fil d'un autre, ni écrire signé « plateforme », ni
écrire du tout si son label bêta est retiré.

## Choix à connaître

**Retirer le label referme l'accès immédiatement**, mais ne supprime
rien : les messages restent en base et reviendront si le label est
remis.

**Un message ne peut être ni modifié ni supprimé**, par personne — il
n'existe aucune politique `UPDATE`/`DELETE` sur la table. C'est un
choix pour un canal de retours ; si un « supprimer mon message »
devient nécessaire, il faudra une politique dédiée (restreinte à
l'auteur et à une fenêtre de quelques minutes).

**L'état « lu » vit dans le compte, pas en base.** Ça évite d'ouvrir
une politique d'écriture sur les messages, et ça suit d'un appareil à
l'autre. Conséquence : la pastille est personnelle — si tu lis depuis
deux navigateurs, elle s'éteint des deux côtés.

**Rafraîchissement par sondage** : 10 s panneau ouvert, 60 s fermé.
Le temps réel Supabase serait plus élégant ; il demande d'ajouter la
table à la publication `supabase_realtime` et une vérification que je
ne peux pas mener sans accès SQL. À basculer si le rythme des échanges
le justifie.

## Vérifier après application

```sql
-- la table et la colonne existent
select count(*) from public.beta_messages;
select beta_chat from public.agencies limit 1;

-- les 3 politiques sont en place
select policyname from pg_policies where tablename = 'beta_messages';
```

Puis, en vrai : passe une agence en bêta, connecte-toi à sa console,
envoie un message, et vérifie qu'il arrive bien dans ta liste — et
qu'une agence NON bêta ne voit aucun bouton.
