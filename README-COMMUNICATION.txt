═══════════════════════════════════════════════════════════════════
📊  TIMELESSHOUSE — UNIVERS COMMUNICATION & MARKETING
     Guide d'installation et de gestion
═══════════════════════════════════════════════════════════════════


🗂️  FICHIERS À AJOUTER À TON SITE (à la racine, à côté de index.html)
─────────────────────────────────────────────────────────────────────

   1. clients-data.js                          (REMPLACE l'ancien)
   2. communication.html                       (NOUVEAU)
   3. communication-app.jsx                    (NOUVEAU — partagé)
   4. communication-maison-lumiere.html        (NOUVEAU — exemple)

   Plus le PATCH dans index.html (voir PATCH-index.txt)


🔄  COMMENT ÇA MARCHE — VUE D'ENSEMBLE
────────────────────────────────────────

   Client clique "Espace client" sur ton site
                    │
                    ▼
       ┌─────────────────────────┐
       │  index.html (accueil)   │  → tape "maison-lumiere"
       │  ou                     │     (n'importe quel univers OK)
       │  communication.html     │  → tape "maison-lumiere"
       │  (sous-page univers)    │     (univers communication only)
       └─────────────────────────┘
                    │
                    ▼  vérifie le code dans clients-data.js
                    ▼
       sessionStorage.access_granted = "maison-lumiere"
                    │
                    ▼  redirige vers
                    ▼
       ┌──────────────────────────────────────────┐
       │  communication-maison-lumiere.html       │
       │  ─────────────────────────────────────   │
       │  ▸ Définit window.CLIENT_DATA = {…}      │
       │  ▸ Charge communication-app.jsx          │
       │  ▸ L'app vérifie sessionStorage          │
       │  ▸ Si OK → affiche le dashboard          │
       │  ▸ Si KO → redirige vers communication   │
       └──────────────────────────────────────────┘


➕  AJOUTER UN NOUVEAU CLIENT — EN 3 ÉTAPES
─────────────────────────────────────────────

   Imaginons un nouveau client "Atelier Onze" :

   ▸ ÉTAPE 1 — Duplique le fichier exemple :
                copie communication-maison-lumiere.html
                en   communication-atelier-onze.html

   ▸ ÉTAPE 2 — Ouvre ce nouveau fichier et modifie le bloc
                window.CLIENT_DATA = {…} :
                  - name:       "Atelier Onze"
                  - greeting:   "Sarah" (prénom du contact)
                  - initials:   "AO"
                  - sector:     "Mode & Lifestyle"
                  - code:       "atelier-onze"  ⚠️ doit matcher l'étape 3
                  - puis remplis media[], invoices[], shoots[],
                    analytics avec les vraies données

   ▸ ÉTAPE 3 — Ouvre clients-data.js et ajoute UNE ligne
                dans la section communication :
                  "atelier-onze": "communication-atelier-onze.html",

   ✅ Terminé. Tu peux donner le code "atelier-onze" à ton client.


🔐  SÉCURITÉ
─────────────

   ▸ Les codes sont en clair dans clients-data.js. C'est suffisant
     pour bloquer 99% des accès non sollicités, mais ce n'est PAS
     une vraie auth bancaire. Pour de la sécurité forte (factures
     sensibles, contrats), passer plus tard à Supabase Auth ou
     Firebase Auth.

   ▸ Si quelqu'un connaît l'URL directe (ex:
     communication-maison-lumiere.html), il sera quand même
     redirigé vers communication.html s'il n'a pas le bon code
     en sessionStorage. ✅

   ▸ La sécurité par univers est garantie : un code mariage
     saisi sur communication.html sera refusé. ✅


🎨  HÉBERGEMENT DES MÉDIAS DU CLIENT
─────────────────────────────────────

   Pour les VIDÉOS et PHOTOS de chaque client, tu as plusieurs
   options. Tu utilises déjà Cloudinary (vu dans index.html),
   continue dans cette voie :

   ▸ Crée un dossier Cloudinary par client (ex: "communication/maison-lumiere/")
   ▸ Upload tes médias dedans
   ▸ Copie les URLs dans le fichier communication-NOM-CLIENT.html
     dans le tableau media[].

   Pour les FACTURES, deux options :
   - Stocke les PDF dans un sous-dossier "factures/" sur ton site
   - Ou utilise le stockage Cloudinary (qui supporte aussi les PDF)


💡  AMÉLIORATIONS POSSIBLES (plus tard)
────────────────────────────────────────

   ▸ Brancher de vraies analytics réseaux sociaux (Meta Graph API,
     TikTok Business API) au lieu des données statiques
   ▸ Ajouter un système de notifications quand tu livres de nouveaux
     médias (email auto via Resend, EmailJS ou Brevo)
   ▸ Permettre au client de télécharger toute une livraison en .zip
   ▸ Ajouter des commentaires / approbation par le client sur chaque
     média (pour la validation avant publication)

═══════════════════════════════════════════════════════════════════
