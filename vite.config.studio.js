import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/**
 * Configuration Vite — LE STUDIO TimelessHouse
 * --------------------------------------------
 * Le site de Gil : sa vitrine, ses univers, son Photobooth. RIEN du
 * produit La Loge (voir vite.config.js pour celui-là).
 *
 * Pourquoi deux configurations (22/07/2026) : un seul build servait
 * TOUTES les pages sur TOUS les domaines. Un client de VisonMike
 * pouvait donc afficher les tarifs de La Loge ou le portfolio de
 * TimelessHouse, et chaque nouvelle page créée « pour un seul des
 * deux sites » atterrissait de fait sur les deux. Deux builds, deux
 * projets Cloudflare Pages : une page n'existe QUE là où elle est
 * déclarée — la séparation est physique, plus seulement une règle.
 *
 *   npm run build          → le produit La Loge  → dist/
 *   npm run build:studio   → le studio           → dist-studio/
 *
 * ⚠️ Une page ajoutée ici n'est PAS servie sur les domaines La Loge,
 *    et réciproquement. C'est exactement le but.
 */
export default defineConfig({
  // Pas de React ici : la vitrine est en HTML/CSS/JS classique.
  plugins: [tailwindcss()],
  publicDir: 'public',

  build: {
    outDir: 'dist-studio',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        // — La vitrine —
        main:                   resolve(__dirname, 'index.html'),
        mariage:                resolve(__dirname, 'mariage.html'),
        immobilier:             resolve(__dirname, 'immobilier.html'),
        communication:          resolve(__dirname, 'communication.html'),

        // — Photobooth (app d'événement de TimelessHouse) —
        photobooth:             resolve(__dirname, 'photobooth.html'),
        photoboothInscription:  resolve(__dirname, 'photobooth-inscription.html'),

        // — Prospection (test non abouti, gardé volontairement) —
        portfolio:              resolve(__dirname, 'portfolio.html'),
      },
    },
  },
})
