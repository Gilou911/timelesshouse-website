import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/**
 * Configuration Vite — TimelessHouse
 * ----------------------------------
 * Architecture multi-pages : chaque fichier HTML déclaré ci-dessous
 * devient une page compilée dans /dist avec ses propres bundles JS/CSS
 * automatiquement injectés (et minifiés / hashés).
 *
 * Le compilateur Tailwind v4 natif lit la directive `@import "tailwindcss"`
 * de style.css et scanne automatiquement tous les .html / .jsx du projet
 * pour ne livrer QUE les classes utilisées (purge AOT).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Les fichiers .js classiques (preview-bridge.js, supabase-config.js)
  // sont copiés tels quels depuis /public — voir README pour les déplacer si besoin.
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Cible moderne : on garde l'optional chaining, top-level await, etc.
    target: 'es2022',
    rollupOptions: {
      output: {
        // Isole le SDK Supabase dans son propre chunk. Sans ça, comme il est
        // importé statiquement par l'admin / l'espace client, Rollup le fusionne
        // dans le bundle initial de la vitrine — alors que la home ne l'importe
        // plus qu'en DYNAMIQUE (getSupabase). Chunk dédié = la home le charge à
        // la demande (au login), les autres pages l'ont toujours au chargement.
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
        },
      },
      input: {
        // ┌─ TRANSITION (22/07/2026) ────────────────────────────────┐
        // │ Le studio a sa propre configuration (vite.config.studio) │
        // │ mais timelesshouse.org pointe ENCORE sur ce projet-ci.   │
        // │ Retirer ces six pages avant la bascule ferait tomber la  │
        // │ vitrine en 404. Elles restent donc ici JUSQU'À l'étape 4 │
        // │ de files/DEUX-SITES.md (custom domain sur le nouveau     │
        // │ projet Pages) — puis on supprime ce bloc, et la          │
        // │ séparation est complète.                                 │
        // │ Le portier les empêche déjà d'apparaître sur une loge.   │
        main:                   resolve(__dirname, 'index.html'),
        mariage:                resolve(__dirname, 'mariage.html'),
        immobilier:             resolve(__dirname, 'immobilier.html'),
        communication:          resolve(__dirname, 'communication.html'),
        photobooth:             resolve(__dirname, 'photobooth.html'),
        photoboothInscription:  resolve(__dirname, 'photobooth-inscription.html'),
        portfolio:              resolve(__dirname, 'portfolio.html'),
        // └──────────────────────────────────────────────────────────┘

        // — Espaces clients / agence —
        app:                    resolve(__dirname, 'app.html'),
        offres:                 resolve(__dirname, 'offres.html'),
        inscription:            resolve(__dirname, 'inscription.html'),
        reinitialiser:          resolve(__dirname, 'reinitialiser.html'),
        admin:                  resolve(__dirname, 'communication-admin.html'),
        dashboard:              resolve(__dirname, 'communication-dashboard.html'),

        // — Galerie autonome (code et lien propres, SaaS B.3 brique 13) —
        galerie:                resolve(__dirname, 'galerie.html'),

        // — Pages événement (galerie publique) —
        eventEngagement:        resolve(__dirname, 'event-engagement.html'),
        eventAnniversary:       resolve(__dirname, 'event-anniversary.html'),
        eventVideo:             resolve(__dirname, 'event-video.html'),
        eventPhotos:            resolve(__dirname, 'event-photos.html'),
        eventPhotosCinematic:   resolve(__dirname, 'event-photos-cinematic.html'),
      },
    },
  },

  server: {
    port: 5173,
    open: '/index.html',
  },
})
