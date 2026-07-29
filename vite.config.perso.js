import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Configuration Vite — L'ESPACE PERSO (perso.timelesshouse.org)
 * -------------------------------------------------------------
 * L'espace privé de Gil : ses pages personnelles type Notion,
 * partagées sur invitation. RIEN du studio ni du produit La Loge
 * (voir vite.config.studio.js et vite.config.js pour ceux-là).
 *
 * Pourquoi un TROISIÈME build (29/07/2026) : brancher le
 * sous-domaine perso.* sur un projet Pages existant servirait
 * TOUTES ses pages sur perso.* — exactement le bug qui a imposé
 * la séparation du 22/07. Même remède : une page n'existe QUE là
 * où elle est déclarée, la séparation est physique.
 *
 *   npm run build          → le produit La Loge  → dist/
 *   npm run build:studio   → le studio           → dist-studio/
 *   npm run build:perso    → l'espace perso      → dist-perso/
 *
 * L'app vit dans perso/ (root Vite) et non à la racine du dépôt :
 * elle est ainsi servie à la RACINE du sous-domaine, et
 * workers/laloge/test-portier.mjs — qui classe les .html de la
 * racine du dépôt entre les deux autres builds — ne la voit pas.
 * Corollaire : le scan Tailwind est borné à perso/**, donc aucune
 * classe ne doit venir d'un fichier importé hors de perso/.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'perso',
  publicDir: '../public', // partagé : fonts/, _headers, 404.html (anti-repli SPA)
  // Les .env vivent à la racine du DÉPÔT, pas dans perso/ — sans cette
  // ligne, VITE_SUPABASE_URL serait undefined et l'app mourrait muette.
  envDir: '..',

  build: {
    outDir: '../dist-perso',
    // outDir hors du root : sans ce flag EXPLICITE, Vite refuse de
    // vider le dossier entre deux builds et les vieux assets s'empilent.
    emptyOutDir: true,
    target: 'es2022',
  },

  server: { port: 4175 },
})
