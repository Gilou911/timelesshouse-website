/* ════════════════════════════════════════════════════════════
   🔐  TIMELESSHOUSE — FICHIER MAÎTRE DES CODES CLIENTS
   ════════════════════════════════════════════════════════════

   📍 RÔLE DE CE FICHIER
   ─────────────────────
   C'est LE SEUL ENDROIT où tu gères les codes d'accès.
   Toutes les pages du site (index.html, mariage.html, immobilier.html…)
   lisent leurs codes ici.

       ▸ index.html      → accepte TOUS les codes (tous univers)
       ▸ mariage.html    → accepte uniquement la section "mariage"
       ▸ immobilier.html → accepte uniquement la section "immobilier"
       ▸ etc.

   La sécurité par univers est garantie : un code mariage saisi
   sur immobilier.html sera refusé. C'est voulu.


   📝 AJOUTER UN CLIENT (univers déjà créé)
   ─────────────────────────────────────────
   Étape 1 → Choisis un CODE secret           ex : "julie-thomas"
   Étape 2 → Crée le fichier HTML privé       ex : "mariage-julie-thomas.html"
   Étape 3 → Ajoute UNE ligne dans la BONNE section ci-dessous :

       mariage: {
           …codes existants…,
           "julie-thomas": "mariage-julie-thomas.html",   ← nouvelle ligne
       },

   ✅ Terminé. Aucune autre édition nulle part.


   ➕ AJOUTER UN NOUVEL UNIVERS (futur : voyage, court-métrage…)
   ──────────────────────────────────────────────────────────────
   Étape 1 → Crée la sous-page (ex: voyage.html) en t'inspirant
             de mariage.html ou immobilier.html
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
     "Julie & Thomas", "JULIE-THOMAS" ou "julie thomas" → "julie-thomas"

   ⚠️  Virgule (,) à la fin de chaque ligne
   ⚠️  Guillemets (") autour du code ET du fichier
   ════════════════════════════════════════════════════════════ */

window.CODES_PAR_UNIVERS = {

    /* ───── 💍 UNIVERS MARIAGE ───── */
    mariage: {
        "precieuse-ronny":  "precieuse-ronny.html",
        "ezla-davy":        "photo-ezla-davy.html",
        "keysia-jason":     "video-keyzia-jason.html",
        // "marie-lucas":   "mariage-marie-lucas.html",   ← exemple désactivé
    },

    /* ───── 🏠 UNIVERS IMMOBILIER ───── */
    immobilier: {
        // "martin-dupont": "immobilier-martin-dupont.html",
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
