# Audit de cohérence de la web app — 07/08/2026

Fouille orchestrée : 8 fouilleurs spécialisés en parallèle, puis contre-épreuve
adversariale (un sceptique chargé de RÉFUTER chaque trouvaille P0/P1, code rouvert
aux trois étages écran/serveur/base). 12 trouvailles ont survécu, 51 P2 relevées.
Aucune correction appliquée : ce document sert à découper les vagues.


---

## P0

### admin-mfa-reset : la 2FA se désarme elle-même — aucune Edge Function ne vérifie le niveau aal
*Fonctions serveur — `supabase/functions/admin-mfa-reset/index.ts`:60*

**Preuve.** admin-mfa-reset:55-63 → `const jeton = (req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,""); … const { data: estProprio } = await sbAppelant.rpc("platform_is_owner"); if (eProprio || estProprio !== true) return json(403, …)`. Or `platform_is_owner()` (files/migration-saas-b3-agences.sql:12-17) est `security definer` et ne teste QUE `am.user_id = auth.uid() and am.role='owner' and a.slug='timelesshouse'` — jamais `aal`. Puis 89-97 : `admin(/admin/users/${utilisateur.id}/factors)` puis DELETE de chaque facteur avec la clé service. `grep -rn "aal|amr|mfa" supabase/functions/` ne renvoie AUCUN résultat : pas une seule des 17 fonctions ne regarde le niveau d'assurance. Le contrat écrit dans files/migration-2fa-rls.sql:12-15 dit pourtant : « un compte AVEC 2FA vérifiée n'accède à RIEN tant que sa session n'est pas de niveau aal2 », et sa menace déclarée (l.8-11) est « quelqu'un qui AURAIT le mot de passe pouvait ignorer l'app et interroger l'API directement avec sa session de niveau 1 ».

**Impact.** Une session obtenue avec le mot de passe SEUL (aal1) est bloquée par la policy restrictive côté PostgREST, mais reste pleinement acceptée par les Edge Functions, qui agissent ensuite avec la clé service (hors RLS). L'attaquant qui détient le mot de passe du fondateur appelle directement admin-mfa-reset (verify_jwt=false, cf. l.21) avec `{ email: <sa propre cible, y compris lui-même> }` : tous les facteurs TOTP sont supprimés, `aal_satisfait()` redevient vrai en aal1, et la base entière s'ouvre. Le verrou 2FA installé le 21/07 est donc contournable par la fonction même qui sert à le retirer — et le même trou vaut pour team-member (promotion en admin), b2-sign, stripe-billing, create-agency, qui n'exigent tous qu'un JWT aal1.

**Piste.** Rejouer la revendication `aal` du JWT dans chaque fonction avant tout usage de la clé service : soit un RPC `aal_satisfait()` appelé avec le jeton de l'appelant (client anon, pas service), soit un décodage de `aal` + lecture des facteurs. Prioritaire sur admin-mfa-reset et team-member.

**Contre-épreuve.** Confirmé aux trois étages : la garde d'admin-mfa-reset:55-63 se réduit à platform_is_owner(), qui est `security definer` (migration-saas-b3-agences.sql:12-17) et donc explicitement hors RLS selon la migration elle-même (migration-2fa-rls.sql:20-22, « les RPC scellées (security definer) […] passent hors RLS ») — elle répond donc `true` à une session aal1 ; `grep -rniE "aal|amr|mfa" supabase/functions/` ne renvoie que des commentaires, et ma sonde prod confirme la fonction déployée sans filtre de passerelle (sans en-tête → 401 « Session requise. » émis par le code lui-même, clé anon → 403). Deux corrections de cadrage sans changer la sévérité : le scénario « la 2FA se désarme elle-même » est conditionnel (le propriétaire plateforme service@timelesshouse.org ne porte pas la 2FA aujourd'hui), mais la partie générale est exploitable maintenant — b2-sign:135-148 et team-member:64-72 résolvent identité ET rôle avec la clé service (hors RLS), si bien qu'une session aal1 du compte qui porte réellement la 2FA signe encore des URLs B2 sur les médias clients et promeut un admin, contredisant le contrat écrit « n'accède à RIEN tant que sa session n'est pas de niveau aal2 » (migration-2fa-rls.sql:13-15).

### Agenda en thème sombre : chips du calendrier au texte invisible (bascule .text-white sans bascule des fonds)
*Thèmes & HIG — `communication-admin.jsx`:2417*

**Preuve.** jsx:2276 `CHIP_TOURNAGE = '… bg-stone-800 text-white …'`, jsx:2417 et 2593 (chips tournage mois/semaine, `bg-stone-800 text-white`), jsx:2423-2424 et 2604-2608 (chips sorties : `text-white` + `style={{ background: RESEAUX[x.reseau]?.c }}`, avec tiktok:'#0f0f10' jsx:2064). Or communication-admin.html:96 pose `[data-theme="dark"] .text-white { color: #1a1410 !important; }` et AUCUNE surcharge `.bg-stone-800` n'existe (html:90-95 ne couvrent que stone-50/100/200/300/900 ; style.css ne contient aucun data-theme). Mesures WCAG : #1a1410 sur #292524 (stone-800) = 1,20:1 ; sur #0f0f10 (TikTok) = 1,05:1 ; sur #c13584 (Instagram) = 3,57:1 — le « 6,5:1 sous texte blanc » du commentaire jsx:2066 suppose du blanc, plus vrai en sombre.

**Impact.** Le thème suit l'appareil sans débrayage possible (useDarkMode jsx:577) : tout locataire en mode sombre voit ses tournages et ses sorties TikTok comme des rectangles muets — l'Agenda est illisible. Contraste 4,5:1 = valeur non négociable P0 du guide maison.

**Piste.** Sortir ces chips de la bascule globale .text-white (classe dédiée) ou ajouter les surcharges manquantes (bg-stone-800 + encre par réseau en sombre).

**Contre-épreuve.** Confirmé et reproduit : html:96 force .text-white à l'encre sombre #1a1410 en thème sombre avec !important, mais aucune surcharge [data-theme="dark"] .bg-stone-800 n'existe (grep vide) et les fonds réseaux sont inline donc intouchables — mesures refaites : 1,20:1 (tournages), 1,05:1 (TikTok), 3,08-3,57:1 (autres réseaux), tout sous le plancher 4,5:1 « non négociable P0 » du guide maison. Ce n'est pas un choix assumé : le commentaire html:115-117 documente justement qu'un fond sous .text-white doit s'éclaircir en sombre (bg-rose-600, bg-stone-900→crème l'appliquent), bg-stone-800 a été oublié, et useDarkMode (jsx:577) suit l'appareil sans bascule possible.

### Cibles tactiles du calendrier sous 44 px (chips ~19 px, pastille du jour 36 px effectifs)
*Thèmes & HIG — `communication-admin.jsx`:2415*

**Preuve.** Chips mois jsx:2415-2426 : `text-[10px] … py-[3px]` ≈ 18-19 px de haut, empilées avec `gap-[3px]` (jsx:2413), sans min-h ni tap-ext ; pastille du numéro de jour jsx:2406-2410 : `w-6 h-6` (24 px) + tap-ext = 36 px effectifs (style.css:5-6 : `.tap-ext::after{inset:-6px}`) ; « +N autres » jsx:2429-2431 : `py-0.5` ≈ 20 px ; vue semaine jsx:2593-2594 : `height: Math.max(30, …)` = 30 px mini. Contre-exemples conformes dans le même fichier : croix du panneau jour `w-11 h-11` (jsx:2465), Btn `min-h-[44px]` (jsx:669), select des cartes d'agence `min-h-[44px]` (jsx:12520) — la règle est appliquée partout sauf sur ces chips. (Au passage : BellBtn jsx:687 `w-10 h-10` = 40 px sans tap-ext, et les boutons d'approbation jsx:9691-9693 `py-1` ≈ 22 px.)

**Impact.** Sur téléphone, taper le bon événement dans une case du mois (jusqu'à 3 chips de 19 px espacées de 3 px) est une loterie ; ≥44 px est un P0 non négociable du guide maison.

**Piste.** min-h + zone tactile étendue sur les chips, ou faire de la case entière la cible qui ouvre le panneau du jour.

**Contre-épreuve.** Toutes les citations sont exactes et non réfutables : chips du mois de 18 px de haut espacées de 3 px sans min-h ni tap-ext (communication-admin.jsx:2413,2417,2423), pastille du jour à 36 px effectifs seulement (jsx:2410 w-6 h-6 + style.css:6 inset:-6px, alors que le commentaire style.css:2-4 promet ≥44-48 px), « +N autres » ~19 px (jsx:2430) et blocs semaine à 30 px (jsx:2594,2606) — le tout accessible sur mobile (vue mois à un tap et persistée en localStorage, jsx:2109-2112) avec un impact réel (une chip sortie voisine à 3 px ouvre une fiche différente via ouvrirPost, jsx:2421) et aucun choix assumé documenté ; le guide maison classe les cibles <44 px en P0 non négociable, et le même fichier prouve la règle appliquée ailleurs (jsx:669, 2465, 12520).


---

## P1

### generate-invoice-pdf : la garde dit « admin » mais accepte n'importe quel compte du projet, pour n'importe quelle facture
*Fonctions serveur — `supabase/functions/generate-invoice-pdf/index.ts`:96*

**Preuve.** l.96-97 : `const { data: { user }, error: authErr } = await userClient.auth.getUser(); if (authErr || !user) return json({ error: "Non autorisé : connectez-vous à l'admin." }, 401);` — c'est TOUT le contrôle. Puis l.107-112, avec la clé service : `.from("invoices").select("*, clients(name, greeting, billing_address, billing_company_number, billing_phone, client_email)").eq("id", invoice_id).single()`, et l.160-163 `.update({ pdf_url, pdf_generated_at }).eq("id", invoice_id)`. Aucun rapprochement entre l'appelant et `clients.agency_id`. Ses sœurs le font toutes : b2-sign:154-191 (`keyAgencyScope`), notify-client:1474-1479 (membre de l'agence DU client), stripe-billing:80-83 (owner).

**Impact.** Tout titulaire d'un compte Supabase du projet passe : un patron de loge inscrit en libre-service via signup-agency (endpoint public), ou même un invité « lecteur » de l'espace perso créé par perso-invite:228-231 — qui n'est membre d'AUCUNE agence. Avec un invoice_id, il fait générer sur B2 (URL publique) le PDF d'une facture d'une autre loge : nom, adresse de facturation, n° d'entreprise, téléphone, email du client final, montant ; et il écrase `invoices.pdf_url` de cette facture, donc ce que le client verra dans son espace. Aucun appelant de cette fonction n'existe plus dans le dépôt (`grep -rn "generate-invoice-pdf"` → 0 hit hors de la fonction) : c'est une porte déployée que plus personne ne surveille.

**Piste.** Soit la supprimer du projet Supabase puisqu'elle n'a plus d'appelant, soit lui donner la garde de ses sœurs : membre de l'agence du client de la facture (jointure `clients.agency_id` ∈ agency_members de l'appelant), plus le refus du rang « membre » que la RLS impose déjà sur invoices (files/migration-privileges.sql:52-62).

**Contre-épreuve.** Confirmé aux trois étages : la l.96-97 de supabase/functions/generate-invoice-pdf/index.ts (`auth.getUser()` puis 401) est l'unique contrôle, la lecture l.107-111 et l'écriture l.160-163 passent par le service role (l.105) qui contourne la RLS, et aucun écran ne garde l'appel (`grep -rni "generate-invoice-pdf"` hors du dossier = 0 hit) ; la fonction est déployée et vivante — ma sonde avec la clé anon en Bearer renvoie exactement `401 {"error":"Non autorisé : connectez-vous à l'admin."}`, donc tout JWT d'utilisateur du projet (compte créé via signup-agency, public, ou invité perso-invite:228-231 membre d'aucune agence) franchit la garde, alors que b2-sign:153-190, notify-client:1474-1479 et stripe-billing:74-83 rapprochent tous l'appelant de l'agency_id. Reste P1 et non P0 : l'exploitation exige un invoice_id UUID non énumérable et aucun parcours produit n'appelle la fonction — le cas réel est le membre révoqué qui conserve les UUID vus du temps de son accès et peut encore extraire les données de facturation du client final et écraser invoices.pdf_url.

### b2-sign : un membre au rang plancher peut signer la SUPPRESSION des livrables clients, que la base lui interdit de toucher
*Fonctions serveur — `supabase/functions/b2-sign/index.ts`:140*

**Preuve.** b2-sign:135-148 `requireAgencyMember` → `.from("agency_members").select("agency_id").eq("user_id", data.user.id); if (!rows || rows.length === 0) return null;` : ni `role`, ni `privileges`. Puis l.386-396 `case "sign-delete": … getSignedUrl(s3, new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key }), { expiresIn: 900 })`, avec pour seul filtre `keyAgencyScope` (périmètre de l'agence, pas du rôle). Cela contredit files/migration-privileges.sql:107-116 : policy restrictive « media: écrire est un privilège (delete) » … `am.role = 'membre' and not ('clients' = any(am.privileges))`, et l.52-62 « les factures ne regardent pas les membres ». L'écran, lui, applique bien le privilège (communication-admin.jsx:3553-3564 : « Le serveur (team-member) et la base (policies restrictives) tiennent la vraie garde »).

**Impact.** Le rang plancher (Messages, Agenda, Mes tâches, Drive, Paramètres) garde la lecture des clients — volontairement ouverte, cf. le commentaire de migration-privileges.sql:64-66 — donc il connaît les `clients.code` et les `media.id` de sa loge. Un appel direct `{action:"sign-delete", key:"weddings/<code>/…"}` ou `media/<uuid>/original/film.mp4` lui rend une URL signée : le film de mariage disparaît de B2 alors que la RLS lui interdit d'écrire la ligne `media`. Même chose pour `sign-put` sur `invoices/<clientId>/…`, un préfixe dont la base dit qu'il ne regarde jamais un membre. La « triple garde écran + serveur + RLS » n'a ici que l'écran, et une RLS qui ne protège que les lignes, pas les octets.

**Piste.** Faire remonter `role` et `privileges` dans `requireAgencyMember`, puis exiger `role != 'membre' || privileges.includes('clients')` pour les préfixes media/weddings/documents, et refuser `invoices/` + `sign-delete` à tout rôle « membre ».

**Contre-épreuve.** CONFIRMÉ (P1 maintenu). J'ai cherché la garde aux trois étages et elle n'existe qu'à l'écran : `supabase/functions/b2-sign/index.ts:140-142` ne lit que `agency_members.select("agency_id")` (ni `role` ni `privileges`), `keyAgencyScope` (l.154-191) ne filtre que le périmètre d'agence, et `case "sign-delete"` (l.386-395) signe un `DeleteObjectCommand` sur n'importe quel préfixe — alors que `files/migration-privileges-2.sql:56-78` et `migration-privileges.sql:108-116` interdisent en base à un `role='membre'` sans privilège `clients` d'écrire/supprimer une ligne `media|documents|shoots|clients`, et que la console, elle, applique bien le bridage (`communication-admin.jsx:13433` et `13562` retirent l'onglet clients). Le membre plancher connaît les chemins car les SELECT restent ouverts à toute l'agence (`migration-saas-b1.sql:173-176` « agency write » FOR ALL sur clients/media + commentaire assumé `migration-privileges.sql:60-62`), donc un POST direct `{action:"sign-delete", key:"weddings/<code>/…"}` lui rend une URL de suppression B2 irréversible du livrable, sans qu'il puisse effacer la ligne. Ce n'est pas un choix documenté : git montre que b2-sign n'a plus bougé depuis af96fa5 (30/07/2026) alors que le modèle de privilèges est arrivé avec e037a9b (01/08/2026) ; le seul appelant légitime de `sign-delete` est `galerie-studio.html:2267` (photothèque photobooth), conforme au commentaire l.30-31 mais nullement contraignant côté serveur. Sonde live : POST sans session sur la fonction déployée renvoie 401 « Session admin requise — reconnecte-toi. » (= b2-sign:351), donc le code déployé est bien celui-ci ; je n'ai pas de jeton de membre plancher pour aller plus loin, mais le chemin de code ne laisse aucune place à une garde intermédiaire. Sévérité P1 et non P0 : l'attaquant doit être un membre déjà invité de l'agence agissant délibérément hors interface, aucune action de lecture (`sign-get` n'existe pas) donc pas de fuite des factures — la nuance « sign-put sur invoices/ » ne permet qu'écrire des octets, pas les lire.

### team-member : l'agence sur laquelle on agit est tirée au sort (limit(1) sans ORDER BY)
*Fonctions serveur — `supabase/functions/team-member/index.ts`:68*

**Preuve.** team-member:68-74 : `.from("agency_members").select("agency_id, role").eq("user_id", who.user.id).in("role", ["owner","admin"]).limit(1); const mien = mienRows?.[0]; … const agencyId = mien.agency_id as string;`. Le front n'envoie jamais d'agency_id (communication-admin.jsx:4979-4983 : `body: JSON.stringify(corps)` avec seulement action/email/role/privileges). Or un compte appartient explicitement à plusieurs loges : create-agency:266-269 (« Compte du patron : réutilisé s'il existe ») et team-member:102-108 (« Compte réutilisé s'il existe — il peut venir d'une autre agence »).

**Impact.** PostgREST sans ORDER BY rend une ligne arbitraire, et l'ordre du heap change après n'importe quel UPDATE de agency_members. Un patron de la loge A qui est aussi admin de la loge B peut, sans rien voir venir, inviter un coéquipier, changer un rôle/des privilèges ou retirer quelqu'un DANS L'AUTRE LOGE que celle affichée par sa console — une écriture inter-locataires silencieuse, avec création de compte à la clé.

**Piste.** Exiger `agency_id` dans le corps (la console le connaît déjà) et vérifier l'appartenance de l'appelant à CETTE agence ; à défaut, refuser explicitement quand la requête rend plus d'une ligne.

**Contre-épreuve.** Confirmé aux trois étages : team-member:68-73 tire l'agence au sort (limit(1) sans order, service role donc sans RLS), le front n'envoie jamais d'agency_id (communication-admin.jsx:4977-4983) et résout lui-même « mon agence » par un autre limit(1) arbitraire (ligne 13181, sans épinglage par le slug de l'hôte), tandis que le multi-loges owner/admin est explicitement supporté (PK composite migration-saas-b1.sql:38, réutilisation de compte dans create-agency et team-member:98). Deux tirages indépendants sur deux tables : un invite/update/remove peut frapper une autre loge que celle affichée — P1 (écriture dans le mauvais locataire par un utilisateur légitime des deux, pas d'escalade vers une loge étrangère, donc pas P0).

### migration-documents.sql se dit « rejouable sans risque » mais recrée une lecture ANONYME de tous les documents clients (contrats/devis)
*RLS & exposition — `files/migration-documents.sql`:31*

**Preuve.** Ligne 6 : « Idempotent : peut être relancé sans risque. ». Lignes 30-31 : create policy "public read documents" on documents for select using (true);. La table (l.14-25) stocke contrats/chartes/devis par client : colonnes client_id, title, category (Contrat|Devis…), file_url. Sonde LIVE avec la clé ANON — GET $VITE_SUPABASE_URL/rest/v1/documents?select=* (Prefer: count=exact, Range 0-0) → HTTP 200, Content-Range .../0 (0 ligne). Même sonde avec la SERVICE key → HTTP 206, Content-Range .../6 (6 lignes). Le front n'accède jamais directement à la table (grep from('documents') dans src = vide) : elle est servie par RPC scellée. Donc la policy using(true) N'EST PAS ce qui tourne en prod — le fichier contredit la prod.

**Impact.** Rejouer cette migration (action présentée comme « sans risque ») recrée la policy anon using(true) et rend TOUS les documents clients — contrats, devis, chartes, file_url — lisibles par n'importe quel visiteur non authentifié, tous tenants confondus (fuite cross-tenant de niveau P0). La prod est actuellement sûre (anon=0), mais l'instruction écrite est fausse et mène droit à la fuite.

**Piste.** Remplacer les lignes 30-31 par la policy scoped réellement en prod (lecture via RPC portail / to authenticated scoped par agence) et retirer la mention « peut être relancé sans risque ».

**Contre-épreuve.** Confirmé sur pièces et par sonde relancée : migration-documents.sql l.6 promet « rejouable sans risque » mais l.29-31 recrée `create policy "public read documents" ... using (true)`, policy que la prod a explicitement supprimée (migration-saas-b2.sql l.209 ; sonde anon → 200/*/0 contre service → 206/0-0/6) ; aucun REVOKE table-level sur anon ni policy restrictive applicable à anon (la 2FA est `to authenticated` seulement), donc rejouer le fichier — ce que le guide DOCUMENTS-ET-NOTIF-FACTURE.md l.30-32 recommande encore — rouvrirait la lecture anonyme cross-tenant de tous les documents clients. P1 car la prod est aujourd'hui saine : c'est une instruction écrite fausse menant à une fuite P0, pas une fuite active.

### La redirection des membres ignore le gating métier : membre sans métier 'communication' = console sans aucune navigation, barre mobile vide (division par zéro CSS)
*Navigation & rôles — `communication-admin.jsx`:13300*

**Preuve.** 13300-13302 : `const permis = new Set(['agenda', 'taches', 'equipe', 'messages', 'drive', 'settings', ...]); if (!permis.has(section)) setSection('agenda');` — aucun test de MES_METIERS. Or les deux menus gatent exactement ces sections par le métier : 13438 (desktop) et 13571 (mobile) `...(MES_METIERS.includes('communication') || FEATURES.allUniverses ? [{ id: 'agenda' ... 'equipe' ... 'messages' ... 'drive' }] : [])`. Pour un membre plancher d'une agence sans 'communication', le tableau mobile `onglets` (13560-13585) est VIDE (pas d'overview ni revenus pour un membre, pas de clients sans privilège, pas de bloc comm) ; la barre 13594 se rend quand même, et 13617 calcule `width: calc((100% - 16px) / ${onglets.length})` → division par 0.

**Impact.** Cas réel : un membre d'une agence dont le métier communication a expiré (`encoreValide` faux, 13213-13216) ou dont la lecture d'agency_universes échoue (catch 13218) est redirigé vers un Agenda qui n'a d'entrée dans AUCUN menu ; sur téléphone il voit une pilule de verre vide en bas d'écran et n'a plus aucun chemin vers Messages, Drive ou Mes tâches — pourtant tous « permis ». Sur desktop, la sidebar n'a plus que le pied (Paramètres/Aide/Déconnexion).

**Piste.** Aligner `permis` sur le même gating que les menus (fallback 'settings' quand le bloc comm n'existe pas), et ne pas rendre la barre mobile quand `onglets.length === 0`.

**Contre-épreuve.** Confirmé : le redirect membre (communication-admin.jsx:13300-13302) autorise agenda/taches/equipe/messages/drive sans tester MES_METIERS, alors que les deux menus (13438 desktop, 13571 mobile) cachent exactement ces sections sans métier 'communication' — pour un membre plancher d'une agence au métier résilié (flux modélisé : status 'cancelling' + valid_until dépassé, 13213-13214, affiché « Résilié » dans MetiersCard:1785) ou sur échec de lecture d'agency_universes (catch 13218), le tableau mobile onglets (13560-13585) est vide et la barre 13594 se rend quand même : pilule vide, aucun chemin vers Messages/Drive/Mes tâches pourtant « permis », sidebar desktop réduite au pied ; aucune garde ailleurs (seul redirect portfolio 13249, pas d'écran métier-expiré) et le commentaire 13294-13297 contredit les menus. Nuance : le calc/0 (13617) est sans effet visible car la pastille a opacity:0 quand actif=-1 (13619) ; P1 et non P0 car Paramètres (13375) et Déconnexion restent atteignables — pas de fuite ni d'enjeu sécurité.

### Verrou de privilège incomplet en base : gallery_photos, event_pages, strategies, analytics, media_comments restent en « agency write for all » (garde d'écran seule)
*Triple garde — `supabase/migrations/00000000000000_baseline_rls.sql`:48*

**Preuve.** baseline_rls.sql:26/44/48/54/70 : `create policy "agency write" on public.analytics|event_pages|gallery_photos|media_comments|strategies … as permissive for all to authenticated using (agency_id IN (SELECT my_agency_ids()))`. Or files/migration-privileges-2.sql:35 et 56 ne scellent que ['clients','galleries'] et ['media','documents','shoots'] (+ posts/post_sorties/tasks), alors que son §2 annonce « écrire sur les espaces clients et TOUT ce qui s'y livre exige le privilège clients ». La console écrit pourtant ces tables derrière la garde d'écran 'clients' : gallery_photos insert (communication-admin.jsx:4303) et delete (8516), event_pages delete (6626) et upsert (8802-8915), analytics update (11922), media_comments insert (9661). S'y ajoute la RPC update_media_approval (files/migration-saas-b2.sql:168-179) : security definer qui ne teste que l'appartenance à l'agence, pas le privilège — elle contourne même le scellé posé sur media.

**Impact.** Un membre au rang plancher (aucun privilège) peut, avec la clé anon + son JWT (PostgREST direct), ajouter/supprimer des photos dans une galerie livrée à un client, supprimer une page événement, réécrire les analyses, effacer des commentaires média et approuver/refuser des médias via la RPC — tout ce que l'écran lui cache. La triple garde (écran+serveur+RLS) se réduit à l'écran seul sur ces tables.

**Piste.** Étendre la boucle du §2 de migration-privileges-2.sql aux tables rattachées par gallery_id/client_id (gallery_photos, event_pages, strategies, analytics, media_comments) et ajouter le test de privilège 'clients' dans update_media_approval(p_media_id, p_status).

**Contre-épreuve.** Confirmé aux trois étages : baseline_rls.sql:26/44/48/54/70 n'a que la policy permissive « agency write » (appartenance agence) sur analytics/event_pages/gallery_photos/media_comments/strategies, aucune policy restrictive de privilège n'existe sur ces cinq tables dans tout le dépôt (migration-privileges-2.sql:35/56 ne scelle que clients/galleries/media/documents/shoots — contredisant son propre §2 « tout ce qui s'y livre exige le privilège clients »), et la console y écrit en PostgREST direct derrière la seule garde d'écran (communication-admin.jsx:4303, 8516, 6626, 8802-8915, 11922, 9661 — lignes vérifiées exactes, menu retiré au plancher en 13433). La RPC update_media_approval est même pire que cité : sa version déployée (20260721000000_security_hardening.sql:37-68) reste security definer, EXECUTE conservé pour authenticated, et ne teste que l'appartenance à l'agence — un membre plancher approuve donc des médias en contournant le scellé « media » du 01/08 ; P1 maintenu (escalade intra-agence authentifiée, pas de fuite cross-tenant).


---

## P2 — relevés, non contre-éprouvés


### Triple garde

- **Factures proposées à un membre : le bouton « Facturer ce tournage » n'a aucune garde de rôle alors que la RLS bloque tout membre** — `communication-admin.jsx`:11662
  - Un membre avec privilège 'clients' voit et remplit un formulaire complet de facture (montant, référence, échéance) puis se fait refuser par la RLS à l'enregistrement — violation de la règle maison « les factures ne regardent JAMAIS un membre » (l'écran ne doit même pas les proposer).
- **Chat privé : un admin peut écrire à un membre, mais le membre ne peut jamais ouvrir ce fil — message invisible et pastille de non-lus fantôme** — `communication-admin.jsx`:3695
  - Cas réel cassé : un admin écrit en privé à un cadreur → le message est enregistré, jamais affichable chez le destinataire, et l'onglet Messages du membre porte un badge de non-lus impossible à effacer.
- **Équipe : un membre voit « Modifier »/« Retirer » sur ses pairs — gerable() oublie le cas du spectateur membre, le serveur refuse toujours** — `communication-admin.jsx`:4974
  - Un membre confirme « Retirer X de l'équipe ? » ou remplit l'édition de privilèges d'un collègue, puis reçoit une erreur 403 — l'écran offre une gestion d'équipe qu'aucun serveur n'acceptera jamais pour ce rôle.
- **Paramètres : la marque et l'abonnement sont servis aux admins alors que le serveur est owner-only — le commentaire du code (« RPC owner/admin ») est faux** — `communication-admin.jsx`:1947
  - Un admin remplit tout le formulaire « Ma marque » (l'upload du logo sur B2 réussit, lui) puis échoue à l'enregistrement ; il voit « S'abonner »/« Gérer mon abonnement »/« Se désabonner » qui échouent toujours en 403. Deux panneaux entiers offerts à un rôle que le serveur refuse.
- **Drive : « Supprimer » offert à tous sur tous les fichiers alors que la policy ne permet que « les siens ou patron »** — `communication-admin.jsx`:4822
  - Un membre plancher confirme un dialogue « Irréversible » sur le rush du patron avant d'apprendre, par l'erreur, que l'action était impossible — l'écran n'applique pas la règle Drive qu'il connaît (garde par message d'erreur au lieu de garde d'affichage).
- **Créer/supprimer un espace client : l'écran le réserve au studio, mais la RLS le permet à tout membre doté du privilège 'clients' (règle d'écran sans verrou)** — `communication-admin.jsx`:5757
  - La règle produit énoncée dans le code (ouvrir/fermer un espace = owner/admin) n'existe qu'à l'écran : un membre avec privilège 'clients' peut créer ou détruire un espace client entier hors interface — incohérence entre la règle affichée et la garde en base.

### Emails

- **notify-lead expédie depuis un domaine supprimé de Resend : les alertes prospects n'arrivent jamais** — `supabase/functions/notify-lead/index.ts`:23
  - Resend refuse tout envoi depuis un domaine non vérifié : chaque formulaire de contact portfolio enregistre le lead en base mais l'alerte à service@timelesshouse.org échoue en silence. Le front (portfolio-public.jsx:206) affiche « Message envoyé » dès que res.ok, sans lire emailSent:false — un prospect croit avoir écrit à Gil, personne n'est prévenu.
- **account-recovery envoie le lien /verify à usage unique brut — le piège des scanners de boîte mail, déjà documenté et corrigé dans perso-invite** — `supabase/functions/account-recovery/index.ts`:144
  - Un patron dont la messagerie pré-visite les liens (Outlook/Microsoft 365, très courant en agence) reçoit des liens de récupération déjà consommés : « Lien expiré » à chaque clic, sans explication. Il martèle « Mot de passe oublié », atteint la limite de 5/heure (auth_recovery_log) et se bloque — exactement le scénario du locataire libéré hier via « Essais mdp à 0 » (commit c71bf95). La contradiction entre deux fonctions du même dépôt sur le même flux est avérée.
- **Repli FROM_EMAIL sur service@timelesshouse.org dans 4 fonctions — l'adresse documentée comme jamais vérifiée chez Resend** — `supabase/functions/account-recovery/index.ts`:27
  - Latent tant que le secret FROM_EMAIL existe, mais notify-client:30-33 rappelle qu'une clé injectée s'est déjà « désynchronisée toute seule ». Si FROM_EMAIL disparaît : Resend refuse l'expéditeur, et account-recovery avale l'erreur (console.error puis 200 ok) — plus aucun email de récupération ne part, sans aucun signal.
- **audit-liens-emails.mjs promet « TOUS les gabarits » mais 5 constructeurs sur 21 échappent à l'audit** — `scripts/audit-liens-emails.mjs`:31
  - La garde pré-déploiement (règle maison : lancer ce script avant tout déploiement) ne couvre pas les gabarits les plus récents (stratégie, sneak peek galerie, digest sorties, tâches équipe). Une URL en dur écrite demain dans l'un d'eux ne serait détectée que par le filet à l'exécution, jamais avant déploiement — précisément ce que l'audit devait empêcher.
- **L'épreuve du filet imprime « un gabarit contient une URL en dur, à corriger à la source » alors qu'aucun gabarit n'est fautif** — `supabase/functions/notify-client/index.ts`:186
  - L'opérateur qui lit la sortie du script (étape obligatoire avant déploiement) croit qu'un gabarit contient une URL en dur à corriger, cherche une faute qui n'existe pas, ou pire : s'habitue à ignorer ce warn — qui est justement le signal à prendre au sérieux s'il apparaît en production.
- **Console plateforme écrite « www.timelesshouse.org/communication-admin » dans scheduled-notifications, « app.timelesshouse.org » partout ailleurs** — `supabase/functions/scheduled-notifications/index.ts`:264
  - Le bouton « Ouvrir ma console » de l'alerte admin_client_expiring dépend, dans ce repli, d'une règle de redirection d'un AUTRE projet Pages : si ces 301 générés par post-build.mjs disparaissent, le lien tombe sur le site vitrine du studio. Repli quasi mort (slug toujours renseigné), mais contradiction réelle entre deux écritures de la même adresse.
- **reply_to absent sur 4 emails (digest sorties, tâche assignée, bienvenue/attente signup, ouverture de loge) — les réponses partent vers noreply@laloge.house** — `supabase/functions/notify-client/index.ts`:1320
  - Un coéquipier qui répond à « Nouvelle tâche — … » ou un studio qui répond à son email de bienvenue écrit à noreply@laloge.house, adresse sans boîte (seul send.laloge.house a un MX, pour les rebonds) : la réponse se perd sans message clair. Incohérent avec le reste du dépôt où chaque envoi porte une adresse de réponse humaine.
- **reinitialiser.html affiche les messages d'erreur GoTrue bruts, en anglais** — `reinitialiser.html`:169
  - Au moment le plus tendu du parcours (le locataire bloqué d'hier passait par cette page), l'erreur la plus probable s'affiche en anglais technique chez un public francophone — rupture de wording sur la page la plus sensible. Le reste de la page est conforme : champs 16 px, page dans PAGES_PARTOUT du portier (worker.js:69), retour Supabase traité (detectSessionInUrl + PASSWORD_RECOVERY + repli « Lien expiré »).
- **account-recovery : marque non déterministe pour un compte rattaché à plusieurs agences** — `supabase/functions/account-recovery/index.ts`:64
  - Un coéquipier membre de deux loges qui demande « Mot de passe oublié » reçoit l'email aux couleurs et au nom d'UNE des deux agences, choisie arbitrairement par la base — potentiellement celle qui n'a rien à voir avec la console d'où il a cliqué. L'email peut ainsi révéler à un destinataire le nom d'une autre agence que celle attendue, et le reply_to (contact_email) part chez le mauvais studio.
- **« Timeless House » en deux mots dans l'identité émetteur des factures PDF** — `supabase/functions/generate-invoice-pdf/index.ts`:38
  - Chaque facture PDF générée porte la marque mal orthographiée dans le bloc émetteur, à un endroit contractuel visible par les clients — contradiction interne à 1 ligne d'écart dans le même objet EMETTEUR.

### Vitrine & portier

- **Tunnel /metiers → /offres?metier=… : la réécriture JS des liens ré-affiche « Créer ma loge » sur mobile et fait déborder « Se connecter » à 320 px** — `offres.html`:506
  - Le parcours NOMINAL (tous les visiteurs venant de /metiers arrivent avec ?metier=…) réintroduit sur mobile exactement l'état que l'audit HIG du 20/07 avait volontairement corrigé (commentaire offres.html:496-502) ; sur petits écrans, le bouton de connexion devient partiellement inatteignable.
- **Le métier choisi est perdu sur les 4 CTA payants « Choisir ce palier » : une agence de com est inscrite en « Mariage & célébrations »** — `offres.html`:1112
  - Une agence Communication & marketing qui convertit sur un palier payant (le cas le plus rentable du tunnel) obtient une loge au métier Mariage & célébrations : mauvais vocabulaire, mauvais écrans, pas d'agenda éditorial — sauf si elle remarque et corrige le select à la main.
- **« Connecte automatiquement et ouvre la console » ne peut jamais aboutir : la session est créée sur laloge.app puis le portier renvoie sur laloge.house** — `inscription.html`:340
  - Chaque inscription self-serve affiche « Loge créée — connexion en cours… » puis atterrit sur l'écran de LOGIN de laloge.house/communication-admin : la promesse d'entrée directe en console est cassée pour 100 % des signups (le parcours ?plan=… atteint Stripe car le fetch checkout reste same-origin, mais le retour console retombe sur le même mur).
- **La vitrine vend « Analyses sociales » et « Toutes les fonctionnalités », mais toute loge self-serve est créée avec features_analytics=false et la console masque l'onglet Analyses** — `offres.html`:832
  - Le prospect (surtout le métier Communication & marketing, dont c'est un argument central) paie ou s'inscrit pour une fonctionnalité que sa loge n'aura pas sans activation manuelle du drapeau par la plateforme — promesse de vente contredite par le code de création du compte.
- **Favicon TimelessHouse sur inscription.html et reinitialiser.html — le correctif documenté dans offres.html n'a pas été propagé** — `inscription.html`:19
  - L'onglet du navigateur affiche la marque TimelessHouse au milieu du tunnel La Loge, et jusque sur la page de réinitialisation d'un locataire — incohérent avec la règle marque-blanche du produit.
- **index.html (vitrine studio) est la seule page sans garde prefers-reduced-motion malgré ses animations** — `index.html`:355
  - Un visiteur ayant demandé la réduction des animations subit quand même fadeUp et la transition de page — violation de la règle maison HIG (§16, classée P0 dans les commentaires des autres pages du dépôt) sur la seule page d'accueil du studio.
- **Vocabulaire du métier : « Communication & marketing » (vitrine) vs « Communication & Marketing » (inscription, console, univers.js)** — `inscription.html`:166
  - Le libellé officiel du métier diffère entre la carte cliquée, le rail des offres et l'option du formulaire d'inscription/console — incohérence de marque dans le tunnel de vente.
- **Pied de page metiers/offres : séparateur « · » manquant entre « Confidentialité » et « Sous-traitance RGPD »** — `metiers.html`:318
  - Les deux liens légaux se lisent comme un seul libellé « Confidentialité Sous-traitance RGPD » dans le pied des deux pages principales de la vitrine.

### Drive & médias

- **Deux fiches Médias créées depuis le même fichier Drive : le 2e encodage purge le HLS de la 1re (lecteur client mort)** — `workers/encoder/worker-encode.mjs`:399
  - Le client de la première fiche garde une carte visible (awaiting_encode déjà levé) mais son master.m3u8 est supprimé de B2 : lecteur cassé en silence, aucun signal admin. Contredit la doctrine affichée en 4184-4186 (« la fiche du client POINTE le fichier du Drive — le client ne perd jamais rien »).
- **« Télécharger » côté client cassé pour tout média pointé depuis le Drive : Content-Disposition jamais posé (original- ≠ original/)** — `supabase/functions/b2-sign/index.ts`:121
  - Pour un média venu du Drive, le bouton « Télécharger » du client ouvre la vidéo dans l'onglet au lieu de l'enregistrer — exactement le bug que la disposition devait éliminer (commentaire b2-sign:112-117). Sur iOS, l'aide « Enregistrer dans Fichiers » est même sautée (communication-app.jsx:1352 : isForceDownloadCDN vrai). Le même média uploadé en direct (media/<id>/original/<nom>) télécharge, lui, correctement : comportement incohérent selon la provenance du fichier.
- **Encodage des fiches Médias : console totalement muette (ni badge ni Réessayer) ; en erreur, le client voit « en préparation » pour toujours** — `communication-admin.jsx`:9496
  - Un encodage média en échec rend la vidéo invisible pour le client à vie, avec une promesse mensongère (« quelques minutes »), sans aucun signal ni action possible côté admin — alors que le Drive a badge + Réessayer (4649-4653, 4786-4791) et les galeries un badge d'état incluant 'Optimisation échouée' et 'En attente du poste' (7379-7382, 7406-7421). L'exigence « pas d'état où l'UI reste muette » est violée précisément sur le chemin Médias.
- **Règle « upload only » violée : champs « coller une URL » offerts aux locataires dans InvoiceForm et DocumentForm** — `communication-admin.jsx`:10719
  - Un locataire peut pointer factures et documents vers n'importe quelle URL externe (lien mort chez le client, octets hors plateforme et hors quota) — violation directe de la règle maison « locataires = upload only, jamais de champ URL », appliquée partout ailleurs dans le même fichier.
- **« Ma marque » (surface locataire) : champ « Logo (URL https, optionnel) » — encore un champ URL hors fondateur** — `communication-admin.jsx`:1661
  - Champ URL offert à un locataire ; gravité moindre que factures/documents (bouton Téléverser à côté, validation https à l'enregistrement), mais la règle maison reste violée sur cette surface.
- **Films d'un espace livraison : le Drive renvoie au concepteur… qui n'a aucun sélecteur Drive — la doctrine « aucune copie d'octets » est inapplicable** — `communication-admin.jsx`:4297
  - Pour livrer un film déjà déposé au Drive, l'admin doit télécharger l'original puis le re-téléverser sous weddings/… : copie d'octets et quota compté deux fois — l'inverse de ce que le message et la doctrine du Drive promettent.
- **InvoiceForm : l'upload direct accepte JPEG/PNG mais le sélecteur Drive filtre ['document'] seulement** — `communication-admin.jsx`:10728
  - Un scan de facture en JPEG uploadable en direct est introuvable depuis le Drive dans le même formulaire : picker incohérent avec son propre accept et avec le formulaire Document voisin.
- **b2-sign sign-delete : garde d'appartenance à l'agence seulement, aucun étage rôle/privilège — la triple garde n'a pas de serveur ici** — `supabase/functions/b2-sign/index.ts`:386
  - Un membre au rang plancher (Messages/Agenda/Mes tâches/Drive/Paramètres, sans privilège 'clients') peut par appel direct faire signer la SUPPRESSION de n'importe quelle clé des livrables clients de son agence : l'écran ne l'offre pas et la RLS protège les lignes, mais pas les octets B2 (photos de galeries, originaux) — perte définitive possible par un compte membre compromis ou malveillant.
- **« Envoyer à un client » (Drive) ignore media_enabled / documents_enabled / invoices_enabled : la fiche envoyée peut devenir ingérable dans la console** — `communication-admin.jsx`:4847
  - L'envoi « réussit » (message vert 4258/4270/4294) vers un module désactivé : l'onglet correspondant étant caché, l'admin ne peut plus voir, modifier ni supprimer la fiche envoyée depuis la console.

### Thèmes & HIG

- **normaliseMarque n'est qu'une garde d'écran : le serveur accepte n'importe quel #rrggbb et les emails consomment la valeur brute** — `supabase/functions/create-agency/index.ts`:254
  - Un owner qui appelle la RPC hors écran (son propre JWT suffit) — ou toute agence dont les couleurs datent d'avant la normalisation du 02/08 — garde un accent brut en base : l'écran « Ma marque » affiche la version corrigée alors que les emails clients partent avec le brut (ex. crème #e8d8be sur #ffff00 ≈ 1,2:1). La règle maison « triple garde écran + serveur + RLS » n'est pas tenue : seule la garde écran normalise.
- **Drive : durée, bouton ▶ et croix de suppression des vignettes invisibles en thème sombre** — `communication-admin.jsx`:4717
  - En sombre, sur les cartes du Drive : durée illisible, pictogramme lecture invisible, croix de suppression invisible (l'utilisateur clique à l'aveugle sur un contrôle destructif) et l'état « Masquée » des photos indétectable.
- **Bouton « Marquer approuvé » à 1,57:1 en sombre : surcharge à moitié (texte basculé, fond non)** — `communication-admin.jsx`:9691
  - Dans la modale Validation & échanges en sombre, le bouton d'approbation est un pavé clair au texte fantôme — l'action principale du workflow de validation devient introuvable.
- **Drive : barre de progression d'upload invisible en sombre (1,18:1)** — `communication-admin.jsx`:4577
  - En sombre, la jauge de téléversement du Drive ne se voit pas ; seul le pourcentage chiffré renseigne.
- **Documents : chips de catégories dans deux mondes en sombre (indigo/fuchsia/sky oubliés, amber traité)** — `communication-admin.jsx`:10760
  - Dans la même liste de documents en sombre, « Devis » devient translucide sombre pendant que « Contrat », « Charte graphique » et « Brief » restent des pavés clairs — incohérence visuelle qui contredit l'audit du 02/08.
- **Commandes d'encodage illisibles en sombre : bg-stone-900 bascule en crème mais text-stone-100 reste blanc (1,28:1)** — `communication-admin.jsx`:10124
  - La commande `npm run encode …` à copier (workflow HLS, écrans plateforme/fondateur) devient invisible en thème sombre.
- **Trois commentaires affirment « sombre = graphite maison, toujours » alors que le code applique NEU_TENANT.sombre** — `communication-admin.jsx`:13045
  - Contradiction interne : un prochain lecteur peut « corriger » dans le mauvais sens (rebrancher NEU_DARK en sombre) en croyant suivre la doc — trois commentaires décrivent un comportement abandonné.
- **Paires de contraste à mesurer : CTA email en encre #e8d8be garanti seulement ~3,2:1, et badge blanc sur amber-500/90 à 2,16:1 en clair** — `supabase/functions/notify-client/index.ts`:293
  - Le bouton principal des emails clients peut passer sous 4,5:1 avec un accent pourtant normalisé (l'invariant contraste est calé sur la mauvaise encre) ; le badge « Aperçu sur la vignette » est déjà sous le plancher en clair.

### Fonctions serveur

- **stripe-billing : même tirage au sort d'agence que team-member, mais sur l'abonnement** — `supabase/functions/stripe-billing/index.ts`:80
  - Un patron propriétaire de deux loges peut voir son passage en caisse, son portail de facturation ou surtout son `univers-cancel` s'appliquer à l'AUTRE loge : un métier payé est résilié (`status='cancelling'`, suppression de la ligne Stripe l.420-424) sur la mauvaise loge, sans rien dans l'interface pour le signaler.
- **measure-storage ne classe pas le préfixe agencies/ que b2-sign facture pourtant au locataire** — `supabase/functions/measure-storage/index.ts`:166
  - Les deux comptabilités se contredisent : à l'upload du logo « Ma marque », les octets sont ajoutés au quota du locataire ; au prochain scan complet (RECON_INTERVAL_DAYS), `storage_used_bytes` est réécrit sans eux et bascule sur TimelessHouse. La jauge du locataire baisse toute seule sans qu'il ait rien supprimé, et le seuil d'alerte 80 %/100 % (l.204-228) peut être retraversé, donc réenvoyé.
- **generate-invoice-pdf : émetteur, adresse et IBAN TimelessHouse en dur dans le PDF de n'importe quelle loge** — `supabase/functions/generate-invoice-pdf/index.ts`:36
  - Le PDF d'une facture d'un locataire porterait l'identité, le SIREN et le RIB personnel de TimelessHouse — la fuite de marque blanche que notify-client a dû colmater avec `filetMarqueBlanche` (notify-client:163-189) et CURRENT_ESPACE/CURRENT_CONSOLE. Et deux loges qui numérotent pareil écrivent au même emplacement B2 : le client de la seconde télécharge la facture de la première.
- **Trois portes internes comparent leur secret avec === alors que notify-client a explicitement corrigé ce point** — `supabase/functions/measure-storage/index.ts`:109
  - Deux façons contradictoires de vérifier exactement la même chose (un secret partagé porté par un en-tête) dans quatre fonctions sœurs. Celui qui a écrit memeJeton a jugé la comparaison naïve inacceptable ; trois fonctions, dont celle qui déclenche la tournée d'emails de toutes les loges, l'utilisent encore.
- **social-oauth : un seul PORTAL de retour, en dur sur timelesshouse.org, pour toutes les loges** — `supabase/functions/social-oauth/index.ts`:39
  - Le client final d'un locataire qui connecte son Instagram est renvoyé, après OAuth, sur le domaine de TimelessHouse (ou sur celui d'une autre loge si SOCIAL_RETURN_URL est posé) — exactement la fuite que notify-client a dû traiter par un filet (l.154-189, « 13 boutons renvoyaient les clients d'un locataire chez TimelessHouse ») et par CURRENT_ESPACE/CURRENT_CONSOLE. La règle maison « jamais d'URL en dur » n'est ici pas appliquée. Latent tant que META_APP_ID/TIKTOK_CLIENT_KEY ne sont pas posés (l.74, l.79 renvoient 500).
- **config.toml et les en-têtes des fonctions se contredisent sur verify_jwt** — `supabase/config.toml`:1
  - Le contrat de déploiement vit à deux endroits qui ne disent pas la même chose. Un `supabase functions deploy` qui s'appuie sur config.toml remet verify_jwt à true sur admin-mfa-reset et team-member : la console du fondateur et l'onglet Équipe cassent (401 de la passerelle) sans que rien dans le code n'ait changé — et le diagnostic est invisible depuis le dépôt.

### RLS & exposition

- **migration-social-sync.sql (« Idempotente ») pose une policy anon using(true) sur social_stat_snapshots** — `files/migration-social-sync.sql`:30
  - Migration rejouable qui ouvre la lecture anonyme des snapshots de statistiques sociales dès qu'il existe des lignes ; potentiel de fuite cross-tenant des perfs sociales des agences. Latent car table actuellement vide.
- **migration-v2.sql laisse des policies publiques (media_comments) et un grant anon de update_media_approval sans contrôle de propriété — obsolète mais toujours dans files/** — `files/migration-v2.sql`:35
  - Si migration-v2.sql est rejouée, elle rouvre la lecture ET l'insertion anonyme de media_comments et redonne à l'anon la RPC update_media_approval, qui — contrairement à toutes les autres RPC anon scellées par code galerie — permet de basculer approval_status de N'IMPORTE quel média rien qu'avec son UUID, sans jeton ni contrôle de propriété. Prod actuellement sûre.

### Navigation & rôles

- **Trois définitions contradictoires du rang plancher dans le même fichier, et Équipe servie au plancher alors que le plancher promis ne la comprend pas** — `communication-admin.jsx`:13428
  - Le fichier se contredit sur le périmètre exact du rang plancher (avec ou sans Drive ? avec ou sans Mes tâches ? Équipe légitime ou pas ?) : toute évolution des rôles se fera sur une carte fausse, et la garde écran/serveur/RLS ne peut pas être vérifiée contre une définition stable.
- **Barre mobile : un locataire communication avec le flag portfolio passe à 8 onglets, cible ~41 px — sous le plancher HIG de 44 px que le commentaire d'à côté déclare garanti** — `communication-admin.jsx`:13583
  - Dès qu'une agence locataire du métier communication reçoit `features_portfolio` en base, sa barre mobile viole la règle maison non négociable (cibles tactiles ≥ 44 px) que le code affirme, deux lignes plus haut, avoir vérifiée au calcul.


---

## Vague 1 — appliquée le 07/08/2026 (commit « Vague 1 de l'audit »)

Corrigé et déployé : le verrou 2FA dans 8 Edge Functions (juge partagé
`_shared/aal.ts` adossé à `public.aal_satisfait()`), la garde d'agence de
`generate-invoice-pdf`, la garde de rang de `b2-sign` (et de sa jumelle
oubliée `cloudinary-sign`), l'agence nommée dans `team-member` et
`stripe-billing` (côté serveur ET console), les encres de l'Agenda en
thème sombre, les cibles tactiles du calendrier (case entière au doigt,
tri par POINTEUR et non par largeur), et la traduction des refus qui les
changeait en « Quelque chose n'a pas fonctionné ».

Une contre-épreuve adversariale (6 angles hostiles, 16 agents) a tourné
sur ce correctif AVANT le commit. Elle a rattrapé un `corsHeaders`
inexistant qui aurait tué l'onglet Équipe en production, et sept
finitions désormais intégrées. Ce qu'elle laisse ouvert :

### Reporté en vague 2 (demande du SQL)

- **`equipe_agence()` mélange les loges d'un même compte** (`files/migration-privileges.sql:29-40` :
  `where am.agency_id in (select my_agency_ids())`, sans paramètre d'agence).
  Sans conséquence aujourd'hui — aucun compte ne dirige plusieurs loges —
  mais dès que ce sera le cas, la liste d'équipe montrera les deux loges
  alors que l'action est désormais épinglée à une seule : le serveur
  refusera proprement, ce qui vaut mieux que l'écriture croisée
  silencieuse d'avant, mais la RPC doit prendre un `p_agence`.
- Les cinq tables encore en « agency write for all » (voir P1 plus haut).
- `create-agency:301` : `.catch()` sur un builder PostgREST, qui n'en a
  pas — le rollback lèverait une seconde erreur (chemin d'échec seulement).

### Limites assumées, à dire plutôt qu'à masquer

- **Vue semaine de l'Agenda** : les blocs passent de 30 à 36 px, toujours
  sous 44. Les rendre conformes les ferait se chevaucher ; la vue par
  défaut sur téléphone reste le planning, dont les lignes font 48 px.
- **Mode de panne du juge 2FA** : une panne (base injoignable) laisse
  passer en journalisant. C'est délibéré — la policy restrictive tient
  déjà la porte de la base, et refuser sur un hoquet réseau enfermerait
  une agence entière dehors.
- Trois fonctions restent sans juge `aal` : `measure-storage`,
  `sync-social`, `scheduled-notifications` — elles tournent sur jeton
  interne ou cron, pas sur session humaine.
