/* ════════════════════════════════════════════════════════════
   🔐  TIMELESSHOUSE — FICHIER MAÎTRE DES CODES CLIENTS
   ════════════════════════════════════════════════════════════

   📍 RÔLE DE CE FICHIER
   ─────────────────────
   C'est LE SEUL ENDROIT où tu gères les codes d'accès.
   Toutes les pages du site (index.html, mariage.html, immobilier.html,
   communication.html…) lisent leurs codes ici.

       ▸ index.html         → accepte TOUS les codes (tous univers)
       ▸ mariage.html       → accepte uniquement la section "mariage"
       ▸ immobilier.html    → accepte uniquement la section "immobilier"
       ▸ communication.html → accepte uniquement la section "communication"
       ▸ etc.

   La sécurité par univers est garantie : un code mariage saisi
   sur immobilier.html sera refusé. C'est voulu.


   📝 AJOUTER UN CLIENT (univers déjà créé)
   ─────────────────────────────────────────
   Étape 1 → Choisis un CODE secret           ex : "maison-lumiere"
   Étape 2 → Crée le fichier HTML privé       ex : "communication-maison-lumiere.html"
   Étape 3 → Ajoute UNE ligne dans la BONNE section ci-dessous :

       communication: {
           …codes existants…,
           "maison-lumiere": "communication-maison-lumiere.html",   ← nouvelle ligne
       },

   ✅ Terminé. Aucune autre édition nulle part.


   ➕ AJOUTER UN NOUVEL UNIVERS (futur : voyage, court-métrage…)
   ──────────────────────────────────────────────────────────────
   Étape 1 → Crée la sous-page (ex: voyage.html) en t'inspirant
             de mariage.html ou communication.html
   Étape 2 → Dans cette nouvelle page, le JS lit la section via :
                 window.CODES_PAR_UNIVERS.voyage
   Étape 3 → Ajoute la nouvelle clé ici :

       voyage: {
           "premier-client-voyage": "voyage-premier-client.html",
       },

   ✅ Terminé. index.html agrège automatiquement.


   📋 RÈGLES POUR LES CODES
   ─────────────────────────
   ✓ Minuscules (a-z), chiffres (0-9) et tirets (-) uniquement
   ✗ Pas d'accents, pas d'espaces, pas de majuscules
   ▸ Le système nettoie automatiquement la saisie du client.
     "Maison & Lumière", "MAISON-LUMIERE" ou "maison lumiere" → "maison-lumiere"

   ⚠️  Virgule (,) à la fin de chaque ligne
   ⚠️  Guillemets (") autour du code ET du fichier
   ════════════════════════════════════════════════════════════ */

window.CODES_PAR_UNIVERS = {

    /* ───── 💍 UNIVERS MARIAGE ───── */
    mariage: {
        "precieuse-ronny":  "precieuse-ronny.html",
        "ezla-davy":        "photo-ezla-davy.html",
        "keysia-jason":     "video-keyzia-jason.html",
        "pau-ema28032026": "video-Pauline-Emanuel.html",
        // "marie-lucas":   "mariage-marie-lucas.html",   ← exemple désactivé
    },

    /* ───── 🏠 UNIVERS IMMOBILIER ───── */
    immobilier: {
        // "martin-dupont": "immobilier-martin-dupont.html",
    },

    /* ───── 📊 UNIVERS COMMUNICATION & MARKETING ─────
       Chaque client a son tableau de bord (médias, factures,
       analyses réseaux sociaux, calendrier de tournage). */
    communication: {
        "maison-lumiere": "communication-maison-lumiere.html",
        // "atelier-onze":   "communication-atelier-onze.html",
        // "cote-jardin":    "communication-cote-jardin.html",
    },

    /* ───── 🎬 UNIVERS COURT-MÉTRAGE (à venir) ───── */
    // "court-metrage": {
    //     "sophie-arthur": "film-sophie-arthur.html",
    // },

    /* ───── 📸 UNIVERS COMMERCIAL (à venir) ───── */
    // commercial: {
    //     "marque-xyz":    "commercial-xyz.html",
    // },

    /* ───── ✈️  UNIVERS VOYAGE (à venir) ───── */
    // voyage: {
    //     "carnet-bali":   "voyage-bali.html",
    // },

};