window.__ADMIN_BUILD = "2026-07-21T18"; // marqueur anti-cache CDN corrompu (voir commit)
/* ════════════════════════════════════════════════════════════
   ⚙️  COMMUNICATION-ADMIN.JSX — Console d'administration
   ════════════════════════════════════════════════════════════
   Extrait depuis communication-admin.html lors de la migration
   vers une compilation industrielle Vite + Tailwind v4.
   Importé en tant que module statique depuis le HTML via :
     <script type="module" src="./communication-admin.jsx"></script>
   ════════════════════════════════════════════════════════════ */

    import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
    import ReactDOM from 'react-dom/client';
    import { createClient } from '@supabase/supabase-js';
    import {
      Home, Users, BarChart3, Settings, LogOut, Plus, Search, Edit3, Trash2,
      X, Check, ArrowLeft, Image as ImageIcon, FileText, Calendar as CalendarIcon,
      Save, Eye, EyeOff, AlertCircle, ChevronRight, Lock, Mail, ArrowUpRight,
      Filter, Video, Camera, Clock, MapPin, TrendingUp, Sparkles, ExternalLink,
      Loader2, MessageSquare, Bell, Send, CheckCircle2, RefreshCw, Link2,
      FolderOpen, Download, Upload,
      Maximize2, Monitor, Smartphone, ChevronDown, ChevronUp,
      Lightbulb, Copy, Power, Building2, HelpCircle, Heart, ShieldCheck,
      UserPlus, UsersRound, List, LayoutGrid, ZoomIn, ZoomOut, ClipboardList
    } from 'lucide-react';
    import AdminPortfolio from './admin-portfolio.jsx';
    import {
      universeOptions, universeLabel, isCelebration, allowsAnalytics, hasDeliveryTab,
      videoPageFor, GALLERY_TEMPLATES, GALLERY_KINDS, templateLabel, kindLabel,
      METIERS, metierOf, isDelivery, metiersDisponibles,
    } from './univers.js';
    import { creerPipelinePhotos } from './galerie-upload.js';

    // — Config Supabase injectée par Vite depuis .env (variables VITE_*)
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Jeton de l'admin connecté, envoyé à notify-client (durcie le
    // 24/07/2026 : elle vérifie désormais que l'appelant est bien membre
    // de l'agence du client). Repli sur la clé anon avant chargement de
    // session ; tenu à jour à chaque changement d'auth. Les envois ne
    // partent que sur action, bien après la connexion → le JWT est prêt.
    let ADMIN_TOKEN = SUPABASE_ANON_KEY;
    sb.auth.getSession().then(({ data }) => { if (data.session?.access_token) ADMIN_TOKEN = data.session.access_token; });
    sb.auth.onAuthStateChange((_e, s) => { ADMIN_TOKEN = s?.access_token || SUPABASE_ANON_KEY; });

    /* 🔐 Fonctionnalités de l'agence connectée (SaaS B.3, brique 7).
       Renseigné par App dès le chargement de l'agence ; faux par
       défaut → un locataire ne voit ni les analyses sociales (apps
       Meta/TikTok au nom de TimelessHouse) ni le portfolio (outil de
       prospection propre à TimelessHouse). Activables par agence en
       base, sans toucher au code.
       `allUniverses` (brique 14) : la liste COMPLÈTE des univers hérités
       est réservée à la plateforme — un locataire n'en voit que 3. */
    const FEATURES = { analytics: false, portfolio: false, allUniverses: false };

    /* 🏷️ Identité de l'agence connectée — renseignée par loadFeatures en
       même temps que FEATURES. Sert à fabriquer les liens de partage des
       galeries (<slug>.laloge.house, ou timelesshouse.org pour la
       plateforme) depuis n'importe quel composant, sans faire descendre
       l'agence par les props sur toute la profondeur de l'arbre. */
    const AGENCY = { id: null, slug: null, name: null, plan: null, maxClients: null, betaChat: false };

    /* 👤 Mon rôle dans l'agence (owner / admin / membre) — rempli par
       loadFeatures via equipe_agence(). `null` = inconnu (avant
       chargement, ou migration non lancée) : on ne bride alors RIEN,
       comme pour MES_METIERS. Sert à masquer ce qui ne regarde pas un
       « membre » (les Revenus) — la vraie garde reste côté serveur. */
    const MON_ROLE = { value: null };
    /* Les privilèges du connecté quand il est « membre » (owner/admin
       ont tout). Vide = rang plancher : chat, agenda, ses tâches.
       Rempli par loadFeatures avec MON_ROLE — même prudence : inconnu
       ne bride rien de PLUS que le rôle seul. */
    const MES_PRIVILEGES = [];

    /* 💼 MÉTIERS de l'agence connectée (25/07/2026).
       Une loge se vend par métier : l'agence ne peut créer des espaces
       QUE dans les métiers qu'elle a pris. Rempli par loadFeatures depuis
       `agency_universes` ; un métier résilié reste utilisable jusqu'à son
       échéance (valid_until) — la règle vit dans la requête ci-dessous.
       Tableau VIDE = on ne bride rien (agence d'avant la migration) : on
       ne casse jamais une console existante sur une donnée manquante. */
    const MES_METIERS = [];
    // Les mêmes, en détail (source / statut / échéance) — pour l'écran Paramètres.
    const MES_METIERS_DETAIL = [];

    /* 💼 Métiers de CHAQUE agence — vue fondateur uniquement (la police
       d'accès `agency_universes_read_platform` n'ouvre cette lecture qu'à
       TimelessHouse). Rempli par loadAgencies juste avant setAgencies, donc
       lu à jour au rendu suivant. Objet simple plutôt qu'un état React :
       il n'est consommé qu'en affichage, et évite de faire descendre une
       prop de plus sur toute la grille. */
    const METIERS_PAR_AGENCE = {};

    /* ════════════════════════════════════════════════════════════
       ☁️ UPLOAD DIRECT VERS BACKBLAZE B2 (via Edge Function b2-sign)
       Même modèle que ylvfeet : l'admin choisit un fichier, le
       navigateur demande une URL signée puis PUT directement sur B2
       (aucun fichier ne transite par Supabase). Les fichiers > 4 Go
       (films de mariage) passent automatiquement en multipart.
       ════════════════════════════════════════════════════════════ */
    /* 📬 « Nouvelle tâche pour vous » — prévient le coéquipier assigné.
       Meilleur effort, JAMAIS bloquant : la tâche est déjà enregistrée,
       l'email est un plus. On ne prévient que si l'assigné est
       quelqu'un d'AUTRE que soi (s'auto-notifier serait du bruit).
       L'anti-doublon (task:id:user) fait qu'un ré-enregistrement de la
       même assignation ne renvoie rien — mais réassigner à quelqu'un
       d'autre prévient bien le nouveau venu. */
    async function signalerAssignation({ taskId, assigneA, titre, dueOn, clientNom }) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session || !assigneA || assigneA === session.user?.id || !AGENCY.id) return;
        await fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            kind: 'member_task_assigned',
            agency_id: AGENCY.id,
            user_id: assigneA,
            dedupe_key: `task:${taskId}:${assigneA}`,
            extra: { titre: titre || '', due_on: dueOn || '', client: clientNom || '' },
          }),
        });
      } catch (_) { /* le rappel est un plus, jamais un blocage */ }
    }

    async function b2Sign(payload) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('Session admin expirée — reconnecte-toi.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/b2-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Signature B2 échouée (${res.status})`);
      return json;
    }

    // PUT avec progression (fetch ne sait pas suivre l'upload → XHR)
    function b2Put(url, body, contentType, onProgress, disposition) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        // Le Content-Type doit correspondre EXACTEMENT à celui signé
        // (sign-put). Pour les parts multipart, rien n'a été signé → pas d'en-tête.
        if (contentType) xhr.setRequestHeader('Content-Type', contentType);
        // Idem pour Content-Disposition : signé côté fonction pour les originaux,
        // il doit être renvoyé tel quel sinon la signature est invalide.
        if (disposition) xhr.setRequestHeader('Content-Disposition', disposition);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve(xhr)
          : reject(new Error(`Upload B2 échoué (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Upload B2 échoué — réseau ou CORS du bucket (npm run b2-cors)'));
        xhr.send(body);
      });
    }

    // Au-delà de ce seuil → upload multipart (découpé en morceaux).
    // Seuil volontairement bas : un PUT unique de plusieurs Go n'a aucune reprise
    // possible (une micro-coupure = tout est perdu), alors qu'un morceau raté se
    // réessaie seul. Cap S3 du PUT unique : 5 Go — inatteignable ici.
    const B2_MPU_THRESHOLD = 100 * 1024 * 1024;      // 100 Mo
    const B2_MPU_PART_SIZE = 100 * 1024 * 1024;      // 100 Mo par morceau

    // Réessaie un PUT : sur un film de plusieurs Go découpé en dizaines de
    // morceaux, une coupure passagère est probable — sans reprise, tout l'upload
    // repartirait de zéro.
    async function b2PutRetry(url, body, contentType, onProgress, disposition, tries = 3) {
      let lastErr;
      for (let i = 1; i <= tries; i++) {
        try { return await b2Put(url, body, contentType, onProgress, disposition); }
        catch (e) {
          lastErr = e;
          if (i < tries) await new Promise(r => setTimeout(r, 1500 * i));
        }
      }
      throw lastErr;
    }

    // Uploade un fichier vers B2 et renvoie son URL publique.
    async function b2UploadFile(file, key, onProgress) {
      const contentType = file.type || 'application/octet-stream';

      if (file.size <= B2_MPU_THRESHOLD) {
        const { url, publicUrl, disposition } = await b2Sign({ action: 'sign-put', key, contentType, size: file.size });
        await b2PutRetry(url, file, contentType, onProgress, disposition);
        return publicUrl;
      }

      // Multipart — gros fichiers (l'ETag de chaque part est exigé à la fin)
      const { uploadId } = await b2Sign({ action: 'mpu-create', key, contentType, size: file.size });
      try {
        const partCount = Math.ceil(file.size / B2_MPU_PART_SIZE);
        const parts = [];
        let uploadedBytes = 0;
        for (let start = 1; start <= partCount; start += 100) {
          const batch = [];
          for (let n = start; n <= Math.min(start + 99, partCount); n++) batch.push(n);
          const { urls } = await b2Sign({ action: 'mpu-sign-parts', key, uploadId, partNumbers: batch });
          for (const n of batch) {
            const blob = file.slice((n - 1) * B2_MPU_PART_SIZE, Math.min(n * B2_MPU_PART_SIZE, file.size));
            const xhr = await b2PutRetry(urls[n], blob, null, (p) => {
              if (onProgress) onProgress((uploadedBytes + p * blob.size) / file.size);
            });
            uploadedBytes += blob.size;
            parts.push({ PartNumber: n, ETag: (xhr.getResponseHeader('ETag') || '').replace(/"/g, '') });
          }
        }
        const { publicUrl } = await b2Sign({ action: 'mpu-complete', key, uploadId, parts, size: file.size });
        return publicUrl;
      } catch (err) {
        await b2Sign({ action: 'mpu-abort', key, uploadId }).catch(() => {});
        throw err;
      }
    }

    // Lit les métadonnées réelles d'un fichier vidéo dans le navigateur.
    // Peut échouer (ex : .mov ProRes non décodable par Chrome) → null,
    // le script d'encodage remplira alors les valeurs exactes via ffprobe.
    function readLocalVideoMeta(file) {
      return new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        const done = (meta) => { URL.revokeObjectURL(v.src); resolve(meta); };
        v.onloadedmetadata = () => done({
          width: v.videoWidth || null,
          height: v.videoHeight || null,
          duration: Math.round(v.duration || 0) || null,
        });
        v.onerror = () => done(null);
        v.src = URL.createObjectURL(file);
      });
    }

    const b2SafeName = (name) => (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const fmtSizeFR = (bytes) => !bytes ? '' : (bytes >= 1e9
      ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`
      : `${Math.round(bytes / 1e6)} Mo`);
    const fmtDurationLabel = (sec) => {
      if (!sec) return '';
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
    };

    // slug ASCII pour dériver un nom de sous-dossier depuis un libellé de catégorie
    const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Convertit une config de page vidéo « ancien format » (teaser/film figés)
    // vers le modèle liste videos[]. Les pages créées avant la liste sont ainsi
    // éditables normalement ; le lecteur, lui, sait lire les deux formats.
    function withVideoList(config, pageType) {
      if (pageType !== 'video' || !config) return config;
      if (Array.isArray(config.videos) && config.videos.length) return config;
      const videos = [];
      if (config.afficherTeaser) videos.push({
        key: 'teaser', title: 'Teaser', hls: config.teaserHls || '', urls: config.teaserUrls || {},
        downloadUrl: config.teaserDownloadUrl || '', chapitres: config.teaserChapitres || [],
      });
      if (config.afficherFilm) videos.push({
        key: 'film', title: 'Film Complet', hls: config.filmHls || '', urls: config.filmUrls || {},
        downloadUrl: config.filmDownloadUrl || '', chapitres: config.filmChapitres || [],
      });
      const defaultVideo = videos.some(v => v.key === config.defaultVideo)
        ? config.defaultVideo
        : (videos[0] ? videos[0].key : '');
      return { ...config, videos, defaultVideo };
    }

    /* ════════════════════════════════════════════════════════════
       📸 GALERIE B2 — pipeline photo PARTAGÉ (galerie-upload.js)
       (SaaS B.3, brique 11 — et concepteur de galerie)
       Décodage EXIF, variantes navigateur (view 2000 px / grid 1000 px),
       clés weddings/<code>/galerie/…, ligne gallery_photos : tout vit
       dans le module, importé aussi par galerie-studio.html — une seule
       source de vérité, aucune divergence possible entre les deux.
       La console injecte SON transport (b2UploadFile) : multipart et
       reprises inchangés — comportement strictement identique à avant.
       ════════════════════════════════════════════════════════════ */
    const { uploadGalleryPhoto } = creerPipelinePhotos({
      sb, supabaseUrl: SUPABASE_URL, uploadFile: b2UploadFile,
    });

    /* ════════════════════════════════════════════════════════════
       📸 UPLOAD PHOTOS → CLOUDINARY (galeries) via Edge Function cloudinary-sign
       ⚠️ HÉRITAGE TimelessHouse : cloudinary-sign est verrouillée aux
       membres de la plateforme. Les locataires passent par la Galerie B2.
       ════════════════════════════════════════════════════════════ */
    async function cloudinarySign(payload) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('Session admin expirée — reconnecte-toi.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cloudinary-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Signature Cloudinary échouée (${res.status})`);
      return j;
    }

    // Uploade un lot de photos dans un dossier Cloudinary (1 signature réutilisée).
    async function uploadPhotosToCloudinary(files, folder, onProgress) {
      const sig = await cloudinarySign({ folder });
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append('file', files[i]);
        fd.append('api_key', sig.apiKey);
        fd.append('timestamp', String(sig.timestamp));
        fd.append('folder', sig.folder);
        fd.append('signature', sig.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error?.message || `Upload Cloudinary échoué (photo ${i + 1}/${files.length})`);
        if (onProgress) onProgress(i + 1, files.length);
      }
    }

    /* ════════════════════════════════════════════════════════════
       🎨 STYLES NÉOMORPHIQUES (harmonisés avec le dashboard client)
       LIGHT : cream warm (#e9e4d9) — DARK : graphite + ivoire (#e8d8be)

       RÈGLE « HALO » (anti-collision d'ombres — à respecter pour
       tout nouvel élément, voir aussi le CSS des pages HTML) :
       · BUDGET DE PORTÉE (portée = offset + flou) : raised 21 px,
         raisedSm 17 px, raisedXs 10 px, dark (bouton actif) 13 px.
         Ne JAMAIS dépasser : 21 px pour une carte (l'interstice
         carte→pastille garanti est de 32 px : 20 d'écart + 12 de
         bande, et 21 + 10 = 31 ≤ 32), 13 px pour l'actif d'une
         barre (place dans la barre : 4 px + 12 px de bande) ;
       · les pastilles (raisedXs) portent zIndex 2 → elles sont
         TOUJOURS peintes au-dessus des halos des grandes cartes,
         quel que soit l'ordre dans le DOM ;
       · interstice minimal entre deux pastilles : 12 px (gap-3) ;
       · toute bande défilante (overflow-x-auto no-scrollbar)
         réserve 12 px verticaux via le CSS global — ne jamais y
         remettre de py/-my à la main ;
       · une barre d'onglets / un sélecteur est un RAIL EN CREUX :
         conteneur en neu.pressed (ombres internes, rien ne déborde),
         JAMAIS raisedXs — choix de Gil du 22/07/2026.
       ════════════════════════════════════════════════════════════ */
    const NEU_LIGHT = {
      base:      { backgroundColor: '#e9e4d9' },
      raised:    { backgroundColor: '#efeae0', boxShadow: '7px 7px 14px rgba(168,156,134,0.38), -7px -7px 14px rgba(255,253,247,0.92)' },
      raisedSm:  { backgroundColor: '#efeae0', boxShadow: '5px 5px 12px rgba(168,156,134,0.26), -5px -5px 12px rgba(255,253,247,0.88)' },
      raisedXs:  { backgroundColor: '#efeae0', boxShadow: '3px 3px 7px rgba(168,156,134,0.22), -3px -3px 7px rgba(255,253,247,0.82)', zIndex: 2 },
      pressed:   { backgroundColor: '#e3ddd0', boxShadow: 'inset 5px 5px 10px rgba(168,156,134,0.32), inset -5px -5px 10px rgba(255,253,247,0.9)' },
      pressedSm: { backgroundColor: '#e3ddd0', boxShadow: 'inset 3px 3px 6px rgba(168,156,134,0.26), inset -3px -3px 6px rgba(255,253,247,0.85)' },
      dark:      { backgroundColor: '#2a2620', boxShadow: '4px 4px 9px rgba(168,156,134,0.44), -2px -2px 6px rgba(255,253,247,0.6), inset 1px 1px 2px rgba(255,255,255,0.08)' },
      darkSm:    { backgroundColor: '#2a2620', boxShadow: '4px 4px 10px rgba(168,156,134,0.36), -2px -2px 6px rgba(255,253,247,0.5)' },
      accent:    '#2a2620',
      accentText:'#f5f1e6',
    };

    const NEU_DARK = {
      base:      { backgroundColor: '#181b20' },
      raised:    { backgroundColor: '#22262d', boxShadow: '7px 7px 14px rgba(0,0,0,0.6), -5px -5px 12px rgba(54,60,72,0.3)' },
      raisedSm:  { backgroundColor: '#22262d', boxShadow: '5px 5px 12px rgba(0,0,0,0.48), -3px -3px 8px rgba(54,60,72,0.22)' },
      raisedXs:  { backgroundColor: '#22262d', boxShadow: '3px 3px 7px rgba(0,0,0,0.42), -2px -2px 5px rgba(54,60,72,0.18)', zIndex: 2 },
      pressed:   { backgroundColor: '#14171c', boxShadow: 'inset 5px 5px 10px rgba(0,0,0,0.55), inset -3px -3px 8px rgba(54,60,72,0.2)' },
      pressedSm: { backgroundColor: '#14171c', boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.48), inset -2px -2px 5px rgba(54,60,72,0.15)' },
      dark:      { backgroundColor: '#e8d8be', boxShadow: '4px 4px 9px rgba(0,0,0,0.68), -2px -2px 6px rgba(54,60,72,0.22), inset 1px 1px 2px rgba(255,255,255,0.18), 0 0 0 1px rgba(232,216,190,0.35), 0 0 12px rgba(232,216,190,0.22)' },
      darkSm:    { backgroundColor: '#e8d8be', boxShadow: '4px 4px 10px rgba(0,0,0,0.55), -2px -2px 6px rgba(54,60,72,0.18), 0 0 0 1px rgba(232,216,190,0.3), 0 0 16px rgba(232,216,190,0.2)' },
      accent:    '#e8d8be',
      accentText:'#1a1410',
    };

    // Mutable pointer — reassigned by App on theme change
    let neu = NEU_LIGHT;

    /* ════════════════════════════════════════════════════════════
       🎨 LA CONSOLE AUX COULEURS DE LA LOGE (02/08/2026)
       ════════════════════════════════════════════════════════════
       Demande de Gil : la marque du locataire (Ma marque → couleurs)
       peint aussi SA console — pas seulement ses espaces clients et
       ses emails. Le relief néomorphique est RECALCULÉ depuis sa
       couleur de fond (ombre = fond assombri, lumière = fond éclairci,
       mêmes portées que les jetons maison — la règle « halo » tient) ;
       ses boutons sombres prennent sa couleur d'accent.
       Gardes, toutes CALCULÉES :
       · fond trop sombre (les encres fixes deviendraient illisibles)
         → on garde la crème maison, l'accent s'applique quand même ;
       · encre du bouton accent choisie par contraste (crème ou encre
         sombre), et l'accent est assombri pas à pas s'il ne porte
         aucune encre à 4,5:1 ;
       · la PLATEFORME garde la maison telle quelle ;
       · thème sombre inchangé (graphite) — le sombre est une lecture
         de nuit, pas une vitrine de marque. */
    const hexVersRgb = (hex) => {
      const h = String(hex || '').replace('#', '');
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const rgbVersHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const melange = (a, b, t) => {
      const ra = hexVersRgb(a), rb = hexVersRgb(b);
      if (!ra || !rb) return a;
      return rgbVersHex(ra.map((v, i) => v + (rb[i] - v) * t));
    };
    const luminance = (hex) => {
      const rgb = hexVersRgb(hex);
      if (!rgb) return 0;
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contraste = (a, b) => {
      const la = luminance(a), lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const hexVersRgba = (hex, alpha) => {
      const rgb = hexVersRgb(hex);
      return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex;
    };

    let NEU_TENANT = null;   // palette claire dérivée de la marque, posée par loadFeatures

    function paletteDepuisMarque(bgBrut, accentBrut, slug) {
      if (!slug || slug === 'timelesshouse') return null;
      const bgOk = hexVersRgb(bgBrut) && luminance(bgBrut) >= 0.5;
      const accentOk = !!hexVersRgb(accentBrut);
      const bg = bgOk ? bgBrut.toLowerCase() : '#e9e4d9';
      let accent = accentOk ? accentBrut.toLowerCase() : '#2a2620';
      // Rien de personnalisé → la maison telle quelle (zéro recalcul).
      if (bg === '#e9e4d9' && accent === '#2a2620') return null;
      /* Toute la console écrit en BLANC sur les surfaces accent
         (classe text-white, partout) : l'accent est donc assombri pas
         à pas jusqu'à porter le blanc à 4,5:1 — un accent pastel
         devient sa version profonde, et rien ne casse nulle part. */
      for (let i = 0; i < 10 && contraste(accent, '#ffffff') < 4.5; i++) {
        accent = melange(accent, '#000000', 0.12);
      }
      const encre = '#ffffff';
      const carte = melange(bg, '#ffffff', 0.35);
      const creux = melange(bg, '#000000', 0.035);
      const ombre = melange(bg, '#000000', 0.38);
      const lumiere = melange(bg, '#ffffff', 0.92);
      const o = (a) => hexVersRgba(ombre, a);
      const l = (a) => hexVersRgba(lumiere, a);
      return {
        base:      { backgroundColor: bg },
        raised:    { backgroundColor: carte, boxShadow: `7px 7px 14px ${o(0.38)}, -7px -7px 14px ${l(0.92)}` },
        raisedSm:  { backgroundColor: carte, boxShadow: `5px 5px 12px ${o(0.26)}, -5px -5px 12px ${l(0.88)}` },
        raisedXs:  { backgroundColor: carte, boxShadow: `3px 3px 7px ${o(0.22)}, -3px -3px 7px ${l(0.82)}`, zIndex: 2 },
        pressed:   { backgroundColor: creux, boxShadow: `inset 5px 5px 10px ${o(0.32)}, inset -5px -5px 10px ${l(0.9)}` },
        pressedSm: { backgroundColor: creux, boxShadow: `inset 3px 3px 6px ${o(0.26)}, inset -3px -3px 6px ${l(0.85)}` },
        dark:      { backgroundColor: accent, color: encre, boxShadow: `4px 4px 9px ${o(0.44)}, -2px -2px 6px ${l(0.6)}, inset 1px 1px 2px rgba(255,255,255,0.08)` },
        darkSm:    { backgroundColor: accent, color: encre, boxShadow: `4px 4px 10px ${o(0.36)}, -2px -2px 6px ${l(0.5)}` },
        accent,
        accentText: encre,
      };
    }

    /* ---------- Thème : PILOTÉ PAR L'APPAREIL ----------
       Plus de bascule manuelle : le thème suit le réglage du système
       (clair / sombre / automatique au coucher du soleil). L'utilisateur
       le règle une fois pour toutes dans son téléphone, et toutes ses
       applications suivent — c'est ce qu'il attend, et ça retire deux
       commandes de l'interface.
       L'écoute reste active : basculer le téléphone en sombre pendant
       qu'une page est ouverte la fait changer sans rechargement. */
    const useDarkMode = () => {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      const [isDark, setIsDark] = useState(() => !!(mq && mq.matches));
      useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }, [isDark]);
      useEffect(() => {
        if (!mq) return;
        const suivre = (e) => setIsDark(e.matches);
        // addEventListener sur un MediaQueryList : Safari < 14 ne connaît
        // que addListener, d'où le repli.
        if (mq.addEventListener) { mq.addEventListener('change', suivre); return () => mq.removeEventListener('change', suivre); }
        mq.addListener(suivre); return () => mq.removeListener(suivre);
      }, [mq]);
      return [isDark, () => {}];   // la bascule ne fait plus rien
    };

    /* Le sélecteur de thème a été retiré : le thème suit désormais le
       réglage de l'appareil (voir useDarkMode plus haut). Son composant
       et ses constantes d'arc SVG partent avec lui — du code mort qui
       aurait laissé croire que la bascule existe encore. */

    const SERIF = { fontFamily: 'Instrument Serif, serif', fontWeight: 400 };

    /* ════════════════════════════════════════════════════════════
       📅 DATE HELPERS
       ════════════════════════════════════════════════════════════ */
    const MOIS_FR = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
    const MOIS_FR_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    /** Retourne la date du jour au format ISO "YYYY-MM-DD" */
    const todayISO = () => {
      const d = new Date();
      return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    };

    /** Retourne la date dans 30 jours au format ISO "YYYY-MM-DD" */
    const in30DaysISO = () => {
      const d = new Date(); d.setDate(d.getDate() + 30);
      return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    };

    /** Convertit "2026-05-17" → "17 Mai 2026" */
    const isoToLabel = (iso) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-').map(Number);
      return `${d} ${MOIS_FR_LONG[m - 1]} ${y}`;
    };

    /* Lit un horaire écrit à la main — « 10 :00 », « 11:00 - 19:00 »,
       « 09:00 — 16:00 ». Les tirets de toutes longueurs valent le même,
       les espaces sautent, et ce qui ne ressemble pas à une heure ne
       donne RIEN plutôt qu'une valeur inventée (« 14h-18h » → vide). */
    const heuresDeTexte = (txt) => {
      const t = String(txt || '').replace(/[—–]/g, '-').replace(/\s/g, '');
      const [g, d] = t.split('-');
      const lire = (x) => (String(x || '').match(/^\d{1,2}:\d{2}/) || [''])[0];
      const pad = (x) => (x && x.length === 4 ? '0' + x : x);
      return { debut: pad(lire(g)), fin: pad(lire(d)) };
    };
    /* Le texte affiché, reconstruit depuis les vraies heures : c'est lui
       que lisent l'espace client, les emails et les factures. */
    const texteHoraire = (debut, fin) =>
      debut && fin ? `${debut} — ${fin}` : (debut || '');

    /** Convertit "2026-05-17" → { date_day: 17, month_label: 'Mai', year: 2026 } */
    const isoToShootParts = (iso) => {
      if (!iso) return {};
      const [y, m, d] = iso.split('-').map(Number);
      return { date_day: d, month_label: MOIS_FR[m - 1], year: y };
    };

    /** Convertit (day, monthLabel, year) → "2026-05-17" */
    const shootPartsToISO = (day, monthLabel, year) => {
      const mi = MOIS_FR.indexOf(monthLabel);
      if (mi === -1 || !day || !year) return '';
      return `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    /* ════════════════════════════════════════════════════════════
       🔧 ATOMS
       ════════════════════════════════════════════════════════════ */
    const Btn = ({ kind = 'soft', onClick, children, type = 'button', disabled, full, icon: Icon, className = '' }) => {
      const styles = kind === 'dark' ? neu.dark : neu.raisedXs;
      const text = kind === 'dark' ? 'text-white' : 'text-stone-800';
      return (
        <button
          type={type}
          onClick={onClick}
          disabled={disabled}
          style={styles}
          className={`px-5 py-3 min-h-[44px] rounded-full text-[13px] font-semibold flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap ${text} ${full ? 'w-full' : ''} ${className}`}
        >
          {Icon && <Icon size={14} />}
          {children}
        </button>
      );
    };

    // Bouton « prévenir le client par email » — LE même partout (cloche),
    // pour que l'action se reconnaisse d'un coup d'œil quel que soit
    // l'onglet (médias, factures, documents, tournages, stratégies…).
    const BellBtn = ({ onClick, busy, title, className = '' }) => (
      <button
        onClick={onClick}
        disabled={busy}
        aria-label={title}
        title={title}
        style={neu.raisedXs}
        className={`w-10 h-10 rounded-full flex items-center justify-center text-stone-600 disabled:opacity-50 active:scale-95 transition-transform ${className}`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
      </button>
    );

    /* ════════════════════════════════════════════════════════════
       💡  ASTUCE CONTEXTUELLE
       ════════════════════════════════════════════════════════════
       Le guide en chapitres reste utile, mais un tour lu une fois
       s'oublie : ce qui s'apprend vraiment, c'est ce qu'on lit AU
       MOMENT où on en a besoin. Une astuce s'affiche donc là où
       l'action se joue, propose le geste plutôt que de le décrire,
       et disparaît définitivement une fois comprise.

       · une seule fois par COMPTE (métadonnées Supabase, donc sur
         tous les appareils — comme l'ouverture du guide) ;
       · une seule à l'écran à la fois : deux astuces simultanées
         ne sont plus une aide, c'est du bruit ;
       · jamais pour la plateforme (Gil connaît son outil).
       Les astuces déjà refermées sont chargées au démarrage dans
       ASTUCES_VUES par App(). */
    let ASTUCES_VUES = new Set();
    let ASTUCE_AFFICHEE = null;   // la clé occupant l'écran

    function Astuce({ cle, titre, texte, action, libelleAction }) {
      const [ferme, setFerme] = useState(() => ASTUCES_VUES.has(cle));
      // Réserve la place à l'écran au premier rendu ; libère-la en partant.
      useEffect(() => {
        if (ferme) return;
        if (!ASTUCE_AFFICHEE) ASTUCE_AFFICHEE = cle;
        return () => { if (ASTUCE_AFFICHEE === cle) ASTUCE_AFFICHEE = null; };
      }, [ferme, cle]);

      if (ferme || FEATURES.allUniverses) return null;
      if (ASTUCE_AFFICHEE && ASTUCE_AFFICHEE !== cle) return null;

      const fermer = () => {
        setFerme(true);
        ASTUCES_VUES.add(cle);
        if (ASTUCE_AFFICHEE === cle) ASTUCE_AFFICHEE = null;
        sb.auth.updateUser({ data: { laloge_astuces: [...ASTUCES_VUES] } }).catch(() => {});
      };

      return (
        <div style={neu.raisedXs} role="note"
             className="rounded-2xl p-4 flex items-start gap-3.5 my-3">
          <span style={neu.pressedSm} aria-hidden="true"
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-amber-600">
            <Lightbulb size={16} />
          </span>
          {/* Largeur de lecture bornée : dans une carte pleine largeur,
              la phrase s'étirait sur ~1300 px d'un seul tenant — l'œil
              perd la ligne suivante au retour. */}
          <div className="min-w-0 flex-1 max-w-[68ch]">
            <div className="text-[13px] font-semibold text-stone-800">{titre}</div>
            <p className="text-[12.5px] text-stone-600 leading-relaxed mt-1">{texte}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {action && (
                <button onClick={() => { action(); fermer(); }} style={neu.dark}
                        className="px-4 py-2 min-h-[38px] rounded-full text-white text-[12px] font-semibold active:scale-95 transition">
                  {libelleAction || 'Montrez-moi'}
                </button>
              )}
              <button onClick={fermer}
                      className="px-3 py-2 min-h-[38px] text-[12px] font-semibold text-stone-500 hover:text-stone-800 transition">
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Libellé de champ — hiérarchie visuelle Apple (22/07/2026) : le
    // libellé est PROCHE du contenu, il doit donc être lisible et sombre,
    // en casse normale. Les petites capitales espacées à 10 px criaient
    // plus fort que la valeur saisie (et passaient sous le plancher des
    // 11 px du guide). Ce sont les intitulés de GROUPE qui reculent,
    // pas les libellés — exactement l'inverse de l'ancien réglage.
    const Field = ({ label, children }) => (
      <div>
        <label className="text-[13px] text-stone-700 font-medium block mb-2 leading-snug">{label}</label>
        {children}
      </div>
    );

    // Groupe thématique d'un formulaire (motif SwiftUI / inspecteur Apple,
    // demande de Gil du 22/07/2026) : les champs qui ont une relation
    // logique vivent sous un même intitulé, et tous les champs gardent la
    // MÊME largeur — c'est ce qui crée la cohérence visuelle. Le premier
    // groupe d'un formulaire se passe d'intitulé (c'est l'essentiel).
    // pt-7 : la RESPIRATION fait le regroupement (principe « proximity »).
    // 44 px entre deux groupes contre 16 px entre deux champs — un rapport
    // franc, sans quoi l'œil ne perçoit pas les sections.
    const FormSection = ({ title, children }) => (
      <div className="space-y-4 pt-7 first:pt-0">
        {title && (
          <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">{title}</div>
        )}
        {children}
      </div>
    );

    // HIG : 16px minimum sur mobile — en dessous, iOS zoome toute la page au
    // focus de chaque champ. Le rendu desktop (sm:) reste inchangé.
    const Input = (props) => (
      <input
        {...props}
        style={{ ...neu.pressedSm, ...(props.style || {}) }}
        className={`w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] placeholder:text-stone-400 ${props.className || ''}`}
      />
    );

    const Textarea = (props) => (
      <textarea
        {...props}
        style={{ ...neu.pressedSm, ...(props.style || {}) }}
        className={`w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[13px] placeholder:text-stone-400 resize-y font-mono ${props.className || ''}`}
      />
    );

    const Select = ({ value, onChange, children, disabled }) => (
      <select value={value} onChange={onChange} disabled={disabled} style={neu.pressedSm}
        className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] disabled:opacity-60">
        {children}
      </select>
    );

    const StatCard = ({ label, value, dark }) => (
      <div style={dark ? neu.dark : neu.raisedSm} className={`rounded-[22px] lg:rounded-3xl p-5 lg:p-6 ${dark ? 'text-white' : 'text-stone-900'}`}>
        <div className={`text-[12px] lg:text-[13px] ${dark ? 'text-stone-400' : 'text-stone-500'} font-medium leading-none`}>{label}</div>
        <div className="text-[26px] lg:text-[32px] tracking-tight mt-3 leading-none" style={SERIF}>{value}</div>
      </div>
    );

    const ApprovalBadge = ({ status }) => {
      const cfg = {
        pending:           { label: 'En attente',          bg: 'bg-amber-100',   text: 'text-amber-700',   icon: Clock },
        approved:          { label: 'Approuvé',            bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
        changes_requested: { label: 'Changements demandés', bg: 'bg-rose-100',   text: 'text-rose-700',    icon: AlertCircle },
      }[status] || { label: status, bg: 'bg-stone-100', text: 'text-stone-600', icon: Clock };
      const Icon = cfg.icon;
      return (
        <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
          <Icon size={10} /> {cfg.label}
        </span>
      );
    };

    const Modal = ({ title, kicker, onClose, children, size = 'md' }) => {
      const boxRef = useRef(null);

      // HIG §12 : une modale verrouille le scroll derrière elle, se ferme
      // par Échap, garde le focus clavier à l'intérieur, et le rend à
      // l'élément d'origine en partant. Sans ces quatre règles, la
      // navigation au clavier sort de la modale et se perd dans la page.
      useEffect(() => {
        const prev = document.body.style.overflow;
        const origine = document.activeElement;
        document.body.style.overflow = 'hidden';

        // Focus initial : le premier champ, sinon la boîte elle-même.
        const box = boxRef.current;
        const focusables = () => [...(box?.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || [])].filter(el => el.offsetParent !== null);
        const premier = focusables()[0];
        (premier || box)?.focus?.();

        const onKey = (e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
          if (e.key !== 'Tab') return;
          const f = focusables();
          if (!f.length) return;
          const debut = f[0], fin = f[f.length - 1];
          if (e.shiftKey && document.activeElement === debut) { e.preventDefault(); fin.focus(); }
          else if (!e.shiftKey && document.activeElement === fin) { e.preventDefault(); debut.focus(); }
        };
        document.addEventListener('keydown', onKey, true);

        return () => {
          document.removeEventListener('keydown', onKey, true);
          document.body.style.overflow = prev;
          if (origine && origine.focus) origine.focus();
        };
      }, [onClose]);

      return (
      <div className="th-modal-fond fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}
           role="dialog" aria-modal="true" aria-label={title}>
        {/* dvh (pas vh) : tient compte de la barre d'URL iOS — sinon le bas de
            la modale (boutons Enregistrer) passe sous la barre.
            overscroll-contain : le scroll interne ne « fuit » pas vers la page. */}
        <div
          ref={boxRef}
          tabIndex={-1}
          style={neu.raised}
          className={`th-modal-boite rounded-t-[28px] sm:rounded-[32px] p-5 sm:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-7 max-h-[92dvh] sm:max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle mobile */}
          <div className="sm:hidden w-10 h-1 bg-stone-300 rounded-full mx-auto mb-4" />
          <div className="flex items-start justify-between mb-5 gap-3">
            <div className="min-w-0 flex-1">
              {kicker && <div className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{kicker}</div>}
              <h2 className="text-[20px] sm:text-[24px] tracking-tight mt-1 leading-tight" style={SERIF}>{title}</h2>
            </div>
            <button style={neu.raisedXs} onClick={onClose} className="w-9 h-9 tap-ext rounded-full flex items-center justify-center shrink-0"><X size={15} /></button>
          </div>
          {children}
        </div>
      </div>
      );
    };

    /* ════════════════════════════════════════════════════════════
       🔐 LOGIN
       ════════════════════════════════════════════════════════════ */
    function LoginScreen({ onLogin, mfaSession }) {
      const [email, setEmail] = useState('');
      const [pwd, setPwd] = useState('');
      const [showPwd, setShowPwd] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [sending, setSending] = useState(false);
      const [sent, setSent] = useState(false);

      // Demande de réinitialisation : réponse toujours identique côté
      // serveur (aucune énumération de comptes possible).
      const forgot = async () => {
        if (!email.trim()) { setError("Renseignez d'abord votre email, puis recliquez sur « Mot de passe oublié ? »."); return; }
        setSending(true); setError('');
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/account-recovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ email: email.trim(), redirect_to: `${window.location.origin}/reinitialiser` }),
          });
        } catch (e) { /* réponse volontairement identique en cas d'échec */ }
        setSent(true); setSending(false);
      };

      /* Étape du code : { factorId } quand la double vérification est
         attendue. La session existe déjà (mot de passe validé) mais elle
         est de niveau 1 — la console ne s'ouvre qu'après verify(). */
      const [mfa, setMfa] = useState(null);
      const [codeMfa, setCodeMfa] = useState('');
      const [mfaBusy, setMfaBusy] = useState(false);

      const versEtapeCode = async () => {
        const { data: fs, error: e1 } = await sb.auth.mfa.listFactors();
        if (e1) return false;
        const f = (fs?.totp || []).find((x) => x.status === 'verified') || (fs?.totp || [])[0];
        if (!f) return false;
        setMfa({ factorId: f.id });
        return true;
      };

      /* Session rechargée à mi-parcours (mot de passe validé hier, code
         jamais saisi) : on arrive directement à l'étape du code. */
      useEffect(() => {
        if (!mfaSession) return;
        versEtapeCode().then((ok) => { if (!ok) sb.auth.signOut(); });
      }, [mfaSession]);

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        const { data, error: err } = await sb.auth.signInWithPassword({ email, password: pwd });
        if (err) {
          setError("Identifiants incorrects ou compte non trouvé.");
          setLoading(false);
          return;
        }
        /* Double vérification exigée ? L'échec de l'API MFA ne bloque
           jamais l'entrée : sans réponse, on se comporte comme avant. */
        try {
          const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
            if (await versEtapeCode()) { setLoading(false); return; }
          }
        } catch (_) {}
        onLogin(data.user);
      };

      const verifierCode = async (e) => {
        e.preventDefault();
        if (!mfa || mfaBusy) return;
        setMfaBusy(true); setError('');
        try {
          const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: mfa.factorId });
          if (e1) throw e1;
          const { data, error: e2 } = await sb.auth.mfa.verify({
            factorId: mfa.factorId, challengeId: ch.id, code: codeMfa.trim(),
          });
          if (e2) throw e2;
          onLogin(data.user);
        } catch (err) {
          setError(/invalid|expired/i.test(err?.message || '')
            ? 'Code incorrect ou expiré — regardez le nouveau code dans votre application.'
            : humaniseErreur(err?.message || 'La vérification a échoué.'));
          setCodeMfa('');
        }
        setMfaBusy(false);
      };

      const abandonnerMfa = async () => {
        await sb.auth.signOut().catch(() => {});
        setMfa(null); setCodeMfa(''); setError(''); setLoading(false);
      };

      if (mfa) return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div style={neu.raised} className="rounded-[32px] p-10 max-w-md w-full">
            <div className="text-center mb-8">
              <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
                <ShieldCheck size={20} />
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Double vérification</div>
              <h1 className="text-[34px] tracking-tight mt-1 leading-none" style={SERIF}>Votre code</h1>
              <p className="text-[13px] text-stone-500 mt-3">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
            </div>
            <form onSubmit={verifierCode} className="space-y-4">
              <Field label="Code à 6 chiffres">
                <Input value={codeMfa} onChange={(e) => setCodeMfa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus required
                  className="text-center tracking-[0.4em] font-semibold" />
              </Field>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </div>
              )}
              <button type="submit" disabled={mfaBusy || codeMfa.length < 6} style={neu.dark}
                className="w-full min-h-[48px] rounded-full text-white text-[14px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform">
                {mfaBusy ? 'Vérification…' : 'Entrer'}
              </button>
              <button type="button" onClick={abandonnerMfa}
                className="w-full min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
                Revenir à la connexion
              </button>
            </form>
          </div>
        </div>
      );

      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div style={neu.raised} className="rounded-[32px] p-10 max-w-md w-full">
            <div className="text-center mb-8">
              <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
                <Lock size={20} />
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Espace Agence</div>
              <h1 className="text-[34px] tracking-tight mt-1 leading-none" style={SERIF}>Connexion admin</h1>
              <p className="text-[13px] text-stone-500 mt-3">Gérez tous vos clients, médias, factures et tournages.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <div className="relative">
                  <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@timelesshouse.org" style={{ paddingLeft: '42px' }} />
                </div>
              </Field>
              <Field label="Mot de passe">
                <div className="relative">
                  <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input type={showPwd ? 'text' : 'password'} required value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" style={{ paddingLeft: '42px', paddingRight: '42px' }} />
                  {/* HIG : zone tactile 44px (l'icône seule faisait 15×15) */}
                  <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-stone-400 hover:text-stone-700">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Lock}>
                {loading ? 'Connexion…' : 'Se connecter'}
              </Btn>
            </form>

            {/* Mot de passe oublié (SaaS B.3) : email de récupération à la
                marque de l'agence, envoyé par l'Edge Function dédiée */}
            <div className="text-center mt-5">
              <button type="button" onClick={forgot} disabled={sending}
                className="text-[12.5px] text-stone-500 hover:text-stone-800 underline underline-offset-4 min-h-[44px] px-3">
                {sending ? 'Envoi…' : 'Mot de passe oublié ?'}
              </button>
            </div>
            {sent && (
              <div className="flex items-start gap-2 mt-1 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-[12.5px]">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier vos indésirables.
              </div>
            )}

            <p className="text-[11px] text-stone-400 text-center mt-6">
              Pas encore de compte ? <a href="/inscription" className="underline underline-offset-2">Créer votre agence</a>.
            </p>
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       ⏳ LOGE EN ATTENTE DE VALIDATION
       ════════════════════════════════════════════════════════════ */
    function PendingScreen({ agency, onLogout }) {
      const suspendue = agency.status === 'suspended';
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div style={neu.raised} className="rounded-[32px] p-9 lg:p-10 max-w-lg w-full text-center">
            <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-5">
              <Clock size={20} />
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
              {suspendue ? 'Accès suspendu' : 'Demande enregistrée'}
            </div>
            <h1 className="text-[28px] lg:text-[32px] tracking-tight mt-2 leading-tight" style={SERIF}>
              {suspendue ? 'Votre loge est fermée' : 'Votre loge ouvre bientôt'}
            </h1>
            <p className="text-[13.5px] text-stone-500 mt-4 leading-relaxed">
              {suspendue
                ? "L'accès à cette loge a été suspendu. Écrivez-nous pour faire le point : nous répondons vite."
                : <>Merci&nbsp;! Votre compte <strong className="text-stone-700">{agency.name}</strong> est créé.
                    Chaque nouvelle loge est validée à la main : nous vous ouvrons l'accès très vite,
                    en général sous 24&nbsp;heures. Vous recevrez un email dès que c'est fait.</>}
            </p>
            {!suspendue && (
              <div style={neu.pressedSm} className="rounded-2xl px-5 py-4 mt-6 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Votre future adresse</div>
                <div className="font-mono text-[13.5px] mt-1.5 break-all">{agency.slug}.laloge.house</div>
              </div>
            )}
            <div className="flex gap-3 justify-center mt-7 flex-wrap">
              <Btn icon={Mail} onClick={() => { window.location.href = 'mailto:service@timelesshouse.org?subject=Ma%20loge%20La%20Loge'; }}>
                Nous écrire
              </Btn>
              <Btn icon={RefreshCw} onClick={() => window.location.reload()}>Actualiser</Btn>
              <Btn icon={LogOut} onClick={onLogout}>Déconnexion</Btn>
            </div>
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🏠 OVERVIEW
       ════════════════════════════════════════════════════════════ */
    // Octets → libellé lisible (jauges de stockage — SaaS B.3)
    const fmtBytes = (b) => {
      if (b == null) return '—';
      if (b >= 1099511627776) return (b / 1099511627776).toFixed(2).replace('.', ',') + ' To';
      if (b >= 1073741824)    return (b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1).replace('.', ',') + ' Go';
      return Math.max(0, Math.round(b / 1048576)) + ' Mo';
    };

    // Jauge de stockage (Vue d'ensemble + cartes agences) — alerte 80 %.
    // Depuis le 24/07/2026, l'upload est BLOQUÉ au-delà du quota (b2-sign) ;
    // cette jauge est le repère visuel de ce plafond.
    function StorageGauge({ storage, compact }) {
      if (!storage) return null;
      const used = storage.used_bytes || 0;
      const quota = storage.quota_bytes || null;
      const pct = quota ? Math.min(100, Math.round(used / quota * 100)) : null;
      const over = quota && used > quota;
      const warn = pct != null && pct >= 80;
      const barColor = over ? '#e11d48' : warn ? '#f59e0b' : (neu.accent || '#2a2620');
      return (
        <div className={compact ? 'mt-4' : ''}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-stone-500 font-medium">
              {fmtBytes(used)}{quota ? ` / ${fmtBytes(quota)}` : ' utilisés'}
            </span>
            {pct != null && (
              <span className={`text-[11.5px] font-semibold ${over ? 'text-rose-600' : warn ? 'text-amber-600' : 'text-stone-400'}`}>
                {over ? 'dépassement' : pct + ' %'}
              </span>
            )}
          </div>
          <div style={neu.pressedSm} className="h-2.5 rounded-full mt-2 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: (pct ?? 4) + '%', background: barColor }} />
          </div>
        </div>
      );
    }

    // ── Abonnement La Loge (SaaS B.3, Stripe) ──
    const PLAN_PRICES = { essentiel: [29, 290], studio: [49, 490], cinema: [89, 890], prestige: [149, 1490] };

    function BillingCard({ billing }) {
      const [plan, setPlan] = useState('studio');
      const [interval, setInterval_] = useState('mensuel');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      // retour de Stripe Checkout (?abonnement=ok|annule)
      const retour = new URLSearchParams(window.location.search).get('abonnement');

      const go = async (action, payload = {}) => {
        setBusy(true); setError('');
        try {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-billing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action, ...payload }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.url) throw new Error(json.error || `Échec (${res.status})`);
          window.location.href = json.url;
        } catch (e) { setError(e.message); setBusy(false); }
      };

      if (!billing) return null;
      const abonne = !!billing.stripe_subscription_id && billing.subscription_status !== 'canceled';
      const fondateur = billing.plan === 'fondateur';

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Abonnement</h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">
              {PLAN_LABELS[billing.plan] || billing.plan}
              {abonne ? ` · ${billing.billing_interval || ''} · ${billing.subscription_status}` : ''}
            </span>
          </div>

          {retour === 'ok' && (
            <div className="flex items-center gap-2 mt-3 text-[13px] text-emerald-700">
              <CheckCircle2 size={15} className="shrink-0" /> Abonnement activé — merci ! Votre plan se met à jour d'ici quelques secondes.
            </div>
          )}

          {fondateur ? (
            <p className="text-[13px] text-stone-500 mt-3">
              Plan Fondateur — stockage illimité, offert. Rien à payer.
            </p>
          ) : abonne ? (
            <div className="mt-4">
              <p className="text-[13px] text-stone-500 mb-4">
                Changez de palier ou mettez à jour votre carte depuis le portail sécurisé Stripe.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Btn kind="dark" onClick={() => go('portal')} disabled={busy}>
                  {busy ? 'Ouverture…' : 'Gérer mon abonnement'}
                </Btn>
                <Btn onClick={() => go('portal')} disabled={busy}>Se désabonner</Btn>
              </div>
              <div className="text-[11.5px] text-stone-400 mt-3">
                La résiliation se confirme dans le portail Stripe. À la fin de la période déjà payée,
                votre loge repasse sur l'offre Découverte — vos données restent en place, ses limites s'appliquent à nouveau.
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <Field label="Palier">
                  <select value={plan} onChange={e => setPlan(e.target.value)} style={neu.pressedSm}
                    className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] appearance-none">
                    {Object.entries(PLAN_PRICES).map(([slug, [pm]]) => (
                      <option key={slug} value={slug}>{PLAN_LABELS[slug]} — {pm} €/mois</option>
                    ))}
                  </select>
                </Field>
                <Field label="Facturation">
                  <select value={interval} onChange={e => setInterval_(e.target.value)} style={neu.pressedSm}
                    className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] appearance-none">
                    <option value="mensuel">Mensuelle</option>
                    <option value="annuel">Annuelle (−2 mois)</option>
                  </select>
                </Field>
                <Btn kind="dark" onClick={() => go('checkout', { plan, interval })} disabled={busy} className="w-full">
                  {busy ? 'Ouverture…' : `S'abonner — ${interval === 'annuel' ? PLAN_PRICES[plan][1] + ' €/an' : PLAN_PRICES[plan][0] + ' €/mois'}`}
                </Btn>
              </div>
              <div className="text-[11.5px] text-stone-400 mt-3">
                Paiement sécurisé Stripe · sans engagement · le quota de stockage suit votre palier.
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 mt-3 text-[13px] text-rose-600">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}
        </div>
      );
    }

    // ── Sécurité : changer son mot de passe depuis la console ──
    function PasswordCard() {
      const [open, setOpen] = useState(false);
      const [pwd, setPwd] = useState('');
      const [pwd2, setPwd2] = useState('');
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }

      const save = async () => {
        if (pwd.length < 8) return setMsg({ kind: 'err', text: 'Le mot de passe doit faire au moins 8 caractères.' });
        if (pwd !== pwd2) return setMsg({ kind: 'err', text: 'Les deux mots de passe ne correspondent pas.' });
        setBusy(true); setMsg(null);
        const { error } = await sb.auth.updateUser({ password: pwd });
        setBusy(false);
        if (error) return setMsg({ kind: 'err', text: /password|mot de passe|weak|short/i.test(error.message || '') ? 'Ce mot de passe est trop court ou trop simple — 8 caractères minimum.' : humaniseErreur(error.message) });
        setPwd(''); setPwd2(''); setOpen(false);
        setMsg({ kind: 'ok', text: 'Mot de passe mis à jour.' });
      };

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Sécurité</h2>
            <Btn icon={Lock} onClick={() => { setOpen(!open); setMsg(null); }}>
              {open ? 'Annuler' : 'Changer mon mot de passe'}
            </Btn>
          </div>
          {open && (
            <div className="grid sm:grid-cols-3 gap-3 items-end mt-5">
              <Field label="Nouveau mot de passe">
                <Input type="password" autoComplete="new-password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="8 caractères minimum" />
              </Field>
              <Field label="Confirmation">
                <Input type="password" autoComplete="new-password" value={pwd2} onChange={e => setPwd2(e.target.value)} placeholder="Retapez le mot de passe" />
              </Field>
              <Btn kind="dark" onClick={save} disabled={busy} className="w-full">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </Btn>
            </div>
          )}
          {msg && (
            <div className={`flex items-center gap-2 mt-4 text-[12.5px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
              {msg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>
      );
    }

    // ── Double vérification (2FA) : un code en plus du mot de passe ──
    function MfaCard() {
      const [facteurs, setFacteurs] = useState(undefined);   // undefined = chargement
      const [enrolement, setEnrolement] = useState(null);    // { id, qr, secret }
      const [code, setCode] = useState('');
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null);

      const charger = async () => {
        try {
          const { data, error } = await sb.auth.mfa.listFactors();
          if (error) throw error;
          setFacteurs((data?.totp || []).filter((f) => f.status === 'verified'));
        } catch (e) {
          setFacteurs(null);
          setMsg({ kind: 'err', text: humaniseErreur(e?.message || 'Impossible de lire l\u2019état de la double vérification.') });
        }
      };
      useEffect(() => { charger(); }, []);

      const activer = async () => {
        setBusy(true); setMsg(null);
        try {
          /* Une tentative abandonnée (onglet fermé avant le premier code)
             laisse un facteur inachevé sur le compte, et Supabase refuse
             d'en créer un second du même nom — l'activation semblait
             cassée à jamais. On balaie d'abord tout facteur non vérifié :
             il ne protège rien, il ne fait que bloquer. */
          const { data: fs } = await sb.auth.mfa.listFactors();
          for (const f of (fs?.all || []).filter((x) => x.status !== 'verified')) {
            await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
          }
          const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Console' });
          if (error) throw error;
          setEnrolement({ id: data.id, qr: data.totp?.qr_code || '', secret: data.totp?.secret || '' });
        } catch (e) {
          setMsg({ kind: 'err', text: /not enabled|disabled/i.test(e?.message || '')
            ? 'La double vérification n\u2019est pas activée côté Supabase : Dashboard \u2192 Authentication \u2192 Multi-Factor \u2192 TOTP.'
            : humaniseErreur(e?.message || 'L\u2019activation a échoué.') });
        }
        setBusy(false);
      };

      const confirmer = async (e) => {
        e.preventDefault();
        if (!enrolement || busy) return;
        setBusy(true); setMsg(null);
        try {
          const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: enrolement.id });
          if (e1) throw e1;
          const { error: e2 } = await sb.auth.mfa.verify({ factorId: enrolement.id, challengeId: ch.id, code: code.trim() });
          if (e2) throw e2;
          setEnrolement(null); setCode('');
          setMsg({ kind: 'ok', text: 'Double vérification activée — le code vous sera demandé à chaque connexion.' });
          charger();
        } catch (err) {
          setMsg({ kind: 'err', text: /invalid|expired/i.test(err?.message || '')
            ? 'Code incorrect — regardez le nouveau code dans l\u2019application et réessayez.'
            : humaniseErreur(err?.message || 'La vérification a échoué.') });
          setCode('');
        }
        setBusy(false);
      };

      const abandonner = async () => {
        // Le facteur jamais vérifié ne doit pas traîner sur le compte.
        if (enrolement) await sb.auth.mfa.unenroll({ factorId: enrolement.id }).catch(() => {});
        setEnrolement(null); setCode(''); setMsg(null);
      };

      const desactiver = async (f) => {
        if (!confirm('Désactiver la double vérification ?\n\nVotre mot de passe redeviendra la seule protection de la console.')) return;
        setBusy(true); setMsg(null);
        const { error } = await sb.auth.mfa.unenroll({ factorId: f.id });
        setBusy(false);
        if (error) return setMsg({ kind: 'err', text: humaniseErreur(error.message) });
        setMsg({ kind: 'ok', text: 'Double vérification désactivée.' });
        charger();
      };

      const active = Array.isArray(facteurs) && facteurs.length > 0;

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Double vérification</h2>
              <p className="text-[12.5px] text-stone-500 mt-1 max-w-md leading-relaxed">
                Un code à 6 chiffres, généré par une application (Google Authenticator, 1Password…),
                demandé à chaque connexion. Même si votre mot de passe fuit, votre console reste fermée.
              </p>
            </div>
            {facteurs === undefined ? (
              <Loader2 size={16} className="animate-spin text-stone-400" />
            ) : active ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={12} /> Activée
                </span>
                <Btn onClick={() => desactiver(facteurs[0])} disabled={busy}>Désactiver</Btn>
              </div>
            ) : !enrolement && (
              <Btn icon={ShieldCheck} kind="dark" onClick={activer} disabled={busy || facteurs === null}>
                {busy ? 'Préparation…' : 'Activer'}
              </Btn>
            )}
          </div>

          {enrolement && (
            <div className="mt-6 grid sm:grid-cols-[auto_1fr] gap-6 items-start">
              {/* Supabase renvoie le QR DÉJÀ en data-URL : l'emballer une
                  seconde fois rendait l'image illisible — on ne voyait que
                  le texte de secours. On n'emballe que du SVG nu. */}
              <img alt="QR code à scanner avec votre application d'authentification"
                src={enrolement.qr.startsWith('data:') ? enrolement.qr
                  : 'data:image/svg+xml;utf8,' + encodeURIComponent(enrolement.qr)}
                className="w-44 h-44 rounded-2xl bg-white p-2 shadow-sm" />
              <div className="min-w-0">
                <ol className="text-[13px] text-stone-600 leading-relaxed list-decimal ml-4 space-y-1.5">
                  <li>Scannez ce QR code avec votre application d'authentification.</li>
                  <li>Saisissez le code à 6 chiffres qu'elle affiche.</li>
                  <li><strong>Gardez l'application</strong> : sans elle, vous ne pourrez plus entrer.</li>
                </ol>
                <div className="mt-3 flex items-center gap-2 flex-wrap text-[12px] text-stone-500">
                  <span>Pas de caméra ?</span>
                  <code className="px-2 py-1 rounded-lg bg-stone-100 text-[11px] break-all">{enrolement.secret}</code>
                  <CopyButton value={enrolement.secret} label="Copier la clé" />
                </div>
                <form onSubmit={confirmer} className="mt-4 flex items-end gap-3 flex-wrap">
                  <Field label="Code affiché par l'application">
                    <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required
                      className="text-center tracking-[0.3em] font-semibold w-40" />
                  </Field>
                  <Btn kind="dark" type="submit" disabled={busy || code.length < 6}>
                    {busy ? 'Vérification…' : 'Confirmer'}
                  </Btn>
                  <Btn onClick={abandonner} disabled={busy}>Annuler</Btn>
                </form>
              </div>
            </div>
          )}

          {msg && (
            <div className={`flex items-center gap-2 mt-4 text-[12.5px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
              {msg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>
      );
    }

    // ── Ma marque (SaaS B.3) : l'agence règle ELLE-MÊME son identité ──
    // Nom, logo, couleurs et email de contact — écrits via la RPC
    // update_my_agency_brand (owners uniquement). C'est la SEULE voie
    // d'écriture sur agencies (aucune policy UPDATE : plan, active,
    // stripe_* et autres champs sensibles restent hors de portée).
    // La marque se propage immédiatement : portail client, pages
    // événement, écran de connexion <slug>.laloge.house, emails.
    const HEX_RE = /^#[0-9a-fA-F]{6}$/;

    function BrandCard({ agency, onSaved }) {
      const [form, setForm] = useState({ name: '', logo_url: '', accent_color: '#2a2620', bg_color: '#e9e4d9', contact_email: '' });
      const [busy, setBusy] = useState(false);
      const [up, setUp] = useState(null);   // progression upload logo (0..1)
      const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }
      const fileRef = useRef(null);

      useEffect(() => {
        if (!agency) return;
        setForm({
          name: agency.name || '',
          logo_url: agency.logo_url || '',
          accent_color: agency.accent_color || '#2a2620',
          bg_color: agency.bg_color || '#e9e4d9',
          contact_email: agency.contact_email || '',
        });
      }, [agency]);

      if (!agency) return null;
      const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

      // Logo ≤ 2 Mo, uploadé sous agencies/<slug>/logo/… (préfixe
      // vérifié par b2-sign : membre de l'agence du slug uniquement).
      const uploadLogo = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setMsg(null);
        if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) {
          return setMsg({ kind: 'err', text: 'Formats acceptés : PNG, JPG, SVG ou WebP.' });
        }
        if (file.size > 2 * 1024 * 1024) {
          return setMsg({ kind: 'err', text: 'Logo trop lourd — 2 Mo maximum.' });
        }
        setUp(0);
        try {
          const url = await b2UploadFile(file, `agencies/${agency.slug}/logo/${Date.now()}-${b2SafeName(file.name)}`, setUp);
          setForm(f => ({ ...f, logo_url: url }));
        } catch (err) {
          setMsg({ kind: 'err', text: humaniseErreur(err.message || 'Upload du logo échoué.') });
        }
        setUp(null);
      };

      const save = async () => {
        setMsg(null);
        const name = form.name.trim();
        const logo = form.logo_url.trim();
        if (name.length < 2 || name.length > 80) return setMsg({ kind: 'err', text: 'Le nom du studio doit faire entre 2 et 80 caractères.' });
        if (!HEX_RE.test(form.accent_color.trim()) || !HEX_RE.test(form.bg_color.trim())) return setMsg({ kind: 'err', text: 'Couleurs au format #rrggbb (ex : #2a2620).' });
        if (logo && !/^https:\/\//i.test(logo)) return setMsg({ kind: 'err', text: 'Le logo doit être une URL https — ou passez par « Téléverser ».' });
        setBusy(true);
        const { error } = await sb.rpc('update_my_agency_brand', {
          p_name: name,
          p_logo_url: logo || null,
          p_accent_color: form.accent_color.trim().toLowerCase(),
          p_bg_color: form.bg_color.trim().toLowerCase(),
          p_contact_email: form.contact_email.trim() || null,
        });
        setBusy(false);
        if (error) {
          return setMsg({
            kind: 'err',
            text: /propriétaire/.test(error.message || '')
              ? "Seul le propriétaire de l'agence peut modifier la marque."
              : (error.message || 'Enregistrement échoué.'),
          });
        }
        setMsg({ kind: 'ok', text: 'Marque enregistrée — vos clients voient les changements immédiatement.' });
        onSaved?.();
      };

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Ma marque</h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">
              {agency.slug}.laloge.house · {PLAN_LABELS[agency.plan] || agency.plan || 'plan —'}
            </span>
          </div>
          <p className="text-[12.5px] text-stone-500 mt-2 leading-relaxed">
            Votre identité, appliquée partout : espaces clients, pages événement, écran de connexion et emails.
          </p>

          <div className="space-y-4 mt-5">
            <Field label="Nom du studio">
              <Input value={form.name} onChange={set('name')} placeholder="Studio Lumière" />
            </Field>
            <Field label="Email de contact">
              <Input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="hello@studio-lumiere.fr" />
            </Field>
            <Field label="Couleur accent">
              <div className="flex items-center gap-3">
                <input type="color" value={HEX_RE.test(form.accent_color) ? form.accent_color : '#2a2620'} onChange={set('accent_color')} aria-label="Couleur accent"
                  className="w-11 h-11 rounded-xl border-0 bg-transparent cursor-pointer shrink-0" style={neu.pressedSm} />
                <Input value={form.accent_color} onChange={set('accent_color')} className="font-mono" />
              </div>
            </Field>
            <Field label="Couleur de fond">
              <div className="flex items-center gap-3">
                <input type="color" value={HEX_RE.test(form.bg_color) ? form.bg_color : '#e9e4d9'} onChange={set('bg_color')} aria-label="Couleur de fond"
                  className="w-11 h-11 rounded-xl border-0 bg-transparent cursor-pointer shrink-0" style={neu.pressedSm} />
                <Input value={form.bg_color} onChange={set('bg_color')} className="font-mono" />
              </div>
            </Field>
            <div>
              <Field label="Logo (URL https, optionnel)">
                <div className="flex items-center gap-3 flex-wrap">
                  {form.logo_url.trim() && (
                    <div style={neu.pressedSm} className="h-11 px-2.5 rounded-xl flex items-center shrink-0">
                      <img src={form.logo_url.trim()} alt="Aperçu du logo" className="h-8 max-w-[120px] object-contain" />
                    </div>
                  )}
                  <div className="flex-1 min-w-[180px]">
                    <Input value={form.logo_url} onChange={set('logo_url')} placeholder="https://…/logo.png" />
                  </div>
                  <Btn icon={Upload} onClick={() => fileRef.current?.click()} disabled={up != null}>
                    {up != null ? `Téléversement… ${Math.round(up * 100)} %` : 'Téléverser'}
                  </Btn>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={uploadLogo} />
                </div>
              </Field>
            </div>
          </div>

          {msg && (
            <div className={`flex items-center gap-2 mt-4 text-[12.5px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
              {msg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
              {msg.text}
            </div>
          )}
          <div className="mt-5">
            <Btn kind="dark" icon={busy ? Loader2 : Save} onClick={save} disabled={busy || up != null}>
              {busy ? 'Enregistrement…' : 'Enregistrer ma marque'}
            </Btn>
          </div>
        </div>
      );
    }

    function Overview({ clients, totalMedia, totalRevenue, upcomingShoots, storage, billing, agency, refreshBrand }) {
      const pct = storage?.quota_bytes ? Math.round((storage.used_bytes || 0) / storage.quota_bytes * 100) : null;
      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Stats — 2 col mobile, 4 col desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            <StatCard dark label="Clients actifs" value={clients.filter(c => c.active).length} />
            <StatCard label="Revenus totaux" value={`${totalRevenue.toLocaleString('fr-FR')} €`} />
            <StatCard label="Médias livrés" value={totalMedia} />
            <StatCard label="Tournages prévus" value={upcomingShoots} />
          </div>

          {/* Stockage (SaaS B.3) — jauge + alerte à 80 % du plan */}
          {storage && (
            <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Stockage</h2>
                <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">
                  Plan {storage.plan || 'fondateur'}{storage.measured_at ? ` · mesuré le ${new Date(storage.measured_at).toLocaleDateString('fr-FR')}` : ''}
                </span>
              </div>
              <StorageGauge storage={storage} compact />
              {pct != null && pct >= 80 && (
                <div className="flex items-center gap-2 mt-4 text-[12.5px] text-amber-700">
                  <AlertCircle size={14} className="shrink-0" />
                  {pct >= 100
                    ? 'Quota dépassé — vos uploads continuent de fonctionner (dépassement souple), pensez à passer au palier supérieur.'
                    : `Vous approchez de votre quota (${pct} %). Pensez au palier supérieur pour rester serein.`}
                </div>
              )}
            </div>
          )}

          {/* Ma marque, Abonnement et Sécurité vivent dans « Paramètres »
              (pastille en bas du menu) depuis le 22/07/2026. */}

          {/* Hero card */}
          <div style={neu.dark} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-[0.12] pointer-events-none" style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(30%, -50%)' }} />
            <h2 className="text-[24px] lg:text-[30px] tracking-tight leading-tight max-w-2xl relative" style={SERIF}>
              Tout votre studio depuis un seul espace.
            </h2>
            <p className="text-[13px] lg:text-[14px] text-stone-300 mt-3 max-w-xl leading-relaxed relative">
              Ajoutez de nouveaux clients, livrez des médias, créez des factures et planifiez vos tournages. Vos clients verront les changements instantanément.
            </p>
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       ⚙️ PARAMÈTRES — marque, abonnement (avec résiliation), sécurité
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       💼 MÉTIERS DE MA LOGE (25/07/2026)
       ════════════════════════════════════════════════════════════
       Une loge se vend par métier : ce que l'agence possède, et ce
       qu'elle pourra ajouter. L'ajout et la résiliation existent déjà
       côté serveur (stripe-billing : univers-checkout / univers-cancel),
       mais les métiers ne sont pas encore ouverts à la vente — ils sont
       donc montrés « bientôt », sans bouton actif. On annonce la
       trajectoire, on ne promet rien qu'on ne sache servir.
       ════════════════════════════════════════════════════════════ */
    function MetiersCard() {
      const mien = (u) => MES_METIERS_DETAIL.find(m => m.universe === u) || null;
      const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR');
      if (!MES_METIERS_DETAIL.length) return null;   // avant migration : rien à dire

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
          <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Ma loge</div>
          <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1" style={SERIF}>Métiers</h3>
          <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2 leading-relaxed">
            Vous créez des espaces clients dans les métiers de votre loge. Vous pourrez en
            ajouter d'autres — et les retirer quand vous voulez, en gardant l'usage jusqu'à
            la fin de la période déjà réglée.
          </p>

          <div className="space-y-2.5 mt-4">
            {METIERS.map((m) => {
              const a = mien(m.value);
              const enSursis = a && a.status === 'cancelling' && a.valid_until;
              return (
                <div key={m.value} style={a ? neu.pressedSm : {}}
                  className={`rounded-2xl px-4 py-3.5 flex items-start justify-between gap-3 ${a ? '' : 'opacity-60'}`}>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{m.label}</div>
                    <div className="text-[11.5px] text-stone-500 mt-0.5 leading-snug">{m.hint}</div>
                    {enSursis && (
                      <div className="text-[11.5px] text-amber-600 mt-1.5 font-medium">
                        Résilié — utilisable jusqu'au {dateFr(a.valid_until)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {a ? (
                      <span className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-stone-500">
                        {a.source === 'inclus' ? 'Compris' : 'Option'}
                      </span>
                    ) : (
                      <span className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-stone-400">
                        Bientôt
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11.5px] text-stone-400 mt-4 leading-relaxed">
            L'ajout de métiers ouvrira prochainement. Écrivez-nous en attendant : nous
            activons manuellement les studios qui en ont besoin.
          </p>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       ⏰ RAPPELS AUTOMATIQUES (01/08/2026)
       ════════════════════════════════════════════════════════════
       Ce qui part tout seul, et à quelle heure. Les réglages vivent
       dans agencies.rappels (jsonb) ; ABSENT = tout actif à 9 h — le
       comportement d'hier, aucune agence existante ne change. Écrits
       par la RPC update_my_agency_rappels (owner/admin), lus par le
       cron scheduled-notifications : il passe toutes les heures et
       envoie au premier passage À PARTIR de l'heure choisie — un
       passage raté se rattrape à l'heure suivante, jamais de trou. */
    function RappelsCard() {
      const DEFAUTS = {
        tournages: { actif: true, heure: 9 },
        factures:  { actif: true, heure: 9 },
        sorties:   { actif: true, heure: 9 },
      };
      const [regl, setRegl] = useState(null);   // null = chargement
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState(null);

      useEffect(() => {
        (async () => {
          /* Colonne demandée À PART (motif beta_chat) : avant la
             migration, PostgREST rejetterait la requête entière —
             ici, au pire, la carte montre les valeurs par défaut. */
          const { data, error } = await sb.from('agencies').select('rappels').limit(1).maybeSingle();
          const r = (!error && data?.rappels && typeof data.rappels === 'object') ? data.rappels : {};
          setRegl({
            tournages: { ...DEFAUTS.tournages, ...(r.tournages || {}) },
            factures:  { ...DEFAUTS.factures,  ...(r.factures  || {}) },
            sorties:   { ...DEFAUTS.sorties,   ...(r.sorties   || {}) },
          });
        })();
      }, []);

      const LIGNES = [
        { id: 'tournages', icon: Camera, titre: 'Tournages',
          desc: 'Vos clients sont prévenus 7 jours puis 1 jour avant leur tournage.' },
        { id: 'factures', icon: FileText, titre: 'Factures',
          desc: "Vos clients sont relancés autour de l'échéance d'une facture impayée." },
        ...(MES_METIERS.includes('communication') || FEATURES.allUniverses
          ? [{ id: 'sorties', icon: Send, titre: 'Sorties à publier',
              desc: 'Votre équipe reçoit la liste de ce qui doit sortir dans la journée.' }]
          : []),
      ];

      const save = async () => {
        setBusy(true); setMsg(null);
        const { error } = await sb.rpc('update_my_agency_rappels', { p_rappels: regl });
        setBusy(false);
        if (error) {
          return setMsg({ kind: 'err', text: /update_my_agency_rappels/.test(error.message || '')
            ? 'Les réglages de rappels ne sont pas encore activés : exécutez files/migration-rappels-reglables.sql dans Supabase.'
            : humaniseErreur(error.message) });
        }
        setMsg({ kind: 'ok', text: 'Rappels enregistrés — ils s’appliquent dès la prochaine tournée.' });
      };

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Rappels automatiques</h2>
          <p className="text-[12.5px] text-stone-500 mt-2 leading-relaxed">
            Choisissez ce qui part tout seul, et à quelle heure.
          </p>

          {regl === null ? (
            <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
          ) : (
            <div className="space-y-2.5 mt-5">
              {LIGNES.map(({ id, icon: Icone, titre, desc }) => {
                const l = regl[id];
                return (
                  <div key={id} className="space-y-2">
                    <button type="button" role="switch" aria-checked={l.actif}
                      onClick={() => setRegl(r => ({ ...r, [id]: { ...r[id], actif: !r[id].actif } }))}
                      style={l.actif ? neu.dark : neu.pressedSm}
                      className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between gap-3 transition ${l.actif ? 'text-white' : 'text-stone-700'}`}>
                      <div className="flex items-center gap-3 text-left min-w-0">
                        <Icone size={17} className="shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px]">{titre}</div>
                          <div className={`text-[10.5px] mt-0.5 ${l.actif ? 'text-stone-300' : 'text-stone-500'}`}>{desc}</div>
                        </div>
                      </div>
                      <div className={`w-10 h-5.5 rounded-full p-0.5 transition shrink-0 ${l.actif ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${l.actif ? 'translate-x-4' : ''}`} />
                      </div>
                    </button>
                    {l.actif && (
                      <div className="flex items-center gap-2.5 pl-5">
                        <Clock size={13} className="text-stone-400 shrink-0" />
                        <label className="text-[12px] text-stone-500" htmlFor={`rappel-heure-${id}`}>Heure d'envoi</label>
                        <select id={`rappel-heure-${id}`} value={l.heure}
                          onChange={(e) => setRegl(r => ({ ...r, [id]: { ...r[id], heure: Number(e.target.value) } }))}
                          style={neu.pressedSm}
                          className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-transparent text-[16px] sm:text-[13.5px] appearance-none">
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>{h} h</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11.5px] text-stone-400 mt-4 leading-relaxed">
            Le facteur passe toutes les heures : chaque rappel part au premier
            passage à partir de l'heure choisie, jamais deux fois.
          </p>

          {msg && (
            <div className={`flex items-center gap-2 mt-4 text-[12.5px] ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
              {msg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
              {msg.text}
            </div>
          )}
          <div className="mt-5">
            <Btn kind="dark" icon={busy ? Loader2 : Save} onClick={save} disabled={busy || regl === null}>
              {busy ? 'Enregistrement…' : 'Enregistrer les rappels'}
            </Btn>
          </div>
        </div>
      );
    }

    function SettingsView({ billing, agency, refreshBrand }) {
      /* Un « membre » ne règle que SON compte : mot de passe et double
         vérification. La marque, l'abonnement, les métiers et les
         rappels appartiennent au studio — le serveur le vérifie déjà
         (RPC owner/admin), l'écran cesse simplement de proposer des
         portes qui ne s'ouvrent pas. */
      if (MON_ROLE.value === 'membre') {
        return (
          <div className="space-y-5 lg:space-y-6">
            <PasswordCard />
            <MfaCard />
          </div>
        );
      }
      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Ma marque (SaaS B.3) — l'agence règle sa propre identité */}
          <BrandCard agency={agency} onSaved={refreshBrand} />

          {/* Métiers de la loge (vente par métier — 25/07/2026) */}
          <MetiersCard />

          {/* Rappels automatiques — quoi, et à quelle heure */}
          <RappelsCard />

          {/* Abonnement (SaaS B.3 — Stripe) + Se désabonner */}
          <BillingCard billing={billing} />

          {/* Sécurité — changement de mot de passe */}
          <PasswordCard />

          {/* Double vérification (2FA) */}
          <MfaCard />
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       ✅ BIEN DÉMARRER (UX vague 1) — trois étapes cochées d'après
       l'ÉTAT RÉEL du compte, jamais d'après un stockage local :
       ① marque réglée (ligne agence), ② premier espace (liste),
       ③ invitation copiée (métadonnées du compte). La carte
       disparaît d'elle-même quand tout est fait. Locataires only.
       ════════════════════════════════════════════════════════════ */
    function StartChecklist({ agency, clients, user, gotoSettings, onNew, onOpenFirst }) {
      const marqueOk = !!(agency && (agency.logo_url || agency.contact_email
        || (agency.accent_color && agency.accent_color.toLowerCase() !== '#2a2620')
        || (agency.bg_color && agency.bg_color.toLowerCase() !== '#e9e4d9')));
      const espaceOk = clients.length > 0;
      const invitOk = !!(user && user.user_metadata && user.user_metadata.laloge_invitation_copiee);
      if (marqueOk && espaceOk && invitOk) return null;
      const etapes = [
        { ok: marqueOk, titre: 'Réglez votre marque', detail: 'Nom, logo, couleurs — vos clients ne verront que vous.', action: gotoSettings },
        { ok: espaceOk, titre: 'Créez votre premier espace client', detail: 'Deux prénoms et un email suffisent.', action: onNew },
        { ok: invitOk, titre: 'Envoyez son invitation à votre client', detail: 'Sur sa fiche : « Copier l\'invitation », puis collez-la dans un message.', action: espaceOk ? onOpenFirst : onNew },
      ];
      const faits = etapes.filter(e => e.ok).length;
      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Bien démarrer</h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">{faits}/3</span>
          </div>
          <div className="mt-4 space-y-3">
            {etapes.map(e => (
              <button key={e.titre} type="button" onClick={e.ok ? undefined : e.action} disabled={e.ok}
                style={e.ok ? {} : neu.raisedXs}
                className={`w-full flex items-center gap-3.5 px-4 py-3 min-h-[52px] rounded-2xl text-left transition ${e.ok ? 'opacity-60' : 'active:scale-[0.99]'}`}>
                {e.ok
                  ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  : <span style={neu.pressedSm} className="w-5 h-5 rounded-full shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] font-semibold ${e.ok ? 'line-through text-stone-400' : 'text-stone-800'}`}>{e.titre}</span>
                  {!e.ok && <span className="block text-[12px] text-stone-500 mt-0.5">{e.detail}</span>}
                </span>
                {!e.ok && <ChevronRight size={16} className="shrink-0 text-stone-400" />}
              </button>
            ))}
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📈 REVENUS — rapport financier mensuel (22/07/2026)
       CA depuis les factures PAYÉES de toute l'agence (la RLS borne
       déjà la lecture), estimation des cotisations URSSAF et de
       l'impôt selon le statut. Les taux sont PRÉREMPLIS (valeurs en
       vigueur) mais MODIFIABLES : ils changent chaque année et selon
       les situations (ACRE…). Estimation indicative, jamais un
       substitut au comptable — c'est écrit sous le rapport.
       Config persistée sur le COMPTE (user_metadata), comme le guide.
       ════════════════════════════════════════════════════════════ */
    const STATUTS_FISCAUX = {
      micro_bnc: { label: 'Micro-entreprise — activité libérale (BNC)', urssaf: 26.1, vflTaux: 2.2, abattement: 0.34 },
      micro_bic: { label: 'Micro-entreprise — prestations de services (BIC)', urssaf: 21.2, vflTaux: 1.7, abattement: 0.50 },
      autre:     { label: 'Autre statut — taux de charges manuel', urssaf: 45, vflTaux: null, abattement: 0 },
    };
    // Barème IR (loi de finances 2025, 1 part) — à titre indicatif.
    const BAREME_IR = [[11497, 0], [29315, 0.11], [83823, 0.30], [180294, 0.41], [Infinity, 0.45]];
    const irBareme = (revenu) => {
      let ir = 0, prev = 0;
      for (const [plafond, taux] of BAREME_IR) {
        if (revenu > prev) ir += (Math.min(revenu, plafond) - prev) * taux;
        prev = plafond;
        if (revenu <= plafond) break;
      }
      return ir;
    };
    const MOIS_INDEX = { janvier:0, fevrier:1, février:1, mars:2, avril:3, mai:4, juin:5,
      juillet:6, aout:7, août:7, septembre:8, octobre:9, novembre:10, decembre:11, décembre:11 };
    const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

    /* ══════════════════════════════════════════════════════════════
       AGENDA — le calendrier éditorial du métier Communication
       ══════════════════════════════════════════════════════════════
       Une seule grille où cohabitent ce qu'on FILME (les tournages) et
       ce qui SORT (les publications programmées) : c'est la vue qu'une
       agence veut le lundi matin. Les deux viennent d'un seul appel —
       agenda_agence() les rend déjà triés, la page n'a rien à refondre
       à chaque changement de mois. */
    const RESEAUX = {
      instagram: { l: 'Instagram', c: '#c13584' },
      tiktok:    { l: 'TikTok',    c: '#0f0f10' },
      linkedin:  { l: 'LinkedIn',  c: '#0a66c2' },
      facebook:  { l: 'Facebook',  c: '#1259c4' },   // 6,5:1 sous texte blanc (le bleu officiel tombait à 4,2)
      youtube:   { l: 'YouTube',   c: '#c4302b' },
      autre:     { l: 'Autre',     c: '#6b6357' },
    };
    const STATUTS_POST = {
      idee:       'Idée',
      tournage:   'À tourner',
      montage:    'Au montage',
      validation: 'Chez le client',
      programme:  'Programmé',
      publie:     'Publié',
      abandonne:  'Abandonné',
    };
    const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    /* Clé de jour LOCALE. toISOString() bascule en UTC et décale d'un
       jour tout ce qui tombe après 22h en été — une sortie du mardi 23h
       se serait rangée au mercredi. */
    const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hhmm = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    function AgendaTab({ clients }) {
      const [mois, setMois] = useState(() => { const d = new Date(); d.setDate(1); return d; });
      const [agenda, setAgenda] = useState(null);   // null = chargement
      const [err, setErr] = useState('');
      const [nouveau, setNouveau] = useState(false);
      const [ouvert, setOuvert] = useState(null);   // post dont la fiche est ouverte
      const [tour, setTour] = useState(0);          // force le rechargement de la chaîne
      const [urgents, setUrgents] = useState(null); // sorties du jour + en retard

      // Les bornes du mois affiché, en dates locales.
      const debut = useMemo(() => new Date(mois.getFullYear(), mois.getMonth(), 1), [mois]);
      const fin   = useMemo(() => new Date(mois.getFullYear(), mois.getMonth() + 1, 0), [mois]);

      const charger = async () => {
        setErr('');
        const { data, error } = await sb.rpc('agenda_agence', {
          p_du: cleJour(debut), p_au: cleJour(fin),
        });
        if (error) {
          setErr(/agenda_agence/.test(error.message || '')
            ? "L'agenda n'est pas encore activé : exécutez files/migration-comm-calendrier.sql dans Supabase."
            : humaniseErreur(error.message));
          setAgenda({ tournages: [], sorties: [] });
          return;
        }
        setAgenda(data || { tournages: [], sorties: [] });
      };
      useEffect(() => { setAgenda(null); charger(); }, [mois]);

      /* Ce qui n'attend pas le calendrier : les sorties à publier
         AUJOURD'HUI et celles dont l'heure est passée sans que
         personne ne coche « publié ». Le calendrier est mensuel — une
         sortie en retard du mois dernier en serait invisible : cette
         requête-ci regarde tout le passé, quel que soit le mois
         affiché. La RLS borne à l'agence, comme partout. */
      const chargerUrgents = async () => {
        const finJour = new Date(); finJour.setHours(23, 59, 59, 999);
        const { data } = await sb.from('post_sorties')
          .select('*, posts!inner(*)')
          .is('publie_le', null)
          .not('prevue_le', 'is', null)
          .lte('prevue_le', finJour.toISOString())
          .order('prevue_le')
          .limit(30);
        const auj = cleJour(new Date());
        const vivantes = (data || []).filter((s) => s.posts?.statut !== 'abandonne');
        setUrgents({
          retard: vivantes.filter((s) => cleJour(new Date(s.prevue_le)) < auj),
          jour:   vivantes.filter((s) => cleJour(new Date(s.prevue_le)) === auj),
        });
      };
      useEffect(() => { chargerUrgents(); }, [tour]);

      /* Cocher « publié » sans ouvrir la fiche : c'est LE geste que le
         rappel du matin demande — il doit tenir en un tap. */
      const cocherPubliee = async (s) => {
        const { error } = await sb.from('post_sorties')
          .update({ publie_le: new Date().toISOString() }).eq('id', s.id);
        if (!error) { chargerUrgents(); setTour((t) => t + 1); }
      };

      /* L'éditorial est un privilège (audit du 01/08/2026) : un
         plancher LIT l'agenda — programmer et cocher appartiennent
         aux privilégiés, et la base tient la même règle. */
      const peutPublier = MON_ROLE.value !== 'membre' || MES_PRIVILEGES.includes('posts');

      /* Les cases de la grille : on remonte au lundi qui précède le 1er
         et on descend jusqu'au dimanche qui suit le dernier. Une grille
         qui commencerait au 1er ferait glisser les colonnes de semaine
         en semaine, et on ne lirait plus « tous mes mardis ». */
      const cases = useMemo(() => {
        const premier = new Date(debut);
        const recul = (premier.getDay() + 6) % 7;          // 0 = lundi
        premier.setDate(premier.getDate() - recul);
        const liste = [];
        for (let i = 0; i < 42; i++) {
          const d = new Date(premier);
          d.setDate(premier.getDate() + i);
          liste.push(d);
          if (i >= 34 && d >= fin && d.getDay() === 0) break;
        }
        return liste;
      }, [debut, fin]);

      // Rangement par jour, une seule passe.
      const parJour = useMemo(() => {
        const m = {};
        const poser = (cle, item) => { (m[cle] = m[cle] || { tournages: [], sorties: [] })[item.genre].push(item); };
        (agenda?.tournages || []).forEach((t) => poser(t.jour, { ...t, genre: 'tournages' }));
        (agenda?.sorties || []).forEach((s) => {
          if (s.prevue_le) poser(cleJour(new Date(s.prevue_le)), { ...s, genre: 'sorties' });
        });
        return m;
      }, [agenda]);

      const moisLabel = debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const aujourdhui = cleJour(new Date());
      const nTournages = (agenda?.tournages || []).length;
      const nSorties = (agenda?.sorties || []).length;

      return (
        <div>
          {/* Le titre « Agenda » vit dans l'en-tête général (titles),
              comme pour toutes les sections — ici, seulement l'action. */}
          <div className="flex justify-end mb-5">
            {peutPublier && (
              <Btn kind="dark" icon={Plus} onClick={() => setNouveau(true)}>Programmer un post</Btn>
            )}
          </div>

          {urgents && (urgents.jour.length + urgents.retard.length) > 0 && (
            <div style={neu.raised} className="rounded-[22px] lg:rounded-[24px] p-4 lg:p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Send size={14} className="text-stone-500" />
                <h2 className="text-[15px] font-semibold">À publier</h2>
                {urgents.retard.length > 0 && (
                  <span className="text-[11.5px] text-rose-600 font-semibold">
                    {urgents.retard.length} en retard
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {[...urgents.retard.map((s) => ({ s, enRetard: true })),
                  ...urgents.jour.map((s) => ({ s, enRetard: false }))].map(({ s, enRetard }) => {
                  const nomClient = clients.find((c) => c.id === s.posts?.client_id)?.name || '';
                  const quand = enRetard
                    ? `${new Date(s.prevue_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${hhmm(s.prevue_le)}`
                    : hhmm(s.prevue_le);
                  return (
                    <div key={s.id}
                      className={`flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-1 ${enRetard ? 'bg-rose-50' : ''}`}
                      style={enRetard ? undefined : neu.pressedSm}>
                      <button onClick={() => setOuvert(s.posts)}
                        className="flex-1 min-w-0 min-h-[44px] flex items-center gap-2.5 text-left">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: RESEAUX[s.reseau]?.c || '#6b6357' }} />
                        <span className={`text-[12.5px] font-semibold tabular-nums shrink-0 ${enRetard ? 'text-rose-700' : ''}`}>
                          {quand}
                        </span>
                        <span className="text-[13px] truncate">{s.posts?.title}</span>
                        {nomClient && (
                          <span className="text-[11.5px] text-stone-500 truncate hidden sm:inline">· {nomClient}</span>
                        )}
                      </button>
                      {peutPublier && (
                        <button onClick={() => cocherPubliee(s)} style={neu.raisedXs}
                          title={`Marquer la sortie ${RESEAUX[s.reseau]?.l || s.reseau} comme publiée`}
                          className="min-h-[44px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-semibold shrink-0 active:scale-95 transition-transform">
                          <Check size={13} /> Publié
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <button onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
                  aria-label="Mois précédent" style={neu.raisedXs}
                  className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                  <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <div className="text-[15px] font-semibold min-w-[150px] text-center capitalize">{moisLabel}</div>
                <button onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
                  aria-label="Mois suivant" style={neu.raisedXs}
                  className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                  <ChevronRight size={15} />
                </button>
                <Btn onClick={() => { const d = new Date(); d.setDate(1); setMois(d); }}>Ce mois-ci</Btn>
              </div>
              <div className="flex items-center gap-4 text-[11.5px] text-stone-500">
                <span className="flex items-center gap-1.5"><Camera size={12} /> {nTournages} tournage{nTournages > 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1.5"><Send size={12} /> {nSorties} sortie{nSorties > 1 ? 's' : ''}</span>
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
              </div>
            )}

            {agenda === null ? (
              <div className="py-16 flex justify-center"><Loader2 size={18} className="animate-spin text-stone-400" /></div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {JOURS_COURTS.map((j) => (
                    <div key={j} className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold text-center py-1">{j}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {cases.map((d) => {
                    const cle = cleJour(d);
                    const dedans = d.getMonth() === debut.getMonth();
                    const jour = parJour[cle] || { tournages: [], sorties: [] };
                    const cestAujourdhui = cle === aujourdhui;
                    return (
                      <div key={cle}
                        style={jour.tournages.length || jour.sorties.length ? neu.pressedSm : undefined}
                        className={`rounded-xl p-1.5 min-h-[84px] ${dedans ? '' : 'opacity-35'}`}>
                        <div className={`text-[11px] font-semibold mb-1 flex items-center justify-center w-6 h-6 rounded-full ${cestAujourdhui ? 'bg-stone-900 text-white' : 'text-stone-500'}`}>
                          {d.getDate()}
                        </div>
                        <div className="flex flex-col gap-1">
                          {jour.tournages.map((t) => (
                            <div key={t.id} title={`${t.titre}${t.lieu ? ' — ' + t.lieu : ''}${t.client ? ' · ' + t.client : ''}`}
                              className="text-[9.5px] leading-tight rounded-md px-1.5 py-1 bg-stone-800 text-white truncate">
                              {t.debut ? String(t.debut).slice(0, 5) + ' ' : ''}{t.type === 'video' ? '🎥' : '📸'} {t.titre}
                            </div>
                          ))}
                          {jour.sorties.map((s) => (
                            <div key={s.id} title={`${s.titre} · ${RESEAUX[s.reseau]?.l || s.reseau}${s.client ? ' · ' + s.client : ''}`}
                              className="text-[9.5px] leading-tight rounded-md px-1.5 py-1 text-white truncate"
                              style={{ background: RESEAUX[s.reseau]?.c || '#6b6357' }}>
                              {hhmm(s.prevue_le)} {s.titre}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!nTournages && !nSorties && !err && (
                  <p className="text-[12.5px] text-stone-500 text-center mt-5 leading-relaxed">
                    Rien de prévu ce mois-ci. Les tournages arrivent des fiches clients ;
                    les publications se programment avec le bouton ci-dessus.
                  </p>
                )}
              </>
            )}
          </div>

          <Pipeline clients={clients} rafraichir={tour}
            onOuvrir={(p2) => setOuvert(p2)} />

          {/* Les tâches et l'équipe vivent dans l'onglet « Équipe »
              (demande de Gil du 01/08/2026) — l'Agenda garde la grille
              et la chaîne éditoriale. */}

          {nouveau && (
            <PostForm clients={clients} onClose={() => setNouveau(false)}
              onSaved={() => { setNouveau(false); charger(); setTour((t) => t + 1); }} />
          )}
          {ouvert && (
            <PostDetail post={ouvert} clients={clients}
              onClose={() => setOuvert(null)}
              onSaved={() => { setOuvert(null); charger(); setTour((t) => t + 1); }} />
          )}
        </div>
      );
    }

    /* ── L'état d'un post se DÉDUIT des faits ──────────────────────
       Un statut qu'on change à la main ment le lendemain : on oublie de
       le bouger, et le tableau raconte une histoire périmée. Ici l'état
       découle de ce qui EXISTE — un tournage passé, un montage livré,
       une validation client, une sortie datée puis publiée. La seule
       décision qui reste humaine est « abandonné ».

       `media.approval_status` fait foi pour la validation : c'est le
       circuit qui tourne déjà, avec ses emails et ses commentaires. On
       ne le double pas, on le lit. */
    const etatDeduit = ({ shoot, media, sorties, statut }) => {
      if (statut === 'abandonne') return 'abandonne';
      if ((sorties || []).some((s) => s.publie_le)) return 'publie';
      const valide = media && media.approval_status === 'approved';
      if (valide && (sorties || []).some((s) => s.prevue_le)) return 'programme';
      if (media && !valide) return 'validation';
      /* Approuvé mais sans date : aucun des sept états ne dit
         exactement « prêt, reste à dater ». Plutôt que d'inventer un
         huitième (et une migration de plus), on le range dans
         « Programmé » et la fiche AFFICHE « à dater » en ambre — le
         tableau ne ment pas, il montre ce qui manque. */
      if (media) return 'programme';
      const auj = new Date();
      const cleAujDeduit = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`;
      if (shoot && shoot.date_iso && shoot.date_iso <= cleAujDeduit) return 'montage';
      if (shoot) return 'tournage';
      return 'idee';
    };

    /* ── La fiche d'un post ────────────────────────────────────────
       C'est ici qu'on RELIE : le tournage d'où vient l'image, le montage
       livré, les sorties prévues. À chaque lien posé, l'étape se
       recalcule et s'enregistre — la chaîne se remplit d'elle-même. */
    function PostDetail({ post, clients, onClose, onSaved }) {
      const [shoots, setShoots] = useState([]);
      const [medias, setMedias] = useState([]);
      const [sorties, setSorties] = useState([]);
      const [shootId, setShootId] = useState(post.shoot_id || '');
      const [mediaId, setMediaId] = useState(post.media_id || '');
      const [brief, setBrief] = useState(post.brief || '');
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const [nouvReseau, setNouvReseau] = useState('instagram');
      const [nouvJour, setNouvJour] = useState('');
      const [nouvHeure, setNouvHeure] = useState('18:00');

      const chargerSorties = async () => {
        const { data } = await sb.from('post_sorties').select('*').eq('post_id', post.id).order('prevue_le');
        setSorties(data || []);
      };

      useEffect(() => {
        chargerSorties();
        if (!post.client_id) { setShoots([]); setMedias([]); return; }
        sb.from('shoots').select('id,title,date_iso,type').eq('client_id', post.client_id)
          .order('date_iso', { ascending: false })
          .then(({ data }) => setShoots(data || []));
        sb.from('media').select('id,title,approval_status,date_iso').eq('client_id', post.client_id)
          .order('created_at', { ascending: false })
          .then(({ data }) => setMedias(data || []));
      }, [post.id]);

      /* ── Les tâches du post : la chaîne distribue le travail ─────
         « Tourner », « Monter », « Publier »… assignées ICI, là où le
         contexte vit. Elles retombent dans l'onglet Équipe (post_id et
         client_id posés), et l'assigné reçoit son email. */
      const [equipe, setEquipe] = useState([]);
      const [taches, setTaches] = useState(null);
      const [tTitre, setTTitre] = useState('');
      const [tPour, setTPour] = useState('');
      const [tQuand, setTQuand] = useState('');
      const [busyTache, setBusyTache] = useState(false);
      /* Audit du 01/08/2026 : un plancher ouvrait cette fiche et
         pouvait tout y faire — reprogrammer, supprimer le post,
         distribuer des tâches. Deux privilèges tranchent : `posts`
         (l'éditorial) et `taches` (la distribution). Sans eux, la
         fiche se LIT — l'agenda du plancher doit montrer, pas offrir
         des portes que la base refuse. */
      const peutPublier = MON_ROLE.value !== 'membre' || MES_PRIVILEGES.includes('posts');
      const peutDonner = MON_ROLE.value !== 'membre' || MES_PRIVILEGES.includes('taches');
      const [moiId, setMoiId] = useState(null);
      useEffect(() => { sb.auth.getUser().then(({ data }) => setMoiId(data?.user?.id || null)); }, []);

      /* ── Le fichier du Drive rattaché (rush, export) ─────────────
         La matière INTERNE du post — à ne pas confondre avec le
         « Montage livré » (media), qui est la livraison au client
         avec son circuit de validation. Brouillon comme les autres
         liens : « Enregistrer » confirme. */
      const [driveId, setDriveId] = useState(post.drive_id || '');
      const [fichierDrive, setFichierDrive] = useState(null);
      const [montrerDrive, setMontrerDrive] = useState(false);
      const [rechDrive, setRechDrive] = useState('');
      const [listeDrive, setListeDrive] = useState(null);
      useEffect(() => {
        if (!driveId) { setFichierDrive(null); return; }
        sb.from('drive_items').select('*').eq('id', driveId).maybeSingle()
          .then(({ data }) => setFichierDrive(data || null));
      }, [driveId]);
      useEffect(() => {
        if (!montrerDrive) return;
        const t = setTimeout(async () => {
          let q = sb.from('drive_items').select('*').neq('genre', 'dossier')
            .order('created_at', { ascending: false }).limit(40);
          if (rechDrive.trim()) q = q.ilike('nom', `%${rechDrive.trim()}%`);
          const { data } = await q;
          setListeDrive(data || []);
        }, 300);
        return () => clearTimeout(t);
      }, [montrerDrive, rechDrive]);

      const chargerTaches = async () => {
        const { data } = await sb.from('tasks').select('*').eq('post_id', post.id)
          .order('fait_le', { nullsFirst: true }).order('due_on', { nullsFirst: false });
        setTaches(data || []);
      };
      useEffect(() => {
        chargerTaches();
        sb.rpc('equipe_agence').then(({ data }) => setEquipe(data || [])).catch(() => {});
      }, [post.id]);

      const ajouterTache = async () => {
        if (!tTitre.trim() || busyTache) return;
        setBusyTache(true); setErr('');
        const { data: { user: moiU } } = await sb.auth.getUser();
        const { data: saved, error } = await sb.from('tasks').insert({
          agency_id: AGENCY.id, post_id: post.id, client_id: post.client_id || null,
          titre: tTitre.trim(), assigne_a: tPour || moiU?.id || null, due_on: tQuand || null,
        }).select().single();
        setBusyTache(false);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        if (saved) {
          signalerAssignation({
            taskId: saved.id, assigneA: saved.assigne_a, titre: saved.titre, dueOn: saved.due_on,
            clientNom: (clients.find((c) => c.id === post.client_id) || {}).name,
          });
        }
        setTTitre(''); setTQuand('');
        chargerTaches();
      };

      const basculerTache = async (t) => {
        await sb.from('tasks').update({ fait_le: t.fait_le ? null : new Date().toISOString() }).eq('id', t.id);
        chargerTaches();
      };
      const retirerTache = async (t) => {
        if (!confirm(`Supprimer « ${t.titre} » ?`)) return;
        await sb.from('tasks').delete().eq('id', t.id);
        chargerTaches();
      };
      const nomEquipier = (id) => (equipe.find((m) => m.user_id === id) || {}).nom || '—';
      const donneeParPost = (t) => {
        if (!t.cree_par || t.cree_par === t.assigne_a) return null;
        const m = equipe.find((x) => x.user_id === t.cree_par);
        if (!m) return 'donnée par un ancien coéquipier';
        const fonction = m.metier || ROLES_EQUIPE[m.role] || '';
        return `donnée par ${m.nom}${fonction ? ` (${fonction})` : ''}`;
      };

      const shoot = shoots.find((x) => x.id === shootId) || null;
      const media = medias.find((x) => x.id === mediaId) || null;
      const etat = etatDeduit({ shoot, media, sorties, statut: post.statut });

      const enregistrer = async () => {
        setBusy(true); setErr('');
        const { error } = await sb.from('posts').update({
          shoot_id: shootId || null,
          media_id: mediaId || null,
          brief: brief.trim() || null,
          statut: etat,
          updated_at: new Date().toISOString(),
          /* `drive_id` seulement si la colonne existe (le rang vient
             d'un select('*')) ou si un fichier vient d'être choisi :
             la nommer avant la migration ferait échouer TOUT
             l'enregistrement (règle PostgREST). */
          ...(driveId || post.drive_id !== undefined ? { drive_id: driveId || null } : {}),
        }).eq('id', post.id);
        setBusy(false);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        onSaved();
      };

      const ajouterSortie = async () => {
        if (!nouvJour) { setErr('Choisissez une date de sortie.'); return; }
        setErr('');
        const { error } = await sb.from('post_sorties').insert({
          post_id: post.id, reseau: nouvReseau,
          prevue_le: new Date(`${nouvJour}T${nouvHeure || '00:00'}`).toISOString(),
        });
        if (error) {
          setErr(/duplicate|unique/i.test(error.message)
            ? `Ce post a déjà une sortie sur ${RESEAUX[nouvReseau]?.l || nouvReseau}.`
            : humaniseErreur(error.message));
          return;
        }
        setNouvJour('');
        chargerSorties();
      };

      const basculerPublie = async (x) => {
        await sb.from('post_sorties')
          .update({ publie_le: x.publie_le ? null : new Date().toISOString() }).eq('id', x.id);
        chargerSorties();
      };
      const retirerSortie = async (x) => {
        if (!confirm(`Retirer la sortie ${RESEAUX[x.reseau]?.l || x.reseau} ?`)) return;
        await sb.from('post_sorties').delete().eq('id', x.id);
        chargerSorties();
      };

      const supprimerPost = async () => {
        if (!confirm(`Supprimer « ${post.title} » ?\n\nSes sorties programmées et ses tâches partent avec. Irréversible.`)) return;
        await sb.from('posts').delete().eq('id', post.id);
        onSaved();
      };

      const nomClient = (clients || []).find((c) => c.id === post.client_id)?.name;

      return (
        <Modal onClose={onClose} title={post.title} kicker={nomClient || 'Sans marque'} size="lg">
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold bg-stone-900 text-white">
                {STATUTS_POST[etat]}
              </span>
              {etat !== post.statut && (
                <span className="text-[11.5px] text-amber-700">
                  Nouvelle étape déduite — « Enregistrer » la confirme.
                </span>
              )}
              {etat === 'programme' && !sorties.some((x) => x.prevue_le) && (
                <span className="text-[11.5px] text-amber-700 font-semibold">Approuvé, reste à dater.</span>
              )}
            </div>

            <Field label="Intention, script, angle">
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} disabled={!peutPublier} />
            </Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Tournage d'origine">
                <Select value={shootId} onChange={(e) => setShootId(e.target.value)} disabled={!peutPublier}>
                  <option value="">— aucun —</option>
                  {shoots.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.date_iso ? isoToLabel(x.date_iso) + ' · ' : ''}{x.title}
                    </option>
                  ))}
                </Select>
                {!post.client_id && (
                  <div className="text-[11px] text-stone-500 mt-1">
                    Choisissez d'abord une marque pour ce post.
                  </div>
                )}
              </Field>
              <Field label="Montage livré">
                <Select value={mediaId} onChange={(e) => setMediaId(e.target.value)} disabled={!peutPublier}>
                  <option value="">— pas encore —</option>
                  {medias.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </Select>
                {media && (
                  <div className="mt-1.5"><ApprovalBadge status={media.approval_status || 'pending'} /></div>
                )}
              </Field>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Fichier du Drive</div>
              {fichierDrive ? (
                <div style={neu.pressedSm} className="rounded-xl overflow-hidden">
                  {fichierDrive.genre === 'photo' ? (
                    <img src={fichierDrive.leger_url || fichierDrive.url} alt={fichierDrive.nom}
                      className="w-full max-h-[280px] object-contain bg-stone-900/85" />
                  ) : fichierDrive.encodage === 'done' && fichierDrive.leger_url ? (
                    <video controls preload="none" playsInline src={fichierDrive.leger_url}
                      poster={fichierDrive.apercu_url || undefined}
                      className="w-full max-h-[280px] bg-black" />
                  ) : (
                    <div className="p-5 text-center">
                      {fichierDrive.apercu_url && (
                        <img src={fichierDrive.apercu_url} alt="" className="max-h-[160px] mx-auto rounded-lg mb-3" />
                      )}
                      <div className="text-[12px] text-amber-700 font-semibold">
                        {fichierDrive.encodage === 'error' ? 'Version allégée en échec' : 'Version allégée en préparation…'}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 flex-wrap">
                    <span className="text-[12px] font-medium truncate min-w-0">{fichierDrive.nom}</span>
                    {peutPublier && (
                      <span className="flex gap-2 shrink-0">
                        <Btn onClick={() => { setRechDrive(''); setMontrerDrive(true); }}>Changer</Btn>
                        <Btn onClick={() => setDriveId('')} className="text-rose-600">Retirer</Btn>
                      </span>
                    )}
                  </div>
                </div>
              ) : peutPublier ? (
                <div>
                  <Btn icon={FolderOpen} onClick={() => { setRechDrive(''); setMontrerDrive(true); }}>
                    Choisir dans le Drive
                  </Btn>
                  <div className="text-[11px] text-stone-500 mt-1.5">
                    Le rush ou l'export du post, déposé par l'équipe — « Enregistrer » confirme.
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-stone-500">Aucun fichier rattaché.</p>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Sorties</div>
              {!sorties.length ? (
                <p className="text-[12.5px] text-stone-500">Aucune sortie programmée.</p>
              ) : (
                <div className="space-y-1.5">
                  {sorties.map((x) => (
                    <div key={x.id} style={neu.pressedSm} className="rounded-xl p-2.5 flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RESEAUX[x.reseau]?.c }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px]">{RESEAUX[x.reseau]?.l || x.reseau}</div>
                        <div className="text-[11px] text-stone-500">
                          {x.publie_le ? `Publié le ${isoToLabel(String(x.publie_le).slice(0, 10))}`
                            : x.prevue_le ? `Prévu ${isoToLabel(String(x.prevue_le).slice(0, 10))} à ${hhmm(x.prevue_le)}`
                            : 'Sans date'}
                        </div>
                      </div>
                      {peutPublier && (
                        <>
                          <Btn onClick={() => basculerPublie(x)}>{x.publie_le ? 'Annuler' : 'Publié'}</Btn>
                          <button type="button" onClick={() => retirerSortie(x)} aria-label="Retirer la sortie"
                            className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {peutPublier && (
                <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 mt-3 items-end">
                  <Field label="Réseau">
                    <Select value={nouvReseau} onChange={(e) => setNouvReseau(e.target.value)}>
                      {Object.entries(RESEAUX).map(([id, r]) => <option key={id} value={id}>{r.l}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date">
                    <Input type="date" value={nouvJour} onChange={(e) => setNouvJour(e.target.value)} />
                  </Field>
                  <Field label="Heure">
                    <Input type="time" value={nouvHeure} onChange={(e) => setNouvHeure(e.target.value)} />
                  </Field>
                  <Btn onClick={ajouterSortie}>Ajouter</Btn>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Qui fait quoi</div>
              {taches === null ? null : !taches.length ? (
                <p className="text-[12.5px] text-stone-500">Aucune tâche sur ce post.</p>
              ) : (
                <div className="space-y-1.5">
                  {taches.map((t) => (
                    <div key={t.id} style={neu.pressedSm} className={`rounded-xl p-2.5 flex items-center gap-3 ${t.fait_le ? 'opacity-55' : ''}`}>
                      {/* Cocher : les privilégiés partout, un plancher
                          SES tâches — même règle que la base. */}
                      {(peutDonner || t.assigne_a === moiId) ? (
                        <button type="button" onClick={() => basculerTache(t)}
                          aria-label={t.fait_le ? 'Rouvrir la tâche' : 'Marquer faite'}
                          className="w-11 h-11 -m-2.5 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                          <span aria-hidden="true" className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: t.fait_le ? '#3f9c6d' : '#b9b2a5', background: t.fait_le ? '#3f9c6d' : 'transparent' }}>
                            {t.fait_le && <Check size={12} className="text-white" />}
                          </span>
                        </button>
                      ) : (
                        <span aria-hidden="true" className="w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center"
                          style={{ borderColor: t.fait_le ? '#3f9c6d' : '#b9b2a5', background: t.fait_le ? '#3f9c6d' : 'transparent' }}>
                          {t.fait_le && <Check size={12} className="text-white" />}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] ${t.fait_le ? 'line-through' : ''}`}>{t.titre}</div>
                        <div className="text-[11px] text-stone-500">
                          {nomEquipier(t.assigne_a)}
                          {donneeParPost(t) ? ` · ${donneeParPost(t)}` : ''}
                          {t.due_on ? ` · pour ${isoToLabel(t.due_on)}` : ''}
                        </div>
                      </div>
                      {(peutDonner || t.cree_par === moiId) && (
                        <button type="button" onClick={() => retirerTache(t)} aria-label="Supprimer la tâche"
                          className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className={`grid ${peutDonner ? 'sm:grid-cols-[1fr_auto_auto_auto]' : 'sm:grid-cols-[1fr_auto_auto]'} gap-2 mt-3 items-end`}>
                <Field label={peutDonner ? 'Nouvelle tâche' : 'Me noter une tâche'}>
                  <Input value={tTitre} onChange={(e) => setTTitre(e.target.value)} placeholder="Monter le reel" />
                </Field>
                {peutDonner && (
                  <Field label="Pour qui">
                    <Select value={tPour} onChange={(e) => setTPour(e.target.value)}>
                      <option value="">Moi</option>
                      {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Pour quand">
                  <Input type="date" value={tQuand} onChange={(e) => setTQuand(e.target.value)} />
                </Field>
                <Btn onClick={ajouterTache} disabled={busyTache || !tTitre.trim()}>Ajouter</Btn>
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
              </div>
            )}

            {montrerDrive && (
              <Modal title="Choisir dans le Drive" kicker="Fichier du post" onClose={() => setMontrerDrive(false)} size="lg">
                <div className="space-y-3">
                  <Input value={rechDrive} onChange={(e) => setRechDrive(e.target.value)}
                    placeholder="Rechercher par nom…" aria-label="Rechercher un fichier du Drive" />
                  {listeDrive === null ? (
                    <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
                  ) : !listeDrive.length ? (
                    <p className="text-[12.5px] text-stone-500 py-4 text-center">
                      Rien trouvé — déposez d'abord le fichier dans l'onglet Drive.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                      {listeDrive.map((f) => (
                        <button key={f.id} type="button"
                          onClick={() => { setDriveId(f.id); setMontrerDrive(false); }}
                          style={neu.raisedXs}
                          className="w-full rounded-xl min-h-[56px] px-2.5 py-1.5 flex items-center gap-3 text-left">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-900/85 shrink-0 flex items-center justify-center text-stone-400">
                            {f.apercu_url
                              ? <img src={f.apercu_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                              : (f.genre === 'video' ? <Video size={15} /> : <ImageIcon size={15} />)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">{f.nom}</div>
                            <div className="text-[10.5px] text-stone-500 mt-0.5">
                              {f.genre === 'video' ? 'Vidéo' : 'Photo'}
                              {f.genre === 'video' && f.encodage !== 'done' ? ' · version allégée en préparation' : ''}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Modal>
            )}

            <div className="flex gap-2 justify-between items-center pt-1 flex-wrap">
              {peutPublier ? (
                <Btn onClick={supprimerPost} className="text-rose-600">Supprimer</Btn>
              ) : <span />}
              <div className="flex gap-2">
                <Btn onClick={onClose}>Fermer</Btn>
                {peutPublier && (
                  <Btn kind="dark" onClick={enregistrer} disabled={busy}>
                    {busy ? 'Enregistrement…' : 'Enregistrer'}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </Modal>
      );
    }

    /* ── La chaîne de production ───────────────────────────────────
       Tous les posts, rangés par étape. C'est ici qu'une agence voit sa
       charge : combien d'idées dorment, combien attendent le client,
       combien sortent cette semaine. */
    function Pipeline({ clients, onOuvrir, rafraichir }) {
      const [posts, setPosts] = useState(null);
      const [err, setErr] = useState('');

      const charger = async () => {
        setErr('');
        /* select('*') plutôt qu'une liste de colonnes : la table est
           neuve, elle grandira, et nommer les colonnes ici casserait la
           requête ENTIÈRE au premier ajout non déployé. */
        const [p, so] = await Promise.all([
          sb.from('posts').select('*').order('created_at', { ascending: false }),
          sb.from('post_sorties').select('*'),
        ]);
        if (p.error) {
          setErr(/relation .*posts/.test(p.error.message || '')
            ? "L'agenda n'est pas encore activé : exécutez files/migration-comm-calendrier.sql dans Supabase."
            : humaniseErreur(p.error.message));
          setPosts([]); return;
        }
        const parPost = {};
        (so.data || []).forEach((x) => (parPost[x.post_id] = parPost[x.post_id] || []).push(x));
        setPosts((p.data || []).map((x) => ({ ...x, sorties: parPost[x.id] || [] })));
      };
      useEffect(() => { charger(); }, [rafraichir]);

      const ETAPES = ['idee', 'tournage', 'montage', 'validation', 'programme', 'publie'];
      const nomClient = (id) => (clients || []).find((c) => c.id === id)?.name || '';

      const groupes = useMemo(() => {
        const g = {};
        ETAPES.forEach((e) => (g[e] = []));
        (posts || []).forEach((p2) => {
          const e = p2.statut === 'abandonne' ? null : p2.statut;
          if (e && g[e]) g[e].push(p2);
        });
        return g;
      }, [posts]);

      const total = (posts || []).filter((x) => x.statut !== 'abandonne').length;

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 mt-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>La chaîne</h2>
              <p className="text-[12.5px] text-stone-500 mt-1">
                De l'idée à la publication. L'étape se déduit des faits — elle ne se décrète pas.
              </p>
            </div>
            <span className="text-[11.5px] text-stone-500">{total} en cours</span>
          </div>

          {err && (
            <div className="flex items-start gap-2 p-3 mt-4 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {posts === null ? (
            <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
          ) : !total ? (
            <p className="text-[12.5px] text-stone-500 mt-5">
              Aucun contenu en cours. « Programmer un post » en crée un — et il avancera tout seul
              à mesure que le tournage, le montage et la validation arrivent.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {ETAPES.filter((e) => groupes[e].length).map((e) => (
                <div key={e} style={neu.pressedSm} className="rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">{STATUTS_POST[e]}</span>
                    <span className="text-[11px] text-stone-400">{groupes[e].length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {groupes[e].map((p2) => {
                      const dates = (p2.sorties || []).filter((x) => x.prevue_le);
                      const aDater = e === 'programme' && !dates.length;
                      return (
                        <button key={p2.id} type="button" onClick={() => onOuvrir(p2)}
                          style={neu.raisedXs}
                          className="w-full text-left rounded-xl p-2.5 active:scale-[0.99] transition-transform">
                          <div className="text-[13px] truncate">{p2.title}</div>
                          <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            {nomClient(p2.client_id) && <span className="truncate">{nomClient(p2.client_id)}</span>}
                            {(p2.sorties || []).map((x) => (
                              <span key={x.id} className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: RESEAUX[x.reseau]?.c || '#6b6357' }}
                                title={RESEAUX[x.reseau]?.l || x.reseau} />
                            ))}
                            {aDater && <span className="text-amber-700 font-semibold">à dater</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    /* ── Mes tâches ────────────────────────────────────────────────
       Volontairement AUTONOMES : une tâche peut pendre à un post, à un
       tournage, ou à rien (« relancer le client », « acheter une carte
       SD »). Par défaut on montre CE QUI M'EST ASSIGNÉ — la question
       du matin est « qu'est-ce que je fais aujourd'hui », pas « que
       fait l'agence ». */
    function MesTaches({ equipe, clients, onChange }) {
      const [taches, setTaches] = useState(null);
      const [qui, setQui] = useState('moi');        // moi · tous · un user_id
      const [moi, setMoi] = useState(null);
      const [err, setErr] = useState('');
      const [titre, setTitre] = useState('');
      const [pour, setPour] = useState('');
      const [quand, setQuand] = useState('');
      const [busy, setBusy] = useState(false);

      useEffect(() => { sb.auth.getUser().then(({ data }) => setMoi(data?.user?.id || null)); }, []);

      /* « Donner des tâches » est un privilège (audit du 01/08/2026) :
         sans lui, un membre ne voit que SES tâches, n'en crée que pour
         lui-même, et n'efface que ce qu'il a créé. La base tient la
         même règle (policies) — l'écran cesse d'offrir l'impossible. */
      const peutDonner = MON_ROLE.value !== 'membre' || MES_PRIVILEGES.includes('taches');

      const charger = async () => {
        setErr('');
        const { data, error } = await sb.from('tasks')
          .select('*').order('fait_le', { nullsFirst: true }).order('due_on', { nullsFirst: false });
        if (error) {
          setErr(/relation .*tasks/.test(error.message || '')
            ? "Les tâches ne sont pas encore activées : exécutez files/migration-comm-calendrier.sql dans Supabase."
            : humaniseErreur(error.message));
          setTaches([]); return;
        }
        setTaches(data || []);
      };
      useEffect(() => { charger(); }, []);

      const ajouter = async (e) => {
        e.preventDefault();
        if (!titre.trim() || busy) return;
        setBusy(true);
        const { data: saved, error } = await sb.from('tasks').insert({
          agency_id: AGENCY.id,
          titre: titre.trim(),
          assigne_a: pour || moi || null,
          due_on: quand || null,
        }).select().single();
        setBusy(false);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        // Prévenir l'assigné (email, meilleur effort) — jamais soi-même.
        if (saved) {
          signalerAssignation({ taskId: saved.id, assigneA: saved.assigne_a, titre: saved.titre, dueOn: saved.due_on });
        }
        setTitre(''); setQuand('');
        charger(); onChange?.();
      };

      const basculer = async (t) => {
        const { error } = await sb.from('tasks')
          .update({ fait_le: t.fait_le ? null : new Date().toISOString() }).eq('id', t.id);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        charger(); onChange?.();
      };

      const supprimer = async (t) => {
        if (!confirm(`Supprimer « ${t.titre} » ?`)) return;
        await sb.from('tasks').delete().eq('id', t.id);
        charger(); onChange?.();
      };

      const nomDe = (id) => (equipe.find((m) => m.user_id === id) || {}).nom || 'Non assignée';
      /* Qui a donné la tâche, et sa FONCTION (le métier saisi dans
         l'équipe, sinon le rôle). Rien quand on se l'est notée
         soi-même — « donnée par moi à moi » serait du bruit — ni sur
         les tâches d'avant la mémoire du créateur. */
      const donneePar = (t) => {
        if (!t.cree_par || t.cree_par === t.assigne_a) return null;
        const m = equipe.find((x) => x.user_id === t.cree_par);
        if (!m) return 'donnée par un ancien coéquipier';
        const fonction = m.metier || ROLES_EQUIPE[m.role] || '';
        return `donnée par ${m.nom}${fonction ? ` (${fonction})` : ''}`;
      };
      /* « Que j'ai données » : les tâches que J'AI créées pour les
         AUTRES — le patron voit d'un coup d'œil ce qu'il a distribué,
         qui a fini, qui est en retard. (Les tâches d'avant la mémoire
         du créateur — cree_par vide — n'y figurent pas.) */
      const visibles = (taches || []).filter((t) =>
        !peutDonner ? t.assigne_a === moi
          : qui === 'tous' ? true
          : qui === 'moi' ? t.assigne_a === moi
          : qui === 'donnees' ? (t.cree_par === moi && t.assigne_a !== moi)
          : t.assigne_a === qui);
      const aFaire = visibles.filter((t) => !t.fait_le);
      const faites = visibles.filter((t) => t.fait_le);

      /* En retard / aujourd'hui : la seule information qui fait AGIR.
         Comparaison en chaînes ISO — jamais de Date() ici, un fuseau
         mal placé décalerait « aujourd'hui » d'un jour. */
      const auj = new Date();
      const cleAuj = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`;
      const urgence = (t) => !t.due_on ? '' : t.due_on < cleAuj ? 'retard' : t.due_on === cleAuj ? 'auj' : '';

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 mt-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Les tâches</h2>
              <p className="text-[12.5px] text-stone-500 mt-1">
                {peutDonner ? 'Qui fait quoi, et pour quand.' : 'Vos tâches, et où elles en sont.'}
              </p>
            </div>
            {peutDonner && (
              <div className="w-full sm:w-[190px]">
                <Select value={qui} onChange={(e) => setQui(e.target.value)}>
                  <option value="moi">Mes tâches</option>
                  <option value="donnees">Que j'ai données</option>
                  <option value="tous">Toute l'équipe</option>
                  {equipe.filter((m) => m.user_id !== moi).map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.nom}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <form onSubmit={ajouter}
            className={`grid ${peutDonner ? 'sm:grid-cols-[1fr_auto_auto_auto]' : 'sm:grid-cols-[1fr_auto_auto]'} gap-2 mt-4 items-end`}>
            <Field label={peutDonner ? 'Nouvelle tâche' : 'Me noter une tâche'}>
              <Input value={titre} onChange={(e) => setTitre(e.target.value)}
                placeholder="Monter le reel Era Étampes" />
            </Field>
            {peutDonner && (
              <Field label="Pour qui">
                <Select value={pour} onChange={(e) => setPour(e.target.value)}>
                  <option value="">Moi</option>
                  {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Pour quand">
              <Input type="date" value={quand} onChange={(e) => setQuand(e.target.value)} />
            </Field>
            <Btn kind="dark" type="submit" disabled={busy || !titre.trim()}>Ajouter</Btn>
          </form>

          {err && (
            <div className="flex items-start gap-2 p-3 mt-4 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {/* Le bilan de ce que j'ai distribué : combien, fait, en retard. */}
          {qui === 'donnees' && peutDonner && taches !== null && visibles.length > 0 && (() => {
            const enRetard = aFaire.filter((t) => t.due_on && t.due_on < cleAuj).length;
            return (
              <div className="text-[12.5px] text-stone-600 mt-4">
                <strong>{visibles.length}</strong> donnée{visibles.length > 1 ? 's' : ''}
                {' · '}<span className="text-emerald-700 font-semibold">{faites.length} faite{faites.length > 1 ? 's' : ''}</span>
                {' · '}{aFaire.length} en cours
                {enRetard > 0 && <span className="text-rose-600 font-semibold"> · {enRetard} en retard</span>}
              </div>
            );
          })()}

          {taches === null ? (
            <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
          ) : !visibles.length ? (
            <p className="text-[12.5px] text-stone-500 mt-5">
              {qui === 'moi' ? 'Rien ne vous est assigné. Profitez-en.'
                : qui === 'donnees' ? 'Rien de distribué pour l’instant — les tâches d’avant ce matin ne portent pas leur créateur.'
                : 'Aucune tâche pour cette personne.'}
            </p>
          ) : (
            <div className="mt-4 space-y-1.5">
              {[...aFaire, ...faites].map((t) => {
                const u = urgence(t);
                return (
                  <div key={t.id} style={neu.pressedSm}
                    className={`rounded-xl p-3 flex items-center gap-3 ${t.fait_le ? 'opacity-55' : ''}`}>
                    {/* HIG §4 : la coche visait 36 px effectifs — l'enveloppe
                        fait 44, le visuel ne bouge pas (marge négative). */}
                    <button type="button" onClick={() => basculer(t)}
                      aria-label={t.fait_le ? 'Rouvrir la tâche' : 'Marquer faite'}
                      className="w-11 h-11 -m-2.5 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                      <span aria-hidden="true" className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: t.fait_le ? '#3f9c6d' : '#b9b2a5', background: t.fait_le ? '#3f9c6d' : 'transparent' }}>
                        {t.fait_le && <Check size={12} className="text-white" />}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13.5px] ${t.fait_le ? 'line-through' : ''}`}>{t.titre}</div>
                      <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{nomDe(t.assigne_a)}</span>
                        {donneePar(t) && <span className="text-stone-400">· {donneePar(t)}</span>}
                        {t.due_on && (
                          <span className={u === 'retard' ? 'text-rose-600 font-semibold'
                            : u === 'auj' ? 'text-amber-700 font-semibold' : ''}>
                            {u === 'retard' ? 'en retard — ' : u === 'auj' ? "aujourd'hui — " : ''}
                            {isoToLabel(t.due_on)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Effacer : les privilégiés effacent tout, un
                        plancher seulement CE QU'IL A CRÉÉ (cree_par) —
                        la corbeille sur la tâche du patron, vue sur la
                        capture de Gil, n'avait rien à faire là. */}
                    {(peutDonner || t.cree_par === moi) && (
                      <button type="button" onClick={() => supprimer(t)} aria-label="Supprimer la tâche"
                        className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       👥 ÉQUIPE — coéquipiers, rôles et tâches (01/08/2026)
       ════════════════════════════════════════════════════════════
       Son propre onglet (demande de Gil) : la gestion d'équipe n'a
       rien à faire coincée sous le calendrier. Chaque coéquipier
       (cadreur, monteur, CM…) a SON compte : il se connecte à la
       console de l'agence, voit l'agenda et coche ses tâches. Les
       invitations passent par l'edge function team-member — les
       règles de rôles y sont scellées, l'interface n'est qu'une
       politesse. Le mot de passe temporaire s'affiche UNE fois,
       comme à la création d'une agence. */
    const ROLES_EQUIPE = { owner: 'Propriétaire', admin: 'Admin', membre: 'Membre' };

    /* Les privilèges d'un membre — trois interrupteurs maison. Sans
       rien, le rang plancher : chat, agenda, ses tâches. Le serveur
       (team-member) et la base (policies restrictives) tiennent la
       vraie garde ; cet écran accorde. */
    const PRIVILEGES_MEMBRE = [
      { id: 'clients', icon: Users, titre: 'Espaces clients',
        desc: 'Voir les clients et agir sur leurs espaces (jamais les factures).' },
      { id: 'posts', icon: Send, titre: 'Publications',
        desc: 'Programmer des posts, gérer les sorties, cocher « publié ».' },
      { id: 'taches', icon: CheckCircle2, titre: 'Donner des tâches',
        desc: 'Assigner aux autres et gérer leurs tâches — sans lui : les siennes seulement.' },
    ];
    function PrivilegesMembre({ valeurs, onChange }) {
      return (
        <div className="space-y-2">
          {PRIVILEGES_MEMBRE.map(({ id, icon: Icone, titre, desc }) => {
            const actif = valeurs.includes(id);
            return (
              <button key={id} type="button" role="switch" aria-checked={actif}
                onClick={() => onChange(actif ? valeurs.filter((v) => v !== id) : [...valeurs, id])}
                style={actif ? neu.dark : neu.pressedSm}
                className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between gap-3 transition ${actif ? 'text-white' : 'text-stone-700'}`}>
                <div className="flex items-center gap-3 text-left min-w-0">
                  <Icone size={17} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[13px]">{titre}</div>
                    <div className={`text-[10.5px] mt-0.5 ${actif ? 'text-stone-300' : 'text-stone-500'}`}>{desc}</div>
                  </div>
                </div>
                <div className={`w-10 h-5.5 rounded-full p-0.5 transition shrink-0 ${actif ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${actif ? 'translate-x-4' : ''}`} />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       💬 MESSAGES — la messagerie de l'équipe (01/08/2026)
       ════════════════════════════════════════════════════════════
       Son propre onglet, façon messagerie : à gauche les
       conversations (le fil d'équipe + les fils privés), à droite le
       fil ouvert. Sur téléphone : la liste, puis la conversation
       plein écran avec retour. UN SEUL chargement porte tout — la
       RLS ne rend que ce que j'ai le droit de voir, le rangement par
       fil se fait ici. Temps réel par Realtime quand la base y est
       abonnée, sondage de secours sinon. L'état « lu » vit dans les
       métadonnées du compte (motif ChatBeta) : il suit l'utilisateur
       d'un appareil à l'autre. On efface SES messages seulement — la
       base le garantit. */
    function MessagesTab({ user, onLu }) {
      const [equipe, setEquipe] = useState([]);
      const [tous, setTous] = useState(null);         // tous mes messages visibles
      const [fil, setFil] = useState('equipe');       // 'equipe' | user_id
      const [vueListe, setVueListe] = useState(true); // téléphone : la liste d'abord
      const [texte, setTexte] = useState('');
      const [envoi, setEnvoi] = useState(false);
      const [erreur, setErreur] = useState('');
      const [, setTic] = useState(0);                 // re-rendu après « lu »
      const [fichiers, setFichiers] = useState(new Map());   // drive_id → fichier
      const [montrerDrive, setMontrerDrive] = useState(false);
      const [apercuFichier, setApercuFichier] = useState(null);
      const boiteRef = useRef(null);
      // Un écran large montre les deux volets : le fil ouvert est VU
      // même quand vueListe reste vraie (elle ne pilote que le mobile).
      const grandEcran = useRef(typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);

      useEffect(() => {
        sb.rpc('equipe_agence').then(({ data }) => setEquipe(data || [])).catch(() => {});
      }, []);

      const charger = async () => {
        const { data, error } = await sb.from('team_messages')
          .select('*').order('created_at', { ascending: true }).limit(500);
        if (error) {
          setErreur(/team_messages|dest_id/.test(error.message || '')
            ? "La messagerie n'est pas encore activée : exécutez files/migration-chat-prive.sql dans Supabase."
            : humaniseErreur(error.message));
          setTous([]); return;
        }
        setErreur(''); setTous(data || []);
        // Les fichiers du Drive référencés par ces messages, en une
        // requête — la RLS de drive_items juge ce que je peux voir.
        const ids = [...new Set((data || []).map((m) => m.drive_id).filter(Boolean))];
        if (ids.length) {
          const { data: fs } = await sb.from('drive_items').select('*').in('id', ids);
          setFichiers(new Map((fs || []).map((f) => [f.id, f])));
        } else setFichiers(new Map());
      };
      useEffect(() => {
        charger();
        const id = setInterval(charger, 15000);   // filet si Realtime dort
        let canal = null;
        try {
          canal = sb.channel('fil-equipe')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, charger)
            .subscribe();
        } catch (_) {}
        return () => { clearInterval(id); if (canal) sb.removeChannel(canal); };
      }, []);

      /* ── Rangement par conversation ─────────────────────────────── */
      const filDe = (m) => m.dest_id == null ? 'equipe'
        : (m.auteur_id === user?.id ? m.dest_id : m.auteur_id);
      const parFil = useMemo(() => {
        const map = new Map();
        (tous || []).forEach((m) => {
          const k = filDe(m);
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(m);
        });
        return map;
      }, [tous]);
      const dernierDe = (k) => ((parFil.get(k) || []).slice(-1)[0] || null);

      /* ── Lu / non lu — métadonnées du compte (motif ChatBeta) ───── */
      const LU_CLE = 'laloge_equipe_lu';
      const luLe = (k) => (user?.user_metadata?.[LU_CLE] || {})[k] || null;
      const marquerLu = async (k) => {
        const dernier = dernierDe(k);
        if (!dernier || dernier.created_at === luLe(k)) return;
        const val = { ...(user?.user_metadata?.[LU_CLE] || {}), [k]: dernier.created_at };
        if (user?.user_metadata) user.user_metadata[LU_CLE] = val;   // écho local immédiat
        setTic((t) => t + 1);
        onLu?.();                        // la pastille de l'onglet suit
        try { await sb.auth.updateUser({ data: { [LU_CLE]: val } }); } catch (_) {}
      };
      const nonLus = (k) => (parFil.get(k) || [])
        .filter((m) => m.auteur_id !== user?.id && (!luLe(k) || m.created_at > luLe(k))).length;

      // Le fil AFFICHÉ se marque lu : à l'ouverture, et à chaque
      // message qui arrive pendant qu'on le regarde.
      useEffect(() => {
        if (grandEcran.current || !vueListe) marquerLu(fil);
      }, [fil, vueListe, (parFil.get(fil) || []).length]);

      /* ── Qui je peux contacter en privé ─────────────────────────── */
      const monRole = (equipe.find((m) => m.user_id === user?.id) || {}).role;
      const contacts = monRole === 'owner' || monRole === 'admin'
        ? equipe.filter((m) => m.user_id !== user?.id)
        : equipe.filter((m) => m.role === 'owner' && m.user_id !== user?.id);
      const conversations = useMemo(() => ([
        { cle: 'equipe', nom: "L'équipe" },
        ...[...contacts].sort((a, b) => {
          const da = dernierDe(a.user_id)?.created_at || '';
          const db = dernierDe(b.user_id)?.created_at || '';
          return db.localeCompare(da);
        }).map((m) => ({ cle: m.user_id, nom: m.nom })),
      ]), [contacts, parFil]);

      const messages = parFil.get(fil) || [];
      const enFace = equipe.find((m) => m.user_id === fil) || null;

      // Toujours voir le dernier message — la boîte défile, pas la page.
      useEffect(() => {
        const b = boiteRef.current;
        if (b) b.scrollTop = b.scrollHeight;
      }, [messages.length, fil, vueListe]);

      const envoyer = async (e) => {
        e.preventDefault();
        const corps = texte.trim();
        if (!corps || envoi) return;
        setEnvoi(true);
        const { error } = await sb.from('team_messages')
          .insert({ agency_id: AGENCY.id, auteur_id: user.id, corps,
                    dest_id: fil === 'equipe' ? null : fil });
        setEnvoi(false);
        if (error) {
          /* Un refus RLS ici n'a RIEN à voir avec l'offre (le
             traducteur maison le suppose par défaut) : c'est le
             juge des fils privés qui manque. On le dit vrai. */
          setErreur(/row-level|permission denied|violates/i.test(error.message || '')
            ? "Ce fil privé n'est pas encore activé : exécutez files/migration-chat-prive-fix.sql dans Supabase."
            : humaniseErreur(error.message));
          return;
        }
        setTexte(''); charger();
      };
      const effacer = async (m) => {
        if (!confirm('Effacer ce message ?')) return;
        await sb.from('team_messages').delete().eq('id', m.id);
        charger();
      };

      /* Partager un fichier du Drive : le message le PORTE (carte
         cliquable). Le texte tapé accompagne ; sinon, l'annonce
         toute simple. */
      const partagerFichier = async (it) => {
        setMontrerDrive(false);
        const corps = texte.trim() || `A déposé « ${it.nom} » dans le Drive`;
        const { error } = await sb.from('team_messages')
          .insert({ agency_id: AGENCY.id, auteur_id: user.id, corps,
                    dest_id: fil === 'equipe' ? null : fil, drive_id: it.id });
        if (error) {
          setErreur(/drive_id/.test(error.message || '')
            ? "Le partage de fichiers n'est pas encore activé : exécutez files/migration-chat-fichiers.sql dans Supabase."
            : /row-level|permission denied|violates/i.test(error.message || '')
            ? "Ce fil privé n'est pas encore activé : exécutez files/migration-chat-prive-fix.sql dans Supabase."
            : humaniseErreur(error.message));
          return;
        }
        setTexte(''); charger();
      };

      const telechargerFichier = (it) => {
        try {
          const u = new URL(it.url);
          if (u.hostname === 'media.timelesshouse.org' && u.pathname.startsWith('/file/')) {
            u.pathname = '/telecharger/' + u.pathname.slice('/file/'.length);
            u.searchParams.set('nom', it.nom);
          }
          window.location.href = u.toString();
        } catch (_) { window.location.href = it.url; }
      };

      const nomDe = (id) => (equipe.find((x) => x.user_id === id) || {}).nom || 'Ancien coéquipier';
      const heureDe = (iso) => {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      const jourDe = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const initialesDe = (nom) => ((nom || '?').replace(/@.*$/, '').split(/[\s._-]+/)
        .map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase()) || '?';
      const ouvrir = (cle) => { setFil(cle); setVueListe(false); };

      return (
        <div style={neu.raised}
          className="rounded-[24px] lg:rounded-[28px] overflow-hidden lg:grid lg:grid-cols-[280px_1fr] flex flex-col h-[calc(100dvh-320px)] lg:h-[calc(100dvh-220px)] min-h-[420px]">
          {/* ─── Volet 1 : les conversations ─── */}
          <div className={`${vueListe ? 'flex' : 'hidden'} lg:flex flex-col h-full min-h-0 lg:border-r`}
            style={{ borderColor: 'var(--divider, rgba(42,38,32,0.08))' }}>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-[17px] tracking-tight" style={SERIF}>Conversations</h2>
            </div>
            {erreur && (
              <div className="flex items-start gap-2 p-3 mx-3 mb-2 rounded-xl bg-amber-50 text-amber-800 text-[12px]">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {erreur}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-1">
              {conversations.map((c) => {
                const d = dernierDe(c.cle);
                const n = nonLus(c.cle);
                const actif = fil === c.cle;
                return (
                  <button key={c.cle} type="button" onClick={() => ouvrir(c.cle)}
                    aria-current={actif ? 'true' : undefined}
                    style={actif ? neu.pressedSm : undefined}
                    className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-2xl text-left">
                    <div style={neu.darkSm}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
                      {c.cle === 'equipe' ? <UsersRound size={16} /> : initialesDe(c.nom)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[13.5px] truncate ${n ? 'font-bold' : 'font-semibold'}`}>{c.nom}</span>
                        {d && <span className="text-[10.5px] text-stone-400 shrink-0">{heureDe(d.created_at)}</span>}
                      </div>
                      <div className={`text-[12px] truncate ${n ? 'text-stone-700 font-medium' : 'text-stone-500'}`}>
                        {d ? `${d.auteur_id === user?.id ? 'Vous : ' : ''}${d.corps}`
                          : (c.cle === 'equipe' ? "Écrire à toute l'équipe" : 'Démarrer la conversation')}
                      </div>
                    </div>
                    {n > 0 && (
                      <span style={neu.darkSm}
                        className="min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Volet 2 : le fil ouvert ─── */}
          <div className={`${vueListe ? 'hidden' : 'flex'} lg:flex flex-col h-full min-h-0 flex-1`}>
            <div className="flex items-center gap-2.5 px-4 lg:px-5 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--divider, rgba(42,38,32,0.08))' }}>
              <button type="button" onClick={() => setVueListe(true)} aria-label="Retour aux conversations"
                className="lg:hidden tap-ext w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-stone-600">
                <ArrowLeft size={17} />
              </button>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold truncate">
                  {fil === 'equipe' ? "L'équipe" : (enFace?.nom || 'Conversation')}
                </div>
                <div className="text-[11px] text-stone-500">
                  {fil === 'equipe' ? 'tout le monde voit ce fil' : 'vous deux seulement'}
                </div>
              </div>
            </div>

            <div ref={boiteRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 lg:px-5 py-4 space-y-2.5">
              {tous === null ? (
                <div className="h-full flex items-center justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
              ) : !messages.length ? (
                <div className="h-full flex items-center justify-center text-[12.5px] text-stone-500 text-center px-8">
                  {fil === 'equipe'
                    ? "Personne n'a encore rien dit. Lancez la conversation — toute l'équipe la verra."
                    : `Rien encore dans ce fil. Écrivez — ${(enFace?.nom || 'ce coéquipier')} seul le verra.`}
                </div>
              ) : (
                messages.map((m, i) => {
                  const mien = m.auteur_id === user?.id;
                  const nouveauJour = i === 0 || jourDe(m.created_at) !== jourDe(messages[i - 1].created_at);
                  return (
                    <div key={m.id}>
                      {nouveauJour && (
                        <div className="text-[10.5px] uppercase tracking-[0.14em] text-stone-400 font-semibold text-center py-2 capitalize">
                          {jourDe(m.created_at)}
                        </div>
                      )}
                      <div className={`flex ${mien ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 ${mien ? 'text-white' : ''}`}
                          style={mien ? neu.darkSm : neu.raisedXs}>
                          <div className={`text-[10.5px] font-semibold mb-0.5 ${mien ? 'text-stone-300' : 'text-stone-500'}`}>
                            {!mien && fil === 'equipe' ? `${nomDe(m.auteur_id)} · ` : ''}{heureDe(m.created_at)}
                          </div>
                          {m.drive_id && (() => {
                            const f = fichiers.get(m.drive_id);
                            return f ? (
                              <button type="button" onClick={() => setApercuFichier(f)}
                                className={`w-full flex items-center gap-2.5 rounded-xl p-2 mb-1.5 text-left ${mien ? 'bg-white/10' : 'bg-stone-900/5'}`}>
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-stone-900/85 shrink-0 flex items-center justify-center text-stone-400">
                                  {f.apercu_url ? <img src={f.apercu_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    : f.genre === 'video' ? <Video size={14} />
                                    : f.genre === 'document' ? <FileText size={14} /> : <ImageIcon size={14} />}
                                </div>
                                <div className="min-w-0">
                                  <div className={`text-[12px] font-semibold truncate ${mien ? 'text-white' : ''}`}>{f.nom}</div>
                                  <div className={`text-[10px] ${mien ? 'text-stone-300' : 'text-stone-500'}`}>
                                    {f.genre === 'video' ? 'Vidéo' : f.genre === 'document' ? 'Document' : 'Photo'} · dans le Drive
                                  </div>
                                </div>
                              </button>
                            ) : (
                              <div className={`text-[11px] italic mb-1 ${mien ? 'text-stone-300' : 'text-stone-500'}`}>
                                Fichier retiré du Drive
                              </div>
                            );
                          })()}
                          <div className="text-[16px] sm:text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{m.corps}</div>
                          {mien && (
                            <button type="button" onClick={() => effacer(m)}
                              className="tap-ext inline-flex items-center text-[10.5px] text-stone-400 hover:text-rose-400 mt-1 min-h-[32px]">
                              Effacer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={envoyer} className="flex gap-2 px-4 lg:px-5 py-3 items-center shrink-0"
              style={{ borderTop: '1px solid var(--divider, rgba(42,38,32,0.08))' }}>
              <button type="button" onClick={() => setMontrerDrive(true)}
                aria-label="Partager un fichier du Drive" title="Partager un fichier du Drive"
                style={neu.raisedXs}
                className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 shrink-0 active:scale-95 transition-transform">
                <FolderOpen size={16} />
              </button>
              <div className="flex-1">
                <Input value={texte} onChange={(e) => setTexte(e.target.value)}
                  placeholder={fil === 'equipe' ? "Écrire à l'équipe…" : `Écrire à ${(enFace?.nom || 'ce coéquipier')}…`}
                  aria-label="Message" maxLength={4000} />
              </div>
              <Btn kind="dark" type="submit" icon={envoi ? Loader2 : Send} disabled={envoi || !texte.trim()}>
                <span className="hidden sm:inline">Envoyer</span>
              </Btn>
            </form>
          </div>

          {montrerDrive && (
            <DrivePicker genres={['photo', 'video', 'document']}
              onChoisir={partagerFichier}
              onClose={() => setMontrerDrive(false)} />
          )}

          {apercuFichier && (
            <Modal title={apercuFichier.nom}
              kicker={apercuFichier.genre === 'video' ? 'Vidéo' : apercuFichier.genre === 'document' ? 'Document' : 'Photo'}
              onClose={() => setApercuFichier(null)} size="lg">
              <div className="space-y-4">
                {apercuFichier.genre === 'document' ? (
                  (/pdf/i.test(apercuFichier.mime || '') || /\.pdf$/i.test(apercuFichier.nom)) ? (
                    <iframe src={apercuFichier.url} title={apercuFichier.nom} className="w-full h-[60vh] rounded-xl bg-white" />
                  ) : (
                    <div style={neu.pressedSm} className="rounded-xl p-8 text-center">
                      <FileText size={28} className="mx-auto text-stone-400 mb-3" />
                      <div className="text-[13.5px] font-semibold">Pas d'aperçu pour ce type de fichier</div>
                      <p className="text-[12px] text-stone-500 mt-1.5">Téléchargez-le pour l'ouvrir.</p>
                    </div>
                  )
                ) : apercuFichier.genre === 'photo' ? (
                  <img src={apercuFichier.leger_url || apercuFichier.url} alt={apercuFichier.nom}
                    className="w-full max-h-[60vh] object-contain rounded-xl bg-stone-900/85" />
                ) : apercuFichier.encodage === 'done' && apercuFichier.leger_url ? (
                  <video controls autoPlay playsInline src={apercuFichier.leger_url}
                    poster={apercuFichier.apercu_url || undefined} className="w-full max-h-[60vh] rounded-xl bg-black" />
                ) : (
                  <div style={neu.pressedSm} className="rounded-xl p-8 text-center">
                    {apercuFichier.apercu_url && (
                      <img src={apercuFichier.apercu_url} alt="" className="max-h-[35vh] mx-auto rounded-lg mb-3" />
                    )}
                    <div className="text-[13.5px] font-semibold">La version allégée se prépare</div>
                    <p className="text-[12px] text-stone-500 mt-1.5">En attendant, l'original se télécharge.</p>
                  </div>
                )}
                <div className="flex gap-2 justify-end flex-wrap">
                  <Btn icon={Download} onClick={() => telechargerFichier(apercuFichier)}>Télécharger l'original</Btn>
                  <Btn onClick={() => setApercuFichier(null)}>Fermer</Btn>
                </div>
              </div>
            </Modal>
          )}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🗂 DRIVE — le disque commun de l'équipe (01/08/2026)
       ════════════════════════════════════════════════════════════
       Dossiers et fichiers dans UNE table (drive_items, le parent
       fait l'arborescence). Tout le monde dépose et range — c'est le
       but, demande explicite de Gil pour les membres — mais on
       n'efface que SES dépôts (owner/admin : tout). Les photos
       montent avec deux variantes fabriquées ICI (vignette + grande
       vue) ; les vidéos montent en original et le worker fabrique la
       VERSION ALLÉGÉE 720p + l'affiche — c'est elle qu'on regarde au
       clic, l'original ne bouge que pour un téléchargement. */
    async function variantesImage(file) {
      let src;
      try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (_) {
        src = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('Image illisible'));
          im.src = URL.createObjectURL(file);
        });
      }
      const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      const variante = (maxW, q) => new Promise((res, rej) => {
        const r = Math.min(1, maxW / w);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * r));
        c.height = Math.max(1, Math.round(h * r));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? res(b) : rej(new Error('Variante impossible'))), 'image/jpeg', q);
      });
      return { largeur: w, hauteur: h, apercu: await variante(640, 0.72), vue: await variante(1800, 0.8) };
    }

    /* Sélecteur de fichier du Drive — partagé par les formulaires
       Médias, Factures et Documents : au lieu de re-téléverser un
       fichier que l'équipe a déjà déposé, on le pointe. `genres`
       borne ce qui est proposé (une facture ne veut qu'un document). */
    function DrivePicker({ genres, onChoisir, onClose }) {
      const [rech, setRech] = useState('');
      const [liste, setListe] = useState(null);
      useEffect(() => {
        const t = setTimeout(async () => {
          let q = sb.from('drive_items').select('*').in('genre', genres)
            .order('created_at', { ascending: false }).limit(40);
          if (rech.trim()) q = q.ilike('nom', `%${rech.trim()}%`);
          const { data } = await q;
          setListe(data || []);
        }, 250);
        return () => clearTimeout(t);
      }, [rech]);
      return (
        <Modal title="Choisir dans le Drive" kicker="Fichier de l'équipe" onClose={onClose} size="lg">
          <div className="space-y-3">
            <Input value={rech} onChange={(e) => setRech(e.target.value)}
              placeholder="Rechercher par nom…" aria-label="Rechercher dans le Drive" />
            {liste === null ? (
              <div className="py-8 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
            ) : !liste.length ? (
              <p className="text-[12.5px] text-stone-500 py-4 text-center">
                Rien trouvé — déposez d'abord le fichier dans l'onglet Drive.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {liste.map((f) => (
                  <button key={f.id} type="button" onClick={() => onChoisir(f)}
                    style={neu.raisedXs}
                    className="w-full rounded-xl min-h-[56px] px-2.5 py-1.5 flex items-center gap-3 text-left">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-900/85 shrink-0 flex items-center justify-center text-stone-400">
                      {f.apercu_url
                        ? <img src={f.apercu_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : (f.genre === 'video' ? <Video size={15} />
                           : f.genre === 'document' ? <FileText size={15} /> : <ImageIcon size={15} />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{f.nom}</div>
                      <div className="text-[10.5px] text-stone-500 mt-0.5">
                        {f.genre === 'video' ? 'Vidéo' : f.genre === 'document' ? 'Document' : 'Photo'}
                        {f.taille ? ` · ${fmtSizeFR(f.taille)}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      );
    }

    function DriveTab({ clients = [] }) {
      const [chemin, setChemin] = useState([]);        // [{id, nom}] — fil d'Ariane
      const dossier = chemin.length ? chemin[chemin.length - 1].id : null;
      const [items, setItems] = useState(null);        // null = chargement
      const [dossiers, setDossiers] = useState([]);    // tous les dossiers (« Déplacer »)
      const [err, setErr] = useState('');
      const [envois, setEnvois] = useState([]);        // [{cle, nom, pct}]
      const [ouvert, setOuvert] = useState(null);      // visionneuse
      const [gere, setGere] = useState(null);          // fiche ⋯ d'un élément
      const [dest, setDest] = useState('');            // destination « Déplacer »
      const fichierRef = useRef(null);

      /* Vue et taille : le rangement est un goût personnel — retenus
         sur CET appareil (localStorage), pas en base. */
      const [vue, setVue] = useState(() => {
        try { return localStorage.getItem('th_drive_vue') || 'grille'; } catch (_) { return 'grille'; }
      });
      const poserVue = (v) => { setVue(v); try { localStorage.setItem('th_drive_vue', v); } catch (_) {} };
      const TAILLES = ['petit', 'moyen', 'grand'];
      const [taille, setTaille] = useState(() => {
        try { return TAILLES.includes(localStorage.getItem('th_drive_taille')) ? localStorage.getItem('th_drive_taille') : 'moyen'; }
        catch (_) { return 'moyen'; }
      });
      const changerTaille = (dir) => setTaille((t) => {
        const n = TAILLES[Math.min(TAILLES.length - 1, Math.max(0, TAILLES.indexOf(t) + dir))];
        try { localStorage.setItem('th_drive_taille', n); } catch (_) {}
        return n;
      });
      const colonnes = taille === 'petit'
        ? 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-6'
        : taille === 'grand'
          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';

      /* Relancer une version allégée en échec : la vidéo repasse en
         file, le worker la reprend au prochain tour (≤ 30 s). */
      const relancerEncodage = async (it) => {
        const { error } = await sb.from('drive_items')
          .update({ encodage: 'pending', erreur: null }).eq('id', it.id);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        setOuvert(null); setGere(null); charger();
      };

      const fmtOctets = (o) => !o ? '' : (o / 1048576) >= 1024
        ? `${(o / 1073741824).toFixed(1)} Go` : `${Math.max(1, Math.round(o / 1048576))} Mo`;

      /* ── Recherche : dans TOUT le Drive, pas le dossier courant —
         « où est ce fichier ? » est la vraie question. ── */
      const [recherche, setRecherche] = useState('');
      const [resultats, setResultats] = useState(null);   // null = pas de recherche
      useEffect(() => {
        const q = recherche.trim();
        if (!q) { setResultats(null); return; }
        const t = setTimeout(async () => {
          const { data } = await sb.from('drive_items').select('*')
            .ilike('nom', `%${q}%`).order('created_at', { ascending: false }).limit(60);
          setResultats(data || []);
        }, 300);
        return () => clearTimeout(t);
      }, [recherche]);
      /* Ouvrir un dossier trouvé par la recherche : le fil d'Ariane se
         reconstruit en remontant les parents (tous les dossiers sont
         déjà chargés pour « Déplacer »). */
      const ouvrirDossierTrouve = (d) => {
        const parId = new Map(dossiers.map((x) => [x.id, x]));
        const chaine = [];
        let cur = d;
        while (cur && chaine.length < 20) {
          chaine.unshift({ id: cur.id, nom: cur.nom });
          cur = cur.parent_id ? parId.get(cur.parent_id) : null;
        }
        setRecherche(''); setChemin(chaine);
      };

      /* ── Sélection multiple : déplacer et supprimer en lot ── */
      const [selMode, setSelMode] = useState(false);
      const [sels, setSels] = useState(new Set());
      const [destLot, setDestLot] = useState('');
      const basculerSel = (id) => setSels((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
      const finirSel = () => { setSelMode(false); setSels(new Set()); setDestLot(''); };
      const deplacerLot = async () => {
        if (!sels.size) return;
        const { error } = await sb.from('drive_items')
          .update({ parent_id: destLot || null }).in('id', [...sels]);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        finirSel(); charger(); chargerDossiers();
      };
      const supprimerLot = async () => {
        if (!sels.size) return;
        if (!confirm(`Supprimer ${sels.size} élément${sels.size > 1 ? 's' : ''} ?\n\nLes dossiers partent avec leur contenu. Irréversible.`)) return;
        const { data, error } = await sb.from('drive_items')
          .delete().in('id', [...sels]).select('id');
        if (error) { setErr(humaniseErreur(error.message)); return; }
        if ((data || []).length < sels.size) {
          setErr('Seuls vos propres dépôts ont été supprimés — le reste appartient à d’autres.');
        }
        finirSel(); charger(); chargerDossiers();
      };

      // Glisser-déposer : tout l'onglet est une zone de dépôt.
      const [glisse, setGlisse] = useState(false);

      /* ── Envoyer à un client — l'aiguillage intelligent ──────────
         Selon le FICHIER et selon l'ESPACE du client :
           · espace tableau de bord → fiche dans ses Médias (circuit
             de validation) ; une vidéo y reçoit en plus la qualité
             adaptative (même file d'encodage que MediaForm) ;
           · espace livraison + photo → droit dans une de ses
             galeries — les trois variantes existent déjà au Drive ;
           · espace livraison + vidéo → refusé poliment : les films
             passent par le concepteur (encodage cinéma, habillage).
         AUCUNE copie d'octets : la fiche du client POINTE le fichier
         du Drive (supprimer la ligne du Drive ne purge pas B2 — le
         client ne perd jamais rien). Geste réservé au privilège
         « Espaces clients », comme tout ce qui touche aux clients. */
      const peutEnvoyer = MON_ROLE.value !== 'membre' || MES_PRIVILEGES.includes('clients');
      const [envoiClient, setEnvoiClient] = useState('');
      const [galsClient, setGalsClient] = useState(null);
      const [galChoisie, setGalChoisie] = useState('');
      const [busyEnvoi, setBusyEnvoi] = useState(false);
      const [okEnvoi, setOkEnvoi] = useState('');
      const clientChoisi = clients.find((c) => c.id === envoiClient) || null;
      const versLivraison = !!clientChoisi && isDelivery(clientChoisi.universe);
      /* Un DOCUMENT a deux destinations : les Documents du client, ou
         une FACTURE toute neuve dont il devient le PDF (montant et
         référence saisis ici — jamais pour un membre, les factures
         sont l'affaire du studio). */
      const [destEnvoi, setDestEnvoi] = useState('documents');
      const [factMontant, setFactMontant] = useState('');
      const [factRef, setFactRef] = useState('');
      const [okAnnonce, setOkAnnonce] = useState('');
      useEffect(() => {
        setEnvoiClient(''); setOkEnvoi(''); setOkAnnonce('');
        setDestEnvoi('documents'); setFactMontant(''); setFactRef('');
      }, [gere?.id]);

      /* « Je l'ai mis dans le Drive » — dit dans le fil d'équipe,
         avec la carte du fichier. Ouvert à tous les rôles : le chat
         est à tout le monde, et c'est exactement le geste du cadreur
         qui vient de déposer ses rushes. */
      const annoncerDansChat = async (it) => {
        const { data: { user: moiU } } = await sb.auth.getUser();
        const { error } = await sb.from('team_messages').insert({
          agency_id: AGENCY.id, auteur_id: moiU?.id,
          corps: `A déposé « ${it.nom} » dans le Drive`, drive_id: it.id,
        });
        if (error) {
          setErr(/drive_id/.test(error.message || '')
            ? "Le partage au chat n'est pas encore activé : exécutez files/migration-chat-fichiers.sql dans Supabase."
            : humaniseErreur(error.message));
          return;
        }
        setOkAnnonce('Annoncé dans le fil d’équipe — visible dans Messages.');
      };
      useEffect(() => {
        setGalsClient(null); setGalChoisie('');
        if (!envoiClient || !clientChoisi || !isDelivery(clientChoisi.universe)) return;
        sb.from('galleries').select('id, title, kind').eq('client_id', envoiClient)
          .in('kind', ['photos', 'mixte']).order('created_at')
          .then(({ data }) => {
            setGalsClient(data || []);
            if ((data || []).length === 1) setGalChoisie(data[0].id);
          });
      }, [envoiClient]);

      const envoyerAuClient = async () => {
        const it = gere, c = clientChoisi;
        if (!it || !c || busyEnvoi) return;
        setBusyEnvoi(true); setErr(''); setOkEnvoi('');
        try {
          if (it.genre === 'document') {
            if (destEnvoi === 'facture') {
              const montant = parseFloat(String(factMontant).replace(',', '.'));
              if (!(montant > 0)) throw new Error('Indiquez le montant de la facture.');
              const { error } = await sb.from('invoices').insert({
                client_id: c.id,
                reference: factRef.trim() || null,
                description: it.nom.replace(/\.[a-z0-9]+$/i, ''),
                amount: montant,
                date_label: isoToLabel(todayISO()),
                due_date: in30DaysISO(),
                status: 'en attente',
                pdf_url: it.url,
              });
              if (error) throw new Error(humaniseErreur(error.message));
              setOkEnvoi(`Facture créée pour ${c.name} (${montant.toLocaleString('fr-FR')} €) — le PDF du Drive y est joint.`);
            } else {
              const { error } = await sb.from('documents').insert({
                client_id: c.id,
                title: it.nom.replace(/\.[a-z0-9]+$/i, ''),
                category: 'Autre',
                file_url: it.url,
                date_label: isoToLabel(todayISO()),
                size_label: it.taille ? fmtSizeFR(it.taille) : null,
                position: 0,
              });
              if (error) throw new Error(humaniseErreur(error.message));
              setOkEnvoi(`Déposé dans les documents de ${c.name}.`);
            }
          } else if (!versLivraison) {
            const payload = {
              client_id: c.id,
              type: it.genre === 'video' ? 'video' : 'photo',
              title: it.nom.replace(/\.[a-z0-9]+$/i, ''),
              url: it.url,
              thumb_url: it.apercu_url || null,
              date_label: isoToLabel(todayISO()),
              date_iso: todayISO(),
              size_label: it.taille ? fmtSizeFR(it.taille) : null,
              ...(it.genre === 'video' ? {
                duration: it.duree ? fmtDurationLabel(it.duree) : null,
                duration_seconds: it.duree || null,
                source_size_bytes: it.taille || null,
                awaiting_encode: !FEATURES.allUniverses,
              } : {}),
            };
            const { data: m, error } = await sb.from('media').insert(payload).select('id').single();
            if (error) throw new Error(humaniseErreur(error.message));
            if (it.genre === 'video') {
              await enqueueEncode({ kind: 'media', media_id: m.id, source_url: it.url });
            }
            setOkEnvoi(`Envoyé dans les médias de ${c.name}${it.genre === 'video' && !FEATURES.allUniverses
              ? ' — la qualité adaptative arrive toute seule.' : '.'}`);
          } else {
            if (it.genre !== 'photo') throw new Error('Les films d’un espace livraison passent par le concepteur de galerie.');
            if (!galChoisie) throw new Error('Choisissez une galerie.');
            // La catégorie en usage dans cette galerie, sinon « Galerie ».
            const { data: cats } = await sb.from('gallery_photos')
              .select('category, position').eq('gallery_id', galChoisie)
              .order('position', { ascending: false }).limit(1);
            const { error } = await sb.from('gallery_photos').insert({
              gallery_id: galChoisie,
              category: cats?.[0]?.category || 'Galerie',
              position: (cats?.[0]?.position ?? 0) + 1,
              url_original: it.url,
              url_view: it.leger_url || it.url,
              url_grid: it.apercu_url || it.leger_url || it.url,
              width: it.largeur || null,
              height: it.hauteur || null,
            });
            if (error) throw new Error(humaniseErreur(error.message));
            setOkEnvoi(`Ajoutée à la galerie de ${c.name} — visible chez lui dès maintenant.`);
          }
        } catch (e2) { setErr(e2.message); }
        setBusyEnvoi(false);
      };

      const charger = async () => {
        let q = sb.from('drive_items').select('*');
        q = dossier ? q.eq('parent_id', dossier) : q.is('parent_id', null);
        const { data, error } = await q.order('genre').order('nom');
        if (error) {
          setErr(/drive_items/.test(error.message || '')
            ? "Le Drive n'est pas encore activé : exécutez files/migration-drive.sql dans Supabase."
            : humaniseErreur(error.message));
          setItems([]); return;
        }
        setErr(''); setItems(data || []);
      };
      const chargerDossiers = async () => {
        const { data } = await sb.from('drive_items')
          .select('id, nom, parent_id').eq('genre', 'dossier').order('nom');
        setDossiers(data || []);
      };
      useEffect(() => { setItems(null); charger(); }, [dossier]);
      useEffect(() => { chargerDossiers(); }, []);

      // Des versions allégées se préparent ? On repasse voir.
      const enPreparation = (items || []).some((i) => i.genre === 'video'
        && (i.encodage === 'pending' || i.encodage === 'processing'));
      useEffect(() => {
        if (!enPreparation) return;
        const id = setInterval(charger, 15000);
        return () => clearInterval(id);
      }, [enPreparation, dossier]);

      const majEnvoi = (cle, pct) => setEnvois((l) => l.map((e) => (e.cle === cle ? { ...e, pct } : e)));

      const televerser = (e) => {
        const fichiers = Array.from(e.target.files || []);
        e.target.value = '';
        traiterFichiers(fichiers);
      };

      const traiterFichiers = async (fichiers) => {
        for (const f of fichiers) {
          const estImage = /^image\//.test(f.type);
          const estVideo = /^video\//.test(f.type);
          // Tout le reste est un DOCUMENT : contrat, devis, brief,
          // archive… — un disque commun n'a pas à trier à la porte.
          const cle = crypto.randomUUID();
          setEnvois((l) => [...l, { cle, nom: f.name, pct: 0 }]);
          try {
            const base = `agencies/${AGENCY.slug}/drive/${cle}`;
            if (estImage) {
              const v = await variantesImage(f);
              const url = await b2UploadFile(f, `${base}/original-${b2SafeName(f.name)}`, (p) => majEnvoi(cle, p * 0.7));
              const vueUrl = await b2UploadFile(v.vue, `${base}/vue.jpg`, (p) => majEnvoi(cle, 0.7 + p * 0.2));
              const apercuUrl = await b2UploadFile(v.apercu, `${base}/apercu.jpg`, (p) => majEnvoi(cle, 0.9 + p * 0.1));
              const { error } = await sb.from('drive_items').insert({
                agency_id: AGENCY.id, parent_id: dossier, genre: 'photo', nom: f.name,
                url, taille: f.size, mime: f.type, largeur: v.largeur, hauteur: v.hauteur,
                apercu_url: apercuUrl, leger_url: vueUrl,
              });
              if (error) throw new Error(humaniseErreur(error.message));
            } else if (estVideo) {
              const url = await b2UploadFile(f, `${base}/original-${b2SafeName(f.name)}`, (p) => majEnvoi(cle, p));
              const { error } = await sb.from('drive_items').insert({
                agency_id: AGENCY.id, parent_id: dossier, genre: 'video', nom: f.name,
                url, taille: f.size, mime: f.type, encodage: 'pending',
              });
              if (error) throw new Error(humaniseErreur(error.message));
            } else {
              // Document : l'original seul, pas de variante à fabriquer.
              const url = await b2UploadFile(f, `${base}/original-${b2SafeName(f.name)}`, (p) => majEnvoi(cle, p));
              const { error } = await sb.from('drive_items').insert({
                agency_id: AGENCY.id, parent_id: dossier, genre: 'document', nom: f.name,
                url, taille: f.size, mime: f.type || 'application/octet-stream',
              });
              if (error) throw new Error(humaniseErreur(error.message));
            }
          } catch (e2) { setErr(`« ${f.name} » : ${e2.message}`); }
          setEnvois((l) => l.filter((x) => x.cle !== cle));
          charger();
        }
      };

      const creerDossier = async () => {
        const nom = prompt('Nom du dossier ?');
        if (!nom || !nom.trim()) return;
        const { error } = await sb.from('drive_items').insert({
          agency_id: AGENCY.id, parent_id: dossier, genre: 'dossier', nom: nom.trim().slice(0, 200),
        });
        if (error) { setErr(humaniseErreur(error.message)); return; }
        charger(); chargerDossiers();
      };

      const renommer = async (it) => {
        const nom = prompt('Nouveau nom ?', it.nom);
        if (!nom || !nom.trim() || nom.trim() === it.nom) return;
        const { error } = await sb.from('drive_items')
          .update({ nom: nom.trim().slice(0, 200) }).eq('id', it.id);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        setGere(null); charger(); chargerDossiers();
      };

      const deplacer = async (it) => {
        const cible = dest || null;
        if (cible === it.id) return;
        const { error } = await sb.from('drive_items')
          .update({ parent_id: cible }).eq('id', it.id);
        if (error) { setErr(humaniseErreur(error.message)); return; }
        setGere(null); setDest(''); charger(); chargerDossiers();
      };

      const supprimer = async (it) => {
        const avert = it.genre === 'dossier'
          ? `Supprimer le dossier « ${it.nom} » ?\n\nTOUT son contenu part avec. Irréversible.`
          : `Supprimer « ${it.nom} » ?\n\nIrréversible.`;
        if (!confirm(avert)) return;
        const { error } = await sb.from('drive_items').delete().eq('id', it.id);
        if (error) {
          setErr(/policy|row-level/i.test(error.message || '')
            ? 'Seuls vos propres dépôts se suppriment — demandez au patron pour le reste.'
            : humaniseErreur(error.message));
          return;
        }
        setGere(null); setOuvert(null); charger(); chargerDossiers();
      };

      const telechargerOriginal = (it) => {
        try {
          const u = new URL(it.url);
          if (u.hostname === 'media.timelesshouse.org' && u.pathname.startsWith('/file/')) {
            u.pathname = '/telecharger/' + u.pathname.slice('/file/'.length);
            u.searchParams.set('nom', it.nom);
          }
          window.location.href = u.toString();
        } catch (_) { window.location.href = it.url; }
      };

      const fmtDuree = (s) => {
        if (!s && s !== 0) return '';
        const m = Math.floor(s / 60), r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
      };
      const enRecherche = resultats !== null;
      const source = enRecherche ? resultats : (items || []);
      const lesDossiers = source.filter((i) => i.genre === 'dossier');
      const lesFichiers = source.filter((i) => i.genre !== 'dossier');

      const Coche = ({ actif }) => (
        <span aria-hidden="true"
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${actif ? 'bg-emerald-500 border-emerald-500' : 'border-stone-400 bg-white/70'}`}>
          {actif && <Check size={11} className="text-white" />}
        </span>
      );

      return (
        <div
          onDragOver={(e) => { e.preventDefault(); setGlisse(true); }}
          onDragLeave={() => setGlisse(false)}
          onDrop={(e) => { e.preventDefault(); setGlisse(false); traiterFichiers(Array.from(e.dataTransfer?.files || [])); }}
          className={glisse ? 'rounded-[24px] outline-dashed outline-2 outline-stone-400 outline-offset-4' : ''}>
          {/* ─── Fil d'Ariane + actions ─── */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-[13px]">
              <button type="button" onClick={() => setChemin([])}
                className={`min-h-[44px] px-2 font-semibold ${chemin.length ? 'text-stone-500 hover:text-stone-800' : ''}`}>
                Drive
              </button>
              {chemin.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1.5 min-w-0">
                  <ChevronRight size={12} className="text-stone-400 shrink-0" />
                  <button type="button" onClick={() => setChemin(chemin.slice(0, i + 1))}
                    className={`min-h-[44px] px-1 truncate max-w-[140px] ${i === chemin.length - 1 ? 'font-semibold' : 'text-stone-500 hover:text-stone-800'}`}>
                    {c.nom}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <button type="button" onClick={() => { charger(); chargerDossiers(); }}
                aria-label="Actualiser" title="Actualiser" style={neu.raisedXs}
                className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <RefreshCw size={15} />
              </button>
              <button type="button" onClick={() => poserVue(vue === 'grille' ? 'liste' : 'grille')}
                aria-label={vue === 'grille' ? 'Passer en liste' : 'Passer en grille'}
                title={vue === 'grille' ? 'Passer en liste' : 'Passer en grille'}
                style={neu.raisedXs}
                className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                {vue === 'grille' ? <List size={15} /> : <LayoutGrid size={15} />}
              </button>
              {vue === 'grille' && (
                <>
                  <button type="button" onClick={() => changerTaille(-1)} disabled={taille === 'petit'}
                    aria-label="Icônes plus petites" title="Icônes plus petites" style={neu.raisedXs}
                    className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform disabled:opacity-35">
                    <ZoomOut size={15} />
                  </button>
                  <button type="button" onClick={() => changerTaille(1)} disabled={taille === 'grand'}
                    aria-label="Icônes plus grandes" title="Icônes plus grandes" style={neu.raisedXs}
                    className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform disabled:opacity-35">
                    <ZoomIn size={15} />
                  </button>
                </>
              )}
              <Btn kind={selMode ? 'dark' : 'soft'} onClick={() => (selMode ? finirSel() : setSelMode(true))}>
                {selMode ? 'Terminer' : 'Sélectionner'}
              </Btn>
              <Btn icon={FolderOpen} onClick={creerDossier}>Nouveau dossier</Btn>
              <Btn kind="dark" icon={Upload} onClick={() => fichierRef.current?.click()}>Téléverser</Btn>
              <input ref={fichierRef} type="file" multiple
                className="hidden" onChange={televerser} />
            </div>
          </div>

          {/* ─── Recherche : tout le Drive, où que l'on soit ─── */}
          <div className="mb-4">
            <Input value={recherche} onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans tout le Drive…" aria-label="Rechercher dans le Drive" />
            {enRecherche && (
              <div className="text-[11.5px] text-stone-500 mt-1.5">
                {source.length} résultat{source.length > 1 ? 's' : ''} dans tout le Drive — effacez la recherche pour revenir au dossier.
              </div>
            )}
          </div>

          {/* ─── Barre de lot (sélection multiple) ─── */}
          {selMode && (
            <div style={neu.raised} className="rounded-2xl p-3 mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-semibold px-1">
                {sels.size} sélectionné{sels.size > 1 ? 's' : ''}
              </span>
              <div className="flex-1 min-w-[170px]">
                <Select value={destLot} onChange={(e) => setDestLot(e.target.value)}>
                  <option value="">Racine du Drive</option>
                  {dossiers.filter((d) => !sels.has(d.id)).map((d) => (
                    <option key={d.id} value={d.id}>{d.nom}</option>
                  ))}
                </Select>
              </div>
              <Btn kind="dark" onClick={deplacerLot} disabled={!sels.size}>Déplacer</Btn>
              <Btn icon={Trash2} onClick={supprimerLot} disabled={!sels.size} className="text-rose-600">Supprimer</Btn>
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {/* ─── Téléversements en cours ─── */}
          {envois.length > 0 && (
            <div style={neu.raised} className="rounded-2xl p-4 mb-4 space-y-2.5">
              {envois.map((e2) => (
                <div key={e2.cle}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="truncate">{e2.nom}</span>
                    <span className="text-stone-500 tabular-nums shrink-0">{Math.round((e2.pct || 0) * 100)} %</span>
                  </div>
                  <div style={neu.pressedSm} className="h-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-stone-800 transition-all" style={{ width: `${Math.round((e2.pct || 0) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {items === null && !enRecherche ? (
            <div className="py-16 flex justify-center"><Loader2 size={18} className="animate-spin text-stone-400" /></div>
          ) : !lesDossiers.length && !lesFichiers.length && !envois.length ? (
            <div style={neu.pressed} className="rounded-[24px] p-10 text-center">
              <div style={neu.dark} className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white mb-4">
                <FolderOpen size={20} />
              </div>
              <div className="text-[15px] font-semibold">
                {enRecherche ? `Rien pour « ${recherche.trim()} »` : "Rien ici pour l'instant"}
              </div>
              <p className="text-[12.5px] text-stone-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                {enRecherche
                  ? 'Essayez un autre mot — la recherche parcourt les noms de tout le Drive.'
                  : 'Déposez photos et vidéos, rangez-les en dossiers — toute l’équipe y accède. Les vidéos reçoivent une version allégée, prête à regarder d’un clic.'}
              </p>
            </div>
          ) : vue === 'liste' ? (
            /* ─── Vue LISTE : une ligne par élément, vignette carrée ─── */
            <div className="space-y-1.5">
              {lesDossiers.map((d) => (
                <div key={d.id} style={neu.raisedXs} className="rounded-xl flex items-center">
                  <button type="button"
                    onClick={() => selMode ? basculerSel(d.id)
                      : enRecherche ? ouvrirDossierTrouve(d)
                      : setChemin([...chemin, { id: d.id, nom: d.nom }])}
                    aria-pressed={selMode ? sels.has(d.id) : undefined}
                    className="flex-1 min-w-0 min-h-[52px] px-3 flex items-center gap-3 text-left">
                    {selMode && <Coche actif={sels.has(d.id)} />}
                    <FolderOpen size={17} className="text-stone-500 shrink-0" />
                    <span className="text-[13px] font-semibold truncate">{d.nom}</span>
                  </button>
                  {!selMode && (
                    <button type="button" onClick={() => { setGere(d); setDest(''); }}
                      aria-label={`Options du dossier ${d.nom}`}
                      className="w-11 min-h-[52px] flex items-center justify-center text-stone-400 hover:text-stone-700 shrink-0">
                      ⋯
                    </button>
                  )}
                </div>
              ))}
              {lesFichiers.map((f) => (
                <div key={f.id} style={neu.raisedXs} className="rounded-xl flex items-center">
                  <button type="button" onClick={() => selMode ? basculerSel(f.id) : setOuvert(f)}
                    aria-pressed={selMode ? sels.has(f.id) : undefined}
                    className="flex-1 min-w-0 min-h-[56px] px-2.5 py-1.5 flex items-center gap-3 text-left">
                    {selMode && <Coche actif={sels.has(f.id)} />}
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-900/85 shrink-0 relative">
                      {f.apercu_url ? (
                        <img src={f.apercu_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400">
                          {f.genre === 'video' ? <Video size={15} />
                            : f.genre === 'document' ? <FileText size={15} /> : <ImageIcon size={15} />}
                        </div>
                      )}
                      {f.genre === 'video' && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-[10px]">▶</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{f.nom}</div>
                      <div className="text-[10.5px] text-stone-500 mt-0.5">
                        {f.genre === 'video' ? 'Vidéo' : f.genre === 'document' ? 'Document' : 'Photo'}
                        {f.taille ? ` · ${fmtOctets(f.taille)}` : ''}
                        {f.genre === 'video' && f.duree != null ? ` · ${fmtDuree(f.duree)}` : ''}
                        {f.genre === 'video' && f.encodage !== 'done' && (
                          <span className={f.encodage === 'error' ? 'text-rose-600 font-semibold' : 'text-amber-700'}>
                            {f.encodage === 'error' ? ' · version allégée en échec' : ' · en préparation…'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  {!selMode && (
                    <button type="button" onClick={() => { setGere(f); setDest(''); }}
                      aria-label={`Options de ${f.nom}`}
                      className="w-11 min-h-[56px] flex items-center justify-center text-stone-400 hover:text-stone-700 shrink-0">
                      ⋯
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              {lesDossiers.length > 0 && (
                <div className={`grid ${colonnes} gap-3 mb-4`}>
                  {lesDossiers.map((d) => (
                    <div key={d.id} style={neu.raisedXs} className="rounded-2xl flex items-center">
                      <button type="button"
                        onClick={() => selMode ? basculerSel(d.id)
                          : enRecherche ? ouvrirDossierTrouve(d)
                          : setChemin([...chemin, { id: d.id, nom: d.nom }])}
                        aria-pressed={selMode ? sels.has(d.id) : undefined}
                        className="flex-1 min-w-0 min-h-[52px] px-3.5 flex items-center gap-2.5 text-left">
                        {selMode && <Coche actif={sels.has(d.id)} />}
                        <FolderOpen size={17} className="text-stone-500 shrink-0" />
                        <span className="text-[13px] font-semibold truncate">{d.nom}</span>
                      </button>
                      {!selMode && (
                        <button type="button" onClick={() => { setGere(d); setDest(''); }}
                          aria-label={`Options du dossier ${d.nom}`}
                          className="w-11 min-h-[52px] flex items-center justify-center text-stone-400 hover:text-stone-700 shrink-0">
                          ⋯
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {lesFichiers.length > 0 && (
                <div className={`grid ${colonnes} gap-3`}>
                  {lesFichiers.map((f) => (
                    <div key={f.id} style={neu.raised} className="rounded-2xl overflow-hidden group relative">
                      <button type="button" onClick={() => selMode ? basculerSel(f.id) : setOuvert(f)}
                        aria-pressed={selMode ? sels.has(f.id) : undefined}
                        className="block w-full text-left">
                        <div className="aspect-[4/3] bg-stone-900/85 relative">
                          {f.apercu_url ? (
                            <img src={f.apercu_url} alt={f.nom} loading="lazy"
                              className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-400">
                              {f.genre === 'video' ? <Video size={22} />
                                : f.genre === 'document' ? <FileText size={22} /> : <ImageIcon size={22} />}
                            </div>
                          )}
                          {f.genre === 'video' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="w-11 h-11 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm">▶</span>
                            </div>
                          )}
                          {f.genre === 'video' && f.duree != null && (
                            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10.5px] tabular-nums">
                              {fmtDuree(f.duree)}
                            </span>
                          )}
                          {f.genre === 'video' && f.encodage !== 'done' && (
                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-amber-300 text-[10px]">
                              {f.encodage === 'error' ? 'version allégée en échec' : 'en préparation…'}
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2.5">
                          <div className="text-[12.5px] font-medium truncate">{f.nom}</div>
                          <div className="text-[10.5px] text-stone-500 mt-0.5">
                            {f.genre === 'video' ? 'Vidéo' : f.genre === 'document' ? 'Document' : 'Photo'}{f.taille ? ` · ${fmtOctets(f.taille)}` : ''}
                          </div>
                        </div>
                      </button>
                      {selMode ? (
                        <span className="absolute top-2 left-2"><Coche actif={sels.has(f.id)} /></span>
                      ) : (
                        <button type="button" onClick={() => { setGere(f); setDest(''); }}
                          aria-label={`Options de ${f.nom}`}
                          className="absolute top-1.5 right-1.5 tap-ext w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
                          ⋯
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Visionneuse ─── */}
          {ouvert && (
            <Modal title={ouvert.nom} kicker={ouvert.genre === 'video' ? 'Vidéo' : ouvert.genre === 'document' ? 'Document' : 'Photo'}
              onClose={() => setOuvert(null)} size="lg">
              <div className="space-y-4">
                {ouvert.genre === 'document' ? (
                  (/pdf/i.test(ouvert.mime || '') || /\.pdf$/i.test(ouvert.nom)) ? (
                    <iframe src={ouvert.url} title={ouvert.nom} className="w-full h-[65vh] rounded-xl bg-white" />
                  ) : (
                    <div style={neu.pressedSm} className="rounded-xl p-8 text-center">
                      <FileText size={28} className="mx-auto text-stone-400 mb-3" />
                      <div className="text-[13.5px] font-semibold">Pas d'aperçu pour ce type de fichier</div>
                      <p className="text-[12px] text-stone-500 mt-1.5">Téléchargez-le pour l'ouvrir.</p>
                    </div>
                  )
                ) : ouvert.genre === 'photo' ? (
                  <img src={ouvert.leger_url || ouvert.url} alt={ouvert.nom}
                    className="w-full max-h-[65vh] object-contain rounded-xl bg-stone-900/85" />
                ) : ouvert.encodage === 'done' && ouvert.leger_url ? (
                  <video controls autoPlay playsInline src={ouvert.leger_url} poster={ouvert.apercu_url || undefined}
                    className="w-full max-h-[65vh] rounded-xl bg-black" />
                ) : (
                  <div style={neu.pressedSm} className="rounded-xl p-8 text-center">
                    {ouvert.apercu_url && (
                      <img src={ouvert.apercu_url} alt="" className="max-h-[40vh] mx-auto rounded-lg mb-4" />
                    )}
                    <div className="text-[13.5px] font-semibold">
                      {ouvert.encodage === 'error'
                        ? 'La version allégée a échoué'
                        : 'La version allégée se prépare'}
                    </div>
                    <p className="text-[12px] text-stone-500 mt-1.5 leading-relaxed">
                      {ouvert.encodage === 'error'
                        ? (ouvert.erreur || 'Le fichier est peut-être illisible.') + ' L’original reste téléchargeable.'
                        : 'Quelques minutes après le dépôt — en attendant, l’original se télécharge.'}
                    </p>
                    {ouvert.encodage === 'error' && (
                      <div className="mt-4">
                        <Btn kind="dark" icon={RefreshCw} onClick={() => relancerEncodage(ouvert)}>
                          Réessayer l'encodage
                        </Btn>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 justify-end flex-wrap">
                  <Btn icon={Download} onClick={() => telechargerOriginal(ouvert)}>
                    Télécharger l'original{ouvert.taille ? ` (${fmtOctets(ouvert.taille)})` : ''}
                  </Btn>
                  <Btn onClick={() => setOuvert(null)}>Fermer</Btn>
                </div>
              </div>
            </Modal>
          )}

          {/* ─── Fiche ⋯ : renommer, déplacer, télécharger, supprimer ─── */}
          {gere && (
            <Modal title={gere.nom} kicker={gere.genre === 'dossier' ? 'Dossier' : gere.genre === 'video' ? 'Vidéo' : gere.genre === 'document' ? 'Document' : 'Photo'}
              onClose={() => setGere(null)}>
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Btn icon={Edit3} onClick={() => renommer(gere)}>Renommer</Btn>
                  {gere.genre !== 'dossier' && (
                    <Btn icon={Download} onClick={() => telechargerOriginal(gere)}>Télécharger l'original</Btn>
                  )}
                  {gere.genre === 'video' && gere.encodage === 'error' && (
                    <Btn icon={RefreshCw} onClick={() => relancerEncodage(gere)}>Réessayer l'encodage</Btn>
                  )}
                  {gere.genre !== 'dossier' && (
                    <Btn icon={MessageSquare} onClick={() => annoncerDansChat(gere)}>Annoncer dans le chat</Btn>
                  )}
                  <Btn icon={Trash2} onClick={() => supprimer(gere)} className="text-rose-600">Supprimer</Btn>
                </div>
                {okAnnonce && (
                  <div className="text-[12px] text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="shrink-0" /> {okAnnonce}
                  </div>
                )}
                <Field label="Déplacer vers">
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Select value={dest} onChange={(e) => setDest(e.target.value)}>
                        <option value="">Racine du Drive</option>
                        {dossiers.filter((d) => d.id !== gere.id && d.id !== gere.parent_id).map((d) => (
                          <option key={d.id} value={d.id}>{d.nom}</option>
                        ))}
                      </Select>
                    </div>
                    <Btn kind="dark" onClick={() => deplacer(gere)}>Déplacer</Btn>
                  </div>
                </Field>

                {gere.genre !== 'dossier' && peutEnvoyer && (
                  <Field label="Envoyer à un client">
                    <div className="space-y-2">
                      <Select value={envoiClient} onChange={(e) => { setEnvoiClient(e.target.value); setOkEnvoi(''); }}>
                        <option value="">— choisir un espace client —</option>
                        {clients.filter((c) => c.active !== false).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                      {clientChoisi && gere.genre === 'document' && (
                        <>
                          <Select value={destEnvoi} onChange={(e) => setDestEnvoi(e.target.value)}>
                            <option value="documents">Dans ses Documents</option>
                            {MON_ROLE.value !== 'membre' && (
                              <option value="facture">En faire une facture (le PDF joint)</option>
                            )}
                          </Select>
                          {destEnvoi === 'facture' && (
                            <div className="space-y-2">
                              <Input type="number" min="0" step="0.01" value={factMontant}
                                onChange={(e) => setFactMontant(e.target.value)}
                                placeholder="Montant (€) *" aria-label="Montant de la facture" />
                              <Input value={factRef} onChange={(e) => setFactRef(e.target.value)}
                                placeholder="Référence (FAC-2026-…)" aria-label="Référence de la facture" />
                            </div>
                          )}
                        </>
                      )}
                      {clientChoisi && !versLivraison && gere.genre !== 'document' && (
                        <div className="text-[11px] text-stone-500">
                          {gere.genre === 'video'
                            ? 'Ira dans ses Médias avec le circuit de validation — la qualité adaptative suivra toute seule.'
                            : 'Ira dans ses Médias, avec le circuit de validation.'}
                        </div>
                      )}
                      {clientChoisi && versLivraison && gere.genre === 'photo' && (
                        galsClient === null ? (
                          <div className="text-[11px] text-stone-500">Ses galeries arrivent…</div>
                        ) : !galsClient.length ? (
                          <div className="text-[11px] text-amber-700">
                            Cet espace n'a pas encore de galerie photos — créez-la d'abord dans le concepteur.
                          </div>
                        ) : (
                          <Select value={galChoisie} onChange={(e) => setGalChoisie(e.target.value)}>
                            <option value="">— choisir la galerie —</option>
                            {galsClient.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                          </Select>
                        )
                      )}
                      {clientChoisi && versLivraison && gere.genre === 'video' && (
                        <div className="text-[11px] text-amber-700">
                          Les films d'un espace livraison passent par le concepteur de galerie
                          (encodage cinéma, habillage) — cet envoi ne couvre que les photos.
                        </div>
                      )}
                      <Btn kind="dark" icon={busyEnvoi ? Loader2 : Send}
                        disabled={busyEnvoi || !clientChoisi
                          || (gere.genre !== 'document' && versLivraison && (gere.genre !== 'photo' || !galChoisie))
                          || (gere.genre === 'document' && destEnvoi === 'facture' && !(parseFloat(String(factMontant).replace(',', '.')) > 0))}
                        onClick={envoyerAuClient}>
                        {busyEnvoi ? 'Envoi…' : 'Envoyer'}
                      </Btn>
                      {okEnvoi && (
                        <div className="text-[12px] text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="shrink-0" /> {okEnvoi}
                        </div>
                      )}
                    </div>
                  </Field>
                )}
              </div>
            </Modal>
          )}
        </div>
      );
    }

    /* L'onglet « Mes tâches » du membre : le MÊME bloc que dans
       Équipe (une liste, un état, une urgence), servi seul — tout ce
       qui lui est confié, sans le bruit de la gestion d'équipe. */
    function MesTachesTab({ clients }) {
      const [equipe, setEquipe] = useState([]);
      useEffect(() => {
        sb.rpc('equipe_agence').then(({ data }) => setEquipe(data || [])).catch(() => {});
      }, []);
      return <MesTaches equipe={equipe} clients={clients} />;
    }

    function EquipeTab({ clients, user }) {
      const [equipe, setEquipe] = useState(null);   // null = chargement
      const [err, setErr] = useState('');
      const [inviter, setInviter] = useState(false);
      const [form, setForm] = useState({ email: '', display_name: '', metier: '', role: 'membre', privileges: [] });
      const [busy, setBusy] = useState(false);
      const [cree, setCree] = useState(null);       // identifiants — affichés UNE fois
      const [copie, setCopie] = useState(false);
      const [editId, setEditId] = useState(null);
      const [edit, setEdit] = useState({ display_name: '', metier: '', role: 'membre', privileges: [] });
      const [busyLigne, setBusyLigne] = useState(null);

      const charger = async () => {
        const { data, error } = await sb.rpc('equipe_agence');
        if (error) {
          setErr(/equipe_agence/.test(error.message || '')
            ? "L'équipe n'est pas encore activée : exécutez files/migration-comm-calendrier.sql dans Supabase."
            : humaniseErreur(error.message));
          setEquipe([]); return;
        }
        setEquipe(data || []);
      };
      useEffect(() => { charger(); }, []);

      /* La CHARGE de chacun : ses tâches ouvertes, et ses retards —
         la réponse d'un coup d'œil à « qui est libre jeudi ? ».
         Rechargée quand le bloc des tâches (dessous) bouge. */
      const [charge, setCharge] = useState([]);
      const chargerCharge = async () => {
        const { data } = await sb.from('tasks')
          .select('assigne_a, due_on, fait_le').is('fait_le', null);
        setCharge(data || []);
      };
      useEffect(() => { chargerCharge(); }, []);
      const cleAujE = (() => { const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      const chargeDe = (id) => {
        const miennes = charge.filter((t) => t.assigne_a === id);
        return { enCours: miennes.length, retard: miennes.filter((t) => t.due_on && t.due_on < cleAujE).length };
      };

      const monRole = (equipe || []).find((m) => m.user_id === user?.id)?.role || MON_ROLE.value;
      const patron = monRole === 'owner';
      // Qui ai-je le droit de gérer ? (le serveur revérifie tout)
      const gerable = (m) => m.user_id !== user?.id && m.role !== 'owner'
        && (patron || m.role === 'membre');

      const appel = async (corps) => {
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/team-member`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify(corps),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Échec (${res.status})`);
        return json;
      };

      const inviterMembre = async (e) => {
        e.preventDefault();
        if (busy || !form.email.trim()) return;
        setBusy(true); setErr(''); setCree(null);
        try {
          const j = await appel({ action: 'invite', ...form });
          setCree(j.member);
          setForm({ email: '', display_name: '', metier: '', role: 'membre', privileges: [] });
          setInviter(false);
          charger();
        } catch (e2) { setErr(e2.message); }
        setBusy(false);
      };

      const ouvrirEdition = (m) => {
        setEdit({
          display_name: m.nom && !m.nom.includes('@') ? m.nom : '',
          metier: m.metier || '',
          role: m.role,
          privileges: Array.isArray(m.privileges) ? m.privileges : [],
        });
        setEditId(m.user_id);
      };

      const enregistrerLigne = async (m) => {
        setBusyLigne(m.user_id); setErr('');
        try {
          await appel({ action: 'update', user_id: m.user_id, ...edit });
          setEditId(null);
          charger();
        } catch (e2) { setErr(e2.message); }
        setBusyLigne(null);
      };

      const retirer = async (m) => {
        if (!confirm(`Retirer ${m.nom} de l'équipe ?\n\nSes tâches restent visibles (non assignées à quelqu'un d'autre), et son compte n'est pas supprimé — seul son accès à cette agence s'arrête.`)) return;
        setBusyLigne(m.user_id); setErr('');
        try {
          await appel({ action: 'remove', user_id: m.user_id });
          charger();
        } catch (e2) { setErr(e2.message); }
        setBusyLigne(null);
      };

      const copierIds = () => {
        try {
          const porte = AGENCY.slug && AGENCY.slug !== 'timelesshouse'
            ? `https://${AGENCY.slug}.laloge.house/communication-admin`
            : 'https://app.timelesshouse.org/communication-admin';
          navigator.clipboard.writeText(`Console : ${porte}\nEmail : ${cree.email}\nMot de passe temporaire : ${cree.temp_password}`);
          setCopie(true); setTimeout(() => setCopie(false), 2000);
        } catch (e2) {}
      };

      return (
        <div className="space-y-5 lg:space-y-6">
          {/* ─── Identifiants du coéquipier : affichés UNE fois ─── */}
          {cree && (
            <div style={neu.dark} className="rounded-3xl p-6 text-white">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <div className="text-[15px] font-semibold tracking-tight">
                  {cree.existing_account ? 'Coéquipier rattaché' : 'Coéquipier invité'}
                </div>
              </div>
              {cree.temp_password ? (
                <>
                  <div className="text-[12.5px] text-stone-300 mt-3 leading-relaxed">
                    Transmettez-lui ces identifiants — le mot de passe ne sera <strong>plus jamais affiché</strong>.
                    Il pourra le changer dans ses Paramètres.
                  </div>
                  <div className="mt-4 grid gap-2 text-[13.5px] font-mono bg-white/10 rounded-2xl p-4 break-all">
                    <div>{cree.email}</div>
                    <div className="tracking-wider">{cree.temp_password}</div>
                  </div>
                  <div className="mt-4">
                    <Btn icon={Copy} onClick={copierIds}>{copie ? 'Copié ✓' : 'Copier les identifiants'}</Btn>
                  </div>
                </>
              ) : (
                <div className="text-[12.5px] text-stone-300 mt-3 leading-relaxed">
                  <span className="font-mono">{cree.email}</span> avait déjà un compte : il est rattaché
                  à votre équipe avec son mot de passe habituel.
                </div>
              )}
            </div>
          )}

          {/* ─── L'équipe ─── */}
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>L'équipe</h2>
                <p className="text-[12.5px] text-stone-500 mt-1.5 leading-relaxed">
                  Chaque coéquipier a son propre compte : il voit l'agenda et coche ses tâches.
                </p>
              </div>
              {(patron || monRole === 'admin') && (
                <Btn kind={inviter ? 'soft' : 'dark'} icon={UserPlus} onClick={() => { setInviter(!inviter); setCree(null); }}>
                  {inviter ? 'Annuler' : 'Inviter un coéquipier'}
                </Btn>
              )}
            </div>

            {inviter && (
              <form onSubmit={inviterMembre} className="space-y-4 mt-5">
                <Field label="Email *">
                  <Input type="email" required value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="camille@studio.fr" />
                </Field>
                <Field label="Prénom (affiché dans les tâches)">
                  <Input value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="Camille" />
                </Field>
                <Field label="Métier">
                  <Input value={form.metier}
                    onChange={(e) => setForm((f) => ({ ...f, metier: e.target.value }))}
                    placeholder="Cadreur, monteur, community manager…" />
                </Field>
                {patron && (
                  <Field label="Rôle">
                    <div style={neu.pressedSm} className="rounded-xl">
                      <select value={form.role}
                        onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                        className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-transparent text-[16px] sm:text-[14px] appearance-none">
                        <option value="membre">Membre — travaille, coche ses tâches</option>
                        <option value="admin">Admin — gère aussi l'équipe et les clients</option>
                      </select>
                    </div>
                  </Field>
                )}
                {form.role === 'membre' && (
                  <Field label="Privilèges">
                    <PrivilegesMembre valeurs={form.privileges}
                      onChange={(p) => setForm((f) => ({ ...f, privileges: p }))} />
                  </Field>
                )}
                <Btn kind="dark" icon={busy ? Loader2 : UserPlus} disabled={busy || !form.email.trim()}
                  onClick={inviterMembre}>
                  {busy ? 'Invitation…' : 'Créer son compte'}
                </Btn>
              </form>
            )}

            {err && (
              <div className="flex items-start gap-2 p-3 mt-4 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
              </div>
            )}

            {equipe === null ? (
              <div className="py-10 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>
            ) : (
              <div className="space-y-2.5 mt-5">
                {equipe.map((m) => (
                  <div key={m.user_id} style={neu.pressedSm} className="rounded-2xl px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">
                          {m.nom}{m.user_id === user?.id && <span className="text-stone-400 font-normal"> (vous)</span>}
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          {ROLES_EQUIPE[m.role] || m.role}{m.metier ? ` · ${m.metier}` : ''}
                          {m.role === 'membre' && (() => {
                            const p = Array.isArray(m.privileges) ? m.privileges : [];
                            const noms = [p.includes('clients') && 'accès clients',
                                          p.includes('posts') && 'publications',
                                          p.includes('taches') && 'donne des tâches'].filter(Boolean);
                            return ` · ${noms.length ? noms.join(', ') : 'chat, agenda et tâches'}`;
                          })()}
                        </div>
                        {(() => {
                          const c = chargeDe(m.user_id);
                          if (!c.enCours) return (
                            <div className="text-[11px] text-stone-400 mt-1">Aucune tâche en cours</div>
                          );
                          return (
                            <div className="text-[11px] mt-1">
                              <span className="text-stone-500">{c.enCours} tâche{c.enCours > 1 ? 's' : ''} en cours</span>
                              {c.retard > 0 && (
                                <span className="text-rose-600 font-semibold"> · {c.retard} en retard</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {gerable(m) && editId !== m.user_id && (
                        <div className="flex gap-2 shrink-0">
                          <Btn onClick={() => ouvrirEdition(m)} disabled={busyLigne === m.user_id}>Modifier</Btn>
                          <Btn icon={Trash2} onClick={() => retirer(m)} disabled={busyLigne === m.user_id}
                            className="text-rose-600">{busyLigne === m.user_id ? '…' : 'Retirer'}</Btn>
                        </div>
                      )}
                    </div>
                    {editId === m.user_id && (
                      <div className="space-y-3 mt-4">
                        <Field label="Prénom">
                          <Input value={edit.display_name}
                            onChange={(e) => setEdit((v) => ({ ...v, display_name: e.target.value }))}
                            placeholder="Camille" />
                        </Field>
                        <Field label="Métier">
                          <Input value={edit.metier}
                            onChange={(e) => setEdit((v) => ({ ...v, metier: e.target.value }))}
                            placeholder="Cadreur, monteur…" />
                        </Field>
                        {patron && (
                          <Field label="Rôle">
                            <div style={neu.pressedSm} className="rounded-xl">
                              <select value={edit.role}
                                onChange={(e) => setEdit((v) => ({ ...v, role: e.target.value }))}
                                className="w-full px-4 py-3 min-h-[44px] rounded-xl bg-transparent text-[16px] sm:text-[14px] appearance-none">
                                <option value="membre">Membre</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                          </Field>
                        )}
                        {edit.role === 'membre' && (
                          <Field label="Privilèges">
                            <PrivilegesMembre valeurs={edit.privileges}
                              onChange={(p) => setEdit((v) => ({ ...v, privileges: p }))} />
                          </Field>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Btn kind="dark" onClick={() => enregistrerLigne(m)} disabled={busyLigne === m.user_id}>
                            {busyLigne === m.user_id ? 'Enregistrement…' : 'Enregistrer'}
                          </Btn>
                          <Btn onClick={() => setEditId(null)} disabled={busyLigne === m.user_id}>Annuler</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* La discussion vit dans l'onglet « Messages » (01/08/2026) —
              une messagerie mérite un plein écran, pas un fond de page. */}

          {/* ─── Les tâches — déménagées depuis l'Agenda. `onChange`
              remonte : cocher une tâche rafraîchit la charge au-dessus.
              Un MEMBRE a désormais SON onglet « Mes tâches » : ici, ce
              serait un doublon — on ne montre le bloc qu'aux gérants. ─── */}
          {MON_ROLE.value !== 'membre' && (
            <MesTaches equipe={equipe || []} clients={clients} onChange={chargerCharge} />
          )}
        </div>
      );
    }

    /* ── Programmer un post ────────────────────────────────────────
       Un contenu, plusieurs SORTIES : le client ne valide qu'une fois,
       les commentaires ne se dispersent pas, et le jour où Meta et
       TikTok valideront les apps, chaque sortie saura se publier seule
       sans qu'on touche au modèle. */
    function PostForm({ clients, onClose, onSaved }) {
      const [titre, setTitre] = useState('');
      const [client, setClient] = useState('');
      const [brief, setBrief] = useState('');
      const [jour, setJour] = useState('');
      const [heure, setHeure] = useState('18:00');
      const [reseaux, setReseaux] = useState(['instagram']);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');

      const basculerReseau = (r) =>
        setReseaux((l) => l.includes(r) ? l.filter((x) => x !== r) : [...l, r]);

      const enregistrer = async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!titre.trim()) { setErr('Donnez un titre au post.'); return; }
        if (!reseaux.length) { setErr('Choisissez au moins un réseau.'); return; }
        setBusy(true); setErr('');
        try {
          const { data: post, error: e1 } = await sb.from('posts').insert({
            agency_id: AGENCY.id,
            client_id: client || null,
            title: titre.trim(),
            brief: brief.trim() || null,
            /* Daté = programmé ; sans date, ce n'est encore qu'une idée.
               L'état DIT la réalité, il ne la décrète pas. */
            statut: jour ? 'programme' : 'idee',
          }).select().single();
          if (e1) throw e1;

          if (jour) {
            /* La date part en heure LOCALE : « mardi 18h » doit rester
               mardi 18h. Un ISO construit à la main serait interprété
               en UTC et décalerait la sortie de deux heures en été. */
            const sorties = reseaux.map((r) => ({
              post_id: post.id, reseau: r,
              prevue_le: new Date(`${jour}T${heure || '00:00'}`).toISOString(),
            }));
            const { error: e2 } = await sb.from('post_sorties').insert(sorties);
            if (e2) throw e2;
          }
          onSaved();
        } catch (e2) {
          setErr(/relation .*posts/.test(e2.message || '')
            ? "L'agenda n'est pas encore activé : exécutez files/migration-comm-calendrier.sql dans Supabase."
            : humaniseErreur(e2.message));
          setBusy(false);
        }
      };

      return (
        <Modal onClose={onClose} title="Programmer un post">
          <form onSubmit={enregistrer} className="space-y-4">
            <Field label="Titre">
              <Input value={titre} onChange={(e) => setTitre(e.target.value)}
                placeholder="Reel — coulisses du tournage Era" required />
            </Field>
            <Field label="Pour quelle marque">
              <Select value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">— aucune en particulier —</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Intention, script, angle">
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
                placeholder="Ce qu'on raconte, et pourquoi." />
            </Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Date de sortie">
                <Input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">
                  {jour ? 'Le post apparaîtra dans l’agenda.' : 'Sans date, il reste une idée — modifiable plus tard.'}
                </div>
              </Field>
              <Field label="Heure">
                <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} disabled={!jour} />
              </Field>
            </div>

            <Field label="Sur quels réseaux">
              <div className="flex flex-wrap gap-2">
                {Object.entries(RESEAUX).map(([id, r]) => {
                  const on = reseaux.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => basculerReseau(id)}
                      aria-pressed={on}
                      className="min-h-[44px] px-4 rounded-full text-[12.5px] font-semibold transition active:scale-95"
                      style={on
                        ? { background: r.c, color: '#fff' }
                        : { ...neu.raisedXs, color: '#57534e' }}>
                      {r.l}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-stone-500 mt-2">
                Un seul contenu, une sortie par réseau — le client ne valide qu'une fois.
              </div>
            </Field>

            {err && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Btn onClick={onClose}>Annuler</Btn>
              <Btn kind="dark" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Programmer'}</Btn>
            </div>
          </form>
        </Modal>
      );
    }

    function RevenusTab({ user, onClients }) {
      const [factures, setFactures] = useState(null); // null = chargement
      const [err, setErr] = useState('');
      // Config fiscale — chargée du compte, enregistrée sur le compte
      const meta = user?.user_metadata?.laloge_fiscal || {};
      const [statut, setStatut] = useState(meta.statut || 'micro_bnc');
      const [urssaf, setUrssaf] = useState(meta.urssaf ?? STATUTS_FISCAUX[meta.statut || 'micro_bnc'].urssaf);
      const [vfl, setVfl] = useState(meta.vfl ?? false);
      // Périodicité des déclarations URSSAF — celle choisie par le
      // locataire sur autoentrepreneur.urssaf.fr. C'est elle qui dit
      // COMBIEN préparer et POUR QUAND (l'annuel seul serait frustrant).
      const [periodicite, setPeriodicite] = useState(meta.periodicite || 'mensuelle');
      // Les taux changent au 1er janvier : on mémorise l'année de la
      // dernière vérification pour alerter chaque nouvelle année.
      const [tauxVerifiesEn, setTauxVerifiesEn] = useState(meta.tauxVerifiesEn || null);
      const [saving, setSaving] = useState(false);
      const [savedMsg, setSavedMsg] = useState(false);

      useEffect(() => {
        sb.from('invoices').select('amount, status, date_label, created_at')
          .then(({ data, error }) => {
            if (error) { setErr(humaniseErreur(error.message)); setFactures([]); }
            else setFactures(data || []);
          });
      }, []);

      const changerStatut = (s) => {
        setStatut(s);
        setUrssaf(STATUTS_FISCAUX[s].urssaf);
        if (STATUTS_FISCAUX[s].vflTaux == null) setVfl(false);
      };
      const enregistrer = async () => {
        setSaving(true);
        try {
          const annee = new Date().getFullYear();
          await sb.auth.updateUser({ data: { laloge_fiscal: {
            statut, urssaf: parseFloat(urssaf) || 0, vfl, periodicite, tauxVerifiesEn: annee,
          } } });
          setTauxVerifiesEn(annee);
          setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500);
        } catch (e) { alert(humaniseErreur(e.message)); }
        setSaving(false);
      };
      // « J'ai vérifié mes taux » — éteint l'alerte jusqu'à l'an prochain
      const confirmerTaux = async () => {
        const annee = new Date().getFullYear();
        setTauxVerifiesEn(annee);
        try {
          await sb.auth.updateUser({ data: { laloge_fiscal: {
            statut, urssaf: parseFloat(urssaf) || 0, vfl, periodicite, tauxVerifiesEn: annee,
          } } });
        } catch (_) {}
      };

      // ── Mois d'une facture : le libellé français d'émission, sinon la
      // date de création (les factures ne stockent pas de date ISO).
      const moisDe = (f) => {
        const m = String(f.date_label || '').toLowerCase()
          .match(/(\d{1,2})\s+([a-zûéè]+)\s+(\d{4})/i);
        if (m && MOIS_INDEX[m[2]] !== undefined) return `${m[3]}-${String(MOIS_INDEX[m[2]] + 1).padStart(2, '0')}`;
        return String(f.created_at || '').slice(0, 7);
      };

      // ── Série des 12 derniers mois ──
      const serie = useMemo(() => {
        const out = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          out.push({
            cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
            annee: d.getFullYear(), ca: 0,
          });
        }
        for (const f of factures || []) {
          if (f.status !== 'payée') continue;
          const hit = out.find(x => x.cle === moisDe(f));
          if (hit) hit.ca += parseFloat(f.amount || 0);
        }
        return out;
      }, [factures]);

      if (factures === null) {
        /* SQUELETTE et non écran vide (§10 : « montrer quelque chose
           immédiatement — squelettes plutôt qu'écran vide »).
           Une roue sur fond vide obligeait la vue à naître deux fois :
           rien, puis tout d'un coup. C'est ce saut que Gil trouvait sec.
           Le squelette reprend la FORME réelle de la page, si bien que
           l'arrivée des chiffres ne déplace plus rien — le contenu se
           substitue à sa propre esquisse. */
        const Bloc = ({ h, c = '' }) => (
          <div className={`rounded-[24px] lg:rounded-[28px] ${c}`}
               style={{ ...neu.raised, height: h }} />
        );
        return (
          <div className="space-y-5 lg:space-y-6 th-squelette" aria-busy="true"
               aria-label="Chargement de vos revenus">
            <div className="grid grid-cols-2 gap-4 lg:gap-5">
              <Bloc h={116} /><Bloc h={116} /><Bloc h={116} /><Bloc h={116} />
            </div>
            <Bloc h={196} />
            <Bloc h={260} />
          </div>
        );
      }

      const caMois = serie[11].ca;
      const caMoisPrec = serie[10].ca;
      const evolution = caMoisPrec > 0 ? Math.round(((caMois - caMoisPrec) / caMoisPrec) * 100) : null;
      const ca12mois = serie.reduce((s, x) => s + x.ca, 0);
      const enAttente = (factures || []).filter(f => f.status !== 'payée')
        .reduce((s, f) => s + parseFloat(f.amount || 0), 0);
      const anneeCourante = new Date().getFullYear();
      const caAnnee = serie.filter(x => x.annee === anneeCourante).reduce((s, x) => s + x.ca, 0)
        + (factures || []).filter(f => f.status === 'payée' && moisDe(f) < serie[0].cle && moisDe(f).startsWith(String(anneeCourante)))
          .reduce((s, f) => s + parseFloat(f.amount || 0), 0);

      const tauxU = (parseFloat(urssaf) || 0) / 100;
      const cfg = STATUTS_FISCAUX[statut];
      const cotisAnnee = caAnnee * tauxU;
      let irAnnee = null, irMention = '';
      if (statut === 'autre') { irMention = 'Impôt non estimé pour ce statut — voyez votre comptable.'; }
      else if (vfl) { irAnnee = caAnnee * (cfg.vflTaux / 100); irMention = `versement libératoire ${cfg.vflTaux} %`; }
      else { irAnnee = irBareme(caAnnee * (1 - cfg.abattement)); irMention = `barème 2025, 1 part, après abattement de ${Math.round(cfg.abattement * 100)} %`; }
      const netAnnee = caAnnee - cotisAnnee - (irAnnee ?? 0);
      const maxCa = Math.max(...serie.map(x => x.ca), 1);

      const aucunCA = ca12mois === 0;

      // ── Prochaine échéance URSSAF ─────────────────────────────
      // Mensuelle : le CA du mois M se déclare avant la fin du mois
      // M+1 → la prochaine échéance est la fin du mois courant, pour
      // le CA du mois précédent. Trimestrielle : T1→30 avril,
      // T2→31 juillet, T3→31 octobre, T4→31 janvier.
      const _now = new Date();
      let echeanceDate, moisCouverts;
      if (periodicite === 'trimestrielle') {
        const an = _now.getFullYear();
        const candidats = [
          { d: new Date(an, 0, 31),     mois: [9, 10, 11], anCA: an - 1 },
          { d: new Date(an, 3, 30),     mois: [0, 1, 2],   anCA: an },
          { d: new Date(an, 6, 31),     mois: [3, 4, 5],   anCA: an },
          { d: new Date(an, 9, 31),     mois: [6, 7, 8],   anCA: an },
          { d: new Date(an + 1, 0, 31), mois: [9, 10, 11], anCA: an },
        ];
        const c = candidats.find(x => x.d >= _now) || candidats[candidats.length - 1];
        echeanceDate = c.d;
        moisCouverts = c.mois.map(m => `${c.anCA}-${String(m + 1).padStart(2, '0')}`);
      } else {
        echeanceDate = new Date(_now.getFullYear(), _now.getMonth() + 1, 0);
        const prec = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
        moisCouverts = [`${prec.getFullYear()}-${String(prec.getMonth() + 1).padStart(2, '0')}`];
      }
      const nomMois = (cle) => new Date(`${cle}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' });
      const caEcheance = serie.filter(x => moisCouverts.includes(x.cle)).reduce((s, x) => s + x.ca, 0);
      const cotisEcheance = caEcheance * tauxU;
      const vflEcheance = (vfl && cfg.vflTaux != null) ? caEcheance * cfg.vflTaux / 100 : 0;
      const totalEcheance = cotisEcheance + vflEcheance;
      const echeanceLabel = echeanceDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const periodeLabel = periodicite === 'trimestrielle'
        ? `CA de ${nomMois(moisCouverts[0])} à ${nomMois(moisCouverts[2])}`
        : `CA de ${nomMois(moisCouverts[0])}`;
      // Alerte annuelle : uniquement si des taux ont déjà été confirmés
      // une année passée — les taux bougent au 1er janvier.
      const alerteTaux = tauxVerifiesEn != null && tauxVerifiesEn < _now.getFullYear();

      return (
        /* th-liste : les blocs entrent l'un après l'autre AU MOMENT où
           les chiffres arrivent. Sans ça l'écran restait vide sous une
           roue, puis tout apparaissait d'un bloc — c'est ce saut qui
           paraissait sec, pas la courbe (vidéo de Gil). La branche de
           chargement rend un autre arbre : React remonte celui-ci, donc
           l'animation se joue à chaque arrivée de données. */
        <div className="th-liste space-y-5 lg:space-y-6">
          {err && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]"><AlertCircle size={14} /> {err}</div>}

          {/* Alerte de nouvelle année : les taux changent au 1er janvier */}
          {alerteTaux && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-amber-50 text-amber-800">
              <AlertCircle size={17} className="shrink-0 hidden sm:block" />
              <div className="text-[13px] leading-relaxed flex-1">
                <strong>Nouvelle année : vérifiez vos taux.</strong> Les cotisations et le
                versement libératoire changent souvent au 1ᵉʳ janvier. Comparez les taux
                ci-dessous avec votre espace URSSAF, ajustez si besoin, puis confirmez.
              </div>
              <Btn onClick={confirmerTaux}>J'ai vérifié mes taux</Btn>
            </div>
          )}

          {aucunCA ? (
            <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
              <EmptyState icon={TrendingUp}
                texte="Aucune facture payée pour l'instant. Dès que vous marquez une facture « payée » dans une fiche client, votre chiffre d'affaires apparaît ici, mois par mois."
                bouton="Voir mes clients" onAction={onClients} />
            </div>
          ) : (<>

          {/* En-têtes chiffrés */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            <StatCard dark label="Encaissé ce mois-ci" value={eur(caMois)} />
            <StatCard label="vs mois dernier" value={evolution === null ? '—' : `${evolution > 0 ? '+' : ''}${evolution} %`} />
            <StatCard label="Encaissé sur 12 mois" value={eur(ca12mois)} />
            <StatCard label="Facturé, en attente" value={eur(enAttente)} />
          </div>

          {/* Prochaine échéance — LE chiffre à préparer, au rythme réel
              des déclarations (mensuel ou trimestriel, jamais l'annuel
              imposé : ce serait frustrant et faux au quotidien). */}
          <div style={neu.dark} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7 text-white">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Prochaine échéance URSSAF</h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">à déclarer avant le {echeanceLabel}</span>
            </div>
            <div className="text-[34px] lg:text-[40px] mt-3 leading-none" style={SERIF}>{eur(totalEcheance)}</div>
            <div className="text-[13px] text-stone-300 mt-3 leading-relaxed">
              {periodeLabel}&nbsp;: {eur(caEcheance)} encaissés → cotisations {eur(cotisEcheance)}
              {vflEcheance > 0 ? <> + impôt (versement libératoire) {eur(vflEcheance)}</> : null}.
              {caEcheance === 0 && <> Rien à payer ce coup-ci — mais la déclaration à 0&nbsp;€ reste obligatoire.</>}
            </div>
          </div>

          {/* Graphique 12 mois — une seule série, barres fines, infobulle */}
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Chiffre d'affaires encaissé</h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">12 derniers mois</span>
            </div>
            <div className="flex items-end gap-1.5 h-40 mt-6" role="img"
                 aria-label={`Chiffre d'affaires mensuel : ${serie.map(x => `${x.label} ${eur(x.ca)}`).join(', ')}`}>
              {serie.map((x, i) => {
                const h = Math.max(x.ca > 0 ? 4 : 2, Math.round((x.ca / maxCa) * 100));
                const labelDirect = x.ca === maxCa || i === 11; // étiquettes sélectives : max + mois courant
                return (
                  <div key={x.cle} className="flex-1 flex flex-col items-center justify-end h-full relative group min-w-0">
                    {labelDirect && x.ca > 0 && (
                      <span className="text-[9.5px] text-stone-500 font-semibold mb-1 whitespace-nowrap">{eur(x.ca)}</span>
                    )}
                    <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                         style={{ height: `${h}%`, backgroundColor: x.ca > 0 ? neu.accent : 'rgba(138,130,114,0.25)' }} />
                    {/* infobulle au survol */}
                    <span style={neu.raisedXs}
                          className="hidden group-hover:block absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap z-10">
                      {x.label} {String(x.annee).slice(2)} · {eur(x.ca)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-2">
              {serie.map(x => (
                <div key={x.cle} className="flex-1 text-center text-[9.5px] uppercase tracking-wide text-stone-400 truncate">{x.label}</div>
              ))}
            </div>
          </div>

          {/* Estimation annuelle */}
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Estimation {anneeCourante}</h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-stone-400 font-semibold">{STATUTS_FISCAUX[statut].label}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div><div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Encaissé {anneeCourante}</div>
                <div className="text-[22px] mt-1.5" style={SERIF}>{eur(caAnnee)}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Cotisations ({urssaf} %)</div>
                <div className="text-[22px] mt-1.5 text-stone-700" style={SERIF}>− {eur(cotisAnnee)}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Impôt estimé</div>
                <div className="text-[22px] mt-1.5 text-stone-700" style={SERIF}>{irAnnee == null ? '—' : `− ${eur(irAnnee)}`}</div>
                <div className="text-[10.5px] text-stone-500 mt-1">{irMention}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Net estimé</div>
                <div className="text-[22px] mt-1.5" style={SERIF}>{eur(netAnnee)}</div></div>
            </div>
            {/* Tableau mensuel — la vue « table » du graphique */}
            <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(138,130,114,0.18)' }}>
              <div className="space-y-1.5">
                {serie.filter(x => x.ca > 0).map(x => (
                  <div key={x.cle} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-stone-600 capitalize">{x.label} {x.annee}</span>
                    <span className="flex-1 border-b border-dotted border-stone-300 mx-1" aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{eur(x.ca)}</span>
                    <span className="text-stone-500 tabular-nums w-24 text-right">− {eur(x.ca * tauxU)} cotis.</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11.5px] text-stone-500 leading-relaxed mt-5">
              ⚖️ Estimation indicative, calculée sur vos factures marquées « payée » (groupées par date
              d'émission). Elle ne remplace ni votre comptable ni l'URSSAF — taux modifiables ci-dessous
              (pensez à l'ACRE ou à un taux particulier).
            </p>
          </div>

          </>)}

          {/* Configuration fiscale — visible même sans CA (on prépare) */}
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-6 lg:p-7">
            <h2 className="text-[18px] lg:text-[20px] tracking-tight" style={SERIF}>Mon statut</h2>
            <div className="space-y-4 mt-5">
              <Field label="Statut fiscal">
                <Select value={statut} onChange={e => changerStatut(e.target.value)}>
                  {Object.entries(STATUTS_FISCAUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Taux de cotisations (%)">
                <Input type="number" inputMode="decimal" step="0.1" value={urssaf}
                       onChange={e => setUrssaf(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1.5">
                  Prérempli avec le taux {statut === 'micro_bnc' ? 'micro-BNC 2026 (26,1 %)' : statut === 'micro_bic' ? 'micro-BIC prestations (21,2 %)' : 'moyen'} — ajustez-le à votre situation (ACRE…).
                </div>
              </Field>
              <Field label="Périodicité de vos déclarations URSSAF">
                <Select value={periodicite} onChange={e => setPeriodicite(e.target.value)}>
                  <option value="mensuelle">Mensuelle — je déclare chaque mois</option>
                  <option value="trimestrielle">Trimestrielle — je déclare tous les 3 mois</option>
                </Select>
                <div className="text-[11px] text-stone-500 mt-1.5">
                  Celle que vous avez choisie sur autoentrepreneur.urssaf.fr — c'est elle qui
                  règle la carte «&nbsp;Prochaine échéance&nbsp;».
                </div>
              </Field>
              {STATUTS_FISCAUX[statut].vflTaux != null && (
                <button type="button" onClick={() => setVfl(!vfl)}
                  style={vfl ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${vfl ? 'text-white' : 'text-stone-700'}`}>
                  <div className="text-left">
                    <div className="font-semibold text-[13px]">Versement libératoire de l'impôt</div>
                    <div className={`text-[10.5px] mt-0.5 ${vfl ? 'text-stone-300' : 'text-stone-500'}`}>
                      Vous payez l'impôt en même temps que vos cotisations ({STATUTS_FISCAUX[statut].vflTaux} % du CA)
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition shrink-0 ${vfl ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${vfl ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
              )}
              <div className="flex items-center gap-3">
                <Btn kind="dark" icon={saving ? Loader2 : Save} onClick={enregistrer} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Btn>
                {savedMsg && <span className="text-[12.5px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Enregistré sur votre compte</span>}
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       👥 CLIENTS LIST
       ════════════════════════════════════════════════════════════ */
    function ClientsList({ clients, onSelect, onCreate, refresh, checklist }) {
      const [showNew, setShowNew] = useState(false);
      const [search, setSearch] = useState('');

      const filtered = useMemo(() =>
        clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || '').includes(search.toLowerCase())),
        [clients, search]
      );

      // Plafond d'espaces clients de l'offre (null = illimité).
      const quotaAtteint = AGENCY.maxClients != null && clients.length >= AGENCY.maxClients;

      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Bien démarrer (UX vague 1) — locataires, tant que les 3
              étapes ne sont pas toutes cochées */}
          {checklist && (
            <StartChecklist agency={checklist.agency} clients={clients} user={checklist.user}
              gotoSettings={checklist.gotoSettings} onNew={() => setShowNew(true)}
              onOpenFirst={() => clients[0] && onSelect(clients[0])} />
          )}

          {/* Search + nouveau bouton — alignés sur tous écrans */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div style={neu.raisedXs} className="rounded-full flex items-center gap-2 px-4 min-h-[44px] w-full sm:w-72">
              <Search size={15} className="text-stone-500 shrink-0" />
              {/* HIG §13 : police 16 px (sinon iOS zoome au focus) et champ
                  étiré sur toute la hauteur de la pilule → cible ≥ 44 px. */}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chercher un client…"
                aria-label="Chercher un client"
                className="bg-transparent outline-none text-[16px] flex-1 placeholder:text-stone-500 min-w-0 self-stretch"
              />
            </div>
            {/* Offre Découverte : 1 espace client. On désactive le bouton
                AVANT le clic et on dit quoi faire (HIG §10 : l'erreur est
                formulée en solution) — la base refuse de toute façon. */}
            {/* Ouvrir ou fermer un espace client engage le studio : pas
                pour un « membre » (le rabot des rôles, 01/08/2026). */}
            {MON_ROLE.value !== 'membre' && (quotaAtteint ? (
              <div style={neu.pressedSm} className="rounded-2xl px-4 py-3 text-[12.5px] text-stone-600 leading-relaxed w-full sm:w-auto sm:max-w-sm">
                Votre offre Découverte comprend 1 espace client.{' '}
                <a href="/offres" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
                  Passez à l'offre Essentiel
                </a>{' '}
                pour en créer d'autres.
              </div>
            ) : (
              <Btn kind="dark" icon={Plus} onClick={() => setShowNew(true)} full={false} className="w-full sm:w-auto">
                Nouveau client
              </Btn>
            ))}
          </div>

          {/* Grille clients — `th-liste` fait entrer les cartes l'une
              après l'autre, du haut vers le bas. */}
          <div className="th-liste grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
            {filtered.map(c => (
              <button key={c.id} onClick={() => onSelect(c)} style={neu.raised} className="rounded-[22px] lg:rounded-[24px] p-5 lg:p-6 text-left group active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div style={neu.darkSm} className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-white text-[16px] lg:text-[18px] font-semibold shrink-0">
                    {c.initials || c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold leading-none ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                    {c.active ? 'actif' : 'pause'}
                  </span>
                </div>
                <h2 className="text-[19px] lg:text-[20px] tracking-tight mt-4 leading-tight truncate" style={SERIF}>{c.name}</h2>
                <div className="text-[12px] text-stone-500 mt-1 truncate">{c.sector || '—'}</div>
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[9.5px] leading-none">
                    {universeLabel(c.universe || 'communication')}
                  </span>
                  <code style={neu.pressedSm} className="px-2.5 py-1 rounded-md font-mono text-[11px] leading-none">{c.code}</code>
                  {c.analytics_enabled && FEATURES.analytics && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 text-violet-700 font-semibold uppercase tracking-wider text-[9.5px] leading-none">
                      <BarChart3 size={10} /> Analytics
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end mt-4">
                  <ArrowUpRight size={16} className="text-stone-400 group-hover:text-stone-900 transition" />
                </div>
              </button>
            ))}
            {/* Même action, même nom que le bouton du haut (HIG §15 : un
                concept = un mot). Et elle disparaît au plafond de l'offre,
                comme le bouton — sinon le clic menait droit à une erreur. */}
            {!quotaAtteint && MON_ROLE.value !== 'membre' && (
              <button onClick={() => setShowNew(true)} style={neu.pressed} className="rounded-[22px] lg:rounded-[24px] p-6 flex flex-col items-center justify-center text-center min-h-[200px] hover:scale-[1.01] active:scale-[0.99] transition-transform">
                <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4">
                  <Plus size={20} />
                </div>
                <div className="text-[15px] font-semibold">Nouveau client</div>
                <div className="text-[12.5px] text-stone-500 mt-1">Ouvrir un espace privé</div>
              </button>
            )}
          </div>

          {showNew && <ClientForm onClose={() => setShowNew(false)} onSaved={(c) => { setShowNew(false); refresh(); onCreate && onCreate(c); }} />}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📝 CLIENT FORM (création + édition identité)
       ════════════════════════════════════════════════════════════ */
    function ClientForm({ existing, onClose, onSaved }) {
      const [form, setForm] = useState({
        name:              existing?.name              || '',
        partner1:          existing?.partner1          || '',
        partner2:          existing?.partner2          || '',
        code:              existing?.code              || '',
        greeting:          existing?.greeting          || '',
        initials:          existing?.initials          || '',
        sector:            existing?.sector            || '',
        client_email:      existing?.client_email      || '',
        // Marque blanche : le nom du studio connecté. Un nouvel espace créé
        // par un locataire portait « TimelessHouse » comme nom d'agence.
        agency_name:       existing?.agency_name       || AGENCY.name || 'TimelessHouse',
        // UX vague 3 : Mariage pré-sélectionné pour un locataire (son cas
        // le plus courant) — et une célébration démarre en livraison
        // épurée, modules éteints (même logique qu'au changement d'univers).
        // Par défaut : le métier de l'agence (le sien, pas un choix arbitraire).
        universe:          existing?.universe          || (FEATURES.allUniverses ? 'communication' : (MES_METIERS[0] || 'celebration')),
        redirect_url:      existing?.redirect_url      || '',
        active:            existing?.active ?? true,
        analytics_enabled: existing?.analytics_enabled ?? false,
        media_enabled:     existing ? (existing.media_enabled ?? true) : FEATURES.allUniverses,
        invoices_enabled:  existing ? (existing.invoices_enabled ?? true) : FEATURES.allUniverses,
        shoots_enabled:    existing ? (existing.shoots_enabled ?? true) : FEATURES.allUniverses,
        documents_enabled: existing ? (existing.documents_enabled ?? true) : FEATURES.allUniverses,
        // Stratégies : réservé à la plateforme (pas au point pour les
        // locataires) — un enregistrement de fiche par un locataire
        // remet le module à zéro, ce qui nettoie aussi son espace client.
        strategies_enabled: FEATURES.allUniverses ? (existing?.strategies_enabled ?? true) : false,
      });
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');
      // UX vague 1 : l'essentiel d'abord (univers, prénoms, email) — le
      // reste vit sous « Options avancées », ouvert d'office en édition.
      const [avance, setAvance] = useState(!!existing);

      // Univers proposés (brique 14) : 3 pour un locataire, la liste
      // complète pour la plateforme. Si le client édité porte un univers
      // hérité absent de la liste (locataire reprenant un ancien espace),
      // on l'ajoute pour ne jamais le réécrire à son insu.
      // 💼 Une loge se vend par MÉTIER : on ne propose que ceux que
      // l'agence a pris (métier résilié = encore là jusqu'à échéance).
      // Deux filets, parce qu'aucune donnée manquante ne doit bloquer une
      // console : MES_METIERS vide → rien n'est bridé ; et l'univers du
      // client en cours d'édition reste toujours dans la liste, pour ne
      // jamais le réécrire à son insu (espaces créés avant, valeurs héritées).
      const options = useMemo(() => {
        const list = MES_METIERS.length
          ? metiersDisponibles(MES_METIERS, FEATURES.allUniverses)
              .map(m => ({ value: m.value, label: m.label, hint: m.hint }))
          : universeOptions(FEATURES.allUniverses);
        return list.some(o => o.value === form.universe)
          ? list
          : [...list, { value: form.universe, label: `${universeLabel(form.universe)} (univers actuel)` }];
      }, [form.universe]);

      const isCouple = isCelebration(form.universe);
      const currentHint = options.find(o => o.value === form.universe)?.hint;

      const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      // Auto-update name + initials + code suggestion quand partner1/partner2 changent
      const updatePartners = (p1, p2) => {
        const composedName = [p1, p2].filter(Boolean).join(' & ');
        const composedInitials = [p1, p2].map(p => p?.[0] || '').join('').toUpperCase();
        const composedCode = [p1, p2].filter(Boolean).map(slugify).join('-');
        setForm({
          ...form,
          partner1: p1,
          partner2: p2,
          name: composedName,
          initials: form.initials && form.initials !== composedInitials.slice(0, form.initials.length) ? form.initials : composedInitials,
          code: existing ? form.code : (form.code && !composedCode.startsWith(form.code) ? form.code : composedCode),
        });
      };

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setErr('');
        const payload = { ...form, code: slugify(form.code) };
        if (!isCouple) { payload.partner1 = null; payload.partner2 = null; }

        let result;
        if (existing) {
          result = await sb.from('clients').update(payload).eq('id', existing.id).select().single();
        } else {
          result = await sb.from('clients').insert(payload).select().single();
          // Créer aussi une ligne analytics vide
          if (result.data) {
            await sb.from('analytics').insert({ client_id: result.data.id });
          }
        }

        if (result.error) {
          setErr(humaniseErreur(result.error.message, 'client'));
          setLoading(false);
        } else {
          onSaved(result.data);
        }
      };

      return (
        <Modal title={existing ? 'Modifier le client' : 'Nouvel espace client'} kicker={existing ? 'Édition' : 'Création'} onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Univers">
              <Select value={form.universe} onChange={e => {
                const newUniverse = e.target.value;
                const patch = { universe: newUniverse };
                // Une célébration est d'abord un espace de LIVRAISON : à la
                // création, ses modules extras partent éteints (et se
                // rallument si on repart vers un univers tableau de bord).
                if (!existing && isCelebration(newUniverse) !== isCelebration(form.universe)) {
                  const on = !isCelebration(newUniverse);
                  Object.assign(patch, {
                    media_enabled: on, invoices_enabled: on, shoots_enabled: on,
                    documents_enabled: on, strategies_enabled: FEATURES.allUniverses ? on : false,
                  });
                }
                // Les Analyses n'existent QUE dans l'univers communication :
                // quitter cet univers éteint l'option (sinon un client
                // `neutre` garderait un drapeau actif invisible dans l'UI).
                if (!allowsAnalytics(newUniverse)) patch.analytics_enabled = false;
                setForm({ ...form, ...patch });
              }}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              {currentHint && <div className="text-[11px] text-stone-500 mt-1.5">{currentHint}</div>}
              {isCelebration(form.universe) && (
                <div className="text-[11px] text-stone-500 mt-1.5">
                  💡 Le style de rendu (mariage, fiançailles, anniversaire…) se choisit
                  désormais sur chaque <strong>galerie</strong>, dans l'onglet « Page client ».
                </div>
              )}
            </Field>

            {isCouple ? (
              <div className="space-y-4">
                <Field label="Prénom 1">
                  <Input required value={form.partner1} onChange={e => updatePartners(e.target.value, form.partner2)} placeholder="Précieuse" />
                </Field>
                <Field label="Prénom 2">
                  <Input required value={form.partner2} onChange={e => updatePartners(form.partner1, e.target.value)} placeholder="Ronny" />
                </Field>
              </div>
            ) : (
              <Field label="Nom du client">
                <Input required value={form.name} onChange={e => {
                  const v = e.target.value;
                  const codeSuggere = slugify(v);
                  setForm({
                    ...form, name: v,
                    initials: form.initials || v.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
                    // le code suit le nom tant qu'il n'a pas été personnalisé
                    code: existing ? form.code : (form.code && !codeSuggere.startsWith(form.code) ? form.code : codeSuggere),
                  });
                }} placeholder="Maison Lumière" />
              </Field>
            )}

            <Field label="Email du client (pour lui envoyer son accès)">
              <Input type="email" value={form.client_email} onChange={e => setForm({...form, client_email: e.target.value})} placeholder="elea.et.david@email.fr" />
            </Field>

            {/* UX vague 1 : tout le reste est replié — un espace se crée
                avec un univers, des prénoms et un email, point. */}
            <button type="button" onClick={() => setAvance(!avance)} aria-expanded={avance}
              className="flex items-center gap-2 min-h-[44px] text-[12.5px] font-semibold text-stone-500 hover:text-stone-800 transition">
              {avance ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              Options avancées
              {!avance && <span className="font-normal text-stone-400 hidden sm:inline">— code d'accès, statut, modules</span>}
            </button>

            {avance && (<>
            <FormSection title="Accès">
              <Field label="Code d'accès (sans espaces)">
                <Input required value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder={isCouple ? 'precieuse-ronny' : 'maison-lumiere'} />
                <div className="text-[11px] text-stone-500 mt-1.5">C'est la clé de votre client. Elle est suggérée automatiquement — vous pouvez la personnaliser.</div>
              </Field>

              {/* UX vague 3 : le statut n'a de sens qu'en édition — un
                  nouvel espace est toujours actif. */}
              {existing && (
              <Field label="Statut">
                <Select value={form.active ? 'actif' : 'pause'} onChange={e => setForm({...form, active: e.target.value === 'actif'})}>
                  <option value="actif">Actif (le client peut se connecter)</option>
                  <option value="pause">En pause (l'accès est bloqué)</option>
                </Select>
              </Field>
              )}
            </FormSection>

            {/* UX vague 2 : ces champs « entreprise » n'ont pas de sens pour
                un mariage — les prénoms remplissent déjà les initiales. */}
            {!isCelebration(form.universe) && (
            <FormSection title="Informations du contact">
              <Field label="Prénom contact">
                <Input value={form.greeting} onChange={e => setForm({...form, greeting: e.target.value})} placeholder="Camille" />
              </Field>
              <Field label="Initiales">
                <Input value={form.initials} onChange={e => setForm({...form, initials: e.target.value.toUpperCase().slice(0,3)})} placeholder="ML" maxLength={3} />
              </Field>
              <Field label="Secteur">
                <Input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} placeholder="Hôtellerie" />
              </Field>
            </FormSection>
            )}

            {/* Page de redirection : héritage TimelessHouse (fichiers HTML
                dédiés) — jargon masqué aux locataires (UX vague 1). */}
            {FEATURES.allUniverses && hasDeliveryTab(form.universe) && (
              <FormSection title="Page client">
              <Field label="Page de redirection (laisser vide pour utiliser les templates dynamiques)">
                <Input value={form.redirect_url} onChange={e => setForm({...form, redirect_url: e.target.value})} placeholder="Laisser vide → event-photos.html (template dynamique)" />
                <div className="text-[11px] text-stone-500 mt-1.5">
                  💡 <strong>Recommandé :</strong> laissez vide pour utiliser les templates dynamiques (configurables dans l'onglet "Page client" après création).<br/>
                  Pour pointer vers un fichier HTML spécifique (legacy), entrez son nom : <code>precieuse-ronny.html</code>
                </div>
              </Field>
              </FormSection>
            )}

            <FormSection title="Modules">
            <Field label="Modules visibles dans l'espace client">
              <div className="space-y-2">
                {/* Médias — masqué dans les univers de LIVRAISON (mariage,
                    célébrations, filmmaker) : tout y passe par les galeries.
                    L'interrupteur restait proposé alors que l'onglet, lui,
                    n'existe plus — on offrait une case qui ne menait nulle part. */}
                {!isDelivery(form.universe) && (
                <button type="button" onClick={() => setForm({...form, media_enabled: !form.media_enabled})}
                  style={form.media_enabled ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.media_enabled ? 'text-white' : 'text-stone-700'}`}>
                  <div className="flex items-center gap-3 text-left">
                    <ImageIcon size={17} />
                    <div>
                      <div className="font-semibold text-[13px]">Médias</div>
                      <div className={`text-[10.5px] mt-0.5 ${form.media_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Photos, vidéos, validation et téléchargement ZIP</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.media_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.media_enabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
                )}

                {/* Factures */}
                <button type="button" onClick={() => setForm({...form, invoices_enabled: !form.invoices_enabled})}
                  style={form.invoices_enabled ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.invoices_enabled ? 'text-white' : 'text-stone-700'}`}>
                  <div className="flex items-center gap-3 text-left">
                    <FileText size={17} />
                    <div>
                      <div className="font-semibold text-[13px]">Factures</div>
                      <div className={`text-[10.5px] mt-0.5 ${form.invoices_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Historique des factures et statuts de paiement</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.invoices_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.invoices_enabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>

                {/* Documents */}
                <button type="button" onClick={() => setForm({...form, documents_enabled: !form.documents_enabled})}
                  style={form.documents_enabled ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.documents_enabled ? 'text-white' : 'text-stone-700'}`}>
                  <div className="flex items-center gap-3 text-left">
                    <FolderOpen size={17} />
                    <div>
                      <div className="font-semibold text-[13px]">Documents</div>
                      <div className={`text-[10.5px] mt-0.5 ${form.documents_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Contrats, chartes graphiques, devis, briefs…</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.documents_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.documents_enabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>

                {/* Stratégies — module réservé à la plateforme tant qu'il
                    n'est pas au point (demande de Gil, 22/07/2026) */}
                {FEATURES.allUniverses && (
                <button type="button" onClick={() => setForm({...form, strategies_enabled: !form.strategies_enabled})}
                  style={form.strategies_enabled ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.strategies_enabled ? 'text-white' : 'text-stone-700'}`}>
                  <div className="flex items-center gap-3 text-left">
                    <Lightbulb size={17} />
                    <div>
                      <div className="font-semibold text-[13px]">Stratégies</div>
                      <div className={`text-[10.5px] mt-0.5 ${form.strategies_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Stratégies de contenu consultables et partageables par lien</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.strategies_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.strategies_enabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
                )}

                {/* Tournages / Calendrier */}
                <button type="button" onClick={() => setForm({...form, shoots_enabled: !form.shoots_enabled})}
                  style={form.shoots_enabled ? neu.dark : neu.pressedSm}
                  className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.shoots_enabled ? 'text-white' : 'text-stone-700'}`}>
                  <div className="flex items-center gap-3 text-left">
                    <CalendarIcon size={17} />
                    <div>
                      <div className="font-semibold text-[13px]">Tournages & calendrier</div>
                      <div className={`text-[10.5px] mt-0.5 ${form.shoots_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Tournages programmés et vue calendrier</div>
                    </div>
                  </div>
                  <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.shoots_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.shoots_enabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>

                {/* Analyses — Communication uniquement, et option réservée
                    aux agences qui en disposent (FEATURES.analytics) */}
                {allowsAnalytics(form.universe) && FEATURES.analytics && (
                  <button type="button" onClick={() => setForm({...form, analytics_enabled: !form.analytics_enabled})}
                    style={form.analytics_enabled ? neu.dark : neu.pressedSm}
                    className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.analytics_enabled ? 'text-white' : 'text-stone-700'}`}>
                    <div className="flex items-center gap-3 text-left">
                      <BarChart3 size={17} />
                      <div>
                        <div className="font-semibold text-[13px]">Analyses réseaux sociaux <span className={`text-[9.5px] ml-1 px-1.5 py-0.5 rounded-full ${form.analytics_enabled ? 'bg-white/20' : 'bg-violet-100 text-violet-700'} font-semibold uppercase tracking-wider`}>Option payante</span></div>
                        <div className={`text-[10.5px] mt-0.5 ${form.analytics_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Audience, engagement, démographie en temps réel</div>
                      </div>
                    </div>
                    <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.analytics_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.analytics_enabled ? 'translate-x-4' : ''}`} />
                    </div>
                  </button>
                )}
              </div>
              {hasDeliveryTab(form.universe) && (
                <div className="text-[11px] text-stone-500 mt-2.5">
                  💡 Ces modules complètent la page de livraison. Vous pouvez n'activer que les Médias pour proposer des photos ou vidéos supplémentaires, ou tout laisser désactivé pour une livraison épurée.
                </div>
              )}
            </Field>
            </FormSection>
            </>)}

            {err && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]"><AlertCircle size={14} /> {err}</div>}

            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? 'Enregistrement…' : (existing ? 'Mettre à jour' : "Créer l'espace")}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       👤 CLIENT DETAIL PAGE (avec onglets)
       ════════════════════════════════════════════════════════════ */
    function ClientDetail({ client, onBack, refresh }) {
      const [tab, setTab] = useState(() => {
        if (isCelebration(client.universe)) return 'event_pages';
        if (client.media_enabled !== false) return 'media';
        if (client.invoices_enabled !== false) return 'invoices';
        if (client.shoots_enabled !== false) return 'shoots';
        if (client.analytics_enabled && FEATURES.analytics && allowsAnalytics(client.universe)) return 'analytics';
        return 'media';
      });
      const [editClient, setEditClient] = useState(false);
      const [confirmDelete, setConfirmDelete] = useState(false);
      const [sendingWelcome, setSendingWelcome] = useState(false);

      // Par défaut, les modules sont activés (pour les clients pré-migration v8 qui ont NULL)
      // MARIAGE & CÉLÉBRATIONS (choix de Gil, 25/07/2026) : la livraison passe
      // ENTIÈREMENT par les galeries — photos et films, chacune avec son propre
      // lien de partage et son habillage (cinématique, film, demande, anniversaire).
      // L'onglet « Médias », hérité de l'univers Communication, n'a plus lieu
      // d'être ici : deux endroits pour déposer une photo, c'était une hésitation
      // de trop. La création éteignait déjà media_enabled pour cet univers ; on
      // rend la règle absolue, y compris pour les espaces créés avant.
      // `isDelivery` et non `isCelebration` : un Filmmaker livre aussi par
      // galeries — la règle vaut pour TOUT espace de livraison, pas seulement
      // pour les couples.
      const mediaOn    = !isDelivery(client.universe) && client.media_enabled !== false;
      /* Les factures sont la comptabilité du studio : un « membre »
         (cadreur, monteur…) n'a pas à les voir (rabot des rôles). */
      const invoicesOn = client.invoices_enabled !== false && MON_ROLE.value !== 'membre';
      const shootsOn   = client.shoots_enabled   !== false;
      const documentsOn = client.documents_enabled !== false;
      // Stratégies : onglet réservé à la plateforme tant que le module
      // n'est pas au point pour les locataires (Gil, 22/07/2026).
      const strategiesOn = FEATURES.allUniverses && client.strategies_enabled !== false;

      const tabs = [
        ...(hasDeliveryTab(client.universe) ? [{ id: 'event_pages', label: 'Page client', icon: Eye }] : []),
        ...(mediaOn    ? [{ id: 'media',    label: 'Médias',    icon: ImageIcon }]  : []),
        ...(invoicesOn ? [{ id: 'invoices', label: 'Factures',  icon: FileText }]   : []),
        ...(documentsOn ? [{ id: 'documents', label: 'Documents', icon: FolderOpen }] : []),
        ...(strategiesOn ? [{ id: 'strategies', label: 'Stratégies', icon: Lightbulb }] : []),
        ...(shootsOn   ? [{ id: 'shoots',   label: 'Tournages', icon: CalendarIcon }] : []),
        ...(client.analytics_enabled && FEATURES.analytics && allowsAnalytics(client.universe) ? [{ id: 'analytics', label: 'Analyses', icon: BarChart3 }] : []),
        // Toujours présent : tout espace envoie des emails, et savoir ce
        // qui est parti ne dépend d'aucune option activée.
        { id: 'envois', label: 'Envois', icon: Send },
      ];

      // Onglet par défaut : Page client si univers événement, sinon Médias (ou premier onglet dispo)
      const defaultTab = isCelebration(client.universe)
        ? 'event_pages'
        : (tabs[0]?.id || 'media');

      // UX vague 3 : l'action la plus destructrice de la console était
      // sans confirmation. On dit ce qui sera perdu, et on exige le code
      // de l'espace — impossible de tout effacer par mégarde.
      const deleteClient = async () => {
        const saisie = prompt(
          `Supprimer définitivement l'espace de ${client.name} ?\n\n` +
          `Seront perdus : ses galeries et leurs liens de partage, ses médias, ` +
          `factures, documents et tournages. Cette action est irréversible.\n\n` +
          `Pour confirmer, tapez le code de l'espace : ${client.code}`
        );
        if (saisie === null) return;
        if ((saisie || '').trim() !== client.code) {
          alert('Le code saisi est différent — suppression annulée.');
          return;
        }
        const { error } = await sb.from('clients').delete().eq('id', client.id);
        if (error) { alert(humaniseErreur(error.message)); return; }
        refresh();
        onBack();
      };

      const sendWelcomeEmail = async () => {
        if (!client.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (!confirm(`Envoyer l'email de bienvenue avec le code d'accès à ${client.client_email} ?`)) return;
        setSendingWelcome(true);
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({ kind: 'welcome', client_id: client.id }),
          });
          if (res.ok) alert(`✓ Email de bienvenue envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.");
          else alert(`Erreur : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setSendingWelcome(false);
      };

      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Header client — empilement vertical propre sur mobile */}
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-5">
              <div className="flex items-start gap-3 lg:gap-5 min-w-0 flex-1">
                <button onClick={onBack} aria-label="Retour" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                  <ArrowLeft size={16} />
                </button>
                <div style={neu.darkSm} className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-white text-[16px] lg:text-[18px] font-semibold shrink-0">
                  {client.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[22px] lg:text-[26px] tracking-tight leading-tight truncate" style={SERIF}>{client.name}</h2>
                  <div className="flex items-center gap-2 mt-1.5 text-[11.5px] lg:text-[12px] text-stone-500 flex-wrap">
                    {client.sector && <span className="truncate max-w-[140px]">{client.sector}</span>}
                    <span className={client.active ? 'text-emerald-600 font-semibold' : 'text-stone-400'}>{client.active ? 'Actif' : 'En pause'}</span>
                  </div>
                  {client.client_email && (
                    <div className="text-[12px] text-stone-500 mt-1 truncate hidden sm:block">{client.client_email}</div>
                  )}
                </div>
              </div>

              {/* Actions — passent à la ligne plutôt que de défiler : sur
                  iPhone, la rangée débordait de 84 px et le premier bouton
                  se retrouvait coupé hors de l'écran. */}
              <div className="flex items-center gap-3 flex-wrap lg:flex-nowrap shrink-0">
                {client.client_email && (
                  <Btn icon={sendingWelcome ? Loader2 : Bell} onClick={sendWelcomeEmail} disabled={sendingWelcome}>
                    <span className="hidden sm:inline">{sendingWelcome ? 'Envoi…' : 'Email de bienvenue'}</span>
                    <span className="sm:hidden">{sendingWelcome ? 'Envoi…' : 'Bienvenue'}</span>
                  </Btn>
                )}
                <Btn icon={Edit3} onClick={() => setEditClient(true)}>Modifier</Btn>
                {/* Supprimer un espace client est irréversible : le geste
                    appartient au studio, pas à un « membre ». */}
                {MON_ROLE.value !== 'membre' && (
                  <Btn icon={Trash2} onClick={() => setConfirmDelete(true)} className="text-rose-600">Supprimer</Btn>
                )}
              </div>
            </div>

            {/* ── Accès client : le couple code + lien à transmettre ──
                En PLEINE LARGEUR de la carte, et non dans la colonne de
                texte : coincé après la flèche et l'avatar, il ne disposait
                que de 187 px sur iPhone et empilait ses cinq éléments sur
                cinq lignes. Ici il en occupe deux. */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--divider, rgba(42,38,32,0.08))' }}>
              <div className="flex items-center gap-x-2.5 gap-y-3 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-semibold">Accès client</span>
                <code style={neu.pressedSm} className="px-2.5 py-1.5 rounded-md font-mono text-[12.5px] leading-none">{client.code}</code>
                <CopyButton value={client.code} label="Copier le code" iconOnly />
                <div className="flex items-center gap-3 flex-wrap">
                  {/* UX vague 1 : LE geste clé — un message tout prêt
                      (bonjour + lien + code) à coller dans un SMS/email.
                      La copie coche l'étape 3 de « Bien démarrer ». */}
                  <CopyButton value={messageInvitation(client)} label="Copier l'invitation"
                    onCopied={() => sb.auth.updateUser({ data: { laloge_invitation_copiee: true } }).catch(() => {})} />
                  <CopyButton value={clientLoginUrl()} label="Copier le lien" />
                  <a href={clientLoginUrl()} target="_blank" rel="noopener" style={neu.raisedXs}
                     className="px-4 min-h-[44px] rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 text-stone-600 active:scale-95 transition-transform">
                    <ExternalLink size={12} /> Ouvrir
                  </a>
                </div>
              </div>
              {/* Astuce nº1 — au moment exact où l'on découvre une fiche
                  client : ce code est la seule chose à transmettre, et
                  « Copier l'invitation » fait le message à sa place. */}
              <Astuce cle="acces-client"
                titre="Ce code, c'est la clé de votre client"
                texte="Il n'a besoin de rien d'autre pour entrer chez vous — ni compte, ni mot de passe. « Copier l'invitation » prépare le message complet : adresse, code et mode d'emploi, prêt à coller dans un SMS ou un email." />
            </div>
          </div>

          {/* Tabs — scrollable horizontalement sur mobile, 44px tactile */}
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
            <div style={neu.pressed} className="rounded-full p-1 inline-flex items-center">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={tab === t.id ? neu.dark : {}}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={`px-4 lg:px-5 py-3 min-h-[44px] rounded-full text-[13px] font-medium flex items-center gap-2 whitespace-nowrap transition active:scale-95 ${tab === t.id ? 'text-white' : 'text-stone-500'}`}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {tab === 'event_pages' && <EventPagesTab clientId={client.id} client={client} />}
          {tab === 'media' && <MediaTab clientId={client.id} client={client} />}
          {tab === 'invoices' && <InvoicesTab clientId={client.id} client={client} />}
          {tab === 'documents' && <DocumentsTab clientId={client.id} client={client} />}
          {tab === 'strategies' && <StrategiesTab clientId={client.id} client={client} />}
          {tab === 'shoots' && <ShootsTab clientId={client.id} client={client} />}
          {tab === 'analytics' && <AnalyticsTab clientId={client.id} />}
          {tab === 'envois' && <EnvoisTab clientId={client.id} />}

          {editClient && <ClientForm existing={client} onClose={() => setEditClient(false)} onSaved={() => { setEditClient(false); refresh(); }} />}
          {confirmDelete && (
            <Modal title="Supprimer ce client ?" kicker="Confirmation" onClose={() => setConfirmDelete(false)}>
              <p className="text-[13px] text-stone-600 mb-5">
                Cette action est irréversible. Tous les médias, factures, tournages et analyses associés à <strong>{client.name}</strong> seront définitivement supprimés.
              </p>
              <div className="flex gap-3">
                <Btn onClick={() => setConfirmDelete(false)} full>Annuler</Btn>
                <Btn kind="dark" onClick={deleteClient} full icon={Trash2}>Confirmer la suppression</Btn>
              </div>
            </Modal>
          )}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🖼️ LIVE PREVIEW — iframe d'aperçu de la page client
       ════════════════════════════════════════════════════════════ */

    function buildPreviewUrl({ client, pageType, version }) {
      let target;
      if (pageType === 'photos') {
        target = 'event-photos.html';
      } else {
        target = videoPageFor(client.universe);
      }
      const params = new URLSearchParams({
        preview: '1',
        code:    client.code || '',
        v:       String(version || 0),
      });
      return `${target}?${params.toString()}`;
    }

    function LivePreviewPanel({ client, pageType, version, disabled, disabledHint }) {
      const [device, setDevice]       = useState('desktop'); // 'desktop' | 'mobile'
      const [expanded, setExpanded]   = useState(false);
      const [collapsed, setCollapsed] = useState(false);
      const [loading, setLoading]     = useState(true);
      const iframeRef = useRef(null);

      const previewUrl = useMemo(
        () => buildPreviewUrl({ client, pageType, version }),
        [client, pageType, version]
      );

      // Reset loading whenever URL changes (new version after save)
      useEffect(() => { if (!disabled) setLoading(true); }, [previewUrl, disabled]);

      // Iframe -> parent : "preview:ready" ping clears spinner reliably
      useEffect(() => {
        const onMsg = (e) => {
          if (e.data && e.data.type === 'preview:ready') setLoading(false);
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
      }, []);

      const openTab = useCallback(() => {
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
      }, [previewUrl]);

      const refresh = useCallback(() => {
        if (!iframeRef.current) return;
        setLoading(true);
        // Cache-busting reload (re-assigning the identical src is a no-op in some browsers)
        iframeRef.current.src = previewUrl + '&t=' + Date.now();
      }, [previewUrl]);

      const renderToolbar = (compact) => (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-200/60">
          <button
            type="button"
            onClick={() => !compact && setCollapsed(c => !c)}
            className="flex items-center gap-2 min-w-0 text-left"
            title={compact ? '' : (collapsed ? 'Déplier' : 'Replier')}
          >
            <Eye size={13} className="text-stone-500 shrink-0" />
            <span className="text-[10.5px] uppercase tracking-[0.18em] text-stone-500 font-semibold truncate">
              Aperçu en direct
            </span>
            {!compact && (collapsed
              ? <ChevronDown size={12} className="text-stone-400" />
              : <ChevronUp   size={12} className="text-stone-400" />)}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Device toggle */}
            <div style={neu.pressedSm} className="rounded-full p-0.5 flex items-center">
              <button type="button" onClick={() => setDevice('desktop')} title="Bureau"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                  device === 'desktop' ? 'bg-stone-900 text-white' : 'text-stone-500'
                }`}>
                <Monitor size={12} />
              </button>
              <button type="button" onClick={() => setDevice('mobile')} title="Mobile"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                  device === 'mobile' ? 'bg-stone-900 text-white' : 'text-stone-500'
                }`}>
                <Smartphone size={12} />
              </button>
            </div>
            <button type="button" onClick={refresh} title="Rafraîchir" disabled={disabled}
              style={neu.raisedXs}
              className="w-8 h-8 tap-ext rounded-full flex items-center justify-center disabled:opacity-40">
              <RefreshCw size={12} className={loading && !disabled ? 'animate-spin' : ''} />
            </button>
            {!compact && (
              <button type="button" onClick={() => setExpanded(true)} title="Plein écran" disabled={disabled}
                style={neu.raisedXs}
                className="w-8 h-8 tap-ext rounded-full flex items-center justify-center disabled:opacity-40">
                <Maximize2 size={12} />
              </button>
            )}
            <button type="button" onClick={openTab} title="Ouvrir dans un nouvel onglet" disabled={disabled}
              style={neu.raisedXs}
              className="w-8 h-8 tap-ext rounded-full flex items-center justify-center disabled:opacity-40">
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
      );

      const renderFrame = (fillMobile) => (
        <div className="relative w-full h-full bg-stone-200/40 flex items-center justify-center overflow-hidden">
          {disabled ? (
            <div className="text-center px-6 py-10 text-stone-500 text-[12.5px] max-w-[340px] leading-relaxed">
              <Eye size={20} className="mx-auto mb-3 text-stone-400" />
              {disabledHint || 'Enregistrez une première fois pour activer l\'aperçu.'}
            </div>
          ) : (
            <div
              className={`relative bg-white shadow-inner transition-all duration-300 ${
                device === 'mobile'
                  ? (fillMobile ? 'w-[390px] max-w-full h-full' : 'w-[390px] max-w-full h-full')
                  : 'w-full h-full'
              }`}
            >
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100/70 backdrop-blur-sm">
                  <Loader2 size={20} className="animate-spin text-stone-500" />
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={previewUrl}
                title="Aperçu de la page client"
                loading="lazy"
                onLoad={() => setLoading(false)}
                allow="autoplay; encrypted-media; fullscreen"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full border-0 bg-white"
              />
            </div>
          )}
        </div>
      );

      return (
        <>
          {/* Embedded slot */}
          <div style={neu.pressedSm} className="rounded-2xl overflow-hidden">
            {renderToolbar(false)}
            {!collapsed && (
              <div className="h-[320px] sm:h-[420px]">
                {expanded ? (
                  <div className="w-full h-full flex items-center justify-center text-stone-400 text-[12px] bg-stone-100/40">
                    <span className="flex items-center gap-2">
                      <Maximize2 size={14} /> Affiché en plein écran
                    </span>
                  </div>
                ) : (
                  renderFrame(false)
                )}
              </div>
            )}
          </div>

          {/* Fullscreen overlay */}
          {expanded && (
            <div
              className="fixed inset-0 z-[60] flex items-stretch justify-stretch bg-stone-900/70 backdrop-blur-sm p-3 sm:p-5"
              onClick={() => setExpanded(false)}
            >
              <div
                style={neu.raised}
                className="rounded-[24px] sm:rounded-[28px] flex-1 flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-stone-200/60">
                  <div className="min-w-0">
                    <div className="text-[10.5px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
                      Aperçu en plein écran
                    </div>
                    <div className="text-[14px] font-semibold mt-0.5 truncate">{client.name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={refresh} title="Rafraîchir"
                      style={neu.raisedXs} className="w-9 h-9 tap-ext rounded-full flex items-center justify-center">
                      <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button type="button" onClick={openTab} style={neu.raisedXs}
                      className="px-3 py-1.5 rounded-full text-[11.5px] flex items-center gap-1.5">
                      <ExternalLink size={11} /> Nouvel onglet
                    </button>
                    <button type="button" onClick={() => setExpanded(false)} style={neu.raisedXs}
                      className="w-9 h-9 tap-ext rounded-full flex items-center justify-center">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0">{renderFrame(true)}</div>
              </div>
            </div>
          )}
        </>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📸 MEDIA TAB
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       📸 ONGLET PAGE CLIENT (mariage, fiançailles, anniversaire…)
       ════════════════════════════════════════════════════════════ */
    function EventPagesTab({ clientId, client }) {
      const [pages, setPages] = useState([]);
      const [loading, setLoading] = useState(true);
      const [editing, setEditing] = useState(null);
      const [notifying, setNotifying] = useState(false);

      const load = async () => {
        // Les pages `event_pages` (Cloudinary, URLs manuelles, encodage local)
        // sont l'héritage TimelessHouse : un locataire n'en a jamais — sa
        // livraison passe entièrement par les galeries.
        if (!FEATURES.allUniverses) { setPages([]); setLoading(false); return; }
        setLoading(true);
        const { data } = await sb.from('event_pages').select('*').eq('client_id', clientId);
        setPages(data || []);
        setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const photosPage = pages.find(p => p.page_type === 'photos');
      const videoPage  = pages.find(p => p.page_type === 'video');
      const hasAnyPage = !!(photosPage || videoPage);

      const removePage = async (id) => {
        if (!confirm('Supprimer cette page ?')) return;
        await sb.from('event_pages').delete().eq('id', id);
        load();
      };

      const notifyClient = async () => {
        if (!client.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (!hasAnyPage) {
          alert("Configurez d'abord au moins une page (galerie photos ou lecteur vidéo).");
          return;
        }
        const contentLabel = photosPage && videoPage ? "vos photos et votre film"
          : videoPage ? "votre film"
          : "vos photos";
        if (!confirm(`Envoyer un email à ${client.client_email} pour annoncer que ${contentLabel} ${photosPage && videoPage ? 'sont disponibles' : (videoPage ? 'est disponible' : 'sont disponibles')} ?`)) return;

        setNotifying(true);
        try {
          // Pas d'URL depuis la console : l'origine de l'onglet n'est pas
          // la porte du client (laloge.app → vitrine !). notify-client
          // met la bonne porte selon la marque (CURRENT_ESPACE).
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({
              kind: 'event_ready',
              client_id: client.id,
              extra: {
                hasPhotos: !!photosPage,
                hasVideo:  !!videoPage,
              },
            }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.");
          else alert(`Erreur : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setNotifying(false);
      };

      // Locataire : uniquement la livraison par galeries — jamais le bloc
      // « Espace de l'événement » ni ses réglages Cloudinary/URLs.
      if (!FEATURES.allUniverses) {
        return <GalleriesManager client={client} />;
      }

      return (
        <div className="space-y-5">
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div>
                <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Pages publiées</div>
                <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1" style={SERIF}>Espace de l'événement</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hasAnyPage && client.client_email && (
                  <button onClick={notifyClient} disabled={notifying} style={neu.dark} className="px-4 py-2 rounded-full text-white text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-60">
                    {notifying ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                    {notifying ? 'Envoi…' : 'Prévenir le client'}
                  </button>
                )}
                {client.redirect_url && (
                  <a href={client.redirect_url} target="_blank" rel="noopener" style={neu.raisedXs} className="px-3 py-1.5 rounded-full text-[11.5px] flex items-center gap-1.5">
                    <ExternalLink size={11} /> Voir l'espace
                  </a>
                )}
              </div>
            </div>
            <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2">
              Configurez la galerie photo et/ou le lecteur vidéo de votre client. Le client accède automatiquement à sa page après avoir saisi son code.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              {/* Carte Photos */}
              <div style={photosPage ? neu.pressedSm : neu.raisedXs} className="rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera size={16} className="text-stone-600" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">Galerie photos</span>
                  </div>
                  {photosPage && <span className="text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>}
                </div>
                {photosPage ? (
                  <>
                    <div className="text-[14.5px] font-semibold mt-1" style={SERIF}>{photosPage.config?.couple || client.name}</div>
                    <div className="text-[11.5px] text-stone-500 mt-0.5">
                      {photosPage.config?.date}{photosPage.config?.lieu ? ' · ' + photosPage.config.lieu : ''}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5">
                      <span>
                        {photosPage.config?.galleryMode === 'flat'
                          ? 'Galerie unique · '
                          : `${(photosPage.config?.categories || []).length} catégorie(s) · `}
                        Cloudinary "{photosPage.config?.cloudName || '—'}"
                      </span>
                      {(photosPage.config?.palette || photosPage.config?.theme || 'noir') !== 'noir' && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-200 text-[9px] uppercase tracking-wide">{(photosPage.config.palette || photosPage.config.theme) === 'custom' ? 'Sur mesure' : (photosPage.config.palette || photosPage.config.theme)}</span>
                      )}
                      {photosPage.config?.coverMode && photosPage.config.coverMode !== 'fill' && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-200 text-[9px] uppercase tracking-wide">{({ fit: 'Cadrée', split: 'Split', editorial: 'Éditorial', portrait: 'Portrait' })[photosPage.config.coverMode] || photosPage.config.coverMode}</span>
                      )}
                      {photosPage.config?.galleryMode && photosPage.config.galleryMode !== 'categorized' && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] uppercase tracking-wide">{photosPage.config.galleryMode}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Btn icon={Edit3} onClick={() => setEditing({ page_type: 'photos', config: photosPage.config, id: photosPage.id })}>Modifier</Btn>
                      <Btn icon={Trash2} onClick={() => removePage(photosPage.id)} className="text-rose-600">Supprimer</Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-stone-500 mt-2">Aucune galerie configurée.</p>
                    <Btn kind="dark" icon={Plus} onClick={() => setEditing({ page_type: 'photos', config: defaultPhotosConfig(client) })} full>Créer la galerie photos</Btn>
                  </>
                )}
              </div>

              {/* Carte Vidéo */}
              <div style={videoPage ? neu.pressedSm : neu.raisedXs} className="rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Video size={16} className="text-stone-600" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">Lecteur vidéo</span>
                  </div>
                  {videoPage && <span className="text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>}
                </div>
                {videoPage ? (
                  <>
                    <div className="text-[14.5px] font-semibold mt-1" style={SERIF}>{videoPage.config?.couple || client.name}</div>
                    <div className="text-[11.5px] text-stone-500 mt-0.5">
                      {videoPage.config?.date}{videoPage.config?.lieu ? ' · ' + videoPage.config.lieu : ''}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-2">
                      {/* Titres des vidéos (gère aussi les pages à l'ancien format) */}
                      {(() => {
                        const vids = withVideoList(videoPage.config || {}, 'video').videos || [];
                        return vids.length
                          ? '🎬 ' + vids.map(v => v.title || v.key).join(' · ')
                          : 'Aucune vidéo';
                      })()}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Btn icon={Edit3} onClick={() => setEditing({ page_type: 'video', config: videoPage.config, id: videoPage.id })}>Modifier</Btn>
                      <Btn icon={Trash2} onClick={() => removePage(videoPage.id)} className="text-rose-600">Supprimer</Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-stone-500 mt-2">Aucun lecteur configuré.</p>
                    <Btn kind="dark" icon={Plus} onClick={() => setEditing({ page_type: 'video', config: defaultVideoConfig(client) })} full>Créer le lecteur vidéo</Btn>
                  </>
                )}
              </div>
            </div>

            {/* URL de redirection du client */}
            <div style={neu.pressedSm} className="rounded-2xl p-4 mt-5 text-[11.5px] lg:text-[12px] text-stone-600">
              <strong>URL d'accès :</strong> Le client est automatiquement redirigé vers{' '}
              <code style={neu.raisedXs} className="px-1.5 py-0.5 rounded mx-1 font-mono text-[11px]">
                {client.redirect_url || (photosPage ? 'event-photos.html' : (videoPage ? 'event-video.html' : '— rien à afficher —'))}
              </code>{' '}
              après saisie de son code.
              {!client.redirect_url && (photosPage || videoPage) && (
                <span className="block mt-1 text-emerald-600">✓ Configuration automatique active.</span>
              )}
            </div>
          </div>

          {/* Console des galeries (SaaS B.3, brique 14) */}
          <GalleriesManager client={client} />

          {editing && (
            <EventPageForm
              clientId={clientId}
              client={client}
              {...editing}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); load(); }}
              onSavedQuiet={() => load()}
            />
          )}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       ✉️ JOURNAL DES ENVOIS
       Un email partait au client final et il n'en restait presque rien :
       le type de la demande, sans l'adresse, l'objet ni le corps. Le
       photographe ne pouvait ni vérifier où c'était parti, ni relire ce
       que ses mariés avaient sous les yeux, ni répondre à « je n'ai rien
       reçu ».
       La trace va au LOCATAIRE et pas à la plateforme (choix de Gil) :
       lire la correspondance entre un photographe et ses mariés serait
       un vrai sujet de confidentialité en marque blanche. La policy RLS
       « agence » s'en charge — chacun ne voit que ses propres envois.
       ════════════════════════════════════════════════════════════ */
    const ENVOI_NOMS = {
      welcome: 'Bienvenue', new_media: 'Nouveau média', invoice_ready: 'Facture disponible',
      invoice_reminder: 'Rappel de facture', invoice_paid: 'Facture réglée',
      gallery_ready: 'Galerie en ligne', video_ready: 'Film prêt',
      event_ready: 'Page événement', strategy_ready: 'Stratégie',
      shoot_scheduled: 'Tournage planifié', shoot_updated: 'Tournage modifié',
      shoot_reminder: 'Rappel de tournage',
      admin_new_comment: 'Commentaire client', admin_media_approved: 'Média validé',
      admin_changes_requested: 'Modifications demandées', admin_client_expiring: 'Espace qui expire',
    };

    function EnvoisTab({ clientId }) {
      const [lignes, setLignes] = useState([]);
      const [loading, setLoading] = useState(true);
      const [err, setErr] = useState('');
      const [ouvert, setOuvert] = useState(null);

      useEffect(() => { (async () => {
        setLoading(true); setErr('');
        /* Colonnes ajoutées par files/migration-journal-envois.sql. Absentes,
           PostgREST rejette TOUTE la requête — d'où le repli sur l'ancien
           jeu, qui garde la liste utilisable en attendant. */
        let r = await sb.from('notifications')
          .select('id, kind, to_email, subject, html, statut, erreur, sent_at, created_at')
          .eq('client_id', clientId).order('created_at', { ascending: false }).limit(200);
        if (r.error) {
          r = await sb.from('notifications')
            .select('id, kind, sent_at, created_at')
            .eq('client_id', clientId).order('created_at', { ascending: false }).limit(200);
          if (!r.error) setErr("Le détail des envois (destinataire, objet, contenu) n'est pas encore activé : exécutez files/migration-journal-envois.sql dans Supabase.");
        }
        if (r.error) setErr(humaniseErreur(r.error.message));
        else setLignes(r.data || []);
        setLoading(false);
      })(); }, [clientId]);

      if (loading) return (
        <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-stone-400" /></div>
      );

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
          <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Historique</div>
          <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1" style={SERIF}>Envois</h3>
          <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2 leading-relaxed">
            Tout ce qui est parti vers ce client depuis votre espace, automatique ou déclenché
            par vous. Ouvrez un envoi pour relire exactement ce qu'il a reçu.
          </p>

          {err && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {lignes.length === 0 ? (
            <EmptyState icon={Send}
              texte="Aucun email n'est encore parti vers ce client. Dès que vous enverrez une galerie, une facture ou qu'un film sera prêt, tout s'inscrira ici." />
          ) : (
            <div className="th-liste space-y-2 mt-4">
              {lignes.map((l) => {
                const ok = l.statut ? l.statut === 'envoye' : !!l.sent_at;
                const quand = new Date(l.created_at);
                return (
                  <div key={l.id} style={neu.pressedSm} className="rounded-2xl p-3.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-semibold">{ENVOI_NOMS[l.kind] || l.kind}</span>
                          <span className={`text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {ok ? 'Envoyé' : 'Échec'}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-stone-500 mt-1">
                          {quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {' à '}{quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {l.to_email && <> · {l.to_email}</>}
                        </div>
                        {l.subject && <div className="text-[12.5px] text-stone-600 mt-1 truncate">{l.subject}</div>}
                        {l.erreur && <div className="text-[11.5px] text-rose-700 mt-1">{l.erreur}</div>}
                      </div>
                      {l.html && (
                        <Btn icon={ouvert === l.id ? ChevronUp : Eye}
                          onClick={() => setOuvert(ouvert === l.id ? null : l.id)}>
                          {ouvert === l.id ? 'Replier' : 'Voir'}
                        </Btn>
                      )}
                    </div>
                    {ouvert === l.id && l.html && (
                      /* Rendu dans un cadre ISOLÉ : c'est du HTML d'email,
                         il ne doit ni hériter des styles de la console ni
                         exécuter quoi que ce soit chez nous. `sandbox` vide
                         coupe scripts, formulaires et navigation. */
                      <iframe title="Aperçu de l'email envoyé" sandbox srcDoc={l.html}
                        className="w-full h-[420px] mt-3 rounded-xl bg-white border border-stone-200" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🖼️ CONSOLE DES GALERIES (SaaS B.3, brique 14)
       Remplace l'ancien gestionnaire « Galerie B2 » (brique 11), qui
       ne savait gérer QU'UNE galerie implicite par client : les photos
       partaient dans gallery_photos avec (client_id, category) mais
       sans gallery_id, et le titre/gabarit/partage n'existaient pas.
       Ici les galeries sont des objets de premier rang (table
       `galleries`, RLS « agency write ») : on les crée, les ordonne,
       les partage par un lien propre et on uploade DANS l'une d'elles.
       Le stockage B2 ne change pas — mêmes variantes, même préfixe
       weddings/<code-client>/galerie/<slug-catégorie>/<uuid>/.
       ════════════════════════════════════════════════════════════ */

    // Lien public d'une galerie. TimelessHouse garde son domaine
    // historique ; les locataires vivent sur leur sous-domaine La Loge.
    function galleryShareUrl(code) {
      if (!code) return '';
      const slug = AGENCY.slug;
      if (!slug || slug === 'timelesshouse') return `https://timelesshouse.org/galerie?c=${code}`;
      return `https://${slug}.laloge.house/galerie?c=${code}`;
    }

    /* ── File d'attente d'encodage (brique 15) ───────────────
       Un MP4 uploadé par un locataire est lisible tout de suite, mais
       en une seule qualité. On dépose un ticket : le worker
       (workers/encoder/) le transcodera en 4K→480p adaptatif. La
       plateforme n'enfile rien — Gil garde son `npm run encode`.
       Jamais bloquant : si l'insert échoue, la vidéo reste lisible. */
    async function enqueueEncode(job) {
      if (FEATURES.allUniverses) return;              // plateforme : encodage manuel
      if (!job?.source_url) return;
      try {
        const { error } = await sb.from('encode_jobs').insert(job);
        // 23505 = doublon (un job est déjà en attente pour cette vidéo)
        if (error && error.code !== '23505') console.warn('encode_jobs:', error.message);
      } catch (e) { console.warn('encode_jobs:', e.message); }
    }

    // Lien de CONNEXION de l'espace client — c'est ce couple (lien + code)
    // que l'admin communique à son client pour qu'il entre dans son espace.
    function clientLoginUrl() {
      const slug = AGENCY.slug;
      if (!slug || slug === 'timelesshouse') return 'https://timelesshouse.org/app';
      return `https://${slug}.laloge.house`;
    }

    // ── Traducteur d'erreurs (UX vague 1) : jamais de message technique
    // brut à l'écran. Les gardes SQL parlent déjà français (quota…) et
    // passent telles quelles ; la plateforme voit le détail technique
    // entre parenthèses, pas les locataires.
    function humaniseErreur(brut, contexte = '') {
      const m = String(brut || '');
      const detail = FEATURES.allUniverses && m ? ` (détail : ${m})` : '';
      if (/quota|palier|offre|découverte/i.test(m) && /[éèàç ]/.test(m)) return m;
      if (/row-level security|violates row-level|permission denied|not.?allowed/i.test(m))
        return (contexte === 'client'
          ? 'Votre offre actuelle ne permet pas de créer un espace client supplémentaire. Passez au palier supérieur (Paramètres → Abonnement), ou supprimez un espace existant.'
          : 'Cette action n\'est pas disponible avec votre offre actuelle.') + detail;
      if (/duplicate|already exists|23505/i.test(m))
        return 'Ce code est déjà utilisé — choisissez-en un autre.';
      if (/failed to fetch|networkerror|load failed|timed? ?out/i.test(m))
        return 'La connexion a été perdue — vérifiez votre réseau puis réessayez.';
      if (/jwt|refresh token|expired/i.test(m))
        return 'Votre session a expiré — rechargez la page pour vous reconnecter.';
      return 'Quelque chose n\'a pas fonctionné. Réessayez dans un instant — si le problème persiste, écrivez-nous : service@timelesshouse.org.' + detail;
    }

    // Message d'invitation prêt à coller (SMS, WhatsApp, email) — LE geste
    // clé du produit : transmettre l'accès au client en un seul clic.
    function messageInvitation(client) {
      const prenoms = [client.partner1, client.partner2].filter(Boolean).join(' et ')
        || client.greeting || client.name || '';
      const ou = AGENCY.name ? ` chez ${AGENCY.name}` : '';
      return `Bonjour${prenoms ? ' ' + prenoms : ''} !\n\n`
        + `Votre espace privé${ou} est prêt : vous y retrouverez tout ce que nous vous livrons.\n\n`
        + `👉 ${clientLoginUrl()}\n`
        + `Votre code d'accès : ${client.code}\n\n`
        + `À très vite !`;
    }

    // Bouton « copier » générique — repasse en icône après 1,6 s.
    // `iconOnly` : version compacte pour les espaces contraints (mobile),
    // avec le libellé porté par aria-label et title.
    // `onCopied` : rappel optionnel après une copie réussie.
    function CopyButton({ value, label = 'Copier', iconOnly = false, onCopied }) {
      const [done, setDone] = useState(false);
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch (_) {
          // Safari hors HTTPS / permission refusée : repli sur un champ temporaire
          const ta = document.createElement('textarea');
          ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (__) {}
          document.body.removeChild(ta);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
        try { onCopied && onCopied(); } catch (_) {}
      };
      if (iconOnly) {
        const Icone = done ? Check : Copy;
        return (
          <button type="button" onClick={copy} aria-label={label} title={label}
            style={neu.raisedXs}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-stone-600 active:scale-95 transition-transform">
            <Icone size={14} />
          </button>
        );
      }
      return (
        <Btn icon={done ? Check : Copy} onClick={copy}>{done ? 'Copié' : label}</Btn>
      );
    }

    /* ── Console : liste des galeries du client ─────────────── */
    function GalleriesManager({ client }) {
      const [galleries, setGalleries] = useState([]);
      const [counts, setCounts]       = useState({});
      const [jobs, setJobs]           = useState({});      // gallery_id → [jobs d'encodage]
      const [loading, setLoading]     = useState(true);
      const [editing, setEditing]     = useState(null);   // {} = création, {…} = édition
      const [selCounts, setSelCounts] = useState({});     // coups de cœur par galerie
      const [openId, setOpenId]       = useState(null);   // galerie dépliée (photos)
      const [busy, setBusy]           = useState(false);
      const [err, setErr]             = useState('');

      const load = async () => {
        setLoading(true); setErr('');
        const { data, error } = await sb.from('galleries').select('*')
          .eq('client_id', client.id)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) { setErr(humaniseErreur(error.message)); setLoading(false); return; }
        setGalleries(data || []);

        // Compteurs de photos : un seul aller-retour pour tout le client.
        const { data: photos } = await sb.from('gallery_photos')
          .select('gallery_id').eq('client_id', client.id);
        const by = {};
        (photos || []).forEach(p => { if (p.gallery_id) by[p.gallery_id] = (by[p.gallery_id] || 0) + 1; });
        setCounts(by);

        // État d'encodage (badge « Optimisation en cours »). Table
        // absente ou vide → aucun badge, jamais d'erreur bloquante.
        const ids = (data || []).map(g => g.id);
        if (ids.length) {
          // `progress` : colonne ajoutée par files/migration-encode-progress.sql.
          // Absente (migration pas encore passée), PostgREST rejette TOUTE la
          // requête — d'où le repli sur l'ancien select, qui garde le badge.
          let js = null;
          ({ data: js } = await sb.from('encode_jobs')
            .select('gallery_id, status, progress, created_at').in('gallery_id', ids));
          if (!js) ({ data: js } = await sb.from('encode_jobs')
            .select('gallery_id, status, created_at').in('gallery_id', ids));
          const byJob = {};
          (js || []).forEach(j => {
            if (!j.gallery_id) return;
            (byJob[j.gallery_id] = byJob[j.gallery_id] || []).push(j);
          });
          setJobs(byJob);

          /* Combien de coups de cœur par galerie ? Sans ce chiffre il
             fallait OUVRIR chaque panneau pour savoir si quelqu'un avait
             choisi — un statut passif vaut mieux qu'une exploration (§10).
             On compte les photos DISTINCTES : trois personnes ayant coché
             la même photo, c'est une photo retenue, pas trois. */
          const { data: sel } = await sb.from('gallery_selections')
            .select('gallery_id, photo_id').in('gallery_id', ids);
          if (sel) {
            const par = {};
            sel.forEach(x => {
              (par[x.gallery_id] = par[x.gallery_id] || new Set()).add(x.photo_id);
            });
            setSelCounts(Object.fromEntries(
              Object.entries(par).map(([k, v]) => [k, v.size])));
          }
        }
        setLoading(false);
      };
      useEffect(() => { load(); }, [client.id]);

      /* Un encodage dure des heures sur un 4K : la barre doit avancer
         sans que l'utilisateur recharge. On ne relit QUE les jobs, et
         seulement TANT QU'IL Y EN A un en cours — un `load()` complet
         toutes les 5 s rallumerait le voile de chargement et ferait
         clignoter la liste. */
      const enCours = Object.values(jobs).flat()
        .some(j => j.status === 'pending' || j.status === 'processing');
      useEffect(() => {
        if (!enCours) return;
        const ids = galleries.map(g => g.id);
        if (!ids.length) return;
        const tic = setInterval(async () => {
          let js = null;
          ({ data: js } = await sb.from('encode_jobs')
            .select('gallery_id, status, progress, created_at').in('gallery_id', ids));
          if (!js) return;
          const by = {};
          js.forEach(j => { if (j.gallery_id) (by[j.gallery_id] = by[j.gallery_id] || []).push(j); });
          setJobs(by);
        }, 5000);
        return () => clearInterval(tic);
      }, [enCours, galleries]);

      // Réordonnancement : échange des positions avec le voisin.
      // Si elles ne sont pas discriminantes, on ré-indexe toute la liste.
      const move = async (idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= galleries.length || busy) return;
        setBusy(true);
        try {
          const a = galleries[idx], b = galleries[j];
          if ((a.position ?? 0) !== (b.position ?? 0)) {
            const r1 = await sb.from('galleries').update({ position: b.position ?? 0 }).eq('id', a.id);
            const r2 = await sb.from('galleries').update({ position: a.position ?? 0 }).eq('id', b.id);
            if (r1.error || r2.error) throw new Error((r1.error || r2.error).message);
          } else {
            const arr = [...galleries];
            [arr[idx], arr[j]] = [arr[j], arr[idx]];
            for (let k = 0; k < arr.length; k++) {
              const { error } = await sb.from('galleries').update({ position: k }).eq('id', arr[k].id);
              if (error) throw new Error(error.message);
            }
          }
          await load();
        } catch (e) { alert(e.message); }
        setBusy(false);
      };

      const toggleShare = async (g) => {
        setBusy(true);
        const { error } = await sb.from('galleries')
          .update({ share_enabled: !g.share_enabled }).eq('id', g.id);
        if (error) alert(error.message);
        await load();
        setBusy(false);
      };

      // Nouveau code : gallery_code_suggest garantit l'unicité, et le
      // trigger set_gallery_code_upd refuse une collision avec le code
      // d'un espace client de l'agence (ceinture + bretelles).
      const regenCode = async (g) => {
        // Pas d'avertissement quand il n'y a RIEN à casser (première génération)
        if (g.access_code && !confirm(`Régénérer le lien de « ${g.title} » ?\n\nL'ancien lien cessera immédiatement de fonctionner.`)) return;
        setBusy(true);
        try {
          const { data, error } = await sb.rpc('gallery_code_suggest', {
            p_agency: g.agency_id, p_base: g.title,
          });
          if (error) throw new Error(error.message);
          const { error: e2 } = await sb.from('galleries').update({ access_code: data }).eq('id', g.id);
          if (e2) throw new Error(e2.message);
          await load();
        } catch (e) { alert(e.message); }
        setBusy(false);
      };

      // Suppression : la cascade SQL emporte les lignes gallery_photos.
      // Les FICHIERS B2 restent (purge différée, comme la brique 11) —
      // un script de ménage plateforme balaiera les orphelins.
      const remove = async (g) => {
        const n = counts[g.id] || 0;
        if (!confirm(
          `Supprimer la galerie « ${g.title} » ?\n\n` +
          (n ? `Ses ${n} photo${n > 1 ? 's' : ''} seront retirée${n > 1 ? 's' : ''} de la livraison.\n` : '') +
          `Le lien de partage cessera de fonctionner. Cette action est irréversible.`
        )) return;
        setBusy(true);
        const { error } = await sb.from('galleries').delete().eq('id', g.id);
        if (error) alert(error.message);
        if (openId === g.id) setOpenId(null);
        await load();
        setBusy(false);
      };

      /* ── « Nouvelle galerie » → le concepteur ─────────────────
         Le concepteur charge une galerie par son lien de partage : elle
         doit donc EXISTER avant qu'il s'ouvre. On la crée avec des
         réglages neutres, puis on ouvre l'atelier dessus — le titre est
         le premier champ, il se change là-bas.
         Le titre par défaut porte le nom du client : il sert de base au
         lien de partage, et « nouvelle-galerie-3 » ferait une piètre
         adresse à envoyer à des mariés. */
      const creerEtConcevoir = async () => {
        if (busy) return;
        // L'onglet s'ouvre DANS le geste de clic. Ouvert après
        // l'aller-retour réseau, le navigateur le bloquerait comme une
        // fenêtre publicitaire.
        const onglet = window.open('', '_blank');
        setBusy(true); setErr('');
        try {
          const { data: siblings } = await sb.from('galleries')
            .select('position').eq('client_id', client.id);
          const next = (siblings || []).reduce((m, s) => Math.max(m, (s.position ?? 0) + 1), 0);
          const metier = METIERS[metierOf(client.universe)];

          const { data, error } = await sb.from('galleries').insert({
            client_id: client.id,
            position: next,
            title: `Galerie — ${client.name}`,
            kind: 'photos',
            template: metier?.templates?.[0] || 'mariage',
            config: { palette: 'noir', coverMode: 'fill', galleryMode: 'categorized' },
          }).select().single();
          if (error) throw new Error(error.message);

          // Même filet qu'à l'enregistrement : sans lien de partage, le
          // concepteur ne saurait pas quelle galerie ouvrir.
          let code = data.access_code;
          if (!code) {
            const { data: suggere } = await sb.rpc('gallery_code_suggest', {
              p_agency: data.agency_id, p_base: data.title,
            });
            if (suggere) {
              await sb.from('galleries').update({ access_code: suggere }).eq('id', data.id);
              code = suggere;
            }
          }
          if (!code) throw new Error(
            "La galerie est créée mais n'a pas de lien de partage : ouvrez-la avec « Générer le lien »."
          );

          const url = `/galerie-studio?c=${encodeURIComponent(code)}`;
          await load();                      // la galerie apparaît dans la liste
          if (onglet) {
            onglet.location.replace(url);
          } else {
            /* Onglet refusé (bloqueur de fenêtres). On ne retente PAS un
               window.open ici : hors du geste de clic, certains
               navigateurs intégrés naviguent l'onglet COURANT à la
               place — la console disparaîtrait sous les pieds. La
               galerie est créée et visible : on dit quoi faire. */
            setErr("Galerie créée. Votre navigateur a bloqué l'ouverture de l'atelier — cliquez sur « Concevoir » ci-dessous.");
          }
        } catch (e) {
          if (onglet) onglet.close();        // pas d'onglet blanc orphelin
          setErr(humaniseErreur(e.message));
        }
        setBusy(false);
      };

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Livraisons</div>
              <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1" style={SERIF}>Galeries</h3>
            </div>
            <Btn kind="dark" icon={Plus} onClick={creerEtConcevoir} disabled={busy}>Nouvelle galerie</Btn>
          </div>
          <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2 leading-relaxed">
            Chaque galerie a son propre lien de partage : le client (ou ses invités) y accède
            directement, sans passer par le code de l'espace client. Les photos partent sur votre
            stockage — originaux intacts, variantes d'affichage générées dans le navigateur.
          </p>

          {err && <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]"><AlertCircle size={14} /> {err}</div>}

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-stone-400" /></div>
          ) : galleries.length === 0 ? (
            <EmptyState icon={ImageIcon}
              texte="C'est ici que vous livrez photos et films : chaque galerie a son lien de partage, prêt à envoyer."
              bouton="Créer ma première galerie" onAction={creerEtConcevoir} />
          ) : (
            <div className="th-liste space-y-3 mt-4">
              {galleries.map((g, idx) => (
                <GalleryCard
                  key={g.id}
                  gallery={g}
                  client={client}
                  count={counts[g.id] || 0}
                  first={idx === 0}
                  last={idx === galleries.length - 1}
                  busy={busy}
                  open={openId === g.id}
                  encodeJobs={jobs[g.id]}
                  selCount={selCounts[g.id] || 0}
                  onToggleOpen={() => setOpenId(openId === g.id ? null : g.id)}
                  onMove={(dir) => move(idx, dir)}
                  onEdit={() => setEditing(g)}
                  onRemove={() => remove(g)}
                  onToggleShare={() => toggleShare(g)}
                  onRegenCode={() => regenCode(g)}
                  onPhotosChanged={load}
                />
              ))}
            </div>
          )}

          {editing && (
            <GalleryForm
              client={client}
              existing={editing.id ? editing : null}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); load(); }}
            />
          )}
        </div>
      );
    }

    /* ── État d'encodage d'une vidéo ────────────────────────
       Trois états visibles par l'admin : rien (pas de vidéo), en
       cours (le worker n'a pas encore fini) et adaptatif (fini).
       Discret : c'est une information de confort, pas une action. */
    // ── État vide guidé (UX vague 2) : une zone vide dit toujours
    // QUOI faire et offre le bouton pour le faire, au lieu d'un « (0) ».
    function EmptyState({ icon: Icon, texte, bouton, onAction }) {
      return (
        <div className="text-center py-10">
          <div style={neu.pressedSm} className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-stone-400" aria-hidden="true">
            <Icon size={22} />
          </div>
          <p className="text-[13.5px] text-stone-500 mt-4 max-w-sm mx-auto leading-relaxed">{texte}</p>
          {bouton && (
            <div className="mt-5 flex justify-center">
              <Btn kind="dark" icon={Plus} onClick={onAction}>{bouton}</Btn>
            </div>
          )}
        </div>
      );
    }

    function EncodeBadge({ state, progress }) {
      if (!state || state === 'none') return null;
      /* Barre DÉTERMINÉE dès qu'un chiffre existe (§10) : sur un 4K de
         trois minutes, « Optimisation en cours » restait seul à l'écran
         pendant des heures, sans le moindre signe de vie. */
      if (state === 'pending' && progress > 0) {
        return (
          <span className="inline-flex items-center gap-2 align-middle"
                role="progressbar" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={progress} aria-label="Optimisation du film">
            <span className="w-16 h-1.5 rounded-full bg-amber-100 overflow-hidden">
              <span className="block h-full rounded-full bg-amber-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${progress}%` }} />
            </span>
            <span className="text-[9.5px] uppercase tracking-wider text-amber-700 font-semibold tabular-nums">
              Optimisation {progress} %
            </span>
          </span>
        );
      }
      const map = {
        pending:  { txt: 'Optimisation en cours', cls: 'bg-amber-100 text-amber-700' },
        eteint:   { txt: 'En attente du poste',   cls: 'bg-rose-100 text-rose-700'  },
        error:    { txt: 'Optimisation échouée',  cls: 'bg-rose-100 text-rose-700'  },
        ready:    { txt: 'Qualité adaptative',    cls: 'bg-emerald-100 text-emerald-700' },
      };
      const m = map[state];
      if (!m) return null;
      return (
        <span className={`text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${m.cls}`}>
          {m.txt}
        </span>
      );
    }

    // Résume l'état d'encodage d'une liste de vidéos + les jobs en cours.
    // Avancement du job réellement en cours (0 si aucun, ou si la
    // migration n'a pas encore ajouté la colonne).
    function encodeProgressOf(jobs) {
      const j = (jobs || []).find(x => x.status === 'processing')
             || (jobs || []).find(x => x.status === 'pending');
      return Math.max(0, Math.min(100, Number(j?.progress) || 0));
    }

    /* Au-delà de ce délai sans qu'un job soit pris en charge, la seule
       explication est que le poste d'encodage ne tourne pas : la boucle
       du worker fait 30 s. « En attente » indéfiniment est un mensonge
       poli — rien ne se prépare, et personne ne le dit. */
    const ATTENTE_ANORMALE_MS = 3 * 60 * 1000;

    function encodeStateOf(videos, jobs) {
      const list = Array.isArray(videos) ? videos.filter(v => v?.urls?.['1080p'] || v?.hls) : [];
      if (!list.length) return 'none';
      if (jobs?.some(j => j.status === 'processing')) return 'pending';
      const attente = (jobs || []).filter(j => j.status === 'pending');
      if (attente.length) {
        const vieux = attente.every(j =>
          Date.now() - new Date(j.created_at || Date.now()).getTime() > ATTENTE_ANORMALE_MS);
        return vieux ? 'eteint' : 'pending';
      }
      if (list.every(v => v.hls)) return 'ready';
      if (jobs?.some(j => j.status === 'error')) return 'error';
      return 'none';
    }

    /* ── Une galerie : en-tête, partage, puis photos dépliables ── */
    function GalleryCard({
      gallery: g, client, count, first, last, busy, open, encodeJobs, selCount,
      onToggleOpen, onMove, onEdit, onRemove, onToggleShare, onRegenCode, onPhotosChanged,
    }) {
      const shareUrl = galleryShareUrl(g.access_code);
      const showsPhotos = g.kind === 'photos' || g.kind === 'mixte';
      const encodeState = encodeStateOf(g.config?.videos, encodeJobs);
      const encodeProgress = encodeProgressOf(encodeJobs);

      // Panneau « Sélection » — indépendant du panneau Photos : on
      // consulte souvent les coups de cœur sans vouloir dérouler la
      // gestion des fichiers.
      const [selOpen, setSelOpen] = useState(false);

      // Email ① « votre galerie est en ligne » — LE geste de livraison,
      // à la marque de l'agence, avec le lien de partage en bouton.
      const [envoiGalerie, setEnvoiGalerie] = useState(false);
      const envoyerGalerie = async () => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email) pour lui envoyer sa galerie.");
          return;
        }
        if (!confirm(`Envoyer « ${g.title} » par email à ${client.client_email} ?`)) return;
        setEnvoiGalerie(true);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body: JSON.stringify({ kind: 'gallery_ready', client_id: client.id, gallery_id: g.id }),
          });
          const j = await res.json().catch(() => ({}));
          if (res.ok && j.ok && !j.skipped) alert(`✓ Galerie envoyée à ${client.client_email}`);
          else alert(humaniseErreur(j.error || j.skipped || `Échec (${res.status})`));
        } catch (e) { alert(humaniseErreur(e.message)); }
        setEnvoiGalerie(false);
      };

      return (
        <div style={neu.pressedSm} className="rounded-2xl p-4">
          <div className="flex items-start gap-3 flex-wrap">
            {/* Réordonnancement */}
            <div className="flex flex-col shrink-0">
              {/* HIG : cibles tactiles 44 px — ce sont des actions primaires */}
              <button type="button" disabled={busy || first} onClick={() => onMove(-1)}
                aria-label="Monter la galerie"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-stone-600 disabled:opacity-25">
                <ChevronUp size={16} />
              </button>
              <button type="button" disabled={busy || last} onClick={() => onMove(1)}
                aria-label="Descendre la galerie"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-stone-600 disabled:opacity-25">
                <ChevronDown size={16} />
              </button>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold" style={SERIF}>{g.title}</span>
                {!g.share_enabled && (
                  <span className="text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 font-semibold">
                    Partage coupé
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-stone-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{kindLabel(g.kind)}</span>
                <span>·</span>
                <span>{templateLabel(g.template)}</span>
                {showsPhotos && <><span>·</span><span>{count} photo{count > 1 ? 's' : ''}</span></>}
                {(g.kind === 'video' || g.kind === 'mixte') && (
                  <><span>·</span><span>{(g.config?.videos || []).length} vidéo{(g.config?.videos || []).length > 1 ? 's' : ''}</span></>
                )}
                <EncodeBadge state={encodeState} progress={encodeProgress} />
                {/* « Est-ce qu'ils l'ont vue ? » — la question qui décide d'une relance.
                     Rien sur QUI regarde : un compteur et une date, c'est tout. */}
                {g.opened_count > 0 && (
                  <><span>·</span><span title={`Première ouverture : ${new Date(g.first_opened_at).toLocaleString('fr-FR')}`}>
                    Ouverte {g.opened_count} fois · dernière le {new Date(g.last_opened_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span></>
                )}
              </div>
              {/* UX vague 2 : pendant l'optimisation, dire clairement
                  qu'il n'y a RIEN à faire — l'inquiétude naît du silence. */}
              {encodeState === 'pending' && (
                <div className="text-[11.5px] text-amber-700 mt-1.5 leading-relaxed">
                  Nous préparons votre film — vous n'avez rien d'autre à faire.
                  Votre client le verra dès qu'il sera prêt.
                </div>
              )}
              {encodeState === 'eteint' && (
                <div className="text-[11.5px] text-rose-700 mt-1.5 leading-relaxed">
                  L'optimisation n'a pas démarré : l'ordinateur qui prépare les films est
                  éteint ou hors ligne. Votre film reste lisible par votre client en
                  attendant, et l'optimisation reprendra toute seule au prochain démarrage.
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {showsPhotos && (
                <Btn icon={open ? ChevronUp : ImageIcon} onClick={onToggleOpen}>
                  {open ? 'Replier' : 'Photos'}
                </Btn>
              )}
              {showsPhotos && (
                <Btn icon={selOpen ? ChevronUp : Heart} onClick={() => setSelOpen(!selOpen)}>
                  {selOpen ? 'Replier' : (selCount ? `Sélection · ${selCount}` : 'Sélection')}
                </Btn>
              )}
              {/* Le concepteur REMPLACE l'ancienne fenêtre d'édition (choix de
                  Gil, 25/07/2026) : mêmes réglages, plus l'aperçu vivant et le
                  dépôt des photos — au lieu de régler à l'aveugle dans une
                  modale. Nouvel onglet : la console reste ouverte derrière.
                  Repli sur l'ancienne fenêtre si la galerie n'a pas encore de
                  code de partage (le concepteur s'ouvre par ce code). */}
              {g.access_code ? (
                <Btn icon={Edit3} onClick={() => window.open(`/galerie-studio?c=${encodeURIComponent(g.access_code)}`, '_blank', 'noopener')}>
                  Concevoir
                </Btn>
              ) : (
                <Btn icon={Edit3} onClick={onEdit}>Modifier</Btn>
              )}
              <Btn icon={Trash2} onClick={onRemove} className="text-rose-600">Supprimer</Btn>
            </div>
          </div>

          {/* Partage */}
          <div style={neu.raisedXs} className="rounded-xl p-3 mt-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Lien de partage</div>
              <button type="button" onClick={onToggleShare} disabled={busy}
                aria-label={g.share_enabled ? 'Couper le partage' : 'Réactiver le partage'}
                className="flex items-center gap-2 min-h-[44px] px-1 disabled:opacity-50">
                <span className="text-[11.5px] text-stone-600 font-medium">
                  {g.share_enabled ? 'Actif' : 'Coupé'}
                </span>
                <span className={`w-10 h-5.5 rounded-full p-0.5 transition ${g.share_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${g.share_enabled ? 'translate-x-4' : ''}`} />
                </span>
              </button>
            </div>
            {g.access_code ? (<>
            {/* Le code en clair (retour de Gil, 22/07/2026) : il n'était
                lisible qu'enterré dans l'URL. Même motif que la carte
                « Accès client » — un client peut aussi SAISIR ce code sur
                la page de connexion de l'agence. */}
            <div className="flex items-center gap-3 flex-wrap mt-2.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-stone-500 font-semibold">Code</span>
              <code style={neu.pressedSm} className="px-2.5 py-1.5 rounded-md font-mono text-[12.5px] leading-none">{g.access_code}</code>
              <CopyButton value={g.access_code} label="Copier le code" iconOnly />
            </div>
            <div className={`mt-2 font-mono text-[11px] break-all ${g.share_enabled ? 'text-stone-600' : 'text-stone-400 line-through'}`}>
              {shareUrl}
            </div>
            <div className="flex gap-3 mt-2.5 flex-wrap">
              {g.share_enabled && (
                <Btn kind="dark" icon={envoiGalerie ? Loader2 : Bell} onClick={envoyerGalerie} disabled={busy || envoiGalerie}>
                  {envoiGalerie ? 'Envoi…' : 'Envoyer au client'}
                </Btn>
              )}
              <CopyButton value={shareUrl} label="Copier le lien" />
              <a href={shareUrl} target="_blank" rel="noopener"
                 style={neu.raisedXs}
                 className="px-5 py-3 min-h-[44px] rounded-full text-[13px] font-semibold flex items-center justify-center gap-2 text-stone-800">
                <ExternalLink size={14} /> Ouvrir
              </a>
              <Btn icon={RefreshCw} onClick={onRegenCode} disabled={busy}>Régénérer le lien</Btn>
            </div>
            {/* Astuce nº2 — la question que tout le monde se pose devant
                une galerie : ce code-là n'est pas celui de l'espace
                client, et la cloche fait le travail d'annonce. */}
            <Astuce cle="galerie-partage"
              titre="Cette galerie a sa propre clé"
              texte="Ce code n'est pas celui de l'espace client : il ouvre cette galerie et rien d'autre — pratique pour les proches, sans leur donner accès aux factures. « Envoyer au client » prévient par email, à vos couleurs, avec le bon lien." />
            </>) : (
            /* UX (22/07/2026, retour de Gil) : proposer « Régénérer » un
               code qui n'a jamais existé n'avait aucun sens. État vide
               honnête + génération en un clic (le filet du formulaire
               couvre les créations neuves ; ceci rattrape les anciennes). */
            <div className="mt-2">
              <p className="text-[12px] text-stone-500 leading-relaxed mb-3">
                Cette galerie n'a pas encore de lien de partage.
              </p>
              <Btn kind="dark" icon={RefreshCw} onClick={onRegenCode} disabled={busy}>
                Générer le lien
              </Btn>
            </div>
            )}
            {!g.share_enabled && (
              <div className="text-[11px] text-stone-500 mt-2">
                Le partage est coupé : le lien ne donne plus rien tant qu'il n'est pas réactivé.
              </div>
            )}
          </div>

          {open && showsPhotos && (
            <GalleryPhotos gallery={g} client={client} onChanged={onPhotosChanged} />
          )}
          {selOpen && showsPhotos && <GallerySelection gallery={g} />}
        </div>
      );
    }

    /* ══════════════════════════════════════════════════════════
       💛 LA SÉLECTION DU CLIENT
       Les cœurs posés dans la galerie ne vivaient que dans le
       navigateur du visiteur : le couple désignait ses photos
       d'album et le photographe n'en savait rien. Ils remontent
       maintenant, chacun sous son prénom.

       Regroupé par PRÉNOM et non par identité technique : une même
       personne venue de son téléphone puis de son ordinateur a deux
       clés d'écriture, mais une seule colonne ici — c'est ce que le
       photographe a en tête.
       ══════════════════════════════════════════════════════════ */
    function GallerySelection({ gallery: g }) {
      const [loading, setLoading] = useState(true);
      const [err, setErr] = useState('');
      const [lignes, setLignes] = useState([]);
      /* Archive des favoris — l'outil d'album : un zip des seules photos
         retenues, fabriqué par le worker comme l'archive de galerie. Le
         ménage l'emporte 7 jours après : un outil de travail, pas un
         stock. { statut, id, progress, url, message } */
      const [archive, setArchive] = useState(null);
      const [photos, setPhotos] = useState([]);
      const [qui, setQui] = useState('*');          // '*' tous · '=' les deux · un prénom

      useEffect(() => { (async () => {
        setLoading(true); setErr('');
        const [sel, ph] = await Promise.all([
          sb.from('gallery_selections')
            .select('photo_id, voter_name, voter_email').eq('gallery_id', g.id),
          /* select('*') et non une liste de colonnes : `hidden` est une
             colonne récente, la nommer ici casserait la requête ENTIÈRE
             sur une base où la migration du masquage n'est pas passée
             (règle apprise avec la colonne progress). Absente, elle vaut
             simplement undefined = visible. */
          sb.from('gallery_photos')
            .select('*')
            .eq('gallery_id', g.id).order('position', { ascending: true }),
        ]);
        /* 42P01 = la table n'existe pas encore. Le code part avant que la
           migration SQL ne soit exécutée : plutôt qu'un vide inexplicable,
           on dit quoi faire. */
        if (sel.error) {
          setErr(sel.error.code === '42P01'
            ? "La sélection n'est pas encore activée : exécutez files/migration-selection.sql dans Supabase."
            : humaniseErreur(sel.error.message));
        } else {
          setLignes(sel.data || []);
        }
        setPhotos(ph.data || []);
        setLoading(false);
      })(); }, [g.id]);

      /* Une ADRESSE = une personne. Grouper par prénom aurait fondu en
         une seule colonne deux invités prénommés Marie (question de
         Gil) ; l'adresse tranche, et suit la personne d'un appareil à
         l'autre. Le prénom n'est qu'une étiquette. */
      const parPersonne = useMemo(() => {
        const m = new Map();
        lignes.forEach(({ photo_id, voter_name, voter_email }) => {
          const cle = (voter_email || '').trim().toLowerCase();
          if (!cle) return;
          if (!m.has(cle)) m.set(cle, { cle, nom: (voter_name || '').trim() || cle, photos: new Set() });
          m.get(cle).photos.add(photo_id);
        });
        const liste = [...m.values()].sort((a, b) => b.photos.size - a.photos.size);
        // On n'affiche l'adresse que lorsqu'elle DISTINGUE : deux Marie
        // ont besoin d'être départagées, une Eléa seule n'a pas besoin
        // qu'on affiche son email à côté de son prénom.
        const vus = new Map();
        liste.forEach((p) => vus.set(p.nom.toLowerCase(), (vus.get(p.nom.toLowerCase()) || 0) + 1));
        liste.forEach((p) => { p.ambigu = vus.get(p.nom.toLowerCase()) > 1; });
        return liste;
      }, [lignes]);

      // Les photos choisies par TOUT LE MONDE : c'est le vrai résultat
      // d'une sélection à deux, et la première chose qu'on cherche.
      const communes = useMemo(() => {
        if (parPersonne.length < 2) return new Set();
        return new Set([...parPersonne[0].photos].filter(
          (id) => parPersonne.every((p) => p.photos.has(id))));
      }, [parPersonne]);

      /* Le NOM DE FICHIER exact que le client télécharge — pas une
         étiquette approchante. Première version : « Préparatifs · n°2 »,
         numéroté par catégorie. C'était faux deux fois, constaté sur une
         vraie galerie : `fileNameOf` numérote sur l'ENSEMBLE de la
         galerie, et en mode « tout mélangé » la catégorie disparaît (les
         fichiers s'appellent alors photo-001.jpg). Une liste qui ne
         correspond à rien de ce que le client reçoit ne sert à rien.

         On rejoue donc l'ordre de rendu de la galerie : mêmes groupes
         (RPC get_gallery_by_code : min(position), min(created_at), nom),
         même tri interne, même repli 'photo' quand la catégorie est vide. */
      const etiquette = useMemo(() => {
        const slug = (s) => (s || 'photo').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
        const cle = (p) => [p.position ?? 0, p.created_at || ''];
        const avant = (a, b) => (a[0] - b[0]) || String(a[1]).localeCompare(String(b[1]));

        const groupes = new Map();
        photos.forEach((p) => {
          const c = p.category || '';
          if (!groupes.has(c)) groupes.set(c, []);
          groupes.get(c).push(p);
        });
        let ordre = [...groupes.entries()]
          .map(([c, liste]) => {
            liste.sort((a, b) => avant(cle(a), cle(b)));
            return { c, liste, pos: Math.min(...liste.map((p) => p.position ?? 0)),
                     ne: liste.map((p) => p.created_at || '').sort()[0] };
          })
          .sort((a, b) => (a.pos - b.pos)
            || String(a.ne).localeCompare(String(b.ne))
            || a.c.localeCompare(b.c));

        // Mode « tout mélangé » : la galerie fusionne tout en un groupe SANS
        // nom, d'où le repli 'photo' sur le nom de fichier.
        if ((g.config?.galleryMode || 'categorized') === 'flat' && ordre.length > 1) {
          ordre = [{ c: '', liste: ordre.flatMap((o) => o.liste) }];
        }

        const rang = new Map();
        let i = 0;
        ordre.forEach(({ c, liste }) => liste.forEach((p) => {
          /* Les invités ne reçoivent pas les photos masquées : la
             numérotation qui fabrique les noms de fichiers doit les
             SAUTER, sinon la liste copiée désigne les mauvais fichiers
             dès la première photo masquée. Un cœur peut exister sur une
             photo masquée APRÈS coup — elle garde une étiquette, qui dit
             ce qu'elle est plutôt qu'un numéro que personne ne verra. */
          if (p.hidden) { rang.set(p.id, '(masquée aux invités)'); return; }
          rang.set(p.id, `${slug(c)}-${String(++i).padStart(3, '0')}.jpg`);
        }));
        return rang;
      }, [photos, g.config?.galleryMode]);

      const retenues = useMemo(() => {
        const garde = qui === '*' ? new Set(lignes.map((l) => l.photo_id))
                    : qui === '=' ? communes
                    : (parPersonne.find((p) => p.cle === qui)?.photos || new Set());
        return photos.filter((p) => garde.has(p.id));
      }, [qui, photos, lignes, communes, parPersonne]);

      const listeTexte = retenues.map((p) => etiquette.get(p.id) || p.id).join('\n');

      const telechargerArchive = (url) => {
        try {
          const u = new URL(url);
          if (u.hostname === 'media.timelesshouse.org' && u.pathname.startsWith('/file/')) {
            u.pathname = '/telecharger/' + u.pathname.slice('/file/'.length);
            u.searchParams.set('nom', `selection-${(g.title || 'galerie').replace(/[\/\\]/g, '-')}.zip`);
          }
          window.location.href = u.toString();
        } catch (_) { window.location.href = url; }
      };
      const demanderArchive = async () => {
        setArchive({ statut: 'demande' });
        const { data, error } = await sb.rpc('request_selection_zip', {
          p_gallery: g.id, p_photo_ids: retenues.map((p) => p.id),
        });
        if (error) {
          setArchive({ statut: 'erreur', message: /request_selection_zip/.test(error.message || '')
            ? "L'archive de sélection n'est pas encore activée : exécutez files/migration-selection-finie.sql dans Supabase."
            : humaniseErreur(error.message) });
          return;
        }
        if (data?.statut === 'done' && data.url) { setArchive(data); telechargerArchive(data.url); }
        else if (data?.statut === 'refus') setArchive({ statut: 'erreur', message: 'Cette galerie ne vous appartient pas.' });
        else setArchive(data);
      };
      useEffect(() => {
        if (!archive?.id || !['pending', 'processing'].includes(archive.statut)) return;
        const t = setInterval(async () => {
          const { data } = await sb.from('zip_jobs')
            .select('status, url, progress').eq('id', archive.id).maybeSingle();
          if (!data) return;
          if (data.status === 'done' && data.url) {
            clearInterval(t);
            setArchive({ statut: 'done', url: data.url });
            telechargerArchive(data.url);
          } else if (data.status === 'error') {
            clearInterval(t);
            setArchive({ statut: 'erreur', message: 'La préparation a échoué — réessayez.' });
          } else {
            setArchive((a) => ({ ...a, statut: data.status, progress: data.progress }));
          }
        }, 4000);
        return () => clearInterval(t);
      }, [archive?.id, archive?.statut]);

      if (loading) return (
        <div className="mt-4 py-6 flex justify-center">
          <Loader2 size={18} className="animate-spin text-stone-400" />
        </div>
      );

      return (
        <div style={neu.raised} className="rounded-2xl p-4 mt-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Coups de cœur</div>
              <h4 className="text-[17px] tracking-tight mt-0.5" style={SERIF}>Leur sélection</h4>
            </div>
            {retenues.length > 0 && (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <CopyButton value={listeTexte} label="Copier la liste" />
                <Btn icon={Download} onClick={demanderArchive}
                  disabled={archive && ['demande', 'pending', 'processing'].includes(archive.statut)}>
                  {archive?.statut === 'pending' || archive?.statut === 'demande' ? 'Préparation…'
                    : archive?.statut === 'processing' ? `Préparation… ${archive.progress || 0}%`
                    : `Archive (${retenues.length})`}
                </Btn>
              </span>
            )}
          </div>

          {archive?.statut === 'erreur' && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {archive.message}
            </div>
          )}
          {err ? (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
            </div>
          ) : parPersonne.length === 0 ? (
            <EmptyState icon={Heart}
              texte="Personne n'a encore choisi. Dès que vos clients cocheront leurs photos préférées dans la galerie, leurs listes apparaîtront ici." />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mt-4">
                <SelPuce actif={qui === '*'} onClick={() => setQui('*')}
                  nom="Tout le monde" n={new Set(lignes.map((l) => l.photo_id)).size} />
                {parPersonne.length > 1 && (
                  /* Le libellé suit le NOMBRE de personnes. « Choisies par
                     les deux » mentait dès qu'il y en avait trois : la
                     valeur, elle, a toujours été l'intersection de tous.
                     Constaté en production — une galerie avait un troisième
                     sélectionneur. */
                  <SelPuce actif={qui === '='} onClick={() => setQui('=')}
                    nom={parPersonne.length === 2 ? 'Choisies par les deux' : 'Choisies par tous'}
                    n={communes.size} />
                )}
                {parPersonne.map((p) => (
                  <SelPuce key={p.cle} actif={qui === p.cle} onClick={() => setQui(p.cle)}
                    nom={p.ambigu ? `${p.nom} · ${p.cle}` : p.nom} titre={p.cle} n={p.photos.size} />
                ))}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-4">
                {retenues.map((p) => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square bg-stone-100">
                    <img src={p.url_grid} alt={etiquette.get(p.id) || ''} loading="lazy"
                      className={'w-full h-full object-cover' + (p.hidden ? ' opacity-40' : '')} />
                    {p.hidden && (
                      <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-stone-900/70 text-white text-[9px] uppercase tracking-wider"
                        title="Les invités ne voient pas cette photo">
                        Masquée
                      </span>
                    )}
                    {communes.has(p.id) && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 text-rose-500 flex items-center justify-center"
                        title="Choisie par les deux">
                        <Heart size={11} fill="currentColor" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] text-stone-500 mt-3 leading-relaxed">
                « Copier la liste » donne les noms de fichiers EXACTS que vos clients
                téléchargent, pour retrouver leurs choix parmi les fichiers reçus.
              </p>
            </>
          )}
        </div>
      );
    }

    function SelPuce({ actif, onClick, nom, n, titre }) {
      return (
        <button type="button" onClick={onClick} aria-pressed={actif} title={titre}
          style={actif ? neu.pressedSm : neu.raisedXs}
          className={`min-h-[44px] px-4 rounded-full text-[12.5px] font-semibold transition-transform active:scale-[0.97] ${actif ? 'text-stone-900' : 'text-stone-500'}`}>
          {nom} <span className="opacity-60 font-normal">{n}</span>
        </button>
      );
    }

    /* ── Création / édition d'une galerie ───────────────────── */
    function GalleryForm({ client, existing, onClose, onSaved }) {
      const [form, setForm] = useState({
        title:    existing?.title    || `Galerie — ${client.name || client.code}`,
        kind:     existing?.kind     || 'photos',
        template: existing?.template || 'mariage',
        // Options d'affichage (parité éditeur event-photos) — lues par
        // galerie.html. Héritage : style 'cinematic' (1re version) → 'fill'.
        coverMode:    existing?.config?.coverMode || 'fill',
        galleryMode:  existing?.config?.galleryMode || 'categorized',
        palette:      existing?.config?.palette || 'noir',
        customBg:     existing?.config?.customBg || '#1a1714',
        customAccent: existing?.config?.customAccent || '#b08968',
        customMode:   existing?.config?.customMode || 'dark',
        cover:        existing?.config?.cover || '',
      });
      // Photos de la galerie — pour choisir la couverture du mode cinématique.
      const [coverPhotos, setCoverPhotos] = useState([]);
      useEffect(() => {
        if (!existing?.id) return;
        sb.from('gallery_photos').select('id, url_grid, category, position')
          .eq('gallery_id', existing.id).order('position')
          .then(({ data }) => setCoverPhotos(data || []));
      }, [existing?.id]);
      // Vidéos : modèle config.videos partagé avec event-video.html
      // (galerie-rendu.js lit urls['1080p'] / urls['4K'] et downloadUrl).
      const [videos, setVideos] = useState(() =>
        (existing?.config?.videos || []).map((v, i) => ({
          key:         v.key || `v${i + 1}`,
          title:       v.title || '',
          url:         (v.urls && (v.urls['1080p'] || v.urls['4K'])) || '',
          downloadUrl: v.downloadUrl || '',
          // Le HLS est produit par le worker : on le TRANSPORTE tel quel.
          // Sans ça, renommer une galerie après l'encodage effacerait le
          // travail du worker et la vidéo retomberait en progressif.
          hls:         v.hls || '',
          // Chapitres : édités en texte, une ligne = « 1:23 Titre ».
          chapText:    (Array.isArray(v.chapitres) ? v.chapitres : [])
            .map(c => `${c.time ?? c.temps ?? ''} ${c.titre ?? c.title ?? ''}`.trim())
            .filter(Boolean).join('\n'),
        }))
      );
      // « 1:23 Ouverture » (une ligne par chapitre) → [{ time, titre }].
      // Les lignes sans horodatage sont ignorées silencieusement.
      const parseChapters = (txt) => String(txt || '').split('\n')
        .map(l => l.trim()).filter(Boolean)
        .map(l => {
          const m = l.match(/^(\d{1,2}(?::\d{1,2}){1,2}|\d+)\s+(.+)$/);
          return m ? { time: m[1], titre: m[2].trim() } : null;
        })
        .filter(Boolean);
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');
      const [upProgress, setUpProgress] = useState(null); // { i, pct } pendant un envoi

      const showsVideos = form.kind === 'video' || form.kind === 'mixte';

      const addVideo = () => setVideos(v => [...v, {
        key: `v${v.length + 1}`, title: '', url: '', downloadUrl: '', hls: '', chapText: '',
      }]);
      const setVideo = (i, patch) => setVideos(v => v.map((x, k) => k === i ? { ...x, ...patch } : x));
      const removeVideo = (i) => setVideos(v => v.filter((_, k) => k !== i));

      // Locataire : la vidéo s'UPLOADE (jamais de lien à coller) — le fichier
      // part du navigateur vers B2, sous le préfixe du client (périmètre
      // vérifié par b2-sign), et sert à la fois de lecture et de source.
      const uploadVideo = async (i, file) => {
        if (!file) return;
        const codeSlug = slugify(client?.code || '');
        if (!codeSlug) { alert("Le client doit avoir un code d'accès avant d'uploader une vidéo."); return; }
        try {
          setUpProgress({ i, pct: 0 });
          const key = `weddings/${codeSlug}/galerie/videos/${crypto.randomUUID()}/${b2SafeName(file.name)}`;
          const url = await b2UploadFile(file, key, (p) => setUpProgress({ i, pct: Math.round(p * 100) }));
          setVideo(i, { url, downloadUrl: url, fileName: file.name });
        } catch (e2) {
          alert('✗ ' + (e2.message || "L'upload a échoué — rien n'a été mis en ligne."));
        }
        setUpProgress(null);
      };

      const submit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) { setErr('Donnez un titre à la galerie.'); return; }
        setLoading(true); setErr('');

        // On ne réécrit que la clé `videos` : une config héritée (migrée
        // depuis event_pages) garde tous ses autres champs.
        const config = { ...(existing?.config || {}) };
        if (showsVideos) {
          config.videos = videos
            .filter(v => (v.title || '').trim() || (v.url || '').trim())
            .map((v, i) => {
              const mp4 = (v.url || '').trim();
              const hls = (v.hls || '').trim();
              return {
                key:         (v.key || `v${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '') || `v${i + 1}`,
                title:       (v.title || '').trim() || `Vidéo ${i + 1}`,
                hls,
                urls:        mp4 ? { '1080p': mp4 } : {},
                downloadUrl: (v.downloadUrl || '').trim(),
                chapitres:   parseChapters(v.chapText),
                // Chez un locataire, le client ne voit la vidéo qu'une fois
                // au moins une qualité encodée : tant que le worker n'a pas
                // rendu son HLS, la page affiche « préparation en cours ».
                // (La plateforme garde ses vidéos visibles immédiatement.)
                ...(!FEATURES.allUniverses && mp4 && !hls ? { awaitingEncode: true } : {}),
              };
            });
          if (!config.defaultVideo || !config.videos.some(v => v.key === config.defaultVideo)) {
            config.defaultVideo = config.videos[0]?.key || '';
          }
        }

        // Options d'affichage (parité event-photos) : palette pour toutes
        // les galeries ; disposition de couverture + mode galerie + photo de
        // couverture pour celles qui ont des photos.
        const hasPhotos = form.kind === 'photos' || form.kind === 'mixte';
        config.palette = form.palette;
        if (form.palette === 'custom') {
          config.customBg = form.customBg;
          config.customAccent = form.customAccent;
          config.customMode = form.customMode;
        }
        if (hasPhotos) {
          config.coverMode = form.coverMode;
          config.galleryMode = form.galleryMode;
          if (form.cover) config.cover = form.cover; else delete config.cover;
          delete config.style; // remplacé par coverMode
        } else {
          delete config.coverMode; delete config.galleryMode;
          delete config.cover; delete config.style;
        }

        const payload = {
          title: form.title.trim(), kind: form.kind, template: form.template, config,
        };

        let result;
        if (existing) {
          result = await sb.from('galleries').update(payload).eq('id', existing.id).select().single();
        } else {
          // position : à la suite des galeries déjà en place.
          const { data: siblings } = await sb.from('galleries')
            .select('position').eq('client_id', client.id);
          const next = (siblings || []).reduce((m, s) => Math.max(m, (s.position ?? 0) + 1), 0);
          result = await sb.from('galleries')
            .insert({ ...payload, client_id: client.id, position: next })
            .select().single();
        }

        if (result.error) { setErr(humaniseErreur(result.error.message)); setLoading(false); return; }

        // Filet (22/07/2026) : le lien de partage naît normalement d'un
        // trigger SQL à l'insertion (set_gallery_code). Gil a constaté des
        // galeries SANS code à la création — dérive base/fichier possible.
        // Quoi qu'il en soit : une galerie ne doit JAMAIS exister sans
        // lien partageable, on le génère donc ici si la base ne l'a pas fait.
        if (result.data && !result.data.access_code) {
          try {
            const { data: code } = await sb.rpc('gallery_code_suggest', {
              p_agency: result.data.agency_id, p_base: result.data.title,
            });
            if (code) {
              const { data: fixed } = await sb.from('galleries')
                .update({ access_code: code }).eq('id', result.data.id).select().single();
              if (fixed) result.data = fixed;
            }
          } catch (_) { /* le bouton « Générer le lien » de la carte prendra le relais */ }
        }

        // Chaque vidéo uploadée mais pas encore transcodée part en file
        // d'attente d'encodage (une seule fois : l'index anti-doublon
        // rejette silencieusement un ticket déjà en attente).
        if (showsVideos) {
          const saved = result.data;
          for (const v of (saved?.config?.videos || [])) {
            const mp4 = v?.urls?.['1080p'];
            if (mp4 && !v.hls) {
              await enqueueEncode({
                kind: 'gallery_video', gallery_id: saved.id,
                video_key: v.key, source_url: mp4,
              });
            }
          }
        }
        onSaved(result.data);
      };

      return (
        <Modal
          title={existing ? 'Modifier la galerie' : 'Nouvelle galerie'}
          kicker={existing ? 'Édition' : 'Création'}
          onClose={onClose}
          size="lg"
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Titre">
              <Input required value={form.title} autoFocus
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Mariage de Précieuse & Ronny" />
              <div className="text-[11px] text-stone-500 mt-1.5">
                Le titre s'affiche en haut de la galerie et sert de base au code d'accès.
              </div>
            </Field>

            <div className="space-y-4">
              <Field label="Type">
                <Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  {GALLERY_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
              </Field>
              <Field label="Gabarit de rendu">
                <Select value={form.template} onChange={e => setForm({ ...form, template: e.target.value })}>
                  {GALLERY_TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
            </div>

            {(form.kind === 'photos' || form.kind === 'mixte') && (
              <>
                {/* ── Disposition de la couverture (parité event-photos) ── */}
                <div className="mt-1">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Disposition de la couverture</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[
                      { id: 'fill', label: 'Plein écran', desc: 'Photo recadrée + zoom lent', icon: (
                        <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                          <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.8"/>
                          <rect x="12" y="12" width="16" height="2.5" rx="1.25" fill="#fff" opacity="0.6"/>
                        </svg>
                      )},
                      { id: 'fit', label: 'Cadrée', desc: 'Ratio naturel sur fond palette', icon: (
                        <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                          <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.18"/>
                          <rect x="11" y="5" width="18" height="13" rx="1" fill="currentColor" opacity="0.85"/>
                          <rect x="14" y="21" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
                        </svg>
                      )},
                      { id: 'split', label: 'Split', desc: 'Photo encadrée à gauche, titre à droite', icon: (
                        <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                          <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                          <rect x="4" y="5" width="16" height="18" rx="1" fill="currentColor" opacity="0.85"/>
                          <rect x="25" y="11" width="11" height="2.5" rx="1.25" fill="currentColor" opacity="0.55"/>
                          <rect x="26" y="16" width="9" height="2" rx="1" fill="currentColor" opacity="0.35"/>
                        </svg>
                      )},
                      { id: 'editorial', label: 'Éditorial', desc: 'Grande typo à gauche, photo à droite', icon: (
                        <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                          <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                          <rect x="21" y="1" width="18" height="26" rx="1" fill="currentColor" opacity="0.85"/>
                          <rect x="4" y="4" width="7" height="2" rx="1" fill="currentColor" opacity="0.45"/>
                          <rect x="4" y="17" width="14" height="6" rx="1" fill="currentColor" opacity="0.7"/>
                        </svg>
                      )},
                      { id: 'portrait', label: 'Portrait', desc: 'Photo arquée centrée, titre dessous', icon: (
                        <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                          <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                          <rect x="15" y="4" width="10" height="16" rx="5" fill="currentColor" opacity="0.85"/>
                          <rect x="14" y="22" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
                        </svg>
                      )},
                    ].map(opt => {
                      const isActive = form.coverMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setForm({ ...form, coverMode: opt.id })}
                          style={isActive ? neu.pressedSm : neu.raisedXs}
                          className={`rounded-xl p-3 flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${isActive ? 'text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          <div className={`w-2/3 ${isActive ? 'text-stone-700' : 'text-stone-400'}`}>{opt.icon}</div>
                          <div className="text-[11px] font-semibold">{opt.label}</div>
                          <div className="text-[9.5px] text-stone-400 text-center leading-tight">{opt.desc}</div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5"/>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-3 mb-2">
                    {coverPhotos.length
                      ? 'Photo de couverture — cliquez pour choisir (sinon la 1ʳᵉ photo de la galerie).'
                      : 'Couverture vide → la 1ʳᵉ photo de la galerie est utilisée automatiquement.'}
                  </div>
                  {coverPhotos.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {coverPhotos.map(p => (
                        <button type="button" key={p.id} aria-label="Choisir comme couverture"
                          onClick={() => setForm({ ...form, cover: form.cover === p.id ? '' : p.id })}
                          className={`relative aspect-square rounded-lg overflow-hidden ${form.cover === p.id ? 'ring-2 ring-stone-800' : ''}`}>
                          <img src={p.url_grid} alt="" loading="lazy" className="w-full h-full object-cover" />
                          {form.cover === p.id && (
                            <span className="absolute inset-0 bg-stone-900/30 flex items-center justify-center">
                              <CheckCircle2 size={18} className="text-white" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Mode galerie ── */}
                <div className="mt-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Mode galerie</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { id: 'categorized', label: 'Catégories', desc: 'Sections par thème' },
                      { id: 'flat', label: 'Galerie unique', desc: 'Tout mélangé' },
                    ].map(m => {
                      const isActive = form.galleryMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setForm({ ...form, galleryMode: m.id })}
                          style={isActive ? neu.pressedSm : neu.raisedXs}
                          className={`rounded-xl p-3 flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${isActive ? 'text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          <div className="text-[14px]">{m.id === 'categorized' ? '📁' : '📷'}</div>
                          <div className="text-[11px] font-semibold">{m.label}</div>
                          <div className="text-[9.5px] text-stone-400 text-center leading-tight">{m.desc}</div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── Palette de couleurs (toutes galeries) ── */}
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-1">Palette de couleurs</div>
              <div className="text-[10px] text-stone-400 mb-3">Sourdes, riches ou sur mesure — la galerie s'adapte pour mettre les photos en valeur.</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { id: 'noir',     label: 'Noir',     sub: 'Or chaud',       bg: '#0a0a0a', accent: '#b08968' },
                  { id: 'fumee',    label: 'Fumée',    sub: 'Bronze doux',    bg: '#1a1714', accent: '#b1916f' },
                  { id: 'encre',    label: 'Encre',    sub: 'Bleu-nuit',      bg: '#0d0f14', accent: '#8a93a6' },
                  { id: 'sapin',    label: 'Sapin',    sub: 'Vert profond',   bg: '#0c0f0d', accent: '#8a9c84' },
                  { id: 'ardoise',  label: 'Ardoise',  sub: 'Bleu acier',     bg: '#13161c', accent: '#7fa0bd' },
                  { id: 'bordeaux', label: 'Bordeaux', sub: 'Vin · tan',      bg: '#45100f', accent: '#d2b48c' },
                  { id: 'acajou',   label: 'Acajou',   sub: 'Brun · caramel', bg: '#2a1812', accent: '#c98a5e' },
                  { id: 'foret',    label: 'Forêt',    sub: 'Vert riche',     bg: '#0e2118', accent: '#c2a878' },
                  { id: 'creme',    label: 'Crème',    sub: 'Sable clair',    bg: '#f3eee7', accent: '#8b6a48' },
                  { id: 'lin',      label: 'Lin',      sub: 'Taupe chaud',    bg: '#f1ece3', accent: '#8a7458' },
                  { id: 'sauge',    label: 'Sauge',    sub: 'Vert pâle',      bg: '#e8ebe4', accent: '#6e7d63' },
                  { id: 'brume',    label: 'Brume',    sub: 'Gris-bleu',      bg: '#e9ebee', accent: '#6b7785' },
                ].map(t => {
                  const isActive = form.palette === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm({ ...form, palette: t.id })}
                      style={isActive ? neu.pressedSm : neu.raisedXs}
                      className={`rounded-xl p-2.5 flex items-center gap-2.5 transition-all active:scale-[0.98] ${isActive ? '' : 'opacity-70 hover:opacity-90'}`}
                    >
                      <div className="relative flex-shrink-0">
                        <div style={{ background: t.bg, width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 13, height: 2, background: t.accent, borderRadius: 2 }}/>
                        </div>
                        {isActive && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                            <Check size={7} color="white"/>
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] font-semibold">{t.label}</div>
                        <div className="text-[9px] text-stone-400">{t.sub}</div>
                      </div>
                    </button>
                  );
                })}

                {(() => {
                  const isActive = form.palette === 'custom';
                  return (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, palette: 'custom' })}
                      style={isActive ? neu.pressedSm : neu.raisedXs}
                      className={`rounded-xl p-2.5 flex items-center gap-2.5 transition-all active:scale-[0.98] ${isActive ? '' : 'opacity-70 hover:opacity-90'}`}
                    >
                      <div className="relative flex-shrink-0">
                        <div style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'conic-gradient(from 210deg, #8B0000, #AA2704, #654321, #013220, #1f3a5f, #45100f, #8B0000)' }}/>
                        {isActive && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                            <Check size={7} color="white"/>
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] font-semibold">Personnalisé</div>
                        <div className="text-[9px] text-stone-400">Couleur libre</div>
                      </div>
                    </button>
                  );
                })()}
              </div>

              {/* Éditeur sur mesure */}
              {form.palette === 'custom' && (() => {
                const pv = previewVars(form.customBg, form.customAccent, form.customMode);
                return (
                  <div style={neu.pressedSm} className="rounded-xl p-4 mt-3 space-y-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Base</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[['dark', 'Sombre'], ['light', 'Clair']].map(([m, lbl]) => {
                          const a = form.customMode === m;
                          return (
                            <button key={m} type="button" onClick={() => setForm({ ...form, customMode: m })}
                              style={a ? neu.dark : neu.raisedXs}
                              className={`px-3 py-2.5 rounded-xl text-[11.5px] font-semibold transition active:scale-[0.98] ${a ? 'text-white' : 'text-stone-600'}`}>
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Fond</div>
                        <input type="color" value={form.customBg} onChange={e => setForm({ ...form, customBg: e.target.value })}
                          aria-label="Couleur de fond" className="w-full h-11 rounded-lg cursor-pointer" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Accent</div>
                        <input type="color" value={form.customAccent} onChange={e => setForm({ ...form, customAccent: e.target.value })}
                          aria-label="Couleur d'accent" className="w-full h-11 rounded-lg cursor-pointer" />
                      </div>
                    </div>
                    <div style={{ background: pv.bg, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ color: pv.accent, fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Aperçu</div>
                      <div style={{ color: pv.ink, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, marginTop: 4 }}>Éléa &amp; David</div>
                      <div style={{ color: pv.soft, fontSize: 10, marginTop: 3 }}>12 juin 2026 · Château de la Loge</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {showsVideos && (
              <Field label="Vidéos">
                <div className="space-y-3">
                  {videos.map((v, i) => (
                    <div key={i} style={neu.pressedSm} className="rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Input value={v.title} onChange={e => setVideo(i, { title: e.target.value })}
                            placeholder="Titre — Teaser, Film complet…" aria-label="Titre de la vidéo" />
                        </div>
                        <button type="button" onClick={() => removeVideo(i)}
                          aria-label="Retirer cette vidéo"
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-rose-500 shrink-0">
                          <X size={15} />
                        </button>
                      </div>
                      {FEATURES.allUniverses ? (
                        <>
                          <Input value={v.url} onChange={e => setVideo(i, { url: e.target.value })}
                            placeholder="URL du MP4 (lecture)" aria-label="URL de lecture" />
                          <Input value={v.downloadUrl} onChange={e => setVideo(i, { downloadUrl: e.target.value })}
                            placeholder="URL de téléchargement (optionnel)" aria-label="URL de téléchargement" />
                        </>
                      ) : upProgress?.i === i ? (
                        <div className="text-[12px] text-stone-600 min-h-[44px] flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Envoi… {upProgress.pct}%
                        </div>
                      ) : v.url ? (
                        <div className="text-[12px] text-emerald-700 min-h-[44px] flex items-center gap-1.5 truncate">
                          <CheckCircle2 size={14} className="shrink-0" /> {v.fileName || 'Fichier en ligne'} — prêt à la lecture
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                          aria-label="Fichier vidéo"
                          onChange={e => uploadVideo(i, e.target.files?.[0] || null)}
                          className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
                        />
                      )}
                      <textarea
                        value={v.chapText}
                        onChange={e => setVideo(i, { chapText: e.target.value })}
                        rows={3}
                        placeholder={'Chapitres (optionnel) — un par ligne :\n0:00 Ouverture\n2:45 Discours'}
                        aria-label="Chapitres de la vidéo"
                        style={neu.pressedSm}
                        className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[13px] leading-relaxed resize-y"
                      />
                    </div>
                  ))}
                  <Btn icon={Plus} onClick={addVideo} full>Ajouter une vidéo</Btn>
                </div>
                <div className="text-[11px] text-stone-500 mt-2 leading-relaxed">
                  {FEATURES.allUniverses ? (
                    <>Livrez un MP4 progressif : le lecteur le lit sans encodage préalable.
                    Laissez le téléchargement vide pour ne pas proposer le fichier source.</>
                  ) : (
                    <>Le fichier part directement de votre navigateur vers le stockage sécurisé
                    — livrez un MP4 : il est lisible immédiatement par votre client.</>
                  )}
                </div>
              </Field>
            )}

            {err && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]"><AlertCircle size={14} /> {err}</div>}

            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading || upProgress !== null} icon={loading ? Loader2 : Save}>
                {upProgress !== null ? 'Envoi de la vidéo…' : loading ? 'Enregistrement…' : (existing ? 'Mettre à jour' : 'Créer la galerie')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ── Photos D'UNE galerie : catégories + upload B2 ───────
       Reprise de l'ancien GalleryB2Manager (brique 11) — mêmes
       variantes, même préfixe B2 — mais tout est filtré et écrit
       avec `gallery_id`, au lieu du seul `client_id`.
       ──────────────────────────────────────────────────────── */
    function GalleryPhotos({ gallery, client, onChanged }) {
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [pendingCats, setPendingCats] = useState([]);  // catégories créées, encore vides
      const [newCat, setNewCat] = useState('');
      const [renames, setRenames] = useState({});          // { [cat]: brouillon de nom }
      const [up, setUp] = useState({});                    // { [cat]: { done, total, pct, msg, err } }
      const [busy, setBusy] = useState(false);

      const load = async () => {
        setLoading(true);
        const { data, error } = await sb.from('gallery_photos').select('*')
          .eq('gallery_id', gallery.id)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true });
        if (!error) setRows(data || []);
        setLoading(false);
      };
      useEffect(() => { load(); }, [gallery.id]);

      // Même ordre que la RPC get_gallery_by_code : min(position),
      // min(created_at) — les ISO se comparent en texte — puis nom.
      const cats = useMemo(() => {
        const by = new Map();
        rows.forEach(r => {
          if (!by.has(r.category)) by.set(r.category, { name: r.category, photos: [] });
          by.get(r.category).photos.push(r);
        });
        const minCreated = (c) => c.photos.reduce(
          (m, p) => (p.created_at && p.created_at < m) ? p.created_at : m,
          c.photos[0]?.created_at || '');
        const list = [...by.values()].sort((a, b) => {
          const pa = Math.min(...a.photos.map(p => p.position ?? 0));
          const pb = Math.min(...b.photos.map(p => p.position ?? 0));
          if (pa !== pb) return pa - pb;
          const ca = minCreated(a), cb = minCreated(b);
          return ca < cb ? -1 : ca > cb ? 1 : a.name.localeCompare(b.name);
        });
        pendingCats.forEach(name => { if (!by.has(name)) list.push({ name, photos: [] }); });
        return list;
      }, [rows, pendingCats]);

      const addCategory = () => {
        const name = newCat.trim();
        if (!name) return;
        if (cats.some(c => c.name === name)) { alert('Cette catégorie existe déjà.'); return; }
        setPendingCats(p => [...p, name]);
        setNewCat('');
      };

      const renameCategory = async (oldName) => {
        const name = (renames[oldName] ?? oldName).trim();
        if (!name || name === oldName) { setRenames(r => ({ ...r, [oldName]: undefined })); return; }
        if (cats.some(c => c.name === name)) { alert('Cette catégorie existe déjà.'); return; }
        setPendingCats(p => p.map(n => n === oldName ? name : n));
        if (rows.some(r => r.category === oldName)) {
          const { error } = await sb.from('gallery_photos')
            .update({ category: name }).eq('gallery_id', gallery.id).eq('category', oldName);
          if (error) { alert(error.message); return; }
          await load();
        }
        setRenames(r => ({ ...r, [oldName]: undefined }));
      };

      const removeEmptyCategory = (name) => setPendingCats(p => p.filter(n => n !== name));

      // Suppression : ligne SQL seulement — la purge des fichiers B2 est
      // différée (orphelins nettoyables par un script de ménage plateforme).
      const deletePhoto = async (p) => {
        if (!confirm('Supprimer cette photo ?\n\nElle disparaîtra de la galerie de votre client. Cette action est irréversible.')) return;
        const { error } = await sb.from('gallery_photos').delete().eq('id', p.id);
        if (error) { alert(error.message); return; }
        setRows(rs => rs.filter(r => r.id !== p.id));
        onChanged?.();
      };

      const movePhoto = async (cat, idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= cat.photos.length || busy) return;
        setBusy(true);
        try {
          const a = cat.photos[idx], b = cat.photos[j];
          if ((a.position ?? 0) !== (b.position ?? 0)) {
            const r1 = await sb.from('gallery_photos').update({ position: b.position }).eq('id', a.id);
            const r2 = await sb.from('gallery_photos').update({ position: a.position }).eq('id', b.id);
            if (r1.error || r2.error) throw new Error((r1.error || r2.error).message);
          } else {
            const arr = [...cat.photos];
            [arr[idx], arr[j]] = [arr[j], arr[idx]];
            for (let k = 0; k < arr.length; k++) {
              const { error } = await sb.from('gallery_photos').update({ position: k }).eq('id', arr[k].id);
              if (error) throw new Error(error.message);
            }
          }
          await load();
        } catch (e) { alert(e.message); }
        setBusy(false);
      };

      const uploadFiles = async (cat, fileList) => {
        const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        if (!client.code) { alert("Le client doit avoir un code d'accès avant d'uploader des photos."); return; }
        let position = cat.photos.length
          ? Math.max(...cat.photos.map(p => p.position ?? 0)) + 1 : 0;
        setBusy(true);
        for (let i = 0; i < files.length; i++) {
          setUp(s => ({ ...s, [cat.name]: { done: i, total: files.length, pct: 0, msg: `Photo ${i + 1}/${files.length}…` } }));
          try {
            await uploadGalleryPhoto({
              client, gallery, category: cat.name, position: position + i, file: files[i],
              onProgress: (p) => setUp(s => ({ ...s, [cat.name]: { ...(s[cat.name] || {}), done: i, total: files.length, pct: Math.round(((i + p) / files.length) * 100), msg: `Photo ${i + 1}/${files.length}…` } })),
            });
          } catch (err) {
            setUp(s => ({ ...s, [cat.name]: { err: true, msg: `✗ ${err.message} (photo ${i + 1}/${files.length})` } }));
            setBusy(false);
            await load(); onChanged?.();
            return;
          }
        }
        setUp(s => ({ ...s, [cat.name]: { msg: `✅ ${files.length} photo${files.length > 1 ? 's' : ''} en ligne` } }));
        setPendingCats(p => p.filter(n => n !== cat.name));
        setBusy(false);
        await load(); onChanged?.();
      };

      if (loading) {
        return <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-stone-400" /></div>;
      }

      return (
        <div className="space-y-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(120,113,108,0.18)' }}>
          {cats.map((cat) => (
            <div key={cat.name} style={neu.raisedXs} className="rounded-2xl p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <Input
                    value={renames[cat.name] ?? cat.name}
                    onChange={e => setRenames(r => ({ ...r, [cat.name]: e.target.value }))}
                    onBlur={() => renameCategory(cat.name)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                    aria-label="Nom de la catégorie"
                  />
                </div>
                <span className="text-[11px] text-stone-500 whitespace-nowrap">{cat.photos.length} photo{cat.photos.length > 1 ? 's' : ''}</span>
                <label className={`cursor-pointer px-4 py-2.5 min-h-[44px] rounded-full text-[12px] font-semibold flex items-center gap-1.5 bg-stone-900 text-white hover:bg-stone-800 transition ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                  {/* ⚠️ FileList est VIVANTE : la copier en Array AVANT
                      de vider l'input, sinon elle devient vide. */}
                  <input type="file" accept="image/*" multiple hidden
                    onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; uploadFiles(cat, files); }} />
                  <Plus size={12} /> Ajouter des photos
                </label>
                {cat.photos.length === 0 && (
                  <button type="button" onClick={() => removeEmptyCategory(cat.name)}
                    aria-label="Retirer la catégorie vide"
                    className="w-11 h-11 flex items-center justify-center rounded-lg text-rose-500">
                    <X size={15} />
                  </button>
                )}
              </div>

              {up[cat.name] && (
                <div className="mt-2.5">
                  {up[cat.name].pct != null && !up[cat.name].err && (
                    <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden mb-1.5">
                      <div className="h-full bg-stone-900 transition-all" style={{ width: `${up[cat.name].pct}%` }} />
                    </div>
                  )}
                  <div className={`text-[11.5px] font-medium ${up[cat.name].err ? 'text-rose-600' : 'text-stone-600'}`}>{up[cat.name].msg}</div>
                </div>
              )}

              {cat.photos.length > 0 && (
                <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                  {cat.photos.map((p, idx) => (
                    <div key={p.id} className="relative group rounded-lg overflow-hidden" style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.08)' }}>
                      <img src={p.url_grid || p.url_view} alt="" loading="lazy" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                        <button type="button" disabled={busy || idx === 0} onClick={() => movePhoto(cat, idx, -1)} aria-label="Monter" className="text-white p-1 disabled:opacity-30">
                          <ChevronUp size={13} />
                        </button>
                        <button type="button" disabled={busy || idx === cat.photos.length - 1} onClick={() => movePhoto(cat, idx, 1)} aria-label="Descendre" className="text-white p-1 disabled:opacity-30">
                          <ChevronDown size={13} />
                        </button>
                        <button type="button" disabled={busy} onClick={() => deletePhoto(p)} aria-label="Supprimer la photo" className="text-rose-300 p-1 disabled:opacity-30">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                placeholder="Nouvelle catégorie — Préparatifs, Cérémonie…"
                aria-label="Nom de la nouvelle catégorie"
              />
            </div>
            <Btn icon={Plus} onClick={addCategory} disabled={!newCat.trim()}>Créer</Btn>
          </div>
          {cats.length === 0 && (
            <div className="text-center text-[12px] text-stone-400 py-2 leading-relaxed">
              Créez une catégorie (Préparatifs, Cérémonie…) puis déposez vos photos dedans.
            </div>
          )}
        </div>
      );
    }

    function clientCouple(client) {
      if (client.partner1 || client.partner2) {
        return [client.partner1, client.partner2].filter(Boolean).join(' & ');
      }
      return client.name || '';
    }

    // Aperçu palette sur mesure — réplique la dérivation de la galerie
    function previewVars(bgHex, accHex, mode) {
      const hx = (h) => {
        h = (h || '').replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '1a1714';
        return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
      };
      const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
      const hex = (c) => '#' + c.map(v => cl(v).toString(16).padStart(2,'0')).join('');
      const mix = (a, b, t) => a.map((v,i) => v + (b[i]-v)*t);
      const W = [255,255,255], K = [0,0,0];
      const bg = hx(bgHex), acc = hx(accHex);
      if (mode === 'light') {
        const ink = mix(K, bg, 0.13);
        return { bg: hex(bg), ink: hex(ink), soft: hex(mix(ink, bg, 0.46)),
                 accent: hex(acc), elev: hex(mix(bg, K, 0.045)) };
      }
      const ink = mix(W, bg, 0.07);
      return { bg: hex(bg), ink: hex(ink), soft: hex(mix(ink, bg, 0.44)),
               accent: hex(acc), elev: hex(mix(bg, W, 0.07)) };
    }

    function defaultPhotosConfig(client) {
      return {
        couple: clientCouple(client),
        date: '',
        lieu: '',
        dateISO: '',
        cloudName: 'dyfa4zztq',
        rootFolder: 'Photos_' + (client.code || ''),
        categories: [],
        zipDriveId: '',
        style: 'cinematic',
        galleryMode: 'categorized',  // 'categorized' | 'flat'
        coverPublicId: '',
        palette: 'noir',             // palette : 'noir' | 'fumee' | 'encre' | 'sapin' | ... | 'custom'
        coverMode: 'fill',           // 'fill' (plein écran) | 'fit' (cadrée)
        customBg: '#1a1714',
        customAccent: '#b08968',
        customMode: 'dark',          // 'dark' | 'light'
      };
    }

    // Helpers chapitres vidéo (format YouTube : "MM:SS Titre" ou "HH:MM:SS Titre" par ligne)
    function parseChapterTime(str) {
      if (typeof str === 'number' && isFinite(str)) return Math.max(0, Math.floor(str));
      if (!str) return 0;
      const parts = String(str).trim().split(':').map(p => parseInt(p, 10));
      if (parts.some(isNaN)) return 0;
      if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
      if (parts.length === 2) return parts[0]*60 + parts[1];
      return parts[0] || 0;
    }
    function formatChapterTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(s).padStart(2, '0');
      return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
    }
    function chaptersToText(arr) {
      if (!Array.isArray(arr)) return '';
      return arr
        .map(c => `${formatChapterTime(c.time)} ${c.titre || ''}`.trimEnd())
        .join('\n');
    }
    // Parse libre : accepte "0:00 - Titre", "0:00 — Titre", "0:00 Titre", "00:00:00 Titre"
    function textToChapters(text) {
      if (!text) return [];
      const re = /^\s*(\d{1,2}(?::\d{1,2}){1,2})\s*[-–—:]?\s*(.*?)\s*$/;
      return text.split(/\r?\n/).reduce((acc, line) => {
        if (!line.trim()) return acc;
        const m = line.match(re);
        if (!m) return acc;
        const titre = (m[2] || '').trim();
        if (!titre) return acc;
        acc.push({ time: parseChapterTime(m[1]), titre });
        return acc;
      }, []).sort((a, b) => a.time - b.time);
    }

    function defaultVideoConfig(client) {
      const base = {
        couple: clientCouple(client),
        // Liste de vidéos : nombre et titres libres (Teaser, Film, Same Day Edit…)
        videos: [
          { key: 'teaser', title: 'Teaser',       hls: '', urls: {}, downloadUrl: '', chapitres: [] },
          { key: 'film',   title: 'Film Complet', hls: '', urls: {}, downloadUrl: '', chapitres: [] },
        ],
        defaultVideo: 'film',
        upsellBouton: false,
        upsellTexte: 'Commander ce film',
        upsellLien: 'mailto:service@timelesshouse.org',
      };
      if (client.universe === 'anniversaire-mariage') {
        return Object.assign(base, {
          nombreAnnees: 0,
          typeNoces: '',
          dateCelebration: '',
          dateCelebrationISO: '',
          lieuCelebration: '',
          dateMariageOriginal: '',
        });
      }
      if (client.universe === 'fiancailles') {
        return Object.assign(base, {
          dateDemande: '',
          dateDemandeISO: '',
          lieuDemande: '',
          dateMariagePrevu: '',
        });
      }
      return Object.assign(base, { date: '', lieu: '', dateISO: '' });
    }

    function EventPageForm({ clientId, client, page_type, config, id: initialId, onClose, onSaved, onSavedQuiet }) {
      // Les pages vidéo créées avant la liste sont converties à l'ouverture
      const [c, setC] = useState(() => withVideoList(config, page_type));
      const [loading, setLoading] = useState(false);
      const [pageId, setPageId] = useState(initialId);          // bumped to real id after first insert
      const [savedVersion, setSavedVersion] = useState(initialId ? 1 : 0);
      const [savedAt, setSavedAt] = useState(null);
      const isPhotos = page_type === 'photos';
      const isAnniversary = !isPhotos && client.universe === 'anniversaire-mariage';
      const isEngagement  = !isPhotos && client.universe === 'fiancailles';

      const performSave = async ({ stayOpen }) => {
        setLoading(true);
        const payload = { client_id: clientId, page_type, config: c };
        const result = pageId
          ? await sb.from('event_pages').update(payload).eq('id', pageId).select().single()
          : await sb.from('event_pages').insert(payload).select().single();

        if (result.error) {
          alert(result.error.message);
          setLoading(false);
          return;
        }
        if (!pageId && result.data?.id) setPageId(result.data.id);
        setSavedVersion(v => v + 1);
        setSavedAt(Date.now());
        setLoading(false);

        if (stayOpen) {
          // Refresh parent list silently, keep modal open so preview can refresh
          (onSavedQuiet || onSaved)?.();
        } else {
          onSaved();
        }
      };

      const submit = (e) => { e.preventDefault(); performSave({ stayOpen: false }); };
      const saveAndStay = () => performSave({ stayOpen: true });

      const updateConfig = (key, value) => setC({ ...c, [key]: value });

      /** Met à jour un champ ISO date + son libellé affiché automatiquement */
      const updateConfigDate = (isoKey, labelKey, iso) => {
        setC({ ...c, [isoKey]: iso, [labelKey]: isoToLabel(iso) });
      };

      // ── Upload de photos par catégorie (galeries photos → Cloudinary) ──
      const [photoUp, setPhotoUp] = useState({}); // { [indexCatégorie]: message }
      const handleCategoryPhotos = async (i, fileList) => {
        const cat = (c.categories || [])[i] || {};
        const folderName = (cat.folder || slugify(cat.name)).trim();
        if (!c.cloudName)  { alert('Renseigne le "Cloud name" Cloudinary plus haut.'); return; }
        if (!c.rootFolder) { alert('Renseigne le "Dossier racine" plus haut.'); return; }
        if (!folderName)   { alert('Donne un nom (ou un sous-dossier) à cette catégorie avant d\'ajouter des photos.'); return; }
        // Fixe le sous-dossier depuis le nom s'il était vide (cohérence galerie)
        if (!cat.folder) { const arr = [...(c.categories || [])]; arr[i] = { ...arr[i], folder: folderName }; updateConfig('categories', arr); }
        const files = Array.from(fileList || []);
        if (!files.length) return;
        try {
          await uploadPhotosToCloudinary(files, `${c.rootFolder}/${folderName}`,
            (n, total) => setPhotoUp(s => ({ ...s, [i]: `⏳ ${n}/${total}…` })));
          setPhotoUp(s => ({ ...s, [i]: `✅ ${files.length} photo(s) ajoutée(s)` }));
        } catch (err) {
          setPhotoUp(s => ({ ...s, [i]: `✗ ${err.message}` }));
        }
      };

      // ── Liste de vidéos (titres libres) + upload → B2 (tous univers) ──
      const videos = Array.isArray(c.videos) ? c.videos : [];
      const setVideos = (arr) => updateConfig('videos', arr);
      const updateVideo = (i, patch) => setVideos(videos.map((v, j) => (j === i ? { ...v, ...patch } : v)));

      // Clé stable dérivée du titre : sert de dossier B2 et de repère pour l'encodage.
      const keyFromTitle = (title, i) => {
        const base = slugify(title) || ('video-' + (i + 1));
        let key = base, n = 2;
        while (videos.some((v, j) => j !== i && v.key === key)) key = base + '-' + (n++);
        return key;
      };
      // Le titre pilote la clé TANT QUE rien n'est uploadé ; ensuite la clé est
      // gelée (les fichiers B2 et les commandes d'encodage y font référence).
      const onVideoTitle = (i, title) => {
        const v = videos[i];
        if (v.hls || v.downloadUrl) { updateVideo(i, { title }); return; }
        const newKey = keyFromTitle(title, i);
        const arr = videos.map((x, j) => (j === i ? { ...x, title, key: newKey } : x));
        const patch = { videos: arr };
        if (c.defaultVideo === v.key) patch.defaultVideo = newKey;
        setC({ ...c, ...patch });
      };
      const addVideo = () => {
        let key = 'video-' + (videos.length + 1), n = videos.length + 1;
        while (videos.some(v => v.key === key)) key = 'video-' + (++n);
        setVideos([...videos, { key, title: '', hls: '', urls: {}, downloadUrl: '', chapitres: [] }]);
      };
      const removeVideo = (i) => {
        const arr = videos.filter((_, j) => j !== i);
        const patch = { videos: arr };
        if (c.defaultVideo === videos[i].key) patch.defaultVideo = arr[0] ? arr[0].key : '';
        setC({ ...c, ...patch });
      };
      const moveVideo = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= videos.length) return;
        const arr = [...videos];
        [arr[i], arr[j]] = [arr[j], arr[i]];
        setVideos(arr);
      };

      const [evUpload, setEvUpload] = useState({}); // { [clé]: { pct, msg, cmd } }
      const codeSlug = slugify(client?.code || '');
      const uploadEventVideo = async (key, file) => {
        if (!file) return;
        if (!codeSlug) { alert("Le client doit avoir un code (fiche client) avant d'uploader une vidéo."); return; }
        const i = videos.findIndex(v => v.key === key);
        if (i === -1) return;
        try {
          setEvUpload(s => ({ ...s, [key]: { pct: 0, msg: 'Upload en cours… (ne ferme pas l\'onglet)' } }));
          const b2key = `weddings/${codeSlug}/${key}/original/${b2SafeName(file.name)}`;
          const url = await b2UploadFile(file, b2key, (p) =>
            setEvUpload(s => ({ ...s, [key]: { pct: Math.round(p * 100), msg: 'Upload en cours… (ne ferme pas l\'onglet)' } })));
          // Persiste la config avec le lien de téléchargement + garantit un pageId
          const arr = videos.map((v, j) => (j === i ? { ...v, downloadUrl: url } : v));
          const newConfig = { ...c, videos: arr };
          setC(newConfig);
          let pid = pageId;
          const res = pid
            ? await sb.from('event_pages').update({ client_id: clientId, page_type, config: newConfig }).eq('id', pid).select('id').single()
            : await sb.from('event_pages').insert({ client_id: clientId, page_type, config: newConfig }).select('id').single();
          if (res.error) throw new Error(res.error.message);
          pid = res.data.id; if (!pageId) setPageId(pid);
          setSavedVersion(v => v + 1); setSavedAt(Date.now());
          const cmd = `npm run encode -- --prefix weddings/${codeSlug}/${key} --input "/chemin/vers/${file.name}" --event-page ${pid} --video-key ${key}`;
          setEvUpload(s => ({ ...s, [key]: { pct: 100, msg: '✅ Original en ligne (téléchargement client OK)', cmd } }));
          (onSavedQuiet || onSaved)?.();
        } catch (err) {
          setEvUpload(s => ({ ...s, [key]: { msg: `✗ ${err.message}` } }));
        }
      };

      // Bloc réutilisable : upload d'une vidéo (teaser ou film).
      // Fonction de rendu (pas un composant) → appelée inline, aucun remontage
      // du champ fichier pendant les re-renders de progression.
      const renderVideoUpload = (key) => {
        const st = evUpload[key];
        return (
          <Field label="Fichier vidéo — upload direct sur B2">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadEventVideo(key, f); }}
              className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
            />
            {st && (
              <div className="mt-2">
                {st.pct != null && st.pct < 100 && (
                  <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden mb-1.5">
                    <div className="h-full bg-stone-900 transition-all" style={{ width: `${st.pct}%` }} />
                  </div>
                )}
                <div className="text-[11.5px] text-stone-600 font-medium">{st.msg}</div>
                {st.cmd && (
                  <div className="mt-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' }}>
                    <div className="text-[11px] leading-relaxed mb-1.5" style={{ color: '#92400e' }}>
                      <strong>Dernière étape (lecture adaptative).</strong> Lance ceci sur ton Mac — l'URL HLS ci-dessous se remplira toute seule :
                    </div>
                    <div className="rounded bg-stone-900 text-stone-100 px-3 py-2 font-mono text-[11px] break-all select-all leading-relaxed">{st.cmd}</div>
                    <button type="button" onClick={() => { try { navigator.clipboard.writeText(st.cmd); } catch (e) {} }} className="text-[11px] text-stone-500 underline underline-offset-2 mt-1.5">Copier la commande</button>
                  </div>
                )}
              </div>
            )}
          </Field>
        );
      };

      const formTitle = isPhotos ? 'Galerie photos'
        : isAnniversary ? 'Lecteur vidéo (anniversaire)'
        : isEngagement  ? 'Lecteur vidéo (fiançailles)'
        : 'Lecteur vidéo';

      return (
        <Modal title={formTitle} kicker={pageId ? 'Édition' : 'Nouvelle page'} onClose={onClose} size="lg">
          {/* ─── Aperçu en direct ─── */}
          <div className="mb-5">
            <LivePreviewPanel
              client={client}
              pageType={page_type}
              version={savedVersion}
              disabled={!pageId}
              disabledHint="Cliquez sur « Créer la page » pour activer l'aperçu en direct."
            />
            {savedAt && (Date.now() - savedAt < 3500) && (
              <div className="mt-2 text-[11.5px] text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Modifications enregistrées · aperçu mis à jour
              </div>
            )}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Couple / Client">
              <Input required value={c.couple || ''} onChange={e => updateConfig('couple', e.target.value)} placeholder="Précieuse & Ronny" />
            </Field>

            {isAnniversary ? (
              <>
                <div className="space-y-4">
                  <Field label="Nombre d'années">
                    <Input type="number" value={c.nombreAnnees || ''} onChange={e => updateConfig('nombreAnnees', parseInt(e.target.value) || 0)} placeholder="50" min="1" max="100" />
                  </Field>
                  <Field label="Type de noces (vide = auto)">
                    <Input value={c.typeNoces || ''} onChange={e => updateConfig('typeNoces', e.target.value)} placeholder="Auto-détecté (Noces d'Or, etc.)" />
                  </Field>
                </div>
                <div className="space-y-4">
                  <Field label="Date de célébration">
                    <Input type="date" value={c.dateCelebrationISO || ''} onChange={e => updateConfigDate('dateCelebrationISO', 'dateCelebration', e.target.value)} />
                    <div className="text-[11px] text-stone-500 mt-1">Affiché : <strong>{c.dateCelebration || '—'}</strong></div>
                  </Field>
                  <Field label="Lieu de la célébration">
                    <Input value={c.lieuCelebration || ''} onChange={e => updateConfig('lieuCelebration', e.target.value)} placeholder="Optionnel" />
                  </Field>
                </div>
                <Field label="Date du mariage d'origine">
                  <Input type="date" value={c.dateMariageOriginalISO || ''} onChange={e => updateConfigDate('dateMariageOriginalISO', 'dateMariageOriginal', e.target.value)} />
                  <div className="text-[11px] text-stone-500 mt-1">Affiché : <strong>{c.dateMariageOriginal || '—'}</strong></div>
                </Field>
              </>
            ) : isEngagement ? (
              <>
                <div className="space-y-4">
                  <Field label="Date de la demande">
                    <Input type="date" value={c.dateDemandeISO || ''} onChange={e => updateConfigDate('dateDemandeISO', 'dateDemande', e.target.value)} />
                    <div className="text-[11px] text-stone-500 mt-1">Affiché : <strong>{c.dateDemande || '—'}</strong></div>
                  </Field>
                  <Field label="Lieu de la demande">
                    <Input value={c.lieuDemande || ''} onChange={e => updateConfig('lieuDemande', e.target.value)} placeholder="Paris, Pont des Arts" />
                  </Field>
                </div>
                <Field label="Date du mariage prévue">
                  <Input type="date" value={c.dateMariagePrevuISO || ''} onChange={e => updateConfigDate('dateMariagePrevuISO', 'dateMariagePrevu', e.target.value)} />
                  <div className="text-[11px] text-stone-500 mt-1">Affiché : <strong>{c.dateMariagePrevu || '—'}</strong></div>
                </Field>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <Field label="Date de l'événement">
                    <Input type="date" value={c.dateISO || ''} onChange={e => updateConfigDate('dateISO', 'date', e.target.value)} />
                    <div className="text-[11px] text-stone-500 mt-1">Affiché : <strong>{c.date || '—'}</strong></div>
                  </Field>
                  <Field label="Lieu">
                    <Input value={c.lieu || ''} onChange={e => updateConfig('lieu', e.target.value)} placeholder="Domaine de Versailles" />
                  </Field>
                </div>
              </>
            )}

            {/* Champs spécifiques PHOTOS */}
            {isPhotos && (
              <>
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mt-6 mb-1">Cloudinary — héritage TimelessHouse (optionnel)</div>
                <div className="text-[11px] text-stone-500 mb-2 leading-relaxed">
                  Les photos se livrent désormais via la section <strong>« Galerie B2 »</strong> de l'onglet Page client — ces champs ne servent qu'aux anciennes galeries Cloudinary.
                </div>
                <div className="space-y-4">
                  <Field label="Cloud Name">
                    <Input value={c.cloudName || ''} onChange={e => updateConfig('cloudName', e.target.value)} placeholder="dyfa4zztq" />
                  </Field>
                  <Field label="Dossier racine">
                    <Input value={c.rootFolder || ''} onChange={e => updateConfig('rootFolder', e.target.value)} placeholder="Photos_precieuse-ronny" />
                  </Field>
                </div>

                <div className="mt-6 rounded-xl p-4" style={neu.pressedSm}>
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 text-emerald-600 flex-shrink-0">
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <div className="text-[12.5px] font-semibold text-stone-700">Upload direct + détection automatique</div>
                      <div className="text-[11.5px] text-stone-500 mt-1 leading-relaxed">
                        Ajoute une catégorie ci-dessous, puis clique <strong>« Ajouter des photos »</strong> : elles partent directement sur Cloudinary dans <code className="text-[10.5px] bg-stone-200/60 px-1 py-0.5 rounded">{c.rootFolder || 'dossier_racine'}/[catégorie]/</code> et la galerie du client les affiche automatiquement. Aucun fichier à numéroter. (Tu peux toujours uploader depuis Cloudinary directement si tu préfères.)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 mb-1">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Catégories — ordre & noms (optionnel)</div>
                  <button type="button" onClick={() => updateConfig('categories', [...(c.categories || []), { name: '', folder: '' }])}
                    style={neu.raisedXs} className="px-3 py-1.5 rounded-full text-[11.5px] flex items-center gap-1.5">
                    <Plus size={11} /> Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {(c.categories || []).map((cat, i) => (
                    <div key={i} style={neu.pressedSm} className="rounded-xl p-3">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 flex justify-center text-stone-400 text-[12px] font-semibold">{i + 1}</div>
                        <div className="col-span-5">
                          <Input value={cat.name} onChange={e => {
                            const arr = [...c.categories];
                            // auto-remplit le sous-dossier depuis le nom tant qu'il n'a pas été édité
                            const autoFolder = !cat.folder || cat.folder === slugify(cat.name);
                            arr[i] = { ...arr[i], name: e.target.value, folder: autoFolder ? slugify(e.target.value) : cat.folder };
                            updateConfig('categories', arr);
                          }} placeholder="Nom affiché — Préparatifs" />
                        </div>
                        <div className="col-span-5">
                          <Input value={cat.folder} onChange={e => {
                            const arr = [...c.categories];
                            arr[i] = { ...arr[i], folder: e.target.value };
                            updateConfig('categories', arr);
                          }} placeholder="Sous-dossier — preparatifs" />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button type="button" onClick={() => updateConfig('categories', c.categories.filter((_, j) => j !== i))} className="text-rose-500 p-1">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                        <label className="cursor-pointer px-3 py-1.5 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 bg-stone-900 text-white hover:bg-stone-800 transition">
                          <input type="file" accept="image/*" multiple hidden onChange={e => { handleCategoryPhotos(i, e.target.files); e.target.value = ''; }} />
                          <Plus size={11} /> Ajouter des photos
                        </label>
                        {photoUp[i] && <span className="text-[11px] text-stone-500">{photoUp[i]}</span>}
                      </div>
                    </div>
                  ))}
                  {(!c.categories || c.categories.length === 0) && (
                    <div className="text-center text-[12px] text-stone-400 py-3 leading-relaxed">
                      Clique <strong>« Ajouter »</strong> pour créer une catégorie, puis dépose tes photos dedans.<br/>
                      Les catégories définissent aussi l'<strong>ordre</strong> et le <strong>nom affiché</strong> côté client.
                    </div>
                  )}
                </div>
                <div className="text-[10.5px] text-stone-500 mt-2">
                  Structure Cloudinary : <code>{c.rootFolder || 'rootFolder'}/preparatifs/*</code>, <code>{c.rootFolder || 'rootFolder'}/ceremonie/*</code> … (noms de fichiers libres)
                </div>

                <Field label="ID Google Drive ZIP (optionnel)">
                  <Input value={c.zipDriveId || ''} onChange={e => updateConfig('zipDriveId', e.target.value)} placeholder="abcXYZ123" />
                </Field>


                <>
                  <Field label="Photo de couverture — public_id Cloudinary (optionnel)">
                      <Input value={c.coverPublicId || ''} onChange={e => updateConfig('coverPublicId', e.target.value)} placeholder="Photos_xxx/ceremonie/IMG_2841" />
                    </Field>

                    <div className="mt-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Disposition de la couverture</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: 'fill', label: 'Plein écran', desc: 'Photo recadrée + zoom lent', icon: (
                            <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                              <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.8"/>
                              <rect x="12" y="12" width="16" height="2.5" rx="1.25" fill="#fff" opacity="0.6"/>
                            </svg>
                          )},
                          { id: 'fit', label: 'Cadrée', desc: 'Ratio naturel sur fond palette', icon: (
                            <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                              <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.18"/>
                              <rect x="11" y="5" width="18" height="13" rx="1" fill="currentColor" opacity="0.85"/>
                              <rect x="14" y="21" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
                            </svg>
                          )},
                          { id: 'split', label: 'Split', desc: 'Photo encadrée à gauche, titre à droite', icon: (
                            <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                              <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                              <rect x="4" y="5" width="16" height="18" rx="1" fill="currentColor" opacity="0.85"/>
                              <rect x="25" y="11" width="11" height="2.5" rx="1.25" fill="currentColor" opacity="0.55"/>
                              <rect x="26" y="16" width="9" height="2" rx="1" fill="currentColor" opacity="0.35"/>
                            </svg>
                          )},
                          { id: 'editorial', label: 'Éditorial', desc: 'Grande typo à gauche, photo à droite', icon: (
                            <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                              <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                              <rect x="21" y="1" width="18" height="26" rx="1" fill="currentColor" opacity="0.85"/>
                              <rect x="4" y="4" width="7" height="2" rx="1" fill="currentColor" opacity="0.45"/>
                              <rect x="4" y="17" width="14" height="6" rx="1" fill="currentColor" opacity="0.7"/>
                            </svg>
                          )},
                          { id: 'portrait', label: 'Portrait', desc: 'Photo arquée centrée, titre dessous', icon: (
                            <svg viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
                              <rect x="1" y="1" width="38" height="26" rx="1" fill="currentColor" opacity="0.12"/>
                              <rect x="15" y="4" width="10" height="16" rx="5" fill="currentColor" opacity="0.85"/>
                              <rect x="14" y="22" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.5"/>
                            </svg>
                          )},
                        ].map(opt => {
                          const isActive = (c.coverMode || 'fill') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateConfig('coverMode', opt.id)}
                              style={isActive ? neu.pressedSm : neu.raisedXs}
                              className={`rounded-xl p-3 flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${isActive ? 'text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                            >
                              <div className={`w-2/3 ${isActive ? 'text-stone-700' : 'text-stone-400'}`}>{opt.icon}</div>
                              <div className="text-[11px] font-semibold">{opt.label}</div>
                              <div className="text-[9.5px] text-stone-400 text-center leading-tight">{opt.desc}</div>
                              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5"/>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-[10.5px] text-stone-500 mt-1 mb-1 leading-relaxed">
                      Couverture vide → la 1ʳᵉ photo de la galerie est utilisée automatiquement.
                    </div>
                  </>


                {/* ── Sélecteur de Mode Galerie ── */}
                <div className="mt-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Mode galerie</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { id: 'categorized', label: 'Catégories', desc: 'Filtres par thème' },
                      { id: 'flat', label: 'Galerie unique', desc: 'Tout mélangé' },
                    ].map(m => {
                      const isActive = (c.galleryMode || 'categorized') === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateConfig('galleryMode', m.id)}
                          style={isActive ? neu.pressedSm : neu.raisedXs}
                          className={`rounded-xl p-3 flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${isActive ? 'text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                          <div className="text-[14px]">{m.id === 'categorized' ? '📁' : '📷'}</div>
                          <div className="text-[11px] font-semibold">{m.label}</div>
                          <div className="text-[9.5px] text-stone-400 text-center leading-tight">{m.desc}</div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Palette de couleurs (tous styles) ── */}
                <div className="mt-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-1">Palette de couleurs</div>
                  <div className="text-[10px] text-stone-400 mb-3">Sourdes, riches ou sur mesure — la galerie s'adapte pour mettre les photos en valeur.</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[
                      { id: 'noir',     label: 'Noir',     sub: 'Or chaud',     bg: '#0a0a0a', accent: '#b08968' },
                      { id: 'fumee',    label: 'Fumée',    sub: 'Bronze doux',  bg: '#1a1714', accent: '#b1916f' },
                      { id: 'encre',    label: 'Encre',    sub: 'Bleu-nuit',    bg: '#0d0f14', accent: '#8a93a6' },
                      { id: 'sapin',    label: 'Sapin',    sub: 'Vert profond', bg: '#0c0f0d', accent: '#8a9c84' },
                      { id: 'ardoise',  label: 'Ardoise',  sub: 'Bleu acier',   bg: '#13161c', accent: '#7fa0bd' },
                      { id: 'bordeaux', label: 'Bordeaux', sub: 'Vin · tan',    bg: '#45100f', accent: '#d2b48c' },
                      { id: 'acajou',   label: 'Acajou',   sub: 'Brun · caramel', bg: '#2a1812', accent: '#c98a5e' },
                      { id: 'foret',    label: 'Forêt',    sub: 'Vert riche',   bg: '#0e2118', accent: '#c2a878' },
                      { id: 'creme',    label: 'Crème',    sub: 'Sable clair',  bg: '#f3eee7', accent: '#8b6a48' },
                      { id: 'lin',      label: 'Lin',      sub: 'Taupe chaud',  bg: '#f1ece3', accent: '#8a7458' },
                      { id: 'sauge',    label: 'Sauge',    sub: 'Vert pâle',    bg: '#e8ebe4', accent: '#6e7d63' },
                      { id: 'brume',    label: 'Brume',    sub: 'Gris-bleu',    bg: '#e9ebee', accent: '#6b7785' },
                    ].map(t => {
                      const isActive = (c.palette || c.theme || 'noir') === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => updateConfig('palette', t.id)}
                          style={isActive ? neu.pressedSm : neu.raisedXs}
                          className={`rounded-xl p-2.5 flex items-center gap-2.5 transition-all active:scale-[0.98] ${isActive ? '' : 'opacity-70 hover:opacity-90'}`}
                        >
                          <div className="relative flex-shrink-0">
                            <div style={{ background: t.bg, width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ width: 13, height: 2, background: t.accent, borderRadius: 2 }}/>
                            </div>
                            {isActive && (
                              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                                <Check size={7} color="white"/>
                              </div>
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-[11px] font-semibold">{t.label}</div>
                            <div className="text-[9px] text-stone-400">{t.sub}</div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Carte « Personnalisé » */}
                    {(() => {
                      const isActive = (c.palette || c.theme || 'noir') === 'custom';
                      return (
                        <button
                          type="button"
                          onClick={() => updateConfig('palette', 'custom')}
                          style={isActive ? neu.pressedSm : neu.raisedXs}
                          className={`rounded-xl p-2.5 flex items-center gap-2.5 transition-all active:scale-[0.98] ${isActive ? '' : 'opacity-70 hover:opacity-90'}`}
                        >
                          <div className="relative flex-shrink-0">
                            <div style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: 'conic-gradient(from 210deg, #8B0000, #AA2704, #654321, #013220, #1f3a5f, #45100f, #8B0000)' }}/>
                            {isActive && (
                              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                                <Check size={7} color="white"/>
                              </div>
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-[11px] font-semibold">Personnalisé</div>
                            <div className="text-[9px] text-stone-400">Couleur libre</div>
                          </div>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Éditeur sur mesure */}
                  {(c.palette || c.theme || 'noir') === 'custom' && (() => {
                    const pv = previewVars(c.customBg || '#1a1714', c.customAccent || '#b08968', c.customMode || 'dark');
                    return (
                    <div style={neu.pressedSm} className="rounded-xl p-4 mt-3 space-y-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Base</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[['dark','Sombre'],['light','Clair']].map(([m, lbl]) => {
                            const a = (c.customMode || 'dark') === m;
                            return (
                              <button key={m} type="button" onClick={() => updateConfig('customMode', m)}
                                style={a ? neu.dark : neu.raisedXs}
                                className={`px-3 py-2.5 rounded-xl text-[11.5px] font-semibold transition active:scale-[0.98] ${a ? 'text-white' : 'text-stone-600'}`}>
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Fond</div>
                          <div className="flex items-center gap-2">
                            <input type="color" value={c.customBg || '#1a1714'} onChange={e => updateConfig('customBg', e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer flex-shrink-0" style={{ border: '1px solid rgba(0,0,0,0.15)', padding: 0, background: 'none' }} />
                            <Input value={c.customBg || ''} onChange={e => updateConfig('customBg', e.target.value)} placeholder="#1a1714" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Accent</div>
                          <div className="flex items-center gap-2">
                            <input type="color" value={c.customAccent || '#b08968'} onChange={e => updateConfig('customAccent', e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer flex-shrink-0" style={{ border: '1px solid rgba(0,0,0,0.15)', padding: 0, background: 'none' }} />
                            <Input value={c.customAccent || ''} onChange={e => updateConfig('customAccent', e.target.value)} placeholder="#b08968" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-2">Aperçu</div>
                        <div style={{ background: pv.bg, borderRadius: 12, padding: '24px 20px', border: '1px solid rgba(0,0,0,0.10)' }}>
                          <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', color: pv.ink, fontSize: 24, lineHeight: 1 }}>
                            {c.couple || 'Aurore & Tom'}
                          </div>
                          <div style={{ width: 36, height: 1, background: pv.accent, margin: '13px 0 15px', opacity: 0.6 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            {[0.9, 1.3, 0.7, 1.1].map((r, i) => (
                              <div key={i} style={{ flex: r, height: 46, background: pv.elev, borderRadius: 2 }} />
                            ))}
                          </div>
                          <div style={{ marginTop: 14, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: pv.soft }}>
                            22 juin 2025 · Toscane
                          </div>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-2 leading-relaxed">
                          Le texte, les nuances et les ombres sont calculés automatiquement à partir du fond et de l'accent — choisissez n'importe quelle couleur (riche ou sourde).
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* Champs spécifiques VIDÉO */}
            {!isPhotos && (
              <>
                <div className="flex items-center justify-between mt-6 mb-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Vidéos de la galerie</div>
                  <button type="button" onClick={addVideo}
                    style={neu.raisedXs} className="px-3 py-1.5 rounded-full text-[11.5px] flex items-center gap-1.5">
                    <Plus size={11} /> Ajouter une vidéo
                  </button>
                </div>
                <div className="text-[11px] text-stone-500 mb-3 leading-relaxed">
                  Chaque vidéo devient un onglet dans le lecteur du client, avec le titre que tu choisis
                  (Teaser, Film Complet, Same Day Edit, Save The Date…). L'ordre ici = l'ordre des onglets.
                </div>

                {videos.length === 0 && (
                  <div style={neu.pressedSm} className="rounded-2xl text-center text-[12px] text-stone-400 py-5 leading-relaxed">
                    Aucune vidéo pour l'instant.<br />Clique « Ajouter une vidéo » pour commencer.
                  </div>
                )}

                <div className="space-y-4">
                  {/* key={i} (et non v.key) : la clé suit le titre tant que rien n'est
                      uploadé — la garder comme key React ferait perdre le focus à chaque frappe */}
                  {videos.map((v, i) => (
                    <div key={i} style={neu.pressedSm} className="rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-stone-400 font-semibold w-4 text-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <Input value={v.title} onChange={e => onVideoTitle(i, e.target.value)} placeholder="Titre affiché — ex. Same Day Edit" />
                        </div>
                        <button type="button" onClick={() => moveVideo(i, -1)} disabled={i === 0}
                          className="px-1.5 py-1 text-[11px] text-stone-400 hover:text-stone-800 disabled:opacity-25" title="Monter">▲</button>
                        <button type="button" onClick={() => moveVideo(i, 1)} disabled={i === videos.length - 1}
                          className="px-1.5 py-1 text-[11px] text-stone-400 hover:text-stone-800 disabled:opacity-25" title="Descendre">▼</button>
                        <button type="button" onClick={() => removeVideo(i)} className="p-1 text-rose-500 hover:text-rose-700" title="Supprimer cette vidéo">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="text-[10.5px] text-stone-400 leading-relaxed">
                        Dossier B2 : <code className="bg-stone-200/50 px-1 py-0.5 rounded">weddings/{codeSlug || 'code-client'}/{v.key}</code>
                        {(v.hls || v.downloadUrl) ? ' · figé (fichiers déjà en ligne)' : ' · suit le titre tant que rien n\'est uploadé'}
                      </div>

                      {renderVideoUpload(v.key)}

                      <Field label="URL HLS adaptative (remplie automatiquement après l'encodage)">
                        <Input value={v.hls || ''} onChange={e => updateVideo(i, { hls: e.target.value })} placeholder="Se remplit toute seule — ou colle une URL master.m3u8" />
                      </Field>
                      <Field label="Lien de téléchargement (rempli automatiquement à l'upload)">
                        <Input value={v.downloadUrl || ''} onChange={e => updateVideo(i, { downloadUrl: e.target.value })} placeholder="https://…" />
                      </Field>
                      <Field label="Chapitres (un par ligne — ex. 2:30 Cérémonie)">
                        <Textarea rows={4}
                          value={chaptersToText(v.chapitres)}
                          onChange={e => updateVideo(i, { chapitres: textToChapters(e.target.value) })}
                          placeholder={"0:00 Ouverture\n2:30 Cérémonie"} />
                      </Field>

                      <details>
                        <summary className="text-[11px] text-stone-500 cursor-pointer select-none">URLs à qualité fixe (ancien système)</summary>
                        <div className="space-y-4 mt-2">
                          <Field label="URL 1080p">
                            <Input value={(v.urls || {})['1080p'] || ''} onChange={e => updateVideo(i, { urls: { ...(v.urls || {}), '1080p': e.target.value } })} placeholder="https://..." />
                          </Field>
                          <Field label="URL 4K">
                            <Input value={(v.urls || {})['4K'] || ''} onChange={e => updateVideo(i, { urls: { ...(v.urls || {}), '4K': e.target.value } })} placeholder="https://..." />
                          </Field>
                        </div>
                        <div className="text-[10.5px] text-stone-400 mt-1">Utilisées uniquement si l'URL HLS est vide (pas d'adaptation à la connexion).</div>
                      </details>
                    </div>
                  ))}
                </div>

                <Field label="Vidéo affichée par défaut">
                  <Select value={c.defaultVideo || ''} onChange={e => updateConfig('defaultVideo', e.target.value)}>
                    {videos.map((v, i) => <option key={i} value={v.key}>{v.title || v.key}</option>)}
                  </Select>
                </Field>

                <button type="button" onClick={() => updateConfig('upsellBouton', !c.upsellBouton)}
                  style={c.upsellBouton ? neu.dark : neu.pressedSm}
                  className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between transition mt-3 ${c.upsellBouton ? 'text-white' : 'text-stone-700'}`}>
                  <div className="text-left">
                    <div className="text-[12.5px] font-semibold">Bouton de commande (upsell)</div>
                    <div className={`text-[10.5px] mt-0.5 ${c.upsellBouton ? 'text-stone-300' : 'text-stone-500'}`}>Affiche un bouton "Commander" si la vidéo n'est pas livrée</div>
                  </div>
                  <div className={`w-9 h-5 rounded-full p-0.5 ${c.upsellBouton ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${c.upsellBouton ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
                {c.upsellBouton && (
                  <div className="space-y-4 mt-3">
                    <Field label="Texte du bouton">
                      <Input value={c.upsellTexte || ''} onChange={e => updateConfig('upsellTexte', e.target.value)} placeholder="Commander ce film" />
                    </Field>
                    <Field label="Lien de commande">
                      <Input value={c.upsellLien || ''} onChange={e => updateConfig('upsellLien', e.target.value)} placeholder="mailto:service@..." />
                    </Field>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn
                onClick={saveAndStay}
                disabled={loading}
                icon={loading ? Loader2 : RefreshCw}
                full
              >
                {loading ? 'Enregistrement…' : 'Enregistrer & continuer'}
              </Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? 'Enregistrement…' : (pageId ? 'Mettre à jour' : 'Créer la page')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    function MediaTab({ clientId, client }) {
      const [items, setItems] = useState([]);
      const [shoots, setShoots] = useState([]);
      const [comments, setComments] = useState({});
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [openComments, setOpenComments] = useState(null); // media object pour la modale
      const [loading, setLoading] = useState(true);
      const [notifying, setNotifying] = useState(null);

      const load = async () => {
        setLoading(true);
        const [m, s] = await Promise.all([
          sb.from('media').select('*').eq('client_id', clientId).order('date_iso', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
          sb.from('shoots').select('*').eq('client_id', clientId).order('date_iso'),
        ]);
        const mediaItems = m.data || [];
        setItems(mediaItems);
        setShoots(s.data || []);
        // Comptage des commentaires par média
        if (mediaItems.length) {
          const ids = mediaItems.map(x => x.id);
          const { data: c } = await sb.from('media_comments').select('id, media_id').in('media_id', ids);
          const grouped = {};
          (c || []).forEach(cm => { grouped[cm.media_id] = (grouped[cm.media_id] || 0) + 1; });
          setComments(grouped);
        }
        setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer ce média ?\n\nVotre client ne le verra plus dans son espace. Cette action est irréversible.')) return;
        await sb.from('media').delete().eq('id', id);
        load();
      };

      const setApproval = async (id, status) => {
        await sb.rpc('update_media_approval', { p_media_id: id, p_status: status });
        load();
      };

      const notifyClient = async (media) => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (modifier le client → champ Email).");
          return;
        }
        setNotifying(media.id);
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ADMIN_TOKEN}`,
            },
            body: JSON.stringify({ client_id: clientId, media_id: media.id, kind: 'new_media' }),
          });
          if (res.ok) {
            alert(`✓ Email envoyé à ${client.client_email}`);
          } else if (res.status === 404) {
            alert("La fonction de notification n'est pas encore déployée.\n\nVoir ÉMAILS-SETUP.md pour activer les notifications par email (5 min).");
          } else {
            const txt = await res.text();
            alert(`Erreur d'envoi : ${txt}`);
          }
        } catch (e) {
          alert("Erreur réseau : " + e.message);
        }
        setNotifying(null);
      };

      const findShoot = (id) => shoots.find(s => s.id === id);

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-tight" style={SERIF}>
              Médias livrés <span className="text-stone-400">({items.length})</span>
            </h3>
            <Btn kind="dark" icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }} className="w-full sm:w-auto">
              Ajouter un média
            </Btn>
          </div>

          {/* Astuce nº3 — n'apparaît qu'une fois un média livré : avant,
              la cloche n'existe pas encore à l'écran et la montrer du
              doigt n'aurait aucun sens. */}
          {items.length > 0 && (
            <Astuce cle="cloche"
              titre="La cloche prévient votre client"
              texte="Sur chaque ligne, l'icône 🔔 envoie un email annonçant ce média — à votre nom, avec votre logo. C'est le même geste partout : médias, factures, documents, tournages." />
          )}

          {loading ? <div className="text-center py-12 text-stone-400">Chargement…</div> : (
            <div className="space-y-2.5">
              {items.map(m => {
                const shoot = findShoot(m.shoot_id);
                const cmtCount = comments[m.id] || 0;
                return (
                  <div key={m.id} style={neu.pressedSm} className="rounded-2xl p-3 flex items-center gap-3 flex-wrap">
                    <div className="w-14 h-14 rounded-xl shrink-0" style={{ background: m.thumb_grad }}>
                      {m.type === 'video' && <div className="w-full h-full flex items-center justify-center text-white"><Video size={18} /></div>}
                      {m.type === 'photo' && <div className="w-full h-full flex items-center justify-center text-white"><Camera size={18} /></div>}
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-[13.5px] truncate">{m.title}</div>
                        <ApprovalBadge status={m.approval_status || 'pending'} />
                      </div>
                      <div className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                        {m.date_label}{m.duration && ` · ${m.duration}`}{m.size_label && ` · ${m.size_label}`}{m.tag && ` · ${m.tag}`}
                        {shoot && <span className="ml-1.5"><Link2 size={10} className="inline" /> {shoot.title}</span>}
                      </div>
                    </div>

                    {/* Actions — wrap propre sur mobile */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button onClick={() => setOpenComments(m)} style={neu.raisedXs} className="px-3 min-h-[40px] rounded-full flex items-center gap-1.5 text-[12px] active:scale-95 transition-transform" title="Commentaires">
                        <MessageSquare size={13} /> {cmtCount}
                      </button>

                      {client?.client_email && (
                        <BellBtn onClick={() => notifyClient(m)} busy={notifying === m.id} title="Prévenir le client par email" />
                      )}
                      {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir dans un nouvel onglet" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" title="Ouvrir dans un nouvel onglet"><ExternalLink size={14} /></a>}
                      <button onClick={() => { setEditing(m); setShowForm(true); }} aria-label="Modifier" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" title="Modifier"><Edit3 size={14} /></button>
                      <button onClick={() => remove(m.id)} aria-label="Supprimer" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-95 transition-transform" title="Supprimer"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <EmptyState icon={ImageIcon}
                  texte="Aucun média pour l'instant. Ajoutez une photo ou une vidéo : votre client la verra dans son espace, et pourra la valider ou la commenter."
                  bouton="Ajouter un média" onAction={() => { setEditing(null); setShowForm(true); }} />
              )}
            </div>
          )}

          {showForm && <MediaForm clientId={clientId} shoots={shoots} existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
          {openComments && <CommentsModal media={openComments} onClose={() => { setOpenComments(null); load(); }} onApprove={setApproval} />}
        </div>
      );
    }

    function CommentsModal({ media, onClose, onApprove }) {
      const [comments, setComments] = useState([]);
      const [newComment, setNewComment] = useState('');
      const [posting, setPosting] = useState(false);
      const [loading, setLoading] = useState(true);
      const [status, setStatus] = useState(media.approval_status || 'pending');

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('media_comments').select('*').eq('media_id', media.id).order('created_at');
        setComments(data || []);
        setLoading(false);
      };
      useEffect(() => { load(); }, [media.id]);

      const post = async () => {
        if (!newComment.trim()) return;
        setPosting(true);
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('media_comments').insert({
          media_id:    media.id,
          author_name: user?.email?.split('@')[0] || 'Agence',
          is_admin:    true,
          comment:     newComment.trim(),
        });
        if (!error) { setNewComment(''); load(); }
        else alert(error.message);
        setPosting(false);
      };

      const removeComment = async (id) => {
        if (!confirm('Supprimer ce commentaire ?')) return;
        await sb.from('media_comments').delete().eq('id', id);
        load();
      };

      const setApprovalStatus = async (s) => {
        await onApprove(media.id, s);
        setStatus(s);
      };

      const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

      return (
        <Modal title={media.title} kicker="Validation & échanges" onClose={onClose} size="lg">
          <div className="mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-2">Statut</div>
            <div className="flex items-center gap-2 flex-wrap">
              <ApprovalBadge status={status} />
              <button onClick={() => setApprovalStatus('approved')} disabled={status === 'approved'} className="text-[11px] px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Marquer approuvé</button>
              <button onClick={() => setApprovalStatus('changes_requested')} disabled={status === 'changes_requested'} className="text-[11px] px-3 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50">Demander des changements</button>
              <button onClick={() => setApprovalStatus('pending')} disabled={status === 'pending'} className="text-[11px] px-3 py-1 rounded-full bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50">En attente</button>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Commentaires ({comments.length})</div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 mb-4">
            {loading && <div className="text-center py-8 text-stone-400">Chargement…</div>}
            {!loading && comments.length === 0 && <div className="text-center py-8 text-[13px] text-stone-400">Aucun commentaire.</div>}
            {comments.map(c => (
              <div key={c.id} className={`flex flex-col ${c.is_admin ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl ${c.is_admin ? 'bg-stone-900 text-white rounded-tr-sm' : 'bg-stone-200 text-stone-800 rounded-tl-sm'}`}>
                  <div className={`text-[10px] font-semibold mb-1 ${c.is_admin ? 'text-stone-400' : 'text-stone-500'}`}>{c.author_name}{c.is_admin ? ' · vous' : ' · client'}</div>
                  <div className="text-[13px] whitespace-pre-wrap leading-snug">{c.comment}</div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-1 px-1">
                  <span>{fmt(c.created_at)}</span>
                  <button onClick={() => removeComment(c.id)} className="text-rose-400 hover:text-rose-600">supprimer</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <textarea value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); } }}
              placeholder="Répondre au client…" rows={2}
              style={neu.pressedSm} className="flex-1 px-4 py-3 rounded-xl bg-transparent text-[13px] resize-none focus:outline-none" />
            <button onClick={post} disabled={posting || !newComment.trim()} style={neu.dark} className="w-11 h-11 rounded-xl text-white flex items-center justify-center disabled:opacity-50">
              {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🎯 PREVIEW CROPPER — Cadrage de la VIDÉO de hover
       ────────────────────────────────────────────────────────────
       Cible UNIQUEMENT la vidéo allégée qui démarre au survol côté
       client (élément <video>). N'affecte PAS la vignette statique.
       
       Pas de recadrage destructif : on enregistre 3 valeurs
       (focus_x, focus_y, zoom) qui seront appliquées côté client
       en CSS pur (object-fit + object-position + transform: scale).
       
       L'admin voit ICI le rendu temps réel sur la VRAIE vidéo
       (lecture muette en boucle), au ratio 4:3 = ratio des cards client.
       ════════════════════════════════════════════════════════════ */
    function PreviewCropper({ previewUrl, fallbackThumbUrl, focusX, focusY, zoom, onChange }) {
      const boxRef = useRef(null);
      const dragRef = useRef(null);

      const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
      const setFocus = (x, y) => onChange({ focus_x: clamp(x), focus_y: clamp(y), zoom });
      const setZoom  = (z)    => onChange({ focus_x: focusX, focus_y: focusY, zoom: Math.max(1, Math.min(3, z)) });

      const onPointerDown = (e) => {
        if (!previewUrl && !fallbackThumbUrl) return;
        const box = boxRef.current;
        if (!box) return;
        // Auto-zoom doux si l'utilisateur drag à zoom=1 (sinon, rien à bouger)
        let activeZoom = zoom;
        if (zoom <= 1.001) { activeZoom = 1.4; setZoom(1.4); }
        const rect = box.getBoundingClientRect();
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          baseFx: focusX, baseFy: focusY,
          w: rect.width, h: rect.height, z: activeZoom,
        };
        e.target.setPointerCapture?.(e.pointerId);
      };

      const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        // Conversion pixels → % de focus, en tenant compte du zoom
        const denomX = Math.max(1, (d.z - 1) * d.w);
        const denomY = Math.max(1, (d.z - 1) * d.h);
        const dfx = -((e.clientX - d.startX) * 100) / denomX;
        const dfy = -((e.clientY - d.startY) * 100) / denomY;
        setFocus(d.baseFx + dfx, d.baseFy + dfy);
      };

      const onPointerUp = () => { dragRef.current = null; };

      const mediaStyle = {
        objectFit: 'cover',
        objectPosition: `${focusX}% ${focusY}%`,
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: `${focusX}% ${focusY}%`,
      };

      const presets = [
        { label: 'Reset',  fx: 50, fy: 50, z: 1 },
        { label: 'Centre', fx: 50, fy: 50, z: Math.max(zoom, 1.2) },
        { label: 'Visage', fx: 50, fy: 35, z: 1.6 },
        { label: 'Haut',   fx: 50, fy: 20, z: Math.max(zoom, 1.4) },
        { label: 'Bas',    fx: 50, fy: 80, z: Math.max(zoom, 1.4) },
      ];

      // Pas de source vidéo ni de thumb → on n'affiche pas le cropper
      if (!previewUrl && !fallbackThumbUrl) {
        return (
          <div className="rounded-xl p-4 text-[12px] text-stone-500 ring-1 ring-stone-200 bg-stone-50">
            💡 Renseignez d'abord l'<strong>URL allégée</strong> de la vidéo ci-dessus pour pouvoir cadrer la prévisualisation au hover.
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
            {/* Aperçu interactif au ratio 4:3 (= card client) */}
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
              className="relative w-full rounded-xl overflow-hidden ring-1 ring-stone-200 bg-stone-900 select-none"
              style={{ aspectRatio: '4 / 3', cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
              {previewUrl ? (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  autoPlay muted loop playsInline preload="metadata"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={mediaStyle}
                />
              ) : (
                // Fallback : si pas d'URL allégée, on cadre sur la vignette
                // (utile si l'admin veut préparer le cadrage avant l'encodage final)
                <img
                  src={fallbackThumbUrl}
                  alt="cadrage"
                  draggable="false"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={mediaStyle}
                />
              )}

              {/* Grille de tiers + indicateur de focus */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                <div
                  className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white pointer-events-none"
                  style={{ left: `${focusX}%`, top: `${focusY}%`, boxShadow: '0 0 0 2px rgba(0,0,0,0.5)' }}
                />
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono">
                {Math.round(focusX)}% · {Math.round(focusY)}% · ×{zoom.toFixed(2)}
              </div>
              {!previewUrl && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-white text-[10px] font-semibold">
                  Aperçu sur la vignette (pas d'URL vidéo allégée)
                </div>
              )}
            </div>

            {/* Contrôles à droite */}
            <div className="space-y-3 sm:w-44">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-1.5">Zoom</div>
                <input
                  type="range" min="1" max="3" step="0.05" value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-stone-900"
                />
                <div className="text-[11px] text-stone-500 mt-1">×{zoom.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-1.5">Préréglages</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <button key={p.label} type="button"
                      onClick={() => onChange({ focus_x: p.fx, focus_y: p.fy, zoom: p.z })}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 transition ring-1 ring-stone-200">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11.5px] text-stone-500 leading-relaxed">
            💡 <strong>Glisse la vidéo</strong> pour repositionner le point d'intérêt. Augmente le <strong>zoom</strong> si le fichier MP4 contient des bandes noires intégrées à éliminer.
            Aucun fichier n'est régénéré — seules les coordonnées de cadrage sont enregistrées.
          </div>
        </div>
      );
    }

    function MediaForm({ clientId, shoots = [], existing, onClose, onSaved }) {
      const [form, setForm] = useState({
        type:       existing?.type       || 'photo',
        title:       existing?.title       || '',
        url:         existing?.url         || '',
        preview_url: existing?.preview_url || '',
        thumb_url:   existing?.thumb_url   || '',
        thumb_grad:  existing?.thumb_grad  || 'linear-gradient(135deg,#2a2620 0%,#4a4238 100%)',
        preview_focus_x: existing?.preview_focus_x ?? 50,
        preview_focus_y: existing?.preview_focus_y ?? 50,
        preview_zoom:    existing?.preview_zoom    ?? 1,
        date_label:  existing?.date_label  || (existing ? '' : isoToLabel(todayISO())),
        // date_iso pilote désormais le tri des galeries : on pré-remplit le
        // sélecteur depuis la valeur existante (ou aujourd'hui pour un nouveau média)
        date_iso_local: existing?.date_iso || (existing ? '' : todayISO()),
        duration:    existing?.duration    || '',
        size_label:  existing?.size_label  || '',
        tag:         existing?.tag         || '',
        position:    existing?.position    ?? 0,
        shoot_id:    existing?.shoot_id    || '',
      });
      const [loading, setLoading] = useState(false);
      // ── Upload direct B2 (pipeline vidéo adaptatif) ──
      const [videoFile, setVideoFile]   = useState(null);
      const [photoFile, setPhotoFile]   = useState(null);   // locataire : photo uploadée (jamais d'URL à coller)
      /* Fichier POINTÉ depuis le Drive : on ne re-téléverse pas ce que
         l'équipe a déjà déposé — la fiche référencera son URL B2, et
         une vidéo repartira dans la même file d'encodage adaptatif. */
      const [driveVideo, setDriveVideo] = useState(null);
      const [drivePhoto, setDrivePhoto] = useState(null);
      const [montrerDrive, setMontrerDrive] = useState(false);
      const [thumbFile, setThumbFile]   = useState(null);
      const [upProgress, setUpProgress] = useState(null);  // { label, pct }
      const [encodeHint, setEncodeHint] = useState(null);  // { id, filename } après upload de l'original
      const [showUrlFields, setShowUrlFields] = useState(false);
      const isHls = (u) => /\.m3u8(\?|$)/i.test(u || '');
      // ── Sélecteur de vignette depuis la vidéo + auto-remplissage durée/taille ──
      const [videoMeta, setVideoMeta]       = useState(null);   // {width,height,duration} lu du fichier
      const [videoObjUrl, setVideoObjUrl]   = useState(null);   // URL locale pour le sélecteur d'image
      const [pickerDur, setPickerDur]       = useState(0);
      const [frameTime, setFrameTime]       = useState(0);
      const [capturedBlob, setCapturedBlob] = useState(null);   // image capturée dans la vidéo
      const [capturedPreview, setCapturedPreview] = useState(null);
      const pickerVideoRef = useRef(null);

      // Libère les URLs d'objet à la fermeture du formulaire (anti-fuite mémoire)
      useEffect(() => () => {
        if (videoObjUrl) URL.revokeObjectURL(videoObjUrl);
        if (capturedPreview) URL.revokeObjectURL(capturedPreview);
      }, [videoObjUrl, capturedPreview]);

      // Sélection d'un fichier vidéo : remplit taille + durée immédiatement,
      // et prépare l'aperçu pour choisir la vignette dans la vidéo.
      const handleVideoFile = async (file) => {
        setVideoFile(file);
        setCapturedBlob(null);
        setCapturedPreview(p => { if (p) URL.revokeObjectURL(p); return null; });
        setVideoObjUrl(prev => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
        setVideoMeta(null);
        setFrameTime(0);
        if (!file) return;
        setForm(f => ({ ...f, size_label: fmtSizeFR(file.size) }));        // taille auto
        const meta = await readLocalVideoMeta(file);
        setVideoMeta(meta);
        if (meta?.duration) setForm(f => ({ ...f, duration: fmtDurationLabel(meta.duration) })); // durée auto
      };

      // Capture l'image affichée dans l'aperçu comme vignette (canvas → jpeg).
      const captureFrame = () => {
        const v = pickerVideoRef.current;
        if (!v || !v.videoWidth) { alert("L'image n'est pas encore prête — patiente une seconde puis réessaie."); return; }
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        try {
          canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) { alert("Capture impossible sur ce format vidéo — utilise l'upload manuel."); return; }
            setThumbFile(null);
            setForm(f => ({ ...f, thumb_url: '' }));
            setCapturedBlob(blob);
            setCapturedPreview(p => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(blob); });
          }, 'image/jpeg', 0.9);
        } catch (err) {
          alert("Le navigateur ne sait pas décoder ce format (ex : ProRes/HEVC). Utilise l'upload manuel, ou la vignette générée automatiquement à l'encodage.");
        }
      };

      // Quand on change la date via le picker, auto-générer le libellé
      const handleMediaDate = (iso) => {
        setForm({ ...form, date_iso_local: iso, date_label: isoToLabel(iso) });
      };

      const submit = async (e) => {
        e.preventDefault();
        // ⚠️ Avertissement si vidéo sans aucune source de lecture ni
        // fichier — un fichier POINTÉ depuis le Drive est une source
        // comme une autre (le dialogue criait à tort, capture de Gil
        // du 02/08).
        if (form.type === 'video' && !form.preview_url.trim() && !form.url.trim() && !videoFile && !driveVideo) {
          if (!window.confirm('⚠️ Aucun fichier ni URL renseigné.\n\nLa vidéo sera invisible pour le client.\n\nVoulez-vous quand même enregistrer ?')) return;
        }
        if (form.type === 'photo' && !form.url.trim() && !photoFile && !drivePhoto) {
          if (!window.confirm('⚠️ Aucune image sélectionnée.\n\nLe média sera invisible pour le client.\n\nVoulez-vous quand même enregistrer ?')) return;
        }
        setLoading(true);
        const { date_iso_local, ...rest } = form;
        const payload = {
          ...rest,
          client_id: clientId,
          date_iso: date_iso_local || null,   // pilote le tri chronologique des galeries
          position: parseInt(form.position) || 0,
          shoot_id: form.shoot_id || null,
          // Coercer les coordonnées de cadrage en nombres (la DB attend des numeric)
          preview_focus_x: Number(form.preview_focus_x) || 50,
          preview_focus_y: Number(form.preview_focus_y) || 50,
          preview_zoom:    Number(form.preview_zoom)    || 1,
        };

        let rowId = existing?.id || null;
        let createdNow = false;
        try {
          // 1) La fiche d'abord — les fichiers sont rangés sous media/<id>/…
          if (!rowId) {
            const { data, error } = await sb.from('media').insert(payload).select('id').single();
            if (error) throw new Error(error.message);
            rowId = data.id; createdNow = true;
          }

          // 2) Uploads directs vers B2 (URL signée par l'Edge Function b2-sign)
          const patch = {};
          if (videoFile) {
            const meta = videoMeta || await readLocalVideoMeta(videoFile);
            const name = b2SafeName(videoFile.name);
            patch.url = await b2UploadFile(videoFile, `media/${rowId}/original/${name}`, (p) =>
              setUpProgress({ label: `Vidéo originale — ${videoFile.name}`, pct: Math.round(p * 100) }));
            // Métadonnées réelles de l'original → affichage qualité côté client
            patch.source_size_bytes = videoFile.size;
            if (!form.size_label) patch.size_label = fmtSizeFR(videoFile.size);
            if (meta) {
              patch.source_width     = meta.width;
              patch.source_height    = meta.height;
              patch.duration_seconds = meta.duration;
              if (!form.duration && meta.duration) patch.duration = fmtDurationLabel(meta.duration);
            }
            // Locataire : la vidéo reste masquée pour le client tant que
            // le worker n'a pas produit au moins une qualité (le master
            // brut ferait une mauvaise première impression). Le worker
            // renseigne preview_url et lève le drapeau en fin d'encodage.
            if (!FEATURES.allUniverses) patch.awaiting_encode = true;
          }
          if (photoFile) {
            const pname = b2SafeName(photoFile.name);
            patch.url = await b2UploadFile(photoFile, `media/${rowId}/original/${pname}`, (p) =>
              setUpProgress({ label: `Image — ${photoFile.name}`, pct: Math.round(p * 100) }));
            if (!form.size_label) patch.size_label = fmtSizeFR(photoFile.size);
          }
          /* Fichier pointé depuis le Drive : aucune copie d'octets, la
             fiche référence l'URL B2 déjà en ligne. La vidéo suit le
             même chemin qu'un upload (masquée jusqu'à la première
             qualité chez un locataire, file d'encodage plus bas). */
          if (driveVideo && !videoFile) {
            patch.url = driveVideo.url;
            patch.source_size_bytes = driveVideo.taille || null;
            patch.duration_seconds = driveVideo.duree || null;
            if (!form.size_label && driveVideo.taille) patch.size_label = fmtSizeFR(driveVideo.taille);
            if (!form.duration && driveVideo.duree) patch.duration = fmtDurationLabel(driveVideo.duree);
            if (driveVideo.apercu_url && !capturedBlob && !thumbFile && !form.thumb_url) {
              patch.thumb_url = driveVideo.apercu_url;
            }
            if (!FEATURES.allUniverses) patch.awaiting_encode = true;
          }
          if (drivePhoto && !photoFile) {
            patch.url = drivePhoto.url;
            if (!form.size_label && drivePhoto.taille) patch.size_label = fmtSizeFR(drivePhoto.taille);
          }
          // Vignette : priorité à l'image capturée dans la vidéo, sinon fichier uploadé
          const thumbBlob = capturedBlob || thumbFile;
          if (thumbBlob) {
            const tname = capturedBlob ? 'vignette.jpg' : b2SafeName(thumbFile.name);
            patch.thumb_url = await b2UploadFile(thumbBlob, `media/${rowId}/thumb/${Date.now()}-${tname}`, (p) =>
              setUpProgress({ label: 'Vignette', pct: Math.round(p * 100) }));
          }
          setUpProgress(null);

          // 3) Enregistrement final (fiche + URLs des fichiers uploadés)
          if (existing || Object.keys(patch).length > 0) {
            const { error } = await sb.from('media').update({ ...payload, ...patch }).eq('id', rowId);
            if (error) throw new Error(error.message);
          }

          if ((videoFile || driveVideo) && FEATURES.allUniverses) {
            // Lecture adaptative pas encore générée → afficher la commande
            // (outillage local de la plateforme — jamais montré aux locataires,
            //  dont le MP4 progressif est déjà lisible tel quel)
            setEncodeHint({ id: rowId, filename: videoFile ? videoFile.name : driveVideo.nom });
            setLoading(false);
          } else {
            // Locataire : le worker prendra le relais pour la qualité
            // adaptative (la vidéo est déjà lisible en attendant).
            if ((videoFile || driveVideo) && patch.url) {
              await enqueueEncode({ kind: 'media', media_id: rowId, source_url: patch.url });
            }
            onSaved();
          }
        } catch (err) {
          // Pas de fiche fantôme si la publication a échoué en route
          if (createdNow && rowId) { try { await sb.from('media').delete().eq('id', rowId); } catch (e2) {} }
          setUpProgress(null);
          setLoading(false);
          alert(`✗ ${err.message || 'Erreur'} — la publication a été annulée, rien n'a été mis en ligne.`);
        }
      };

      const gradients = [
        'linear-gradient(135deg,#2a2620 0%,#4a4238 100%)',
        'linear-gradient(135deg,#2d4a3e 0%,#5a7a6e 100%)',
        'linear-gradient(135deg,#3a2a1a 0%,#6a5a4a 100%)',
        'linear-gradient(135deg,#2a2a3d 0%,#5a5a7d 100%)',
        'linear-gradient(135deg,#1a2a3a 0%,#4a6a8a 100%)',
        'linear-gradient(135deg,#3a1a1a 0%,#6a3a3a 100%)',
      ];

      // ── Écran post-upload : commande d'encodage HLS à lancer en local ──
      // (ffmpeg ne tourne pas dans le navigateur ni sur Supabase — même
      //  workflow que ylvfeet : upload depuis l'admin, encodage en local)
      if (encodeHint) {
        const cmd = `npm run encode -- --media-id ${encodeHint.id} --input "/chemin/vers/${encodeHint.filename}"`;
        return (
          <Modal title="Vidéo uploadée sur B2 ✓" kicker="Dernière étape" onClose={onSaved} size="lg">
            <div className="space-y-4">
              <p className="text-[13.5px] text-stone-600 leading-relaxed">
                L'original est en ligne (téléchargement client OK). Pour activer la <strong>lecture adaptative</strong> — qualité auto selon la connexion, badge qualité, vignette, aperçu au survol, durée et poids exacts — lance sur ton Mac :
              </p>
              <div className="rounded-xl bg-stone-900 text-stone-100 px-4 py-3 font-mono text-[12px] leading-relaxed break-all select-all">
                {cmd}
              </div>
              <div className="flex gap-3">
                <Btn icon={Link2} onClick={() => { try { navigator.clipboard.writeText(cmd); } catch (e) {} }} full>Copier la commande</Btn>
                <Btn kind="dark" icon={CheckCircle2} onClick={onSaved} full>Terminer</Btn>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                💡 Remplace <code>/chemin/vers/…</code> par l'emplacement réel du fichier sur ton Mac (glisse-le dans le Terminal pour coller son chemin). Tant que l'encodage n'a pas tourné, le client voit la vidéo mais devra la télécharger pour la visionner.
              </p>
            </div>
          </Modal>
        );
      }

      return (
        <Modal title={existing ? 'Modifier le média' : 'Ajouter un média'} kicker={existing ? 'Édition' : 'Nouveau'} onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <FormSection>
              <Field label="Type">
                <Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="photo">📸 Photo</option>
                  <option value="video">🎥 Vidéo</option>
                </Select>
              </Field>
              <Field label="Titre">
                <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Campagne printemps — Hero" />
              </Field>
              <Field label="Tag (catégorie)">
                <Input value={form.tag} onChange={e => setForm({...form, tag: e.target.value})} placeholder="Réseaux sociaux, Site web…" />
              </Field>
            </FormSection>
            <FormSection title="Le fichier">
            {form.type === 'video' ? (
              <>
                <Field label="Fichier vidéo original (upload direct sur B2 — servira au téléchargement client)">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                    onChange={e => handleVideoFile(e.target.files?.[0] || null)}
                    className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
                  />
                  {videoFile ? (
                    <div className="text-[11px] text-stone-500 mt-1.5">
                      📦 {videoFile.name} · {fmtSizeFR(videoFile.size)}
                      {videoFile.size > B2_MPU_THRESHOLD ? ' · gros fichier → upload multipart automatique' : ''}
                    </div>
                  ) : form.url ? (
                    <div className="text-[11px] text-emerald-700 mt-1.5 truncate">✅ Original déjà en ligne : {form.url}</div>
                  ) : (
                    <div className="text-[11px] text-stone-500 mt-1.5">
                      💾 Le fichier part directement du navigateur vers B2 (rien ne transite par le site).
                    </div>
                  )}
                  {driveVideo && !videoFile && (
                    <div className="text-[11px] text-emerald-700 mt-1.5 truncate">🗂 Depuis le Drive : {driveVideo.nom}</div>
                  )}
                  <div className="mt-2">
                    <Btn icon={FolderOpen} onClick={() => setMontrerDrive(true)}>Choisir dans le Drive</Btn>
                  </div>
                </Field>

                {/* État de la lecture adaptative (HLS) — outillage plateforme.
                    Un locataire n'a ni npm run encode ni URLs à coller : son
                    MP4 uploadé est lu en streaming progressif tel quel. */}
                {!FEATURES.allUniverses ? null : isHls(form.preview_url) ? (
                  <div className="text-[11.5px] leading-relaxed rounded-lg px-3 py-2.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#065f46' }}>
                    ✅ <strong>Lecture adaptative active.</strong> La qualité s'ajuste à la connexion du client, avec badge de qualité sur le lecteur et mention de l'original téléchargeable.
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
                    <span className="text-[15px] leading-none mt-px">🎞</span>
                    <div className="text-[11.5px] leading-relaxed" style={{ color: '#92400e' }}>
                      <strong>Lecture adaptative pas encore générée.</strong> Après l'enregistrement, la commande d'encodage s'affiche : elle crée les qualités (4K → 480p) sur B2 et remplit automatiquement lecture, vignette, aperçu au survol, durée et poids.
                      {form.preview_url && <div className="mt-1 opacity-80">Lecture actuelle : URL simple ({form.preview_url.includes('streamable') ? 'Streamable' : 'fichier direct'}) — fonctionne, mais qualité fixe.</div>}
                    </div>
                  </div>
                )}

                {FEATURES.allUniverses && (
                <button type="button" onClick={() => setShowUrlFields(v => !v)} className="text-[11.5px] text-stone-500 underline underline-offset-2 hover:text-stone-800 transition">
                  {showUrlFields ? '▴ Masquer les URLs manuelles' : '▾ Coller des URLs manuellement (avancé)'}
                </button>
                )}
                {FEATURES.allUniverses && showUrlFields && (
                  <>
                    <Field label="URL vidéo originale (téléchargement)">
                      <Input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://… (fichier original sur B2)" />
                    </Field>
                    <Field label="URL de lecture (master.m3u8 HLS adaptatif — ou .mp4 léger)">
                      <Input value={form.preview_url} onChange={e => setForm({...form, preview_url: e.target.value})} placeholder="https://…/master.m3u8" />
                      <div className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">
                        Rempli automatiquement par <code>npm run encode</code>. Les anciens liens (.mp4, Streamable, Cloudinary) restent lisibles par le portail.
                      </div>
                    </Field>
                  </>
                )}
              </>
            ) : FEATURES.allUniverses ? (
              <Field label="URL du fichier (Cloudinary, Drive, S3…)">
                <Input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://res.cloudinary.com/…" />
              </Field>
            ) : (
              <Field label="Image (upload direct sur le stockage sécurisé)">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  onChange={e => setPhotoFile(e.target.files?.[0] || null)}
                  className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
                />
                {photoFile ? (
                  <div className="text-[11px] text-stone-500 mt-1.5">📦 {photoFile.name} · {fmtSizeFR(photoFile.size)}</div>
                ) : form.url ? (
                  <div className="text-[11px] text-emerald-700 mt-1.5 truncate">✅ Image déjà en ligne</div>
                ) : (
                  <div className="text-[11px] text-stone-500 mt-1.5">💾 Le fichier part directement du navigateur vers le stockage.</div>
                )}
                {drivePhoto && !photoFile && (
                  <div className="text-[11px] text-emerald-700 mt-1.5 truncate">🗂 Depuis le Drive : {drivePhoto.nom}</div>
                )}
                <div className="mt-2">
                  <Btn icon={FolderOpen} onClick={() => setMontrerDrive(true)}>Choisir dans le Drive</Btn>
                </div>
              </Field>
            )}
            </FormSection>
            <FormSection title="Classement">
              <Field label="Tournage associé (optionnel — permet de grouper les médias chez le client)">
                <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                  <option value="">— Hors tournage —</option>
                  {shoots.map(s => (
                    <option key={s.id} value={s.id}>{s.month_label} {s.date_day} · {s.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Date (classe automatiquement le média)">
                <Input type="date" value={form.date_iso_local} onChange={e => handleMediaDate(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">{form.date_label || '—'} · le plus récent apparaît en premier</div>
              </Field>
              {form.type === 'video' && (
                <Field label="Durée">
                  <Input value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} placeholder="0:45" />
                </Field>
              )}
              <Field label="Taille">
                <Input value={form.size_label} onChange={e => setForm({...form, size_label: e.target.value})} placeholder="128 MB" />
              </Field>
            </FormSection>

            <FormSection title="Apparence">
            <Field label={form.type === 'video' ? (FEATURES.allUniverses ? "Vignette (optionnel — sinon générée automatiquement à l'encodage)" : "Vignette (optionnel)") : "Miniature (optionnel)"}>
              {/* 1) Choisir une image DANS la vidéo (si un fichier vidéo est sélectionné) */}
              {form.type === 'video' && videoObjUrl && (
                <div className="mb-3 rounded-xl p-3" style={neu.pressedSm}>
                  <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Choisir une image dans la vidéo</div>
                  <video
                    ref={pickerVideoRef}
                    src={videoObjUrl}
                    muted playsInline preload="metadata"
                    onLoadedMetadata={e => setPickerDur(e.currentTarget.duration || 0)}
                    className="w-full max-h-52 rounded-lg bg-black object-contain"
                  />
                  <input
                    type="range" min="0" max={pickerDur || 0} step="0.1" value={frameTime}
                    onChange={e => { const t = parseFloat(e.target.value); setFrameTime(t); if (pickerVideoRef.current) pickerVideoRef.current.currentTime = t; }}
                    className="w-full accent-stone-900 mt-2"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-stone-500 tabular-nums">{fmtDurationLabel(Math.round(frameTime))} / {fmtDurationLabel(Math.round(pickerDur))}</span>
                    <Btn type="button" icon={Camera} onClick={captureFrame}>Utiliser cette image</Btn>
                  </div>
                </div>
              )}

              {/* 2) …ou uploader une image manuellement */}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => { const f = e.target.files?.[0] || null; setThumbFile(f); if (f) { setCapturedBlob(null); setCapturedPreview(p => { if (p) URL.revokeObjectURL(p); return null; }); } }}
                className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-200 file:text-stone-700 file:text-[12px] file:font-semibold file:cursor-pointer"
              />
              {/* 3) …ou coller une URL d'image (plateforme uniquement — un
                     locataire uploade, il ne colle jamais de lien) */}
              {FEATURES.allUniverses && (
              <Input
                value={form.thumb_url || ''}
                onChange={e => setForm({...form, thumb_url: e.target.value})}
                placeholder="… ou coller une URL d'image"
                style={{ marginTop: '8px' }}
              />
              )}

              {/* Aperçu de la vignette retenue (capture ou URL) */}
              {(capturedPreview || (form.thumb_url && !thumbFile)) && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={capturedPreview || form.thumb_url} alt="aperçu" className="h-20 rounded-lg object-cover ring-1 ring-stone-200" />
                  <span className="text-[11px] text-stone-500">{capturedPreview ? '📸 Image capturée dans la vidéo' : '🔗 Vignette depuis une URL'}</span>
                  <button type="button" onClick={() => { setCapturedBlob(null); setCapturedPreview(p => { if (p) URL.revokeObjectURL(p); return null; }); setForm(f => ({ ...f, thumb_url: '' })); }} className="text-[12px] text-stone-500 hover:text-rose-600">
                    Effacer
                  </button>
                </div>
              )}
              {thumbFile && !capturedPreview && <div className="text-[11px] text-stone-500 mt-2">🖼 {thumbFile.name} · {fmtSizeFR(thumbFile.size)} — sera uploadée sur B2</div>}
            </Field>

            {/* 🎯 Cadrage de la vidéo de hover — uniquement pour les vidéos.
                N'affecte PAS la vignette statique. */}
            {form.type === 'video' && (
              <Field label="Cadrage de la vidéo au survol (élimine bandes noires intégrées, recentre le sujet)">
                <PreviewCropper
                  previewUrl={isHls(form.preview_url) ? (existing?.hover_url || '') : form.preview_url}
                  fallbackThumbUrl={form.thumb_url}
                  focusX={Number(form.preview_focus_x) || 50}
                  focusY={Number(form.preview_focus_y) || 50}
                  zoom={Number(form.preview_zoom) || 1}
                  onChange={({ focus_x, focus_y, zoom }) =>
                    setForm({ ...form, preview_focus_x: focus_x, preview_focus_y: focus_y, preview_zoom: zoom })}
                />
              </Field>
            )}

            <Field label="Couleur de fond (utilisée si la vignette n'est pas disponible)">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {gradients.map(g => (
                  <button key={g} type="button" onClick={() => setForm({...form, thumb_grad: g})}
                    className={`h-12 rounded-xl transition ${form.thumb_grad === g ? 'ring-2 ring-stone-900 ring-offset-2 ring-offset-stone-100' : ''}`}
                    style={{ background: g }} />
                ))}
              </div>
            </Field>
            </FormSection>
            {/* Progression de l'upload B2 */}
            {upProgress && (
              <div className="rounded-xl px-4 py-3" style={neu.pressedSm}>
                <div className="flex justify-between items-center text-[11.5px] font-semibold text-stone-600 mb-1.5">
                  <span className="truncate pr-3">☁️ {upProgress.label}</span>
                  <span className="shrink-0">{upProgress.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden">
                  <div className="h-full bg-stone-900 transition-all duration-300" style={{ width: `${upProgress.pct}%` }} />
                </div>
                <div className="text-[10.5px] text-stone-500 mt-1.5">Ne ferme pas cet onglet pendant l'upload.</div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full disabled={loading}>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}
                style={form.type === 'video' && !form.preview_url && !videoFile && !driveVideo && !form.url ? { background: 'linear-gradient(135deg,#92400e,#b45309)', boxShadow: '0 0 0 2px rgba(245,158,11,0.4)' } : {}}>
                {loading
                  ? (upProgress ? 'Upload en cours…' : 'Enregistrement…')
                  : ((form.type === 'video' && !form.preview_url && !videoFile && !driveVideo && !form.url ? '⚠️ ' : '') + (existing ? 'Mettre à jour' : (videoFile ? 'Ajouter et uploader' : 'Ajouter')))}
              </Btn>
            </div>
          </form>
          {montrerDrive && (
            <DrivePicker genres={form.type === 'video' ? ['video'] : ['photo']}
              onChoisir={(it) => {
                if (it.genre === 'video') {
                  setDriveVideo(it); setVideoFile(null);
                  setForm(f => ({ ...f,
                    size_label: it.taille ? fmtSizeFR(it.taille) : f.size_label,
                    duration: it.duree ? fmtDurationLabel(it.duree) : f.duration }));
                } else {
                  setDrivePhoto(it); setPhotoFile(null);
                  setForm(f => ({ ...f, size_label: it.taille ? fmtSizeFR(it.taille) : f.size_label }));
                }
                setMontrerDrive(false);
              }}
              onClose={() => setMontrerDrive(false)} />
          )}
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       💶 INVOICES TAB
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       🔗 LIAISONS — listes pour les selects (tournages / stratégies)
       ════════════════════════════════════════════════════════════ */
    function useLinkLists(clientId, { shoots = false, strategies = false } = {}) {
      const [lists, setLists] = useState({ shoots: [], strategies: [] });
      useEffect(() => {
        let alive = true;
        (async () => {
          const next = { shoots: [], strategies: [] };
          if (shoots) {
            const { data } = await sb.from('shoots').select('id,title,type,date_day,month_label,year,date_iso')
              .eq('client_id', clientId).order('date_iso', { ascending: false });
            next.shoots = data || [];
          }
          if (strategies) {
            const { data } = await sb.from('strategies').select('id,title,subtitle,concepts')
              .eq('client_id', clientId).order('position');
            next.strategies = data || [];
          }
          if (alive) setLists(next);
        })();
        return () => { alive = false; };
      }, [clientId]);
      return lists;
    }

    const shootOptionLabel = (s) =>
      `${s.type === 'video' ? '🎥' : '📸'} ${s.title}${s.date_day ? ` — ${s.date_day} ${s.month_label || ''} ${s.year || ''}` : ''}`;

    function InvoicesTab({ clientId, client }) {
      const [items, setItems] = useState([]);
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [loading, setLoading] = useState(true);

      // Email ④ : la facture vient de PASSER à « payée » → proposer le reçu.
      // `editing` porte encore l'état d'avant l'enregistrement : on ne
      // propose rien si elle était déjà payée (pas de reçu en double).
      const proposerRecu = async (saved, avant) => {
        if (!saved || saved.status !== 'payée') return;
        if (avant === 'payée') return;
        if (!client?.client_email) return;
        if (!confirm(`Facture ${saved.reference} marquée payée.\n\nEnvoyer un reçu de paiement à ${client.client_email} ?`)) return;
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body: JSON.stringify({ kind: 'invoice_paid', client_id: clientId, invoice_id: saved.id }),
          });
          const j = await res.json().catch(() => ({}));
          alert(res.ok && j.ok ? `✓ Reçu envoyé à ${client.client_email}` : humaniseErreur(j.error || `Échec (${res.status})`));
        } catch (e) { alert(humaniseErreur(e.message)); }
      };
      const [notifying, setNotifying] = useState(null);

      const [basculeEnCours, setBasculeEnCours] = useState(null);

      /* Marquer payée SANS ouvrir la fiche : la pastille de statut est le
         bouton (demande de Gil, 28/07/2026). Payée → attente demande
         confirmation : c'est le chemin de l'erreur, pas celui du geste
         courant. Le reçu est proposé comme depuis la fiche. */
      const basculerStatut = async (inv) => {
        if (basculeEnCours) return;
        const versPayee = inv.status !== 'payée';
        if (!versPayee && !confirm(`Repasser la facture ${inv.reference} en « en attente » ?`)) return;
        setBasculeEnCours(inv.id);
        const { data: saved, error } = await sb.from('invoices')
          .update({ status: versPayee ? 'payée' : 'en attente' })
          .eq('id', inv.id).select().single();
        setBasculeEnCours(null);
        if (error) { alert(humaniseErreur(error.message)); return; }
        await load();
        if (versPayee) proposerRecu(saved, inv.status);
      };

      /* La pastille-bouton, partagée mobile/bureau. Rembourrage négatif
         compensé + tap-ext : la cible dépasse 44 px sans grossir le
         visuel. Le libellé annonce l'action, pas seulement l'état. */
      const PastilleStatut = ({ inv }) => (
        <button type="button" onClick={() => basculerStatut(inv)}
          disabled={basculeEnCours === inv.id}
          title={inv.status === 'payée' ? 'Repasser en « en attente »' : 'Marquer payée'}
          aria-label={inv.status === 'payée'
            ? `Facture ${inv.reference} payée — cliquer pour repasser en attente`
            : `Marquer la facture ${inv.reference} payée`}
          className="tap-ext p-2 -m-2 shrink-0 rounded-full disabled:opacity-50 active:scale-95 transition-transform group">
          <span className={`block text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold leading-none transition-shadow group-hover:ring-2 ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700 group-hover:ring-emerald-200' : 'bg-amber-100 text-amber-700 group-hover:ring-amber-300'}`}>
            {basculeEnCours === inv.id ? '…' : inv.status}
          </span>
        </button>
      );

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('invoices').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer cette facture ?\n\nElle disparaîtra aussi de l\'espace de votre client. Cette action est irréversible.')) return;
        await sb.from('invoices').delete().eq('id', id);
        load();
      };

      const notifyInvoiceReady = async (inv) => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (!confirm(`Envoyer un email à ${client.client_email} pour annoncer que la facture ${inv.reference} est disponible sur son espace client ?`)) return;
        setNotifying(inv.id);
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({
              kind:      'invoice_ready',
              client_id: clientId,
              extra: {
                reference: inv.reference,
                amount:    parseFloat(inv.amount || 0),
              },
            }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.\n\nVoir ÉMAILS-SETUP.md pour activer les notifications par email (5 min).");
          else alert(`Erreur d'envoi : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setNotifying(null);
      };

      const total = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
      const paid = items.filter(i => i.status === 'payée').reduce((s, i) => s + parseFloat(i.amount || 0), 0);

      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Stats — 1 col mobile, 3 col desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5">
            <StatCard dark label="Total facturé" value={`${total.toLocaleString('fr-FR')} €`} />
            <StatCard label="Réglé" value={`${paid.toLocaleString('fr-FR')} €`} />
            <StatCard label="En attente" value={`${(total - paid).toLocaleString('fr-FR')} €`} />
          </div>

          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-tight" style={SERIF}>
                Factures <span className="text-stone-400">({items.length})</span>
              </h3>
              <Btn kind="dark" icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }} className="w-full sm:w-auto">
                Nouvelle facture
              </Btn>
            </div>

            {loading ? <div className="text-center py-12 text-stone-400">Chargement…</div> : (
              <div className="space-y-2.5 lg:space-y-2">
                {items.map(inv => (
                  <div key={inv.id} style={neu.pressedSm} className="rounded-2xl p-4 lg:px-4 lg:py-3.5">
                    {/* Mobile : carte verticale aérée */}
                    <div className="lg:hidden">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[13px] font-semibold leading-none">{inv.reference}</div>
                          <div className="text-[13px] text-stone-700 mt-2 leading-snug line-clamp-2">{inv.description}</div>
                        </div>
                        <PastilleStatut inv={inv} />
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-stone-200/60 gap-3">
                        <div>
                          <div className="text-[11.5px] text-stone-500 leading-none">{inv.date_label}</div>
                          <div className="font-semibold text-[18px] leading-none mt-2" style={SERIF}>{parseFloat(inv.amount).toLocaleString('fr-FR')} €</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {client?.client_email && (
                            <BellBtn onClick={() => notifyInvoiceReady(inv)} busy={notifying === inv.id} title="Prévenir le client que la facture est prête" />
                          )}
                          <button onClick={() => { setEditing(inv); setShowForm(true); }} aria-label="Modifier" className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform"><Edit3 size={14} /></button>
                          <button onClick={() => remove(inv.id)} aria-label="Supprimer" className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95 transition-transform"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>

                    {/* Desktop : ligne grille 12 col */}
                    <div className="hidden lg:grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-2 font-mono text-[12.5px] font-medium">{inv.reference}</div>
                      <div className="col-span-4 text-[12.5px] text-stone-700 truncate">{inv.description}</div>
                      <div className="col-span-2 text-[12px] text-stone-500">{inv.date_label}</div>
                      <div className="col-span-2 font-semibold text-[14px]" style={SERIF}>{parseFloat(inv.amount).toLocaleString('fr-FR')} €</div>
                      <div className="col-span-1">
                        <PastilleStatut inv={inv} />
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1.5">
                        {client?.client_email && (
                          <BellBtn onClick={() => notifyInvoiceReady(inv)} busy={notifying === inv.id} title="Prévenir le client que la facture est prête" />
                        )}
                        <button onClick={() => { setEditing(inv); setShowForm(true); }} aria-label="Modifier" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"><Edit3 size={13} /></button>
                        <button onClick={() => remove(inv.id)} aria-label="Supprimer" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <EmptyState icon={FileText}
                    texte="Aucune facture pour l'instant. Créez-en une : votre client la retrouvera dans son espace, avec son statut de paiement."
                    bouton="Créer une facture" onAction={() => { setEditing(null); setShowForm(true); }} />
                )}
              </div>
            )}
          </div>

          {showForm && <InvoiceForm clientId={clientId} existing={editing} onClose={() => setShowForm(false)} onSaved={(saved) => { setShowForm(false); load(); proposerRecu(saved, editing?.status); }} />}
        </div>
      );
    }

    function InvoiceForm({ clientId, existing, onClose, onSaved, initial }) {
      const [form, setForm] = useState({
        reference:   existing?.reference   || '',
        description: existing?.description || initial?.description || '',
        amount:      existing?.amount      || '',
        date_label:  existing?.date_label  || (existing ? '' : isoToLabel(todayISO())),
        date_iso_local: existing?.date_label ? '' : todayISO(),
        due_date:    existing?.due_date    || (existing ? '' : in30DaysISO()),
        status:      existing?.status      || 'en attente',
        pdf_url:     existing?.pdf_url     || '',
        shoot_id:    existing?.shoot_id    || initial?.shoot_id || '',
      });
      const [loading, setLoading] = useState(false);
      const [pdfFile, setPdfFile] = useState(null);   // PDF à uploader sur B2
      const [upPct, setUpPct]     = useState(null);   // progression upload
      const [montrerDrive, setMontrerDrive] = useState(false);   // sélecteur Drive
      const { shoots } = useLinkLists(clientId, { shoots: true });

      // Quand on change la date d'émission via le date picker, auto-générer le libellé
      const handleEmissionDate = (iso) => {
        setForm({ ...form, date_iso_local: iso, date_label: isoToLabel(iso) });
      };

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          const { date_iso_local, ...rest } = form;
          // Upload direct du PDF vers B2 si un fichier est choisi
          let pdf_url = form.pdf_url;
          if (pdfFile) {
            setUpPct(0);
            pdf_url = await b2UploadFile(pdfFile, `invoices/${clientId}/${Date.now()}-${b2SafeName(pdfFile.name)}`,
              (p) => setUpPct(Math.round(p * 100)));
            setUpPct(null);
          }
          const payload = { ...rest, pdf_url, client_id: clientId, amount: parseFloat(form.amount), due_date: form.due_date || null, shoot_id: form.shoot_id || null };
          const result = existing
            ? await sb.from('invoices').update(payload).eq('id', existing.id).select().single()
            : await sb.from('invoices').insert(payload).select().single();
          if (result.error) throw new Error(result.error.message);
          onSaved(result.data);
        } catch (err) {
          setUpPct(null); setLoading(false);
          alert(`✗ ${err.message || 'Erreur'}`);
        }
      };

      return (
        <Modal title={existing ? 'Modifier la facture' : 'Nouvelle facture'} kicker="Facture" onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <FormSection>
              <Field label="Référence">
                <Input required value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="FAC-2026-042" />
              </Field>
              <Field label="Date d'émission">
                <Input type="date" value={form.date_iso_local} onChange={e => handleEmissionDate(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">Libellé : <strong>{form.date_label || '—'}</strong></div>
              </Field>
              <Field label="Description">
                <Input required value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Production vidéo — Campagne printemps" />
              </Field>
            </FormSection>
            <FormSection title="Rattachement">
              <Field label="Tournage couvert (optionnel)">
                <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                  <option value="">— Aucun —</option>
                  {shoots.map(s => <option key={s.id} value={s.id}>{shootOptionLabel(s)}</option>)}
                </Select>
                <div className="text-[11px] text-stone-500 mt-1">Le client verra à quel tournage cette facture correspond.</div>
              </Field>
            </FormSection>
            <FormSection title="Montant et paiement">
              <Field label="Montant (€)">
                <Input required type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="3200" />
              </Field>
              <Field label="Échéance (rappels auto)">
                <Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
              </Field>
              <Field label="Statut">
                <Select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option value="en attente">En attente</option>
                  <option value="payée">Payée</option>
                </Select>
              </Field>
            </FormSection>
            <FormSection title="Document joint">
            <Field label="Facture PDF (optionnel)">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={e => { const f = e.target.files?.[0] || null; setPdfFile(f); if (f) setForm(fm => ({ ...fm, pdf_url: '' })); }}
                className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
              />
              {pdfFile ? (
                <div className="text-[11px] text-stone-500 mt-1.5">📄 {pdfFile.name} · {fmtSizeFR(pdfFile.size)} — sera uploadé sur B2</div>
              ) : form.pdf_url ? (
                <div className="text-[11px] text-emerald-700 mt-1.5 truncate">✅ PDF déjà en ligne : {form.pdf_url}</div>
              ) : (
                <div className="text-[11px] text-stone-500 mt-1.5">Le PDF part directement du navigateur vers B2.</div>
              )}
              <Input value={form.pdf_url} onChange={e => setForm({...form, pdf_url: e.target.value})} placeholder="… ou coller une URL" style={{ marginTop: '8px' }} />
              {/* Le PDF que l'équipe a déjà déposé au Drive : on le
                  pointe, on ne le re-téléverse pas. */}
              <div className="mt-2">
                <Btn icon={FolderOpen} onClick={() => setMontrerDrive(true)}>Choisir dans le Drive</Btn>
              </div>
            </Field>
            </FormSection>
            {montrerDrive && (
              <DrivePicker genres={['document']}
                onChoisir={(it) => {
                  setPdfFile(null);
                  setForm(fm => ({ ...fm, pdf_url: it.url }));
                  setMontrerDrive(false);
                }}
                onClose={() => setMontrerDrive(false)} />
            )}
            {upPct !== null && (
              <div className="rounded-xl px-4 py-3" style={neu.pressedSm}>
                <div className="flex justify-between text-[11.5px] font-semibold text-stone-600 mb-1.5"><span>☁️ Upload du PDF</span><span>{upPct}%</span></div>
                <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden"><div className="h-full bg-stone-900 transition-all" style={{ width: `${upPct}%` }} /></div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full disabled={loading}>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? (upPct !== null ? 'Upload…' : 'Enregistrement…') : (existing ? 'Mettre à jour' : 'Ajouter')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📁 DOCUMENTS TAB (contrats, chartes graphiques, devis…)
       ════════════════════════════════════════════════════════════ */
    const DOC_CATEGORIES = ['Contrat', 'Charte graphique', 'Devis', 'Brief', 'Autre'];

    const DocCategoryBadge = ({ category }) => {
      const cfg = {
        'Contrat':          { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
        'Charte graphique': { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
        'Devis':            { bg: 'bg-amber-100',   text: 'text-amber-700' },
        'Brief':            { bg: 'bg-sky-100',     text: 'text-sky-700' },
      }[category] || { bg: 'bg-stone-100', text: 'text-stone-600' };
      return (
        <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shrink-0 leading-none ${cfg.bg} ${cfg.text}`}>{category}</span>
      );
    };

    function DocumentsTab({ clientId, client }) {
      const [items, setItems] = useState([]);
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [loading, setLoading] = useState(true);
      const [notifying, setNotifying] = useState(null);

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('documents').select('*').eq('client_id', clientId).order('position').order('created_at', { ascending: false });
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer ce document ?\n\nVotre client n\'y aura plus accès. Cette action est irréversible.')) return;
        await sb.from('documents').delete().eq('id', id);
        load();
      };

      // Prévenir le client qu'un document l'attend (kind: document_ready).
      // L'email contient le lien de SON espace avec son code : un clic
      // et il est connecté.
      const notifyDocument = async (doc) => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (!confirm(`Envoyer un email à ${client.client_email} pour annoncer que « ${doc.title} » est disponible sur son espace ?`)) return;
        setNotifying(doc.id);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({ kind: 'document_ready', client_id: clientId, document_id: doc.id }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.");
          else alert(`Erreur : ${humaniseErreur(await res.text(), 'email')}`);
        } catch (e) { alert('Erreur réseau : ' + e.message); }
        setNotifying(null);
      };

      return (
        <div className="space-y-5 lg:space-y-6">
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
              <div>
                <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Espace partagé</div>
                <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1 leading-tight" style={SERIF}>
                  Documents <span className="text-stone-400">({items.length})</span>
                </h3>
              </div>
              <Btn kind="dark" icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }} className="w-full sm:w-auto">
                Ajouter un document
              </Btn>
            </div>
            <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2">
              Contrats, chartes graphiques, devis, briefs… Le client retrouve ces fichiers dans l'onglet « Documents » de son espace.
            </p>

            <div className="mt-5">
              {loading ? <div className="text-center py-12 text-stone-400">Chargement…</div> : (
                <div className="space-y-2.5 lg:space-y-2">
                  {items.map(doc => (
                    <div key={doc.id} style={neu.pressedSm} className="rounded-2xl p-4 lg:px-4 lg:py-3.5">
                      {/* Mobile : carte verticale */}
                      <div className="lg:hidden">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[13.5px] leading-snug line-clamp-2">{doc.title}</div>
                            <div className="text-[11.5px] text-stone-500 mt-1.5 leading-none">{doc.date_label}{doc.size_label && ` · ${doc.size_label}`}</div>
                          </div>
                          <DocCategoryBadge category={doc.category} />
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-stone-200/60 gap-3">
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-stone-500 flex items-center gap-1.5 truncate hover:text-stone-900">
                            <ExternalLink size={12} /> Ouvrir
                          </a>
                          <div className="flex items-center gap-2">
                            <BellBtn onClick={() => notifyDocument(doc)} busy={notifying === doc.id} title="Prévenir le client que ce document l'attend" />
                            <button onClick={() => { setEditing(doc); setShowForm(true); }} aria-label="Modifier" className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform"><Edit3 size={14} /></button>
                            <button onClick={() => remove(doc.id)} aria-label="Supprimer" className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95 transition-transform"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>

                      {/* Desktop : ligne grille 12 col */}
                      <div className="hidden lg:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-5 text-[13px] text-stone-800 font-medium truncate flex items-center gap-2">
                          <FileText size={14} className="text-stone-400 shrink-0" /> {doc.title}
                        </div>
                        <div className="col-span-2"><DocCategoryBadge category={doc.category} /></div>
                        <div className="col-span-2 text-[12px] text-stone-500">{doc.date_label}</div>
                        <div className="col-span-2 text-[12px] text-stone-500 truncate">{doc.size_label || '—'}</div>
                        <div className="col-span-1 flex items-center justify-end gap-1.5">
                          <BellBtn onClick={() => notifyDocument(doc)} busy={notifying === doc.id} title="Prévenir le client que ce document l'attend" />
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le document" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100" title="Ouvrir le document"><ExternalLink size={13} /></a>
                          <button onClick={() => { setEditing(doc); setShowForm(true); }} aria-label="Modifier" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"><Edit3 size={13} /></button>
                          <button onClick={() => remove(doc.id)} aria-label="Supprimer" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <EmptyState icon={FolderOpen}
                      texte="Aucun document pour l'instant. Partagez un contrat, un devis ou un brief : votre client l'aura toujours sous la main."
                      bouton="Partager un document" onAction={() => { setEditing(null); setShowForm(true); }} />
                  )}
                </div>
              )}
            </div>
          </div>

          {showForm && <DocumentForm clientId={clientId} existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
        </div>
      );
    }

    function DocumentForm({ clientId, existing, onClose, onSaved }) {
      const [form, setForm] = useState({
        title:       existing?.title      || '',
        category:    existing?.category   || 'Contrat',
        file_url:    existing?.file_url   || '',
        size_label:  existing?.size_label || '',
        date_label:  existing?.date_label || (existing ? '' : isoToLabel(todayISO())),
        date_iso_local: existing?.date_label ? '' : todayISO(),
        position:    existing?.position ?? 0,
        shoot_id:    existing?.shoot_id    || '',
        strategy_id: existing?.strategy_id || '',
      });
      const [loading, setLoading] = useState(false);
      const [docFile, setDocFile] = useState(null);   // fichier à uploader sur B2
      const [upPct, setUpPct]     = useState(null);
      const [montrerDrive, setMontrerDrive] = useState(false);   // sélecteur Drive
      const { shoots, strategies } = useLinkLists(clientId, { shoots: true, strategies: true });

      const handleDocDate = (iso) => {
        setForm({ ...form, date_iso_local: iso, date_label: isoToLabel(iso) });
      };

      // Sélection d'un fichier : remplit la taille automatiquement
      const handleDocFile = (f) => {
        setDocFile(f);
        if (f) setForm(fm => ({ ...fm, file_url: '', size_label: fmtSizeFR(f.size) }));
      };

      const submit = async (e) => {
        e.preventDefault();
        if (!docFile && !form.file_url.trim()) { alert('Choisis un fichier ou colle une URL.'); return; }
        setLoading(true);
        try {
          const { date_iso_local, ...rest } = form;
          let file_url = form.file_url;
          if (docFile) {
            setUpPct(0);
            file_url = await b2UploadFile(docFile, `documents/${clientId}/${Date.now()}-${b2SafeName(docFile.name)}`,
              (p) => setUpPct(Math.round(p * 100)));
            setUpPct(null);
          }
          const payload = { ...rest, file_url, client_id: clientId, position: parseInt(form.position) || 0, shoot_id: form.shoot_id || null, strategy_id: form.strategy_id || null };
          const result = existing
            ? await sb.from('documents').update(payload).eq('id', existing.id)
            : await sb.from('documents').insert(payload);
          if (result.error) throw new Error(result.error.message);
          onSaved();
        } catch (err) {
          setUpPct(null); setLoading(false);
          alert(`✗ ${err.message || 'Erreur'}`);
        }
      };

      return (
        <Modal title={existing ? 'Modifier le document' : 'Nouveau document'} kicker="Document" onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <FormSection>
              <Field label="Titre">
                <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Contrat de prestation 2026" />
              </Field>
              <Field label="Catégorie">
                <Select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" value={form.date_iso_local} onChange={e => handleDocDate(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">Libellé : <strong>{form.date_label || '—'}</strong></div>
              </Field>
            </FormSection>
            <FormSection title="Fichier">
            <Field label="Fichier (PDF, image)">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={e => handleDocFile(e.target.files?.[0] || null)}
                className="w-full text-[13px] text-stone-600 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-stone-900 file:text-white file:text-[12px] file:font-semibold file:cursor-pointer"
              />
              {docFile ? (
                <div className="text-[11px] text-stone-500 mt-1.5">📄 {docFile.name} · {fmtSizeFR(docFile.size)} — sera uploadé sur B2</div>
              ) : form.file_url ? (
                <div className="text-[11px] text-emerald-700 mt-1.5 truncate">✅ Fichier déjà en ligne : {form.file_url}</div>
              ) : (
                <div className="text-[11px] text-stone-500 mt-1.5">Le fichier part directement du navigateur vers B2.</div>
              )}
              <Input value={form.file_url} onChange={e => setForm({...form, file_url: e.target.value})} placeholder="… ou coller une URL publique" style={{ marginTop: '8px' }} />
              <div className="mt-2">
                <Btn icon={FolderOpen} onClick={() => setMontrerDrive(true)}>Choisir dans le Drive</Btn>
              </div>
            </Field>
            </FormSection>
            {montrerDrive && (
              <DrivePicker genres={['document', 'photo']}
                onChoisir={(it) => {
                  setDocFile(null);
                  setForm(fm => ({
                    ...fm,
                    file_url: it.url,
                    size_label: it.taille ? fmtSizeFR(it.taille) : fm.size_label,
                    title: fm.title || it.nom.replace(/\.[a-z0-9]+$/i, ''),
                  }));
                  setMontrerDrive(false);
                }}
                onClose={() => setMontrerDrive(false)} />
            )}
            {upPct !== null && (
              <div className="rounded-xl px-4 py-3" style={neu.pressedSm}>
                <div className="flex justify-between text-[11.5px] font-semibold text-stone-600 mb-1.5"><span>☁️ Upload du fichier</span><span>{upPct}%</span></div>
                <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden"><div className="h-full bg-stone-900 transition-all" style={{ width: `${upPct}%` }} /></div>
              </div>
            )}
            <FormSection title="Rattachement">
              <Field label="Tournage lié (optionnel)">
                <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                  <option value="">— Aucun —</option>
                  {shoots.map(s => <option key={s.id} value={s.id}>{shootOptionLabel(s)}</option>)}
                </Select>
              </Field>
              {/* Stratégie liée : module réservé à la plateforme (retiré des
                  locataires) — le champ ne s'affiche plus que pour elle. */}
              {FEATURES.allUniverses && (
              <Field label="Stratégie liée (optionnel)">
                <Select value={form.strategy_id} onChange={e => setForm({...form, strategy_id: e.target.value})}>
                  <option value="">— Aucune —</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>💡 {s.subtitle || s.title}</option>)}
                </Select>
              </Field>
              )}
            </FormSection>
            <FormSection title="Affichage">
              <Field label="Taille (optionnel)">
                <Input value={form.size_label} onChange={e => setForm({...form, size_label: e.target.value})} placeholder="1,2 MB" />
              </Field>
              <Field label="Ordre d'affichage">
                <Input type="number" inputMode="numeric" value={form.position} onChange={e => setForm({...form, position: e.target.value})} placeholder="0" />
              </Field>
            </FormSection>
            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? 'Enregistrement…' : (existing ? 'Mettre à jour' : 'Ajouter')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📑 STRATEGIES TAB (stratégies de contenu + partage par lien)
       ════════════════════════════════════════════════════════════ */
    const STRATEGY_TAGS = ['Lead Gen', 'Éducation', 'Désir', 'Viral', 'Confiance', 'Conversion'];

    const STRATEGY_TAG_COLORS = {
      'Lead Gen': '#C9A84C', 'Éducation': '#2D7A5F', 'Désir': '#7B5EA7',
      'Viral': '#C0392B', 'Confiance': '#2980B9', 'Conversion': '#E67E22',
    };

    const stratTagColor = (tag) => STRATEGY_TAG_COLORS[tag] || '#8a7a66';
    const stratHexA = (hex, a) => {
      const h = (hex || '#8a7a66').replace('#', '');
      return `rgba(${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)},${a})`;
    };

    const StrategyTagBadge = ({ tag }) => {
      if (!tag) return null;
      const c = stratTagColor(tag);
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shrink-0 leading-none"
              style={{ background: stratHexA(c, 0.14), color: c, border: `1px solid ${stratHexA(c, 0.35)}` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{tag}
        </span>
      );
    };

    function StrategiesTab({ clientId, client }) {
      const [items, setItems] = useState([]);
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [loading, setLoading] = useState(true);
      const [copiedId, setCopiedId] = useState(null);
      const [busyId, setBusyId] = useState(null);
      const [notifying, setNotifying] = useState(null);
      // « Planifier un tournage » depuis une stratégie (préremplit ShootForm)
      const [shootFor, setShootFor] = useState(null);

      // Prévenir le client que sa stratégie est publiée (kind: strategy_ready)
      const notifyReady = async (s) => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (s.status !== 'published') {
          alert("Publiez d'abord la stratégie : un brouillon est invisible côté client.");
          return;
        }
        if (!confirm(`Envoyer un email à ${client.client_email} pour annoncer la stratégie « ${s.subtitle || s.title} » ?`)) return;
        setNotifying(s.id);
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({ kind: 'strategy_ready', client_id: clientId, strategy_id: s.id }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.");
          else alert(`Erreur : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setNotifying(null);
      };

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('strategies').select('*').eq('client_id', clientId).order('position').order('created_at', { ascending: false });
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer cette stratégie ? Le lien de partage cessera de fonctionner.')) return;
        await sb.from('strategies').delete().eq('id', id);
        load();
      };

      // Base de l'URL publique : strategie.html vit à la racine du site.
      const shareBase = (() => {
        const path = window.location.pathname.replace(/[^/]*$/, '');
        return window.location.origin + path + 'strategie.html';
      })();

      const shareLink = (s) => shareBase + '?s=' + s.share_token;

      const copyLink = async (s) => {
        try { await navigator.clipboard.writeText(shareLink(s)); }
        catch (e) { window.prompt('Copiez ce lien :', shareLink(s)); }
        setCopiedId(s.id); setTimeout(() => setCopiedId(null), 2200);
      };

      // Active/désactive le partage public
      const toggleShare = async (s) => {
        setBusyId(s.id);
        await sb.from('strategies').update({ share_enabled: !s.share_enabled }).eq('id', s.id);
        await load(); setBusyId(null);
      };

      // Régénère le token (révoque l'ancien lien)
      const regenToken = async (s) => {
        if (!confirm('Régénérer le lien ? L\'ancien lien partagé cessera immédiatement de fonctionner.')) return;
        setBusyId(s.id);
        const newToken = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).replace(/-/g, '');
        await sb.from('strategies').update({ share_token: newToken }).eq('id', s.id);
        await load(); setBusyId(null);
      };

      // Duplique une stratégie (sert de modèle) : nouveau token (défaut DB),
      // partage désactivé, statut brouillon.
      const duplicate = async (s) => {
        setBusyId(s.id);
        const { id, created_at, updated_at, share_token, ...rest } = s;
        const { error } = await sb.from('strategies').insert({
          ...rest,
          title: s.title + ' (copie)',
          share_enabled: false,
          status: 'draft',
        });
        if (error) alert(error.message);
        await load(); setBusyId(null);
      };

      return (
        <div className="space-y-5 lg:space-y-6">
          <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
              <div>
                <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Contenu & Marketing</div>
                <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1 leading-tight" style={SERIF}>
                  Stratégies <span className="text-stone-400">({items.length})</span>
                </h3>
              </div>
              <Btn kind="dark" icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }} className="w-full sm:w-auto">
                Nouvelle stratégie
              </Btn>
            </div>
            <p className="text-[12px] lg:text-[13px] text-stone-500 mt-2">
              Stratégies de contenu (concepts, hooks, storyboards…). Le client les consulte dans son espace et peut partager un lien public à ses collaborateurs.
            </p>

            <div className="mt-5">
              {loading ? <div className="text-center py-12 text-stone-400">Chargement…</div> : (
                <div className="space-y-3">
                  {items.map(s => {
                    const nbConcepts = Array.isArray(s.concepts) ? s.concepts.length : 0;
                    return (
                      <div key={s.id} style={neu.pressedSm} className="rounded-2xl p-4 lg:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-[14px] leading-snug">{s.title}</span>
                              <span className={`text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${s.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                                {s.status === 'published' ? 'Publiée' : 'Brouillon'}
                              </span>
                            </div>
                            {s.subtitle && <div className="text-[12.5px] text-stone-500 mt-1 leading-snug">{s.subtitle}</div>}
                            <div className="text-[11.5px] text-stone-400 mt-1.5">
                              {nbConcepts} concept{nbConcepts > 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => setShootFor(s)} aria-label="Planifier un tournage" title="Planifier un tournage lié à cette stratégie" className="w-10 h-10 lg:w-9 lg:h-9 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform"><CalendarIcon size={14} /></button>
                            {s.status === 'published' && client?.client_email && (
                              <BellBtn onClick={() => notifyReady(s)} busy={notifying === s.id} title="Prévenir le client par email" />
                            )}
                            <button onClick={() => duplicate(s)} disabled={busyId === s.id} aria-label="Dupliquer" title="Dupliquer (sert de modèle)" className="w-10 h-10 lg:w-9 lg:h-9 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform disabled:opacity-50"><Copy size={14} /></button>
                            <button onClick={() => { setEditing(s); setShowForm(true); }} aria-label="Modifier" className="w-10 h-10 lg:w-9 lg:h-9 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform"><Edit3 size={14} /></button>
                            <button onClick={() => remove(s.id)} aria-label="Supprimer" className="w-10 h-10 lg:w-9 lg:h-9 rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95 transition-transform"><Trash2 size={14} /></button>
                          </div>
                        </div>

                        {/* Bloc de partage */}
                        <div style={neu.raisedXs} className="rounded-xl p-3 mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                          <button
                            onClick={() => toggleShare(s)}
                            disabled={busyId === s.id}
                            style={s.share_enabled ? neu.darkSm : {}}
                            className={`px-3 py-2 min-h-[40px] rounded-full text-[12px] font-semibold flex items-center justify-center gap-2 shrink-0 active:scale-95 transition ${s.share_enabled ? 'text-white' : 'text-stone-500'}`}>
                            <Power size={13} /> {s.share_enabled ? 'Lien actif' : 'Lien désactivé'}
                          </button>

                          {s.share_enabled ? (
                            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                              {s.status !== 'published' && (
                                <span className="text-[11px] text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 leading-none">
                                  <AlertCircle size={11} /> Lien inactif tant que la stratégie est en brouillon
                                </span>
                              )}
                              <code className="text-[11px] text-stone-500 truncate flex-1 font-mono min-w-[120px]">{shareLink(s)}</code>
                              <button onClick={() => copyLink(s)} aria-label="Copier le lien"
                                className="w-9 h-9 tap-ext rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform shrink-0" title="Copier le lien">
                                {copiedId === s.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                              </button>
                              <a href={shareLink(s)} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l'aperçu"
                                className="w-9 h-9 tap-ext rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform shrink-0" title="Ouvrir l'aperçu public"><ExternalLink size={13} /></a>
                              <button onClick={() => regenToken(s)} aria-label="Régénérer le lien"
                                className="w-9 h-9 tap-ext rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform shrink-0" title="Régénérer le lien (révoque l'ancien)"><RefreshCw size={13} /></button>
                            </div>
                          ) : (
                            <div className="text-[11.5px] text-stone-400 leading-snug">Activez le lien pour permettre au client de le partager publiquement.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucune stratégie pour l'instant.</div>}
                </div>
              )}
            </div>
          </div>

          {showForm && <StrategyForm clientId={clientId} existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
          {shootFor && (
            <ShootForm
              clientId={clientId}
              client={client}
              initial={{ strategy_id: shootFor.id }}
              onClose={() => setShootFor(null)}
              onSaved={() => { setShootFor(null); alert('✓ Tournage programmé — retrouvez-le dans l\'onglet Tournages.'); }}
            />
          )}
        </div>
      );
    }

    /* ────────────────────────────────────────────────────────────
       ÉDITEUR D'UN CONCEPT (carte/storyboard)
       Pattern raw-text-on-change : les lignes "texte écran" sont éditées
       comme un bloc texte brut (1 ligne = 1 super), converti en tableau
       seulement à la sauvegarde → évite la boucle controlled-input.
       ──────────────────────────────────────────────────────────── */
    function ConceptEditor({ concept, index, total, onChange, onRemove, onMove }) {
      const set = (patch) => onChange({ ...concept, ...patch });
      return (
        <div style={neu.pressedSm} className="rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[20px] leading-none">{concept.emoji || '🎬'}</span>
              <span className="text-[12px] font-semibold text-stone-500">Concept #{concept.id}</span>
              <StrategyTagBadge tag={concept.tag} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Monter"
                className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 disabled:opacity-30 active:scale-95"><ChevronUp size={14} /></button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1} aria-label="Descendre"
                className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 disabled:opacity-30 active:scale-95"><ChevronDown size={14} /></button>
              <button type="button" onClick={() => onRemove(index)} aria-label="Supprimer le concept"
                className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95"><Trash2 size={13} /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Emoji">
              <Input value={concept.emoji || ''} onChange={e => set({ emoji: e.target.value })} placeholder="💰" />
            </Field>
            <Field label="Objectif (tag)">
              <Select value={concept.tag || ''} onChange={e => set({ tag: e.target.value })}>
                <option value="">— Aucun —</option>
                {STRATEGY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Angle stratégique">
              <Input value={concept.angle || ''} onChange={e => set({ angle: e.target.value })} placeholder="Brise la barrière prix #1" />
            </Field>
          </div>

          <Field label="Titre">
            <Input value={concept.titre || ''} onChange={e => set({ titre: e.target.value })} placeholder="Budget réel en Île-de-France" />
          </Field>

          <Field label="Hook (accroche, 3 premières secondes)">
            <Textarea rows={2} value={concept.hook || ''} onChange={e => set({ hook: e.target.value })} placeholder="On m'a dit 200K… mais combien ça coûte VRAIMENT ?" />
          </Field>

          <Field label="Visuel (ce qu'on montre à l'écran)">
            <Textarea rows={2} value={concept.visuel || ''} onChange={e => set({ visuel: e.target.value })} placeholder="Constructeur face caméra, tableau blanc derrière…" />
          </Field>

          <Field label="Texte écran (une ligne = un super)">
            <Textarea rows={4}
              value={Array.isArray(concept.texteEcran) ? concept.texteEcran.join('\n') : (concept.texteEcran || '')}
              onChange={e => set({ texteEcran: e.target.value.split('\n') })}
              placeholder={"⚠️ VÉRITÉ sur les prix\nEntre 1 600 et 2 200 €/m²\n→ pour une maison clé en main"} />
            <div className="text-[11px] text-stone-500 mt-1">Chaque retour à la ligne crée une nouvelle pastille de texte.</div>
          </Field>

          <Field label="Call to action (CTA de fin)">
            <Input value={concept.cta || ''} onChange={e => set({ cta: e.target.value })} placeholder="💬 Estimez votre projet →" />
          </Field>
        </div>
      );
    }

    function StrategyForm({ clientId, existing, onClose, onSaved }) {
      const [form, setForm] = useState({
        title:        existing?.title        || '',
        subtitle:     existing?.subtitle     || '',
        sector_label: existing?.sector_label || '',
        intro:        existing?.intro         || '',
        format_note:  existing?.format_note  || '',
        status:       existing?.status       || 'draft',
        share_enabled: existing?.share_enabled ?? false,
        position:     existing?.position ?? 0,
      });
      // Concepts en state structuré (édités via ConceptEditor, chacun avec un sous-state texte brut)
      const [concepts, setConcepts] = useState(() =>
        Array.isArray(existing?.concepts) ? existing.concepts.map(c => ({ ...c })) : []
      );
      // Stats d'en-tête et objectifs/KPIs : édition visuelle structurée
      const [stats, setStats] = useState(() =>
        Array.isArray(existing?.stats) ? existing.stats.map(s => ({ ...s })) : []
      );
      const [kpis, setKpis] = useState(() =>
        Array.isArray(existing?.kpis) ? existing.kpis.map(k => ({ ...k })) : []
      );
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');

      const updateRow = (list, setList) => (i, patch) => setList(list.map((r, idx) => idx === i ? { ...r, ...patch } : r));
      const removeRow = (list, setList) => (i) => setList(list.filter((_, idx) => idx !== i));
      const updateStat = updateRow(stats, setStats);
      const removeStat = removeRow(stats, setStats);
      const updateKpi  = updateRow(kpis, setKpis);
      const removeKpi  = removeRow(kpis, setKpis);

      const addConcept = () => {
        const nextId = concepts.reduce((m, c) => Math.max(m, parseInt(c.id) || 0), 0) + 1;
        setConcepts([...concepts, { id: nextId, emoji: '🎬', titre: '', hook: '', visuel: '', texteEcran: [], cta: '', tag: '', angle: '' }]);
      };
      const updateConcept = (i, next) => setConcepts(concepts.map((c, idx) => idx === i ? next : c));
      const removeConcept = (i) => setConcepts(concepts.filter((_, idx) => idx !== i));
      const moveConcept = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= concepts.length) return;
        const copy = [...concepts];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        setConcepts(copy);
      };

      const submit = async (e) => {
        e.preventDefault();
        setErr('');
        // Nettoie les lignes vides de texteEcran + renumérote les concepts dans l'ordre d'affichage
        const cleanConcepts = concepts.map((c, idx) => ({
          ...c,
          id: idx + 1,
          texteEcran: (Array.isArray(c.texteEcran) ? c.texteEcran : String(c.texteEcran || '').split('\n'))
            .map(l => l.trim()).filter(Boolean),
        }));

        let cleanStats = stats
          .map(s => ({ n: (s.n || '').trim(), label: (s.label || '').trim() }))
          .filter(s => s.n || s.label);
        let cleanKpis = kpis
          .map(k => ({
            icon: (k.icon || '').trim(), label: (k.label || '').trim(),
            count: (k.count || '').trim(), desc: (k.desc || '').trim(),
            color: k.color || '#2a2620',
          }))
          .filter(k => k.label || k.desc || k.count);

        setLoading(true);
        const payload = {
          client_id: clientId,
          title: form.title, subtitle: form.subtitle, sector_label: form.sector_label,
          intro: form.intro, format_note: form.format_note,
          status: form.status, share_enabled: form.share_enabled,
          position: parseInt(form.position) || 0,
          concepts: cleanConcepts, kpis: cleanKpis, stats: cleanStats,
        };
        const result = existing
          ? await sb.from('strategies').update(payload).eq('id', existing.id)
          : await sb.from('strategies').insert(payload);
        if (!result.error) onSaved();
        else { setErr(humaniseErreur(result.error.message)); setLoading(false); }
      };

      return (
        <Modal title={existing ? 'Modifier la stratégie' : 'Nouvelle stratégie'} kicker="Stratégie de contenu" onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Titre (kicker)">
              <Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Stratégie Contenu Vidéo Courte" />
            </Field>
            <Field label="Sous-titre">
              <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="8 Concepts Reels · TikTok · Shorts" />
            </Field>
            <Field label="Secteur / contexte">
              <Input value={form.sector_label} onChange={e => setForm({ ...form, sector_label: e.target.value })} placeholder="Constructeur maisons individuelles — Île-de-France" />
            </Field>
            <Field label="Introduction (objectif stratégique)">
              <Textarea rows={3} value={form.intro} onChange={e => setForm({ ...form, intro: e.target.value })} placeholder="Démystifier, rassurer, convertir. Chaque vidéo lève un frein précis…" />
            </Field>

            {/* Concepts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Concepts ({concepts.length})</label>
                <Btn icon={Plus} onClick={addConcept}>Ajouter un concept</Btn>
              </div>
              <div className="space-y-3">
                {concepts.map((c, i) => (
                  <ConceptEditor key={i} concept={c} index={i} total={concepts.length}
                    onChange={(next) => updateConcept(i, next)} onRemove={removeConcept} onMove={moveConcept} />
                ))}
                {concepts.length === 0 && (
                  <div style={neu.pressedSm} className="rounded-2xl p-6 text-center text-[12.5px] text-stone-400">
                    Aucun concept. Cliquez sur « Ajouter un concept ».
                  </div>
                )}
              </div>
            </div>

            {/* Stats d'en-tête (compteurs) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Compteurs d'en-tête ({stats.length})</label>
                <Btn icon={Plus} onClick={() => setStats([...stats, { n: '', label: '' }])}>Ajouter</Btn>
              </div>
              <div className="space-y-2">
                {stats.map((s, i) => (
                  <div key={i} style={neu.pressedSm} className="rounded-xl p-3 flex items-end gap-2">
                    <div className="w-24 shrink-0">
                      <Field label="Valeur"><Input value={s.n || ''} onChange={e => updateStat(i, { n: e.target.value })} placeholder="8" /></Field>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Field label="Libellé"><Input value={s.label || ''} onChange={e => updateStat(i, { label: e.target.value })} placeholder="Concepts" /></Field>
                    </div>
                    <button type="button" onClick={() => removeStat(i)} aria-label="Supprimer"
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95 shrink-0 mb-0.5"><Trash2 size={13} /></button>
                  </div>
                ))}
                {stats.length === 0 && <div className="text-[11.5px] text-stone-400 px-1">Ex. : « 8 / Concepts », « 60s / Format max ». Affichés en haut à droite de la stratégie.</div>}
              </div>
            </div>

            {/* Objectifs / KPIs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Objectifs ({kpis.length})</label>
                <Btn icon={Plus} onClick={() => setKpis([...kpis, { icon: '🎯', label: '', count: '', desc: '', color: '#2D7A5F' }])}>Ajouter</Btn>
              </div>
              <div className="space-y-2">
                {kpis.map((k, i) => (
                  <div key={i} style={neu.pressedSm} className="rounded-xl p-3 space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="w-20 shrink-0">
                        <Field label="Emoji"><Input value={k.icon || ''} onChange={e => updateKpi(i, { icon: e.target.value })} placeholder="🔍" /></Field>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Field label="Libellé"><Input value={k.label || ''} onChange={e => updateKpi(i, { label: e.target.value })} placeholder="Notoriété & Portée" /></Field>
                      </div>
                      <div className="w-28 shrink-0">
                        <Field label="Compteur"><Input value={k.count || ''} onChange={e => updateKpi(i, { count: e.target.value })} placeholder="3 vidéos" /></Field>
                      </div>
                      <div className="w-14 shrink-0">
                        <Field label="Couleur">
                          <input type="color" value={k.color || '#2D7A5F'} onChange={e => updateKpi(i, { color: e.target.value })}
                            aria-label="Couleur de l'objectif"
                            style={{ ...neu.pressedSm, padding: 4 }} className="w-full h-[46px] rounded-xl cursor-pointer bg-transparent" />
                        </Field>
                      </div>
                      <button type="button" onClick={() => removeKpi(i)} aria-label="Supprimer"
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-rose-500 active:scale-95 shrink-0 mb-0.5"><Trash2 size={13} /></button>
                    </div>
                    <Field label="Description">
                      <Input value={k.desc || ''} onChange={e => updateKpi(i, { desc: e.target.value })} placeholder="Concepts 2, 5, 7 — éducation top of funnel" />
                    </Field>
                  </div>
                ))}
                {kpis.length === 0 && <div className="text-[11.5px] text-stone-400 px-1">Cartes d'objectifs affichées en bas de la stratégie (notoriété, confiance, conversion…).</div>}
              </div>
            </div>

            <Field label="Note de pied de page">
              <Input value={form.format_note} onChange={e => setForm({ ...form, format_note: e.target.value })} placeholder="Format Reels / TikTok / YouTube Shorts · 30–60 s par vidéo" />
            </Field>

            {/* Publication + partage */}
            <div className="space-y-4">
              <Field label="Statut">
                <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="draft">Brouillon</option>
                  <option value="published">Publiée</option>
                </Select>
              </Field>
              <Field label="Ordre d'affichage">
                <Input type="number" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="0" />
              </Field>
            </div>

            <button type="button" onClick={() => setForm({ ...form, share_enabled: !form.share_enabled })}
              style={form.share_enabled ? neu.dark : neu.pressedSm}
              className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between transition ${form.share_enabled ? 'text-white' : 'text-stone-700'}`}>
              <div className="flex items-center gap-3 text-left">
                <Link2 size={17} />
                <div>
                  <div className="font-semibold text-[13px]">Lien de partage public</div>
                  <div className={`text-[10.5px] mt-0.5 ${form.share_enabled ? 'text-stone-300' : 'text-stone-500'}`}>Lien consultable sans connexion — actif uniquement si la stratégie est publiée</div>
                </div>
              </div>
              <div className={`w-10 h-5.5 rounded-full p-0.5 transition ${form.share_enabled ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.share_enabled ? 'translate-x-4' : ''}`} />
              </div>
            </button>

            {err && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]"><AlertCircle size={14} /> {err}</div>}

            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? 'Enregistrement…' : (existing ? 'Mettre à jour' : 'Créer la stratégie')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🎬 SHOOTS TAB
       ════════════════════════════════════════════════════════════ */
    function ShootsTab({ clientId, client }) {
      const [items, setItems] = useState([]);
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [loading, setLoading] = useState(true);
      const [notifying, setNotifying] = useState(null);
      // Liaisons : stratégies (pour les chips) + « Facturer ce tournage »
      const { strategies } = useLinkLists(clientId, { strategies: true });
      const [invoiceFor, setInvoiceFor] = useState(null);

      const load = async () => {
        setLoading(true);
        /* Par date RÉELLE. Trier par (année, jour-du-mois) ignorait le
           MOIS : « 21 mai » s'affichait après « 19 juin » et « 29 mai »
           atterrissait après septembre (relevé sur les 7 tournages en
           base le 29/07/2026). */
        const { data } = await sb.from('shoots').select('*').eq('client_id', clientId).order('date_iso');
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer ce tournage ?\n\nIl disparaîtra du calendrier et de l\'espace de votre client.')) return;
        await sb.from('shoots').delete().eq('id', id);
        load();
      };

      // Prévenir le client qu'un tournage est programmé (kind: shoot_scheduled)
      const notifyScheduled = async (shoot) => {
        if (!client?.client_email) {
          alert("Ajoutez d'abord l'email du client (Modifier → champ Email).");
          return;
        }
        if (!confirm(`Envoyer un email à ${client.client_email} pour annoncer le tournage « ${shoot.title} » ?`)) return;
        setNotifying(shoot.id);
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({
              kind:      'shoot_scheduled',
              client_id: clientId,
              extra: {
                title:       shoot.title,
                type:        shoot.type,
                date_iso:    shoot.date_iso || null,
                date_day:    shoot.date_day,
                month_label: shoot.month_label,
                year:        shoot.year,
                time_label:  shoot.time_label || '',
                location:    shoot.location || '',
              },
            }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.\n\nVoir ÉMAILS-SETUP.md pour activer les notifications par email.");
          else alert(`Erreur d'envoi : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setNotifying(null);
      };

      return (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-tight" style={SERIF}>
              Tournages programmés <span className="text-stone-400">({items.length})</span>
            </h3>
            <Btn kind="dark" icon={Plus} onClick={() => { setEditing(null); setShowForm(true); }} className="w-full sm:w-auto">
              Nouveau tournage
            </Btn>
          </div>

          {loading ? <div className="text-center py-12 text-stone-400">Chargement…</div> : (
            <div className="space-y-2.5">
              {items.map(s => (
                <div key={s.id} style={neu.pressedSm} className="rounded-2xl p-4 flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                  <div style={s.type === 'video' ? neu.dark : neu.raisedXs} className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${s.type === 'video' ? 'text-white' : 'text-stone-700'}`}>
                    <div className="text-[9px] uppercase tracking-wider opacity-60 leading-none">{s.month_label}</div>
                    <div className="text-[18px] leading-none font-semibold mt-1" style={SERIF}>{s.date_day}</div>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="font-medium text-[14px] truncate">{s.title}</div>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold leading-none ${s.type === 'video' ? 'bg-stone-900 text-white' : 'bg-stone-300 text-stone-700'}`}>{s.type}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-stone-500 flex-wrap">
                      {s.time_label && <span className="flex items-center gap-1"><Clock size={11} /> {s.time_label}</span>}
                      {s.location && <span className="flex items-center gap-1"><MapPin size={11} /> {s.location}</span>}
                      {s.strategy_id && (() => {
                        const strat = strategies.find(st => st.id === s.strategy_id);
                        if (!strat) return null;
                        const concept = s.concept_id != null && Array.isArray(strat.concepts)
                          ? strat.concepts.find(c => String(c.id) === String(s.concept_id)) : null;
                        return (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full leading-none"
                                style={{ background: 'rgba(201,168,76,0.12)', color: '#a8893d', border: '1px solid rgba(201,168,76,0.3)' }}>
                            💡 {strat.subtitle || strat.title}{concept ? ` · #${concept.id} ${concept.emoji || ''}` : ''}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button onClick={() => setInvoiceFor(s)} aria-label="Facturer ce tournage" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" title="Créer une facture liée à ce tournage"><FileText size={14} /></button>
                    {client?.client_email && (
                      <BellBtn onClick={() => notifyScheduled(s)} busy={notifying === s.id} title="Prévenir le client de ce tournage par email" />
                    )}
                    <button onClick={() => { setEditing(s); setShowForm(true); }} aria-label="Modifier" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"><Edit3 size={14} /></button>
                    <button onClick={() => remove(s.id)} aria-label="Supprimer" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-95 transition-transform"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <EmptyState icon={CalendarIcon}
                  texte="Aucun tournage programmé. Planifiez-en un : votre client verra la date et le lieu dans son espace."
                  bouton="Programmer un tournage" onAction={() => { setEditing(null); setShowForm(true); }} />
              )}
            </div>
          )}

          {showForm && <ShootForm clientId={clientId} client={client} existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
          {invoiceFor && (
            <InvoiceForm
              clientId={clientId}
              initial={{
                shoot_id: invoiceFor.id,
                description: `${invoiceFor.type === 'video' ? 'Production vidéo' : 'Production photo'} — ${invoiceFor.title}`,
              }}
              onClose={() => setInvoiceFor(null)}
              onSaved={() => { setInvoiceFor(null); alert('✓ Facture créée — retrouvez-la dans l\'onglet Factures.'); }}
            />
          )}
        </div>
      );
    }

    function ShootForm({ clientId, client, existing, onClose, onSaved, initial }) {
      // Reconstituer la date ISO à partir des anciens champs si on édite un existant
      const existingISO = existing?.date_iso || (existing ? shootPartsToISO(existing.date_day, existing.month_label, existing.year) : '');
      const [form, setForm] = useState({
        title:       existing?.title       || '',
        type:        existing?.type        || 'photo',
        date_iso:    existingISO || (existing ? '' : todayISO()),
        time_label:  existing?.time_label  || '',
        /* Les heures viennent de la base ; à défaut on relit l'ancien
           texte, pour qu'un tournage saisi avant la bascule s'ouvre
           déjà rempli au lieu de paraître vide. */
        start_time:  (existing?.start_time || '').slice(0, 5) || heuresDeTexte(existing?.time_label).debut,
        end_time:    (existing?.end_time   || '').slice(0, 5) || heuresDeTexte(existing?.time_label).fin,
        location:    existing?.location    || '',
        notes:       existing?.notes       || '',
        strategy_id: existing?.strategy_id || initial?.strategy_id || '',
        concept_id:  existing?.concept_id  ?? initial?.concept_id ?? '',
      });
      const [loading, setLoading] = useState(false);
      const { strategies } = useLinkLists(clientId, { strategies: true });

      // Concepts de la stratégie sélectionnée (pour le second select)
      const selectedStrategy = strategies.find(s => s.id === form.strategy_id);
      const conceptOptions = Array.isArray(selectedStrategy?.concepts) ? selectedStrategy.concepts : [];

      // Envoie shoot_scheduled (création) ou shoot_updated (date/lieu modifié)
      const fireShootEmail = async (kind, shoot) => {
        if (!client?.client_email) return;
        const label = kind === 'shoot_scheduled'
          ? `annoncer le tournage « ${shoot.title} »`
          : `prévenir du changement sur le tournage « ${shoot.title} »`;
        if (!confirm(`Envoyer un email à ${client.client_email} pour ${label} ?`)) return;
        try {
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body:    JSON.stringify({
              kind,
              client_id: clientId,
              extra: {
                title:       shoot.title,
                type:        shoot.type,
                date_iso:    shoot.date_iso || null,
                date_day:    shoot.date_day,
                month_label: shoot.month_label,
                year:        shoot.year,
                time_label:  shoot.time_label || '',
                location:    shoot.location || '',
              },
            }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée (l'email n'a pas été envoyé, le tournage est enregistré).");
          else alert(`Le tournage est enregistré, mais l'email a échoué : ${await res.text()}`);
        } catch (e) { alert("Le tournage est enregistré, mais l'email a échoué (réseau) : " + e.message); }
      };

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Calculer les champs legacy à partir de la date ISO
        const parts = isoToShootParts(form.date_iso);
        const payload = {
          ...form,
          client_id:   clientId,
          date_day:    parts.date_day || null,
          month_label: parts.month_label || 'Jan',
          year:        parts.year || new Date().getFullYear(),
          date_iso:    form.date_iso || null,
          /* Les heures font foi ; le texte en découle. L'inverse (saisir
             le texte, deviner les heures) est ce qui nous a menés à
             « 10 :00 » en base. */
          start_time:  form.start_time || null,
          end_time:    form.end_time || null,
          /* Un horaire que le lecteur n'a pas su interpréter (« 14h-18h »)
             serait effacé par la réécriture : on le CONSERVE tel quel.
             On n'efface que ce qu'on savait représenter — donc ce que
             l'utilisateur a vu dans les deux champs et vidé lui-même. */
          time_label:  texteHoraire(form.start_time, form.end_time)
                       || (heuresDeTexte(form.time_label).debut ? '' : (form.time_label || '')),
          strategy_id: form.strategy_id || null,
          concept_id:  form.strategy_id && form.concept_id !== '' ? parseInt(form.concept_id) : null,
        };

        // Détecter un changement de date ou de lieu (mode édition)
        const dateChanged     = !!existing && (existing.date_iso || '') !== (payload.date_iso || '');
        const locationChanged = !!existing && (existing.location || '') !== (payload.location || '');

        const result = existing
          ? await sb.from('shoots').update(payload).eq('id', existing.id)
          : await sb.from('shoots').insert(payload);

        if (result.error) { alert(result.error.message); setLoading(false); return; }

        // Réinitialiser les flags de rappel si la date a bougé (les rappels J-7/J-1 repartiront)
        if (existing && dateChanged) {
          await sb.from('shoots').update({ reminded_7d: false, reminded_1d: false }).eq('id', existing.id);
        }

        // Notifications email
        if (!existing) {
          await fireShootEmail('shoot_scheduled', payload);
        } else if (dateChanged || locationChanged) {
          await fireShootEmail('shoot_updated', payload);
        }

        onSaved();
      };

      return (
        <Modal title={existing ? 'Modifier le tournage' : 'Nouveau tournage'} kicker="Planning" onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <FormSection>
              <Field label="Titre du tournage">
                <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Shooting éditorial — Maison Lumière" />
              </Field>
              <Field label="Type">
                <Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="photo">📸 Photo</option>
                  <option value="video">🎥 Vidéo</option>
                </Select>
              </Field>
            </FormSection>
            <FormSection title="Quand et où">
              <Field label="Date du tournage">
                <Input required type="date" value={form.date_iso} onChange={e => setForm({...form, date_iso: e.target.value})} />
                <div className="text-[11px] text-stone-500 mt-1">{form.date_iso ? isoToLabel(form.date_iso) : '—'}</div>
              </Field>
              {/* Deux VRAIES heures au lieu d'un texte libre. La saisie
                  libre avait produit « 10 :00 », « 11:00 - 19:00 » et du
                  vide — impossible d'en tirer un calendrier. time_label
                  reste écrit, dérivé de ces deux champs : tout ce qui le
                  lit déjà (espace client, emails, factures) continue. */}
              <Field label="Début">
                <Input type="time" value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })} />
              </Field>
              <Field label="Fin">
                <Input type="time" value={form.end_time}
                  onChange={e => setForm({ ...form, end_time: e.target.value })} />
                <div className="text-[11px] text-stone-500 mt-1">
                  {form.end_time && form.start_time && form.end_time < form.start_time
                    ? 'Se termine après minuit — c’est accepté.'
                    : 'Laissez vide si l’heure de fin n’est pas connue.'}
                </div>
              </Field>
              <Field label="Lieu">
                <Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Studio Bastille, Paris 11" />
              </Field>
            </FormSection>

            {/* ── Liaison stratégie → concept (chaîne de production) ── */}
            {strategies.length > 0 && (
              <FormSection title="Rattachement">
                <Field label="Stratégie liée (optionnel)">
                  <Select value={form.strategy_id} onChange={e => setForm({...form, strategy_id: e.target.value, concept_id: ''})}>
                    <option value="">— Aucune —</option>
                    {strategies.map(s => <option key={s.id} value={s.id}>💡 {s.subtitle || s.title}</option>)}
                  </Select>
                </Field>
                {form.strategy_id && (
                  <Field label="Concept produit">
                    <Select value={form.concept_id} onChange={e => setForm({...form, concept_id: e.target.value})}>
                      <option value="">— Aucun en particulier —</option>
                      {conceptOptions.map(c => <option key={c.id} value={c.id}>#{c.id} {c.emoji} {c.titre}</option>)}
                    </Select>
                    <div className="text-[11px] text-stone-500 mt-1">Le concept passera en « 🎬 planifié » puis « ✓ livré » dans la stratégie du client.</div>
                  </Field>
                )}
              </FormSection>
            )}
            <FormSection title="Notes">
              <Field label="Notes (optionnel, visibles uniquement par vous)">
                <Textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Équipe : 4 personnes. Pré-prod le 3 avril." />
              </Field>
            </FormSection>
            <div className="flex gap-3 pt-2">
              <Btn onClick={onClose} full>Annuler</Btn>
              <Btn kind="dark" type="submit" full disabled={loading} icon={loading ? Loader2 : Save}>
                {loading ? 'Enregistrement…' : (existing ? 'Mettre à jour' : 'Programmer')}
              </Btn>
            </div>
          </form>
        </Modal>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📊 ANALYTICS TAB
       ════════════════════════════════════════════════════════════ */
    function AnalyticsTab({ clientId }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [saving, setSaving] = useState(false);
      const [savedAt, setSavedAt] = useState(null);

      const load = async () => {
        setLoading(true);
        const { data: d } = await sb.from('analytics').select('*').eq('client_id', clientId).maybeSingle();
        if (d) setData(d);
        else {
          // Pas de ligne analytics encore : on en crée une vide
          const { data: created } = await sb.from('analytics').insert({ client_id: clientId }).select().single();
          setData(created);
        }
        setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const save = async () => {
        setSaving(true);
        const { client_id, ...payload } = data;
        // Parse JSON fields
        try {
          if (typeof payload.platforms === 'string') payload.platforms = JSON.parse(payload.platforms || '[]');
          if (typeof payload.demographics === 'string') payload.demographics = JSON.parse(payload.demographics || '[]');
          if (typeof payload.follower_growth === 'string') payload.follower_growth = JSON.parse(payload.follower_growth || '[]');
          if (typeof payload.engagement_by_day === 'string') payload.engagement_by_day = JSON.parse(payload.engagement_by_day || '[]');
          if (typeof payload.ai_summary === 'string') payload.ai_summary = payload.ai_summary ? JSON.parse(payload.ai_summary) : null;
        } catch (e) {
          alert("Erreur de format JSON : " + e.message);
          setSaving(false);
          return;
        }
        payload.updated_at = new Date().toISOString();

        const { error } = await sb.from('analytics').update(payload).eq('client_id', clientId);
        if (error) { alert(error.message); }
        else {
          setSavedAt(new Date());
          load();
        }
        setSaving(false);
      };

      const upd = (k, v) => setData({ ...data, [k]: v });

      if (loading || !data) return <div style={neu.raised} className="rounded-[28px] p-12 text-center text-stone-400">Chargement…</div>;

      return (
        <div className="space-y-5">
          {/* KPIs simples */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">KPIs principaux</div>
                <h3 className="text-[22px] tracking-tight mt-1" style={SERIF}>Indicateurs clés</h3>
              </div>
              <Btn kind="dark" icon={saving ? Loader2 : Save} onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Btn>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {[
                ['total_followers', 'Abonnés totaux', '48 320'],
                ['followers_delta', 'Évolution abonnés', '+5,2%'],
                ['engagement', 'Engagement', '4,8%'],
                ['engagement_delta', 'Évolution engagement', '+0,6 pts'],
                ['reach', 'Reach', '284 K'],
                ['reach_delta', 'Évolution reach', '+12,4%'],
                ['clicks', 'Clics sortants', '1 247'],
                ['clicks_delta', 'Évolution clics', '-2,1%'],
                ['spent_delta', 'Évolution dépensé', '+8,4%'],
                ['media_delta', 'Évolution médias', '+12 ce mois'],
              ].map(([key, label, ph]) => (
                <Field key={key} label={label}>
                  <Input value={data[key] || ''} onChange={e => upd(key, e.target.value)} placeholder={ph} />
                </Field>
              ))}
            </div>
          </div>

          {/* Plateformes - JSON éditable */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Plateformes (JSON)</div>
            <h3 className="text-[18px] tracking-tight mt-1 mb-3" style={SERIF}>Réseaux sociaux du client</h3>
            <p className="text-[12px] text-stone-500 mb-3">
              Format : un tableau d'objets <code className="bg-stone-200 px-1.5 py-0.5 rounded text-[11px]">{`{name, followers, followersRaw, delta, engagement}`}</code>
            </p>
            <Textarea rows={6} value={typeof data.platforms === 'string' ? data.platforms : JSON.stringify(data.platforms, null, 2)} onChange={e => upd('platforms', e.target.value)} />
          </div>

          {/* Démographie */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Démographie (JSON)</div>
            <h3 className="text-[18px] tracking-tight mt-1 mb-3" style={SERIF}>Répartition par âge</h3>
            <p className="text-[12px] text-stone-500 mb-3">
              Format : <code className="bg-stone-200 px-1.5 py-0.5 rounded text-[11px]">{`[{name: "25-34 ans", v: 42}, ...]`}</code> (les "v" sont en %)
            </p>
            <Textarea rows={5} value={typeof data.demographics === 'string' ? data.demographics : JSON.stringify(data.demographics, null, 2)} onChange={e => upd('demographics', e.target.value)} />
          </div>

          {/* Follower growth */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Croissance abonnés (JSON)</div>
            <h3 className="text-[18px] tracking-tight mt-1 mb-3" style={SERIF}>Série temporelle abonnés</h3>
            <p className="text-[12px] text-stone-500 mb-3">
              Format : <code className="bg-stone-200 px-1.5 py-0.5 rounded text-[11px]">{`[{week: "S1", value: 12400}, ...]`}</code>
            </p>
            <Textarea rows={5} value={typeof data.follower_growth === 'string' ? data.follower_growth : JSON.stringify(data.follower_growth, null, 2)} onChange={e => upd('follower_growth', e.target.value)} />
          </div>

          {/* Engagement by day */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Engagement par jour (JSON)</div>
            <h3 className="text-[18px] tracking-tight mt-1 mb-3" style={SERIF}>Interactions par jour de la semaine</h3>
            <p className="text-[12px] text-stone-500 mb-3">
              Format : <code className="bg-stone-200 px-1.5 py-0.5 rounded text-[11px]">{`[{day: "Lun", insta: 2400, fb: 1200, tt: 3200}, ...]`}</code>
            </p>
            <Textarea rows={6} value={typeof data.engagement_by_day === 'string' ? data.engagement_by_day : JSON.stringify(data.engagement_by_day, null, 2)} onChange={e => upd('engagement_by_day', e.target.value)} />
          </div>

          {/* AI summary */}
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Synthèse IA (JSON)</div>
            <h3 className="text-[18px] tracking-tight mt-1 mb-3" style={SERIF}>Texte affiché en bas du dashboard</h3>
            <p className="text-[12px] text-stone-500 mb-3">
              Format : <code className="bg-stone-200 px-1.5 py-0.5 rounded text-[11px]">{`{headline: "...", body: "..."}`}</code> ou null
            </p>
            <Textarea rows={5} value={typeof data.ai_summary === 'string' ? data.ai_summary : JSON.stringify(data.ai_summary, null, 2)} onChange={e => upd('ai_summary', e.target.value)} />
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl" style={neu.dark}>
            <div className="text-white">
              <div className="text-[12px] text-stone-400">Pensez à enregistrer après chaque modification</div>
              {savedAt && <div className="text-[11px] text-emerald-400 mt-0.5">✓ Enregistré à {savedAt.toLocaleTimeString('fr-FR')}</div>}
            </div>
            <Btn kind="dark" icon={saving ? Loader2 : Save} onClick={save} disabled={saving} className="!bg-white !text-stone-900">
              {saving ? 'Enregistrement…' : 'Enregistrer toutes les analyses'}
            </Btn>
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🏢 AGENCES — réservé au propriétaire de la plateforme (SaaS B.3)
       ────────────────────────────────────────────────────────────
       Liste les agences locataires et en crée de nouvelles via
       l'Edge Function create-agency (qui crée aussi le compte du
       patron et renvoie son mot de passe temporaire UNE seule fois).
       ════════════════════════════════════════════════════════════ */
    const PLAN_LABELS = {
      fondateur: 'Fondateur', decouverte: 'Découverte (3 Go)', essentiel: 'Essentiel (100 Go)',
      studio: 'Studio (500 Go)', cinema: 'Cinéma (2 To)', prestige: 'Prestige (5 To)',
    };

    function AdminAgencies({ agencies, refresh }) {
      /* Le label bêta ne vient pas de `platform_list_agencies` (fonction
         existante qu'on ne réécrit pas pour si peu) mais d'un appel
         dédié — d'où cette petite table `{ agencyId: true }`. */
      const [beta, setBeta] = useState({});
      const [betaDispo, setBetaDispo] = useState(false);
      const [busyBeta, setBusyBeta] = useState(null);
      // Tant que la migration du chat n'est pas appliquée, la RPC
      // n'existe pas : on n'affiche AUCUN bouton plutôt qu'un bouton
      // qui échoue — un bouton mort est pire que pas de bouton.
      const chargerBeta = async () => {
        const { data, error } = await sb.rpc('beta_fils');
        if (error) { setBetaDispo(false); return; }
        setBetaDispo(true);
        setBeta(Object.fromEntries((data || []).map(f => [f.agency_id, f.beta_chat === true])));
      };
      useEffect(() => { chargerBeta(); }, [agencies]);

      const [busy2fa, setBusy2fa] = useState(null);

      /* 💼 Édition des métiers d'une loge existante. On n'édite que les
         métiers « inclus » actifs : les options Stripe et les sursis
         sont montrés verrouillés — l'abonnement les gère, pas ce
         panneau. Le serveur (create-agency, action set-universes)
         applique exactement la même règle. */
      const [editMetiers, setEditMetiers] = useState(null);   // id d'agence ouverte
      const [selMetiers, setSelMetiers] = useState([]);
      const [busyMetiers, setBusyMetiers] = useState(false);

      const verrousDe = (a) => (METIERS_PAR_AGENCE[a.id] || [])
        .filter((m) => m.source !== 'inclus' || m.status !== 'active');

      const ouvrirMetiers = (a) => {
        setSelMetiers((METIERS_PAR_AGENCE[a.id] || [])
          .filter((m) => m.source === 'inclus' && m.status === 'active')
          .map((m) => m.universe));
        setEditMetiers(a.id);
      };

      const enregistrerMetiers = async (a) => {
        const avant = (METIERS_PAR_AGENCE[a.id] || [])
          .filter((m) => m.source === 'inclus' && m.status === 'active')
          .map((m) => m.universe);
        const retires = avant.filter((u) => !selMetiers.includes(u));
        if (retires.length && !confirm(
          `Retirer ${retires.map((u) => (metierOf(u) || {}).label || u).join(', ')} de « ${a.name} » ?\n\n`
          + `Ses espaces clients existants continuent de fonctionner, mais l'agence ne pourra plus `
          + `créer de nouveaux espaces dans ce métier.`)) return;
        setBusyMetiers(true); setError('');
        try {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/create-agency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'set-universes', agency_id: a.id, universes: selMetiers }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Échec (${res.status})`);
          setEditMetiers(null);
          refresh();
        } catch (e) { setError(e.message); }
        setBusyMetiers(false);
      };
      /* Retire tous les facteurs 2FA du patron de l'agence — le geste de
         secours du téléphone perdu. Plusieurs propriétaires : on demande
         lequel. Le compte repasse en mot de passe seul, et son détenteur
         réactive la 2FA depuis ses Paramètres quand il veut. */
      const retirer2fa = async (agency) => {
        const patrons = agency.owners || [];
        if (!patrons.length) { alert("Cette agence n'a pas de propriétaire."); return; }
        let email = patrons[0];
        if (patrons.length > 1) {
          email = prompt(`Plusieurs propriétaires — lequel ?\n${patrons.join('\n')}`, patrons[0]);
          if (!email || !patrons.includes(email.trim())) return;
          email = email.trim();
        }
        /* La cible peut être… soi-même : VisonMike, l'agence d'essai de
           Gil, a son propre compte pour patron. Sans ce miroir, un clic
           de test emportait SA vraie 2FA derrière un message anodin. */
        const { data: { session } } = await sb.auth.getSession();
        const cestMoi = (session?.user?.email || '').toLowerCase() === email.toLowerCase();
        if (!confirm(cestMoi
          ? `⚠ ${email}, c'est VOTRE compte.\n\nCe bouton retirerait votre propre double `
            + `vérification. Pour la gérer normalement, passez par Paramètres → Double `
            + `vérification → Désactiver.\n\nRetirer quand même ?`
          : `Retirer la double vérification de ${email} ?\n\n`
            + `Son compte repassera en mot de passe seul — à faire uniquement s'il a perdu `
            + `son application d'authentification. Il pourra la réactiver dans ses Paramètres.`)) return;
        setBusy2fa(agency.id);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-mfa-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
            body: JSON.stringify({ email }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j.ok) throw new Error(j.error || `Échec (${res.status})`);
          alert(j.retires > 0
            ? `✓ Double vérification retirée pour ${email} (${j.retires} facteur${j.retires > 1 ? 's' : ''}).`
            : `${email} n'avait pas de double vérification active — rien à retirer.`);
        } catch (e) { alert(humaniseErreur(e.message)); }
        setBusy2fa(null);
      };

      const basculerBeta = async (agency) => {
        const nouveau = !beta[agency.id];
        if (!nouveau && !confirm(`Retirer « ${agency.name} » des bêta-testeurs ?\n\nLe chat disparaîtra de sa console. Les messages déjà échangés sont conservés.`)) return;
        setBusyBeta(agency.id);
        const { error } = await sb.rpc('beta_toggle', { p_agency: agency.id, p_on: nouveau });
        if (error) alert(humaniseErreur(error.message, 'bêta'));
        else setBeta(b => ({ ...b, [agency.id]: nouveau }));
        setBusyBeta(null);
      };

      /* `universes` : les métiers accordés à la loge dès sa naissance.
         Le fondateur les choisit librement — contrairement au signup
         public, qui ne vend que les métiers ouverts à la caisse. */
      const empty = { name: '', owner_email: '', slug: '', contact_email: '', plan: 'fondateur', accent_color: '#2a2620', bg_color: '#e9e4d9', logo_url: '', universes: ['celebration'] };
      const [form, setForm] = useState(empty);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [result, setResult] = useState(null); // { agency, owner } — affiché une seule fois
      const [copied, setCopied] = useState(false);
      const [busyId, setBusyId] = useState(null);

      // Ouvrir (valider) ou suspendre une loge — l'Edge Function envoie
      // l'email de bienvenue au studio à l'ouverture.
      const setActive = async (agency, activate) => {
        if (!activate && !confirm(`Suspendre l'accès de « ${agency.name} » ? Ses espaces clients resteront en ligne mais l'agence ne pourra plus rien publier.`)) return;
        setBusyId(agency.id); setError('');
        try {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/create-agency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: activate ? 'approve' : 'suspend', agency_id: agency.id }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Échec (${res.status})`);
          refresh();
        } catch (e) { setError(e.message); }
        setBusyId(null);
      };

      // Upgrade/downgrade manuel de l'offre d'une loge (console fondateur).
      // Les quotas (plan_quota_bytes / plan_limits) suivent immédiatement.
      // ⚠️ Une loge avec abonnement Stripe actif sera réalignée par le
      // prochain webhook — ce levier vise les loges sans abonnement payant.
      const setPlan = async (agency, plan) => {
        if (plan === agency.plan) return;
        if (!confirm(`Passer « ${agency.name} » à l'offre ${PLAN_LABELS[plan] || plan} ?`)) { refresh(); return; }
        setBusyId(agency.id); setError('');
        try {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/create-agency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'set-plan', agency_id: agency.id, plan }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Échec (${res.status})`);
        } catch (e) { setError(e.message); }
        refresh();
        setBusyId(null);
      };

      const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
      const autoSlug = form.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' ').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

      const submit = async () => {
        setError(''); setResult(null); setBusy(true);
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (!session?.access_token) throw new Error('Session admin expirée — reconnecte-toi.');
          const res = await fetch(`${SUPABASE_URL}/functions/v1/create-agency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ ...form, slug: form.slug || autoSlug }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Création échouée (${res.status})`);
          setResult(json);
          setForm(empty);
          refresh();
        } catch (e) { setError(e.message); }
        setBusy(false);
      };

      const copyCreds = () => {
        try {
          // La console du locataire, jamais l'origine de NOTRE onglet :
          // l'installer sur laloge.app ou timelesshouse.org sème le bug
          // des liens d'email bâtis sur la mauvaise origine.
          const console_ = result.agency?.slug
            ? `https://${result.agency.slug}.laloge.house/communication-admin`
            : `${window.location.origin}/communication-admin.html`;
          navigator.clipboard.writeText(`Espace admin : ${console_}\nEmail : ${result.owner.email}\nMot de passe temporaire : ${result.owner.temp_password}`);
          setCopied(true); setTimeout(() => setCopied(false), 2000);
        } catch (e) {}
      };

      return (
        <div className="space-y-6">
          {/* ─── Identifiants générés : affichés UNE fois ─── */}
          {result && (
            <div style={neu.dark} className="rounded-3xl p-6 text-white">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <div className="text-[15px] font-semibold tracking-tight">Agence « {result.agency.name} » créée</div>
              </div>
              {result.owner.temp_password ? (
                <>
                  <div className="text-[12.5px] text-stone-300 mt-3 leading-relaxed">
                    Transmets ces identifiants à ton client — le mot de passe ne sera <strong>plus jamais affiché</strong>.
                  </div>
                  <div className="mt-4 grid gap-2 text-[13.5px] font-mono bg-white/10 rounded-2xl p-4 break-all">
                    <div>{result.owner.email}</div>
                    <div className="tracking-wider">{result.owner.temp_password}</div>
                  </div>
                  <div className="mt-4">
                    <Btn icon={Copy} onClick={copyCreds}>{copied ? 'Copié ✓' : 'Copier les identifiants'}</Btn>
                  </div>
                </>
              ) : (
                <div className="text-[12.5px] text-stone-300 mt-3 leading-relaxed">
                  L'email <span className="font-mono">{result.owner.email}</span> avait déjà un compte : il a été rattaché
                  comme propriétaire de cette agence, avec son mot de passe habituel.
                </div>
              )}
            </div>
          )}

          {/* ─── Nouvelle agence ─── */}
          <div style={neu.raised} className="rounded-[28px] p-6 lg:p-7">
            <div className="text-[17px] tracking-tight mb-5" style={SERIF}>Nouvelle agence</div>
            <div className="space-y-4">
              <Field label="Nom de l'agence *">
                <Input value={form.name} onChange={set('name')} placeholder="Studio Lumière" />
              </Field>
              <Field label="Email du propriétaire *">
                <Input type="email" value={form.owner_email} onChange={set('owner_email')} placeholder="contact@studio-lumiere.fr" />
              </Field>
              <Field label="Slug (URLs & stockage)">
                <Input value={form.slug} onChange={set('slug')} placeholder={autoSlug || 'studio-lumiere'} />
              </Field>
              <Field label="Plan">
                <select value={form.plan} onChange={set('plan')} style={neu.pressedSm}
                  className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] appearance-none">
                  {Object.entries(PLAN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Métiers de la loge">
                <div className="space-y-2">
                  {METIERS.map((m) => {
                    const actif = form.universes.includes(m.value);
                    return (
                      <button key={m.value} type="button" role="switch" aria-checked={actif}
                        onClick={() => setForm(f => {
                          const dedans = f.universes.includes(m.value);
                          // Jamais zéro métier : une loge sans métier ne
                          // pourrait créer aucun espace client.
                          if (dedans && f.universes.length === 1) return f;
                          return { ...f, universes: dedans ? f.universes.filter(v => v !== m.value) : [...f.universes, m.value] };
                        })}
                        style={actif ? neu.dark : neu.pressedSm}
                        className={`w-full px-5 py-3.5 rounded-2xl flex items-center justify-between gap-3 transition ${actif ? 'text-white' : 'text-stone-700'}`}>
                        <div className="text-left min-w-0">
                          <div className="font-semibold text-[13px]">{m.label}</div>
                          <div className={`text-[10.5px] mt-0.5 ${actif ? 'text-stone-300' : 'text-stone-500'}`}>{m.hint}</div>
                        </div>
                        <div className={`w-10 h-5.5 rounded-full p-0.5 transition shrink-0 ${actif ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                          <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${actif ? 'translate-x-4' : ''}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Couleur accent">
                <div className="flex items-center gap-3">
                  <input type="color" value={form.accent_color} onChange={set('accent_color')} aria-label="Couleur accent"
                    className="w-11 h-11 rounded-xl border-0 bg-transparent cursor-pointer shrink-0" style={neu.pressedSm} />
                  <Input value={form.accent_color} onChange={set('accent_color')} className="font-mono" />
                </div>
              </Field>
              <Field label="Couleur de fond">
                <div className="flex items-center gap-3">
                  <input type="color" value={form.bg_color} onChange={set('bg_color')} aria-label="Couleur de fond"
                    className="w-11 h-11 rounded-xl border-0 bg-transparent cursor-pointer shrink-0" style={neu.pressedSm} />
                  <Input value={form.bg_color} onChange={set('bg_color')} className="font-mono" />
                </div>
              </Field>
              <Field label="Email de contact (sinon celui du propriétaire)">
                <Input type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="hello@studio-lumiere.fr" />
              </Field>
              <Field label="Logo (URL https, optionnel)">
                <Input value={form.logo_url} onChange={set('logo_url')} placeholder="https://…/logo.png" />
              </Field>
            </div>
            {error && (
              <div className="flex items-center gap-2 mt-4 text-[13px] text-rose-600">
                <AlertCircle size={15} className="shrink-0" /> {error}
              </div>
            )}
            <div className="mt-5">
              <Btn kind="dark" icon={busy ? Loader2 : Plus} onClick={submit} disabled={busy || !form.name.trim() || !form.owner_email.trim()}>
                {busy ? 'Création…' : "Créer l'agence + le compte du patron"}
              </Btn>
            </div>
          </div>

          {/* ─── Récapitulatif stockage (fondateur) ───
              Chaque octet du bucket est attribué à une agence par
              measure-storage (le contenu historique non rattaché tombe
              sur TimelessHouse). Donc : total bucket = somme des agences,
              et « ce que j'ai uploadé » = l'agence timelesshouse. */}
          {(() => {
            const list = agencies || [];
            const total = list.reduce((s, a) => s + (a.storage_used_bytes || 0), 0);
            const studio = list.find(a => a.slug === 'timelesshouse');
            const mine = studio?.storage_used_bytes || 0;
            return (
              <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 mb-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Stockage du bucket</div>
                <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 mt-3">
                  <div>
                    <div className="text-[26px] lg:text-[30px] tracking-tight leading-none" style={SERIF}>{fmtBytes(total)}</div>
                    <div className="text-[12px] text-stone-500 mt-1.5">au total · {list.length} agence{list.length > 1 ? 's' : ''}</div>
                  </div>
                  <div>
                    <div className="text-[20px] lg:text-[22px] tracking-tight leading-none" style={SERIF}>{fmtBytes(mine)}</div>
                    <div className="text-[12px] text-stone-500 mt-1.5">votre studio (TimelessHouse){studio && !studio.storage_quota_bytes ? ' · illimité' : ''}</div>
                  </div>
                </div>
                <div className="text-[11px] text-stone-400 mt-4">Mesuré chaque nuit sur Backblaze ; ajusté en direct à chaque upload.</div>
              </div>
            );
          })()}

          {/* ─── Agences existantes ─── */}
          <div className="grid sm:grid-cols-2 gap-4">
            {(agencies || []).map(a => (
              <div key={a.id} style={neu.raised} className="rounded-[28px] p-5.5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16.5px] tracking-tight truncate" style={SERIF}>{a.name}</div>
                    <div className="text-[11.5px] text-stone-400 font-mono mt-0.5 truncate">{a.slug}</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold ${a.status === 'pending' ? 'text-amber-600' : 'text-stone-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${a.active ? 'bg-emerald-500' : (a.status === 'pending' ? 'bg-amber-500' : 'bg-stone-400')}`} />
                    {a.active ? 'Active' : (a.status === 'pending' ? 'En attente' : 'Suspendue')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[12.5px] text-stone-500">
                  <span className="font-medium text-stone-700">{PLAN_LABELS[a.plan] || a.plan}</span>
                  <span>{a.clients_count} client{a.clients_count > 1 ? 's' : ''}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: a.accent_color }} />
                    <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: a.bg_color }} />
                  </span>
                </div>
                <div className="text-[12px] text-stone-500 mt-2 truncate">{(a.owners || []).join(', ') || '— pas de propriétaire —'}</div>
                {/* 💼 Métiers de la loge : ce que cette agence a le droit de
                    créer. Un métier résilié reste affiché avec sa date de fin
                    tant qu'il est utilisable — c'est justement ce qu'on veut
                    voir d'un coup d'œil depuis la console fondateur. */}
                {(METIERS_PAR_AGENCE[a.id] || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {(METIERS_PAR_AGENCE[a.id] || []).map((m) => {
                      const finit = m.status === 'cancelling' && m.valid_until;
                      return (
                        <span key={m.universe}
                          title={finit
                            ? `Résilié — utilisable jusqu'au ${new Date(m.valid_until).toLocaleDateString('fr-FR')}`
                            : (m.source === 'option' ? 'Métier ajouté en option' : "Métier compris dans l'offre")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-semibold ${
                            finit ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                          {(metierOf(m.universe) || {}).label || m.universe}
                          {m.source === 'option' && !finit && <span className="opacity-60">+</span>}
                          {finit && <span className="opacity-80">· jusqu'au {new Date(m.valid_until).toLocaleDateString('fr-FR')}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
                <StorageGauge compact storage={{ used_bytes: a.storage_used_bytes, quota_bytes: a.storage_quota_bytes }} />
                <div className="text-[11px] text-stone-400 mt-2">Créée le {new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
                {a.slug !== 'timelesshouse' && (
                  <div className="flex gap-2 mt-4 flex-wrap items-center">
                    {/* Label « bêta testeur » : ouvre à cette agence le fil
                        de discussion direct. Retirer le label referme
                        l'accès aussitôt — c'est la base qui le vérifie,
                        les messages déjà écrits restent. */}
                    {betaDispo && (
                      <Btn icon={MessageSquare}
                           kind={beta[a.id] ? 'dark' : 'soft'}
                           onClick={() => basculerBeta(a)}
                           disabled={busyBeta === a.id}>
                        {busyBeta === a.id ? '…' : (beta[a.id] ? 'Bêta testeur' : 'Passer en bêta')}
                      </Btn>
                    )}
                    {a.active ? (
                      <Btn icon={Power} onClick={() => setActive(a, false)} disabled={busyId === a.id}>
                        {busyId === a.id ? '…' : 'Suspendre'}
                      </Btn>
                    ) : (
                      <Btn kind="dark" icon={CheckCircle2} onClick={() => setActive(a, true)} disabled={busyId === a.id}>
                        {busyId === a.id ? '…' : 'Ouvrir la loge'}
                      </Btn>
                    )}
                    {/* Téléphone perdu chez un locataire : retirer sa 2FA
                        sans passer par le dashboard Supabase. La fonction
                        est scellée par platform_is_owner() — seul le
                        propriétaire de la plateforme peut appuyer ici. */}
                    <Btn icon={ShieldCheck} onClick={() => retirer2fa(a)} disabled={busy2fa === a.id}>
                      {busy2fa === a.id ? '…' : 'Retirer la 2FA'}
                    </Btn>
                    {/* Accorder / retirer des métiers à cette loge */}
                    <Btn icon={Building2}
                      kind={editMetiers === a.id ? 'dark' : 'soft'}
                      onClick={() => (editMetiers === a.id ? setEditMetiers(null) : ouvrirMetiers(a))}
                      disabled={busyMetiers && editMetiers === a.id}>
                      Métiers
                    </Btn>
                    {/* Upgrade/downgrade manuel de l'offre (sans Stripe) */}
                    <select
                      value={a.plan || 'decouverte'}
                      onChange={e => setPlan(a, e.target.value)}
                      disabled={busyId === a.id}
                      aria-label={`Offre de ${a.name}`}
                      style={neu.pressedSm}
                      className="min-h-[44px] px-3 rounded-xl bg-transparent text-[12.5px] text-stone-700"
                    >
                      {Object.entries(PLAN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
                {a.slug !== 'timelesshouse' && editMetiers === a.id && (
                  <div className="mt-3 space-y-2">
                    {METIERS.map((m) => {
                      const verrou = verrousDe(a).find((v) => v.universe === m.value);
                      const actif = verrou ? true : selMetiers.includes(m.value);
                      return (
                        <button key={m.value} type="button" disabled={!!verrou || busyMetiers}
                          role="switch" aria-checked={actif}
                          onClick={() => setSelMetiers((s) => s.includes(m.value)
                            ? s.filter((v) => v !== m.value) : [...s, m.value])}
                          style={actif ? neu.dark : neu.pressedSm}
                          className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between gap-3 transition ${actif ? 'text-white' : 'text-stone-700'} ${verrou ? 'opacity-70' : ''}`}>
                          <div className="text-left min-w-0">
                            <div className="font-semibold text-[12.5px]">{m.label}</div>
                            {verrou && (
                              <div className={`text-[10px] mt-0.5 ${actif ? 'text-stone-300' : 'text-stone-500'}`}>
                                {verrou.source === 'option'
                                  ? "Option payée — gérée par l'abonnement Stripe"
                                  : `En sursis${verrou.valid_until ? ` jusqu'au ${new Date(verrou.valid_until).toLocaleDateString('fr-FR')}` : ''}`}
                              </div>
                            )}
                          </div>
                          <div className={`w-10 h-5.5 rounded-full p-0.5 transition shrink-0 ${actif ? 'bg-emerald-400' : 'bg-stone-300'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${actif ? 'translate-x-4' : ''}`} />
                          </div>
                        </button>
                      );
                    })}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <Btn kind="dark" onClick={() => enregistrerMetiers(a)}
                        disabled={busyMetiers || (!selMetiers.length && !verrousDe(a).length)}>
                        {busyMetiers ? 'Enregistrement…' : 'Enregistrer les métiers'}
                      </Btn>
                      <Btn onClick={() => setEditMetiers(null)} disabled={busyMetiers}>Annuler</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🌳 ROOT APP
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       📖 GUIDE DE LA LOGE — pour les locataires
       S'ouvre seul à la PREMIÈRE connexion (jamais pour la plateforme),
       se referme d'un geste (HIG : un onboarding ne retient jamais
       personne), et reste rappelable par le bouton « ? » de la barre.
       Six chapitres courts, adossés au produit réel : les exemples
       utilisent la vraie adresse de l'agence connectée.
       ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       💬  CHAT BÊTA — un fil direct entre Gil et chaque locataire
       ════════════════════════════════════════════════════════════
       Réservé aux agences labellisées « bêta testeur » depuis la
       section Agences. Les fils sont cloisonnés : un locataire ne
       voit que le sien, jamais celui d'un autre — c'est la base qui
       le garantit (RLS), pas cet écran.

       L'état « lu » vit dans les métadonnées du compte plutôt qu'en
       base : ça évite une politique UPDATE sur les messages (donc
       tout risque d'écriture croisée) et ça suit l'utilisateur d'un
       appareil à l'autre. Côté Gil c'est une date par agence.

       Rafraîchissement par sondage : 10 s panneau ouvert, 60 s fermé
       (juste pour la pastille). Le temps réel Supabase ferait mieux,
       mais il demande une configuration que je ne peux pas éprouver
       d'ici — à basculer plus tard si le rythme le justifie. */
    /* `externe` (02/08/2026) : chez un LOCATAIRE bêta, le fil ne se
       déclenche plus par la bulle flottante (elle chevauchait le
       contenu, capture de Gil) mais par le bouton violet « Bêta
       testeur » posé à côté du nom de l'agence — l'état vit alors
       chez le parent, et la pastille de non-lus remonte par
       onNonLus. La plateforme (Gil) garde sa bulle : c'est sa boîte
       de réception, pas un bouton de signalement. */
    function ChatBeta({ user, estPlateforme, agencyId, agencyNom, externe = null }) {
      const [ouvertInt, setOuvertInt] = useState(false);
      const ouvert = externe ? externe.ouvert : ouvertInt;
      const setOuvert = externe ? externe.setOuvert : setOuvertInt;
      const [fils, setFils] = useState([]);          // Gil : la liste des agences
      const [filActif, setFilActif] = useState(estPlateforme ? null : agencyId);
      const [messages, setMessages] = useState([]);
      const [texte, setTexte] = useState('');
      const [envoi, setEnvoi] = useState(false);
      const [erreur, setErreur] = useState('');
      const [nonLus, setNonLus] = useState(0);
      const finRef = useRef(null);

      const monRole = estPlateforme ? 'plateforme' : 'agence';
      const roleEnFace = estPlateforme ? 'agence' : 'plateforme';

      /* ── Date de dernière lecture ─────────────────────────────── */
      const cleLu = estPlateforme ? 'laloge_chat_lu_par_agence' : 'laloge_chat_lu';
      const luLe = (aId) => {
        const m = user?.user_metadata?.[cleLu];
        return estPlateforme ? (m && m[aId]) || null : m || null;
      };
      const marquerLu = async (aId) => {
        const maintenant = new Date().toISOString();
        const m = user?.user_metadata?.[cleLu];
        const val = estPlateforme ? { ...(m || {}), [aId]: maintenant } : maintenant;
        if (user?.user_metadata) user.user_metadata[cleLu] = val;  // écho local immédiat
        try { await sb.auth.updateUser({ data: { [cleLu]: val } }); } catch (_) {}
      };

      /* ── Chargement ───────────────────────────────────────────── */
      const chargerFils = async () => {
        if (!estPlateforme) return;
        const { data, error } = await sb.rpc('beta_fils');
        if (error) return;
        const liste = (data || []).filter(f => f.beta_chat);
        setFils(liste);
        // Pastille : nombre d'agences dont le dernier message reçu est
        // postérieur à ma dernière lecture de CE fil.
        setNonLus(liste.filter(f => f.dernier_recu && (!luLe(f.agency_id) || f.dernier_recu > luLe(f.agency_id))).length);
      };

      const chargerMessages = async (aId) => {
        if (!aId) return;
        const { data, error } = await sb.from('beta_messages')
          .select('id, auteur_role, corps, created_at')
          .eq('agency_id', aId).order('created_at', { ascending: true }).limit(300);
        if (error) { setErreur(humaniseErreur(error.message, 'chat')); return; }
        setErreur('');
        setMessages(data || []);
        if (!estPlateforme) {
          const dernierRecu = [...(data || [])].reverse().find(m => m.auteur_role === roleEnFace);
          setNonLus(dernierRecu && (!luLe(aId) || dernierRecu.created_at > luLe(aId)) ? 1 : 0);
        }
      };

      // Sondage : rapide quand on regarde, lent quand le panneau dort.
      useEffect(() => {
        const tic = () => { if (estPlateforme) chargerFils(); if (filActif) chargerMessages(filActif); };
        tic();
        const id = setInterval(tic, ouvert ? 10000 : 60000);
        return () => clearInterval(id);
      }, [ouvert, filActif, estPlateforme]);

      // Toujours voir le dernier message en arrivant.
      useEffect(() => {
        if (ouvert && finRef.current) finRef.current.scrollIntoView({ block: 'end' });
      }, [messages, ouvert, filActif]);

      // Ouvrir un fil = l'avoir lu.
      useEffect(() => {
        if (ouvert && filActif) { marquerLu(filActif); setNonLus(n => (estPlateforme ? Math.max(0, n - 1) : 0)); }
      }, [ouvert, filActif]);

      // Mode commandé : le bouton violet du parent porte la pastille.
      useEffect(() => { externe?.onNonLus?.(nonLus); }, [nonLus]);

      /* ── Envoi ────────────────────────────────────────────────── */
      const envoyer = async (e) => {
        e?.preventDefault?.();
        const corps = texte.trim();
        if (!corps || envoi || !filActif) return;
        setEnvoi(true); setErreur('');
        const { error } = await sb.from('beta_messages').insert({
          agency_id: filActif, auteur_role: monRole, auteur_id: user.id, corps,
        });
        if (error) setErreur(humaniseErreur(error.message, 'chat'));
        else { setTexte(''); await chargerMessages(filActif); }
        setEnvoi(false);
      };

      // Entrée envoie, Maj+Entrée passe à la ligne — l'usage de tous
      // les messageries ; sans ça on cherche le bouton à chaque phrase.
      const auClavier = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
      };

      const heure = (iso) => new Date(iso).toLocaleString('fr-FR',
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

      const titre = estPlateforme
        ? (filActif ? (fils.find(f => f.agency_id === filActif)?.nom || 'Bêta') : 'Mes bêta-testeurs')
        : 'La Loge';

      return (
        <>
          {/* Bouton flottant — discret par défaut (Gil : « translucide,
              qui ne gêne pas »), franc dès qu'un message attend. Au-dessus
              de la barre du bas sur téléphone. */}
          {!externe && !ouvert && (
            <button onClick={() => setOuvert(true)}
              aria-label={nonLus ? `Chat bêta — ${nonLus} non lu` : 'Chat bêta'}
              title="Chat bêta"
              style={{ ...neu.raised, opacity: nonLus ? 1 : 0.45 }}
              className="fixed right-5 bottom-[92px] lg:bottom-6 z-40 w-14 h-14 rounded-full flex items-center justify-center
                         text-stone-700 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 active:scale-95">
              <MessageSquare size={20} />
              {nonLus > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white
                                 text-[11px] font-bold flex items-center justify-center">{nonLus}</span>
              )}
            </button>
          )}

          {ouvert && (
            <div role="dialog" aria-label="Chat bêta"
                 style={neu.raised}
                 className={`fixed z-40 sm:w-[380px] max-h-[70vh] rounded-[24px] flex flex-col overflow-hidden ${externe
                   ? 'left-4 right-4 sm:right-auto sm:left-[270px] top-[76px] lg:top-6'
                   : 'right-4 left-4 sm:left-auto bottom-[92px] lg:bottom-6 sm:right-5'}`}>
              {/* En-tête */}
              <div className="flex items-center gap-2 px-4 py-3 shrink-0"
                   style={{ borderBottom: '1px solid rgba(127,127,127,0.15)' }}>
                {estPlateforme && filActif && (
                  <button onClick={() => setFilActif(null)} aria-label="Tous les fils"
                          className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-900 shrink-0">
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-semibold">Bêta</div>
                  <div className="text-[14px] font-semibold truncate">{titre}</div>
                </div>
                <button onClick={() => setOuvert(false)} aria-label="Fermer le chat"
                        className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-900 shrink-0">
                  <X size={16} />
                </button>
              </div>

              {/* Gil sans fil choisi : la liste de ses testeurs */}
              {estPlateforme && !filActif ? (
                <div className="p-3 overflow-y-auto">
                  {fils.length === 0 ? (
                    <p className="text-[12.5px] text-stone-500 text-center py-8 px-4 leading-relaxed">
                      Aucun bêta-testeur pour l'instant.<br />
                      Ouvrez le chat d'une agence depuis la section « Agences ».
                    </p>
                  ) : fils.map(f => {
                    const aLire = f.dernier_recu && (!luLe(f.agency_id) || f.dernier_recu > luLe(f.agency_id));
                    return (
                      <button key={f.agency_id} onClick={() => setFilActif(f.agency_id)}
                              style={neu.raisedXs}
                              className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[56px] rounded-2xl text-left mb-2 active:scale-[0.99] transition">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-stone-800 truncate">{f.nom}</span>
                          <span className="block text-[11.5px] text-stone-500 mt-0.5">
                            {f.messages ? `${f.messages} message${f.messages > 1 ? 's' : ''}` : 'Aucun message'}
                            {f.dernier_le && ` · ${heure(f.dernier_le)}`}
                          </span>
                        </span>
                        {aLire && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" aria-label="non lu" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* Le fil */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[180px]">
                    {messages.length === 0 && (
                      <p className="text-[12.5px] text-stone-500 text-center py-8 leading-relaxed">
                        {estPlateforme
                          ? 'Rien encore. Écrivez le premier message.'
                          : <>Un souci, une idée, une contrainte&nbsp;?<br />Écrivez-nous ici, on lit tout.</>}
                      </p>
                    )}
                    {messages.map(m => {
                      const deMoi = m.auteur_role === monRole;
                      return (
                        <div key={m.id} className={`flex ${deMoi ? 'justify-end' : 'justify-start'}`}>
                          <div style={deMoi ? neu.dark : neu.pressedSm}
                               className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${deMoi ? 'text-white' : 'text-stone-800'}`}>
                            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.corps}</p>
                            <div className={`text-[10.5px] mt-1 ${deMoi ? 'text-white/60' : 'text-stone-400'}`}>{heure(m.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={finRef} />
                  </div>

                  {erreur && <p className="px-4 pb-2 text-[12px] text-rose-600">{erreur}</p>}

                  {/* Composer */}
                  <form onSubmit={envoyer} className="p-3 shrink-0 flex items-end gap-2"
                        style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                    <label htmlFor="chat-texte" className="sr-only">Votre message</label>
                    <textarea id="chat-texte" value={texte} rows={1}
                      onChange={(e) => setTexte(e.target.value)} onKeyDown={auClavier}
                      placeholder="Votre message…"
                      style={neu.pressed}
                      className="flex-1 min-w-0 rounded-2xl px-3.5 py-3 text-[13.5px] bg-transparent border-none outline-none resize-none max-h-28 placeholder:text-stone-400" />
                    <button type="submit" disabled={!texte.trim() || envoi} aria-label="Envoyer"
                            style={neu.dark}
                            className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-40 active:scale-95 transition">
                      {envoi ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </>
      );
    }

    /* ════════════════════════════════════════════════════════════
       📚  CENTRE D'AIDE — entrée par OBJECTIF, pas par fonctionnalité
       ════════════════════════════════════════════════════════════
       Le guide était un tour linéaire en six chapitres : on le lit une
       fois, à un moment où l'on n'a encore rien à faire, et on l'oublie.
       Il devient un centre d'aide consultable à tout moment, où chaque
       article répond à une question que le locataire se pose vraiment
       (« comment je livre un film ? ») plutôt que de décrire un écran.
       Cherchable : `mots` couvre le vocabulaire des gens, pas le nôtre
       (« facture » mais aussi « devis », « payé », « argent »). */
    function aideArticles() {
      const domaine = AGENCY.slug ? `${AGENCY.slug}.laloge.house` : 'votre-studio.laloge.house';
      return [
        {
          id: 'loge',
          but: 'Comprendre ma loge',
          icone: '🏠',
          resume: 'Ce que voient vos clients, et ce qu\'ils ne voient jamais.',
          mots: 'loge adresse domaine marque blanche client console différence',
          contenu: [
            ['Votre espace, votre adresse', `Vos clients entrent par ${domaine} — pas par La Loge. Ils ne voient que votre studio : votre nom, votre logo, vos couleurs.`],
            ['Deux mondes séparés', 'Cette console est la vôtre. Vos clients, eux, n\'y accèdent jamais : chacun entre dans son espace privé avec le code que vous lui remettez.'],
          ],
        },
        {
          id: 'marque',
          but: 'Mettre mon logo et mes couleurs',
          icone: '🎨',
          resume: 'Réglé une fois, appliqué partout — jusque dans vos emails.',
          mots: 'marque logo couleur charte identité nom personnaliser design réglages paramètres compte',
          contenu: [
            ['Réglez-la une fois', 'Dans « Paramètres » (en bas du menu), la carte « Ma marque » : nom affiché, logo, deux couleurs, email de contact.'],
            ['Elle s\'applique partout', 'Page de connexion, espaces clients, galeries, emails envoyés à vos clients — tout suit instantanément.'],
          ],
          action: { section: 'settings', libelle: 'Ouvrir Ma marque' },
        },
        {
          id: 'espace-client',
          but: 'Créer l\'espace d\'un client',
          icone: '👤',
          resume: 'Deux prénoms, un email — et sa clé d\'entrée.',
          mots: 'client espace créer nouveau code accès invitation clé connexion mot de passe identifiant inviter',
          contenu: [
            ['Créez l\'espace', '« Nouveau client », choisissez le type : Mariage & célébrations (livraison), Communication & Marketing (suivi complet), ou Espace neutre.'],
            ['Remettez le code', 'En haut de la fiche, la carte « Accès client » : copiez le code et le lien de connexion, envoyez-les à votre client. C\'est sa clé.'],
            ['Le plus simple', 'Le bouton « Copier l\'invitation » prépare un message complet — adresse, code, mode d\'emploi. Vous n\'avez qu\'à le coller.'],
          ],
          action: { section: 'clients', libelle: 'Aller à mes clients' },
        },
        {
          id: 'livrer',
          but: 'Livrer des photos ou un film',
          icone: '🖼️',
          resume: 'Une galerie par projet, avec son propre lien.',
          mots: 'galerie livrer photos film vidéo album partage lien code encodage mp4 envoyer client télécharger',
          contenu: [
            ['Autant de galeries que de projets', 'Dans la fiche client, « Nouvelle galerie » : photos, film ou les deux, avec un habillage selon la prestation (mariage, immobilier, mannequinat…).'],
            ['Un lien direct par galerie', 'Chaque galerie a son propre code et son propre lien de partage — vos clients (ou leurs invités) y entrent sans passer par l\'espace client. Coupez le partage quand vous voulez.'],
            ['Les vidéos s\'optimisent seules', 'Déposez votre MP4 : il est lisible aussitôt, puis la qualité s\'adapte automatiquement à la connexion de chaque spectateur.'],
          ],
        },
        {
          id: 'prevenir',
          but: 'Prévenir un client par email',
          icone: '🔔',
          resume: 'Partout la même cloche — une cloche, un email part.',
          mots: 'email prévenir notifier cloche envoyer message alerte notification mail relance rappel',
          contenu: [
            ['La cloche, partout', 'Sur un média, une facture, un document, un tournage, une galerie : l\'icône 🔔 envoie un email à votre client. C\'est toujours le même geste.'],
            ['À vos couleurs', 'L\'email part au nom de votre studio, avec votre logo, et ramène votre client chez vous — jamais chez La Loge.'],
            ['Ce qui part tout seul', 'Vous n\'avez rien à faire pour : le film prêt après encodage, la fin d\'accès (J-15 et J-3), les relances de facture impayée.'],
          ],
        },
        {
          id: 'quotidien',
          but: 'Suivre factures, documents et tournages',
          icone: '🗂️',
          resume: 'Chaque onglet de la fiche alimente l\'espace du client.',
          mots: 'facture devis payé argent document contrat tournage agenda calendrier rendez-vous validation commentaire',
          contenu: [
            ['Tout au même endroit', 'Médias livrés, factures, documents, tournages : chaque onglet de la fiche client alimente son espace en direct.'],
            ['Validation et échanges', 'Vos clients approuvent ou commentent les médias depuis leur espace — vous le voyez ici immédiatement.'],
            ['Vos revenus, si vous voulez', 'L\'onglet « Revenus » calcule votre chiffre d\'affaires, vos cotisations URSSAF et une estimation d\'impôt à partir des factures que vous passez en « payée ». Il est facultatif.'],
          ],
        },
        {
          id: 'offre',
          but: 'Gérer mon offre et mon stockage',
          icone: '⭐',
          resume: 'Où vous en êtes, et comment changer d\'offre.',
          mots: 'offre abonnement plan stockage quota go payer résilier désabonner facture prix réglages paramètres arrêter',
          contenu: [
            ['Où vous en êtes', 'La Vue d\'ensemble affiche votre stockage ; votre abonnement vit dans « Paramètres ». L\'offre Découverte : 1 espace client, 3 Go, accès 90 jours.'],
            ['Évoluer quand vous voulez', 'Le passage à une offre supérieure — ou la résiliation — se fait dans « Paramètres », carte Abonnement. Sans engagement.'],
          ],
          action: { section: 'settings', libelle: 'Ouvrir Paramètres' },
        },
      ];
    }

    /* Centre d'aide : liste d'objectifs + recherche + article.
       Remplace le tour linéaire — on entre par ce qu'on cherche, on
       ressort quand on a trouvé, et le bouton d'action emmène à
       l'écran concerné plutôt que de le décrire. */
    function CentreAide({ onClose, onAller }) {
      const articles = aideArticles();
      const [q, setQ] = useState('');
      const [ouvert, setOuvert] = useState(null);   // id de l'article lu
      const art = ouvert ? articles.find(a => a.id === ouvert) : null;

      // Recherche mot à mot, accents et casse ignorés. Un `includes` sur
      // la phrase entière échouait sur « code client » : les deux mots
      // existent, mais pas côte à côte — or c'est exactement ainsi qu'on
      // tape dans une barre de recherche.
      // …et on ignore les mots-outils : beaucoup de gens tapent une
      // question entière (« où est mon logo ? ») plutôt qu'un mot-clé.
      // (écrits SANS accent : la comparaison se fait sur le texte normalisé)
      const VIDES = new Set(['ou', 'est', 'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du',
        'mon', 'ma', 'mes', 'je', 'comment', 'que', 'qui', 'quoi', 'pour', 'a', 'au', 'aux',
        'en', 'et', 'sur', 'dans', 'avec', 'faire', 'peux', 'puis',
        // verbes d'intention : ils disent l'envie, jamais le sujet
        'changer', 'modifier', 'mettre', 'trouver', 'voir', 'regler', 'ajouter', 'utiliser']);
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const mots = norm(q).replace(/[?!.,;:]/g, ' ').split(/\s+/).filter(m => m && !VIDES.has(m));
      // Pluriel toléré : on écrit « couleur » dans les mots-clés, les gens
      // tapent « couleurs » — et `includes` ne va que dans un sens.
      const trouve = (foin, m) => foin.includes(m) || (m.endsWith('s') && foin.includes(m.slice(0, -1)));
      const filtres = mots.length
        ? articles.filter(a => {
            const foin = norm(`${a.but} ${a.resume} ${a.mots}`);
            return mots.every(m => trouve(foin, m));
          })
        : articles;

      return (
        <Modal
          title={art ? art.but : 'Centre d\'aide'}
          kicker={art ? 'Aide' : 'Que voulez-vous faire ?'}
          onClose={onClose}
          size="lg">

          {art ? (
            <div>
              <div className="space-y-4">
                {art.contenu.map(([t, p]) => (
                  <div key={t}>
                    <div className="text-[14px] font-bold">{t}</div>
                    <p className="text-[13.5px] text-stone-600 leading-relaxed mt-1">{p}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 mt-6 pt-4 flex-wrap"
                   style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                <Btn icon={ArrowLeft} onClick={() => setOuvert(null)}>Toutes les aides</Btn>
                {art.action && (
                  <Btn kind="dark" icon={ArrowUpRight}
                       onClick={() => { onAller(art.action.section); onClose(); }}>
                    {art.action.libelle}
                  </Btn>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="aide-q" className="sr-only">Rechercher dans l'aide</label>
              <div style={neu.pressed} className="rounded-full flex items-center gap-2.5 px-4 mb-4">
                <Search size={16} className="text-stone-400 shrink-0" aria-hidden="true" />
                <input id="aide-q" value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Chercher — « facture », « logo », « livrer un film »…"
                       className="flex-1 bg-transparent border-none outline-none py-3 min-h-[44px] text-[13.5px] placeholder:text-stone-400" />
                {q && (
                  <button onClick={() => setQ('')} aria-label="Effacer la recherche"
                          className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-800 shrink-0">
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {filtres.map(a => (
                  <button key={a.id} onClick={() => setOuvert(a.id)} style={neu.raisedXs}
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[60px] rounded-2xl text-left active:scale-[0.99] transition">
                    <span aria-hidden="true" className="text-[20px] shrink-0">{a.icone}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-stone-800">{a.but}</span>
                      <span className="block text-[12px] text-stone-500 mt-0.5">{a.resume}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-stone-400" />
                  </button>
                ))}
                {filtres.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-[13.5px] text-stone-500">Rien trouvé pour « {q} ».</p>
                    <p className="text-[12.5px] text-stone-400 mt-2">
                      Écrivez-nous : <a href="mailto:service@timelesshouse.org" className="underline">service@timelesshouse.org</a>
                    </p>
                  </div>
                )}
              </div>

              <p className="text-[12px] text-stone-400 text-center mt-5 pt-4"
                 style={{ borderTop: '1px solid rgba(127,127,127,0.15)' }}>
                Une question qui n'est pas là ?{' '}
                <a href="mailto:service@timelesshouse.org" className="underline">Écrivez-nous</a>.
              </p>
            </div>
          )}
        </Modal>
      );
    }

    function App() {
      const [isDark] = useDarkMode();
      // Reassign the module-level mutable neu pointer.
      // Thème clair : la palette de la LOGE si elle a personnalisé sa
      // marque ; thème sombre : le graphite maison, toujours.
      neu = isDark ? NEU_DARK : (NEU_TENANT || NEU_LIGHT);
      // Le fond du document suit (zones d'overscroll, derrière les coins).
      useEffect(() => {
        document.body.style.backgroundColor = isDark ? '' : neu.base.backgroundColor;
        return () => { document.body.style.backgroundColor = ''; };
      }, [isDark, neu]);

      const [user, setUser] = useState(undefined); // undefined = checking, null = logged out, object = logged in
      // Retour de Stripe Checkout (?abonnement=ok|annule) : on ouvre
      // directement Paramètres, où vit désormais la carte Abonnement.
      const [section, setSection] = useState(() =>
        new URLSearchParams(window.location.search).get('abonnement') ? 'settings' : 'clients');
      const [selectedClient, setSelectedClient] = useState(null);
      const [clients, setClients] = useState([]);
      const [overviewData, setOverviewData] = useState({ totalMedia: 0, totalRevenue: 0, upcomingShoots: 0 });
      // null = pas propriétaire de la plateforme (section Agences masquée)
      const [agencies, setAgencies] = useState(null);
      const [featuresReady, setFeaturesReady] = useState(false);
      const [myAgency, setMyAgency] = useState(null);
      const [showGuide, setShowGuide] = useState(false);

      // Astuces contextuelles : on recharge celles déjà refermées AVANT
      // le premier rendu utile, sinon une astuce comprise il y a un mois
      // réapparaîtrait à chaque connexion.
      useEffect(() => {
        if (!user) return;
        ASTUCES_VUES = new Set(user.user_metadata?.laloge_astuces || []);
      }, [user]);

      // Aide : s'ouvre SEULE à la PREMIÈRE connexion d'un locataire
      // (jamais pour la plateforme), puis plus jamais, sur aucun
      // appareil — le « vu » est écrit dans les métadonnées du COMPTE
      // Supabase dès l'ouverture automatique ; localStorage ne sert
      // que de cache local. Réouverture à la demande via « Aide ».
      useEffect(() => {
        if (!featuresReady || FEATURES.allUniverses || !user) return;
        if (user.user_metadata?.laloge_guide_vu) return;
        const cle = `laloge-guide-vu:${user.id}`;
        try { if (localStorage.getItem(cle)) return; } catch (_) {}
        setShowGuide(true);
        // Marqué « vu » dès maintenant : l'ouverture automatique est unique.
        try { localStorage.setItem(cle, '1'); } catch (_) {}
        sb.auth.updateUser({ data: { laloge_guide_vu: true } }).catch(() => {});
      }, [featuresReady, user]);

      const fermerGuide = () => {
        setShowGuide(false);
        try { if (user) localStorage.setItem(`laloge-guide-vu:${user.id}`, '1'); } catch (_) {}
      };

      /* Une session n'ouvre la console que si la double vérification est
         SATISFAITE : l'événement de connexion arrive dès le mot de passe,
         AVANT le code à 6 chiffres — sans cette garde, il court-circuitait
         l'étape. Un échec de l'API MFA (réseau, option désactivée côté
         Supabase) ne mure jamais la porte : on laisse passer, comme avant
         la fonctionnalité. */
      const [mfaEnAttente, setMfaEnAttente] = useState(false);
      const poserSession = async (session) => {
        if (!session?.user) { setMfaEnAttente(false); setUser(null); return; }
        try {
          const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
            setMfaEnAttente(true); setUser(null); return;
          }
        } catch (_) {}
        setMfaEnAttente(false);
        setUser(session.user);
      };

      // Vérification session au mount
      useEffect(() => {
        sb.auth.getSession().then(({ data }) => {
          if (data.session) poserSession(data.session); else setUser(null);
        });
        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
          poserSession(session);
        });
        return () => sub.subscription.unsubscribe();
      }, []);

      const loadClients = async () => {
        const { data } = await sb.from('clients').select('*').order('created_at', { ascending: false });
        setClients(data || []);
      };

      const loadOverview = async () => {
        const [m, i, s, st, ag] = await Promise.all([
          sb.from('media').select('id', { count: 'exact', head: true }),
          sb.from('invoices').select('amount'),
          sb.from('shoots').select('id', { count: 'exact', head: true }),
          sb.rpc('my_agency_storage'),
          sb.from('agencies').select('plan, subscription_status, stripe_subscription_id, billing_interval').limit(1).maybeSingle(),
        ]);
        const totalRevenue = (i.data || []).reduce((a, b) => a + parseFloat(b.amount || 0), 0);
        setOverviewData({
          totalMedia: m.count || 0,
          totalRevenue,
          upcomingShoots: s.count || 0,
          storage: st.data || null,
          billing: ag.data || null,
        });
      };

      // Section Agences (SaaS B.3) : la RPC échoue pour quiconque n'est pas
      // owner de l'agence plateforme → la section reste simplement masquée.
      const loadAgencies = async () => {
        const { data, error } = await sb.rpc('platform_list_agencies');
        // Métiers de chaque agence : requête à part (la table n'existe pas
        // tant que la migration n'est pas lancée — au pire, pas de label).
        try {
          const { data: mets } = await sb
            .from('agency_universes')
            .select('agency_id, universe, source, status, valid_until');
          Object.keys(METIERS_PAR_AGENCE).forEach(k => delete METIERS_PAR_AGENCE[k]);
          (mets || []).forEach((m) => {
            (METIERS_PAR_AGENCE[m.agency_id] = METIERS_PAR_AGENCE[m.agency_id] || []).push(m);
          });
        } catch (_) { /* pas de label, rien de cassé */ }
        setAgencies(error ? null : (data || []));
      };

      // Fonctionnalités de MON agence (RLS : je ne vois que la mienne).
      // Renseigne FEATURES avant le premier rendu des sections.
      const loadFeatures = async () => {
        /* ⚠️ `beta_chat` est demandée à part. PostgREST rejette TOUTE la
           requête si une seule colonne lui est inconnue : demandée dans
           le select principal, elle ferait échouer le chargement de
           l'agence — donc plus de marque, plus de plan, plus de
           fonctionnalités — chez tous les locataires tant que la
           migration du chat n'est pas appliquée. Ici, au pire, le chat
           n'apparaît pas. */
        const CHAMPS = 'id, name, slug, active, status, plan, contact_email, logo_url, accent_color, bg_color, features_analytics, features_portfolio, features_all_universes';
        const { data } = await sb.from('agencies').select(CHAMPS).limit(1).maybeSingle();
        FEATURES.analytics    = data?.features_analytics === true;
        FEATURES.portfolio    = data?.features_portfolio === true;
        FEATURES.allUniverses = data?.features_all_universes === true;
        AGENCY.id   = data?.id || null;
        AGENCY.slug = data?.slug || null;
        try {
          const { data: b } = await sb.from('agencies').select('beta_chat').limit(1).maybeSingle();
          AGENCY.betaChat = b?.beta_chat === true;
        } catch (_) { AGENCY.betaChat = false; }
        AGENCY.name = data?.name || null;
        AGENCY.plan = data?.plan || null;
        // Limites de l'offre (brique 17) : l'offre Découverte plafonne à
        // 1 espace client. On les lit ici pour PRÉVENIR dans l'interface
        // plutôt que de laisser l'admin buter sur une erreur de base.
        try {
          const { data: lim } = await sb.rpc('plan_limits', { p_plan: data?.plan || '' });
          AGENCY.maxClients = lim?.max_clients ?? null;
        } catch (_) { AGENCY.maxClients = null; }
        /* 💼 Métiers de l'agence — requête SÉPARÉE, exprès : la table
           `agency_universes` n'existe pas tant que la migration n'est pas
           lancée. Dans le select principal, elle ferait tomber TOUTE la
           console (plus de marque, plus de plan) chez tous les locataires.
           Ici, au pire, on ne bride rien — le comportement d'avant.
           Un métier résilié reste utilisable jusqu'à son échéance. */
        try {
          const { data: mets } = await sb
            .from('agency_universes')
            .select('universe, source, status, valid_until');
          MES_METIERS.length = 0;
          MES_METIERS_DETAIL.length = 0;
          (mets || []).forEach((m) => {
            const encoreValide = m.status === 'active'
              || (m.status === 'cancelling' && m.valid_until && new Date(m.valid_until) > new Date());
            MES_METIERS_DETAIL.push(m);
            if (encoreValide) MES_METIERS.push(m.universe);
          });
        } catch (_) { MES_METIERS.length = 0; MES_METIERS_DETAIL.length = 0; }
        /* 👤 Mon rôle — même prudence : la RPC peut ne pas exister
           (migration comm non lancée), et un échec ne bride rien. */
        try {
          const { data: eq } = await sb.rpc('equipe_agence');
          const moiEq = (eq || []).find((m) => m.user_id === user?.id);
          MON_ROLE.value = moiEq?.role || null;
          MES_PRIVILEGES.length = 0;
          (Array.isArray(moiEq?.privileges) ? moiEq.privileges : []).forEach((p) => MES_PRIVILEGES.push(p));
        } catch (_) { MON_ROLE.value = null; MES_PRIVILEGES.length = 0; }
        // La console prend les couleurs de la loge (jamais la plateforme).
        NEU_TENANT = paletteDepuisMarque(data?.bg_color, data?.accent_color, data?.slug);
        setMyAgency(data || null);
        // Titre de l'onglet : le studio, pas nous. L'onglet du navigateur
        // affichait « TimelessHouse — Admin » chez tous les locataires.
        if (data?.name) document.title = `${data.name} — Admin`;
        setFeaturesReady(true);
      };

      useEffect(() => {
        if (user) {
          loadClients();
          loadOverview();
          loadAgencies();
          loadFeatures();
        }
      }, [user]);

      // Le Portfolio est un outil de la plateforme : si l'agence n'y a pas
      // droit, on ne laisse pas la section ouverte (lien direct, retour…)
      useEffect(() => {
        if (featuresReady && section === 'portfolio' && !FEATURES.portfolio) setSection('overview');
      }, [featuresReady, section]);

      /* 🟣 Fil bêta d'un locataire : ouvert/fermé et non-lus vivent
         ici — le bouton violet (menu + en-tête mobile) et le panneau
         partagent le même état. */
      const [betaOuvert, setBetaOuvert] = useState(false);
      const [betaNonLus, setBetaNonLus] = useState(0);

      /* 🔴 Messages non lus — la pastille sur l'onglet. Sans elle, un
         message reçu ne se voyait qu'en OUVRANT Messages : le même
         défaut que l'agenda avant les rappels. Même arithmétique que
         l'onglet lui-même (fils × dernière lecture en métadonnées),
         nourrie par sondage 30 s + Realtime, et rafraîchie par
         l'onglet quand il marque un fil comme lu. */
      const [nonLusMsg, setNonLusMsg] = useState(0);
      const chargerNonLus = async () => {
        if (!(MES_METIERS.includes('communication') || FEATURES.allUniverses)) { setNonLusMsg(0); return; }
        try {
          const { data } = await sb.from('team_messages')
            .select('auteur_id, dest_id, created_at')
            .order('created_at', { ascending: false }).limit(300);
          const lus = user?.user_metadata?.laloge_equipe_lu || {};
          let n = 0;
          (data || []).forEach((m) => {
            if (m.auteur_id === user?.id) return;
            const k = m.dest_id == null ? 'equipe' : m.auteur_id;
            if (!lus[k] || m.created_at > lus[k]) n++;
          });
          setNonLusMsg(n);
        } catch (_) { setNonLusMsg(0); }
      };
      useEffect(() => {
        if (!user || !featuresReady) return;
        chargerNonLus();
        const id = setInterval(chargerNonLus, 30000);
        let canal = null;
        try {
          canal = sb.channel('badge-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, chargerNonLus)
            .subscribe();
        } catch (_) {}
        return () => { clearInterval(id); if (canal) sb.removeChannel(canal); };
      }, [user, featuresReady]);

      /* Un « membre » n'atterrit jamais sur un écran qui ne le regarde
         pas : son monde, c'est l'agenda, l'équipe (ses tâches), les
         messages, ses réglages de compte — et les clients si le
         privilège lui est accordé. Tout le reste ramène à l'agenda. */
      useEffect(() => {
        if (!featuresReady || MON_ROLE.value !== 'membre') return;
        const permis = new Set(['agenda', 'taches', 'equipe', 'messages', 'drive', 'settings',
          ...(MES_PRIVILEGES.includes('clients') ? ['clients'] : [])]);
        if (!permis.has(section)) setSection('agenda');
      }, [featuresReady, section]);

      const logout = async () => { await sb.auth.signOut(); };

      if (user === undefined) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-stone-400" size={28} /></div>;
      }

      if (!user) return <LoginScreen onLogin={setUser} mfaSession={mfaEnAttente} />;

      // Loge en attente de validation (SaaS B.3) : au-delà du seuil
      // d'inscriptions automatiques, l'agence est inactive tant que la
      // plateforme ne l'a pas ouverte — et ne peut rien écrire (RLS).
      if (featuresReady && myAgency && myAgency.active === false) {
        return <PendingScreen agency={myAgency} onLogout={logout} />;
      }

      /* ⚠️ CHAQUE section du menu DOIT avoir son entrée ici : l'en-tête
         lisait `titles[section].t` sans filet, et l'Agenda (ajouté au
         menu sans son titre) blanchissait TOUTE la console d'un clic —
         trouvé par Gil le 01/08/2026 sur VisonMike. L'accès est
         désormais défensif en plus : une entrée oubliée coûte un titre
         vide, plus jamais l'écran. */
      const titles = {
        overview: { t: `Bonjour`, s: 'Vue d\'ensemble de votre studio.' },
        clients:  { t: 'Mes clients', s: 'Tous les espaces que vous avez créés.' },
        agenda:   { t: 'Agenda', s: 'Ce que vous tournez et ce qui sort, sur la même grille.' },
        equipe:   { t: 'Équipe', s: 'Vos coéquipiers, leurs rôles et leurs tâches.' },
        taches:   { t: 'Mes tâches', s: 'Tout ce qui vous est confié, et où ça en est.' },
        messages: { t: 'Messages', s: 'Le fil de l’équipe, et vos conversations privées.' },
        drive:    { t: 'Drive', s: 'Le disque commun de l’équipe : déposez, rangez, retrouvez.' },
        portfolio:{ t: 'Portfolio', s: 'Vitrine et espaces de prospection.' },
        agences:  { t: 'Agences', s: 'Les locataires de votre plateforme marque blanche.' },
        settings: { t: 'Paramètres', s: 'Votre marque, votre abonnement et la sécurité de votre compte.' },
        revenus:  { t: 'Revenus', s: 'Votre chiffre d\'affaires, vos cotisations et votre impôt — estimés depuis vos factures payées.' },
      };

      return (
        <div className="min-h-screen w-full" style={neu.base}>
          {/* Header mobile — glass blur iOS-style */}
          <header
            className="lg:hidden flex items-center justify-between px-5 py-3.5 sticky top-0 z-30"
            style={{
              backgroundColor: isDark ? 'rgba(34,38,45,0.85)' : hexVersRgba(neu.raised.backgroundColor, 0.85),
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              borderBottom: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.06)',
            }}>
            <div className="min-w-0">
              {/* Même règle qu'en barre latérale : l'en-tête mobile porte le
                  nom du studio connecté, jamais le nôtre. */}
              <div className="text-[19px] tracking-tight leading-none truncate" style={{ ...SERIF, fontStyle: 'italic' }}>
                {myAgency?.name || 'Ma loge'}<span className="text-stone-400">.</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400 font-medium">Admin</span>
                {featuresReady && !FEATURES.allUniverses && AGENCY.betaChat && MON_ROLE.value !== 'membre' && (
                  <button type="button" onClick={() => setBetaOuvert((o) => !o)}
                    aria-expanded={betaOuvert}
                    aria-label={betaNonLus ? `Bêta testeur — ${betaNonLus} message(s) non lu(s)` : 'Bêta testeur — écrire à La Loge'}
                    style={{ background: '#7c3aed', color: '#ffffff' }}
                    className="tap-ext min-h-[32px] px-2.5 rounded-full text-[9.5px] font-bold uppercase tracking-[0.08em] inline-flex items-center gap-1 active:scale-95 transition-transform shrink-0">
                    Bêta testeur
                    {betaNonLus > 0 && (
                      <span className="min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: '#ffffff', color: '#7c3aed' }}>{betaNonLus}</span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center shrink-0">
              <button onClick={() => { setSection('settings'); setSelectedClient(null); }} aria-label="Paramètres" title="Paramètres" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <Settings size={16} />
              </button>
              {featuresReady && !FEATURES.allUniverses && (
                <button onClick={() => setShowGuide(true)} aria-label="Aide" title="Aide" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                  <HelpCircle size={16} />
                </button>
              )}
              <a href="/app" aria-label="Espace client" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <Eye size={16} />
              </a>
              <button onClick={logout} aria-label="Déconnexion" title="Déconnexion" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <div className="flex gap-5 px-4 pb-28 lg:p-5 lg:pb-5 min-h-screen">
            {/* Sidebar — desktop uniquement */}
            {/* `dvh` et non `vh` : sur iPad, 100vh compte les barres de
                Safari repliées — la carte dépassait l'écran. Et le menu
                DÉFILE dans sa carte quand il manque de place : huit
                onglets plus le pied, sur un écran bas, débordaient du
                fond arrondi (capture de Gil du 02/08). */}
            <aside style={neu.raised} className="hidden lg:flex w-[230px] h-[calc(100dvh-40px)] sticky top-5 flex-col rounded-[32px] p-5 shrink-0 overflow-y-auto overscroll-contain">
              <div className="px-2 pt-2 pb-6">
                {/* MARQUE BLANCHE : le nom du STUDIO connecté, jamais le nôtre.
                    Un locataire lisait « TimelessHouse » dans sa propre console
                    — la fuite exacte qu'on traque partout ailleurs. */}
                <div className="text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
                  {myAgency?.name || 'Ma loge'}<span className="text-stone-400">.</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mt-1.5 font-medium">Espace agence</div>
                {/* Bêta testeur : le fil de signalement vers La Loge —
                    violet assumé (5,7:1 sous blanc, couleurs en dur pour
                    échapper aux bascules du thème sombre). */}
                {featuresReady && !FEATURES.allUniverses && AGENCY.betaChat && MON_ROLE.value !== 'membre' && (
                  <button type="button" onClick={() => setBetaOuvert((o) => !o)}
                    aria-expanded={betaOuvert}
                    aria-label={betaNonLus ? `Bêta testeur — ${betaNonLus} message(s) non lu(s)` : 'Bêta testeur — écrire à La Loge'}
                    style={{ background: '#7c3aed', color: '#ffffff' }}
                    className="tap-ext mt-2.5 min-h-[32px] px-3 rounded-full text-[10.5px] font-bold uppercase tracking-[0.1em] inline-flex items-center gap-1.5 active:scale-95 transition-transform">
                    <MessageSquare size={11} /> Bêta testeur
                    {betaNonLus > 0 && (
                      <span className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9.5px] font-bold"
                        style={{ background: '#ffffff', color: '#7c3aed' }}>{betaNonLus}</span>
                    )}
                  </button>
                )}
              </div>

              <nav className="flex flex-col gap-1.5">
                {[
                  /* Le RANG PLANCHER (membre sans privilège) ne voit que
                     l'agenda, l'équipe (ses tâches) et les messages — la
                     vue d'ensemble et les clients sont des affaires de
                     studio, ou un privilège accordé. */
                  ...(MON_ROLE.value === 'membre' ? [] : [{ id: 'overview', icon: Home, label: 'Vue d\'ensemble' }]),
                  ...(MON_ROLE.value === 'membre' && !MES_PRIVILEGES.includes('clients')
                    ? [] : [{ id: 'clients', icon: Users, label: 'Clients' }]),
                  /* L'agenda est l'outil du métier Communication & Marketing :
                     il n'a rien à faire chez un photographe de mariage.
                     FEATURES.allUniverses = la plateforme, qui voit tout. */
                  ...(MES_METIERS.includes('communication') || FEATURES.allUniverses
                    ? [{ id: 'agenda', icon: CalendarIcon, label: 'Agenda' },
                       /* L'onglet du MEMBRE : ses tâches en un seul
                          endroit (demande de Gil) — le patron garde
                          les siennes dans Équipe, avec la gestion. */
                       ...(MON_ROLE.value === 'membre'
                         ? [{ id: 'taches', icon: ClipboardList, label: 'Mes tâches' }] : []),
                       { id: 'equipe', icon: UsersRound, label: 'Équipe' },
                       { id: 'messages', icon: MessageSquare, label: 'Messages' },
                       { id: 'drive', icon: FolderOpen, label: 'Drive' }] : []),
                  /* Les Revenus ne regardent pas un « membre » (cadreur,
                     monteur…) : c'est la comptabilité du studio. */
                  ...(MON_ROLE.value === 'membre' ? [] : [{ id: 'revenus', icon: TrendingUp, label: 'Revenus' }]),
                  ...(FEATURES.portfolio ? [{ id: 'portfolio', icon: ImageIcon, label: 'Portfolio' }] : []),
                  ...(agencies !== null ? [{ id: 'agences', icon: Building2, label: 'Agences' }] : []),
                ].map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setSection(n.id); setSelectedClient(null); }}
                    style={section === n.id && !selectedClient ? neu.pressedSm : {}}
                    className={`th-onglet w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-left ${section === n.id && !selectedClient ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                    <n.icon size={18} /> <span className="text-[14px] font-medium tracking-tight">{n.label}</span>
                    {n.id === 'messages' && nonLusMsg > 0 && (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10.5px] font-bold flex items-center justify-center">
                        {nonLusMsg > 99 ? '99+' : nonLusMsg}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div style={neu.dark} className="rounded-3xl p-5 text-white mt-6">
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Connecté</div>
                <div className="text-[12.5px] mt-1.5 truncate">{user.email}</div>
              </div>

              <div className="mt-auto pt-4 space-y-1">
                <button
                  onClick={() => { setSection('settings'); setSelectedClient(null); }}
                  style={section === 'settings' && !selectedClient ? neu.pressedSm : {}}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl transition ${section === 'settings' && !selectedClient ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                  <Settings size={18} /> <span className="text-[14px] font-medium tracking-tight">Paramètres</span>
                </button>
                {featuresReady && !FEATURES.allUniverses && (
                  <button onClick={() => setShowGuide(true)} className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-stone-500 hover:text-stone-800 transition">
                    <HelpCircle size={18} /> <span className="text-[14px] font-medium tracking-tight">Aide</span>
                  </button>
                )}
                <a href="/app" className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-stone-500 hover:text-stone-800 transition">
                  <Eye size={18} /> <span className="text-[14px] font-medium tracking-tight">Espace client</span>
                </a>
                <button onClick={logout} className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-stone-500 hover:text-stone-800 transition">
                  <LogOut size={18} /> <span className="text-[14px] font-medium tracking-tight">Déconnexion</span>
                </button>
              </div>
            </aside>

            {/* Main */}
            {/* `key` : changer de section REMONTE la vue, ce qui rejoue
                l'animation d'entrée. Sans elle, React réutiliserait le
                nœud et le passage d'un écran à l'autre resterait muet —
                on ne saurait pas qu'il s'est passé quelque chose. */}
            <main key={`${section}:${selectedClient?.id || ''}`} className="th-vue flex-1 min-w-0">
              {!selectedClient && (
                <div className="mb-6 lg:mb-8 pt-4 lg:pt-0">
                  <h1 className="text-[28px] lg:text-[34px] tracking-tight leading-[1.05]" style={SERIF}>{titles[section]?.t || ''}</h1>
                  <div className="text-[13px] text-stone-500 mt-1.5 leading-relaxed">{titles[section]?.s || ''}</div>
                </div>
              )}

              {selectedClient ? (
                <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} refresh={() => { loadClients(); loadOverview(); }} />
              ) : section === 'overview' ? (
                <Overview clients={clients} {...overviewData} agency={myAgency} refreshBrand={loadFeatures} />
              ) : section === 'settings' ? (
                <SettingsView billing={overviewData.billing} agency={myAgency} refreshBrand={loadFeatures} />
              ) : section === 'agenda' ? (
                <AgendaTab clients={clients} />
              ) : section === 'equipe' ? (
                <EquipeTab clients={clients} user={user} />
              ) : section === 'taches' ? (
                <MesTachesTab clients={clients} />
              ) : section === 'messages' ? (
                <MessagesTab user={user} onLu={chargerNonLus} />
              ) : section === 'drive' ? (
                <DriveTab clients={clients} />
              ) : section === 'revenus' ? (
                <RevenusTab user={user} onClients={() => setSection('clients')} />
              ) : section === 'portfolio' && FEATURES.portfolio ? (
                <AdminPortfolio sb={sb} neu={neu} SERIF={SERIF} isDark={isDark} />
              ) : section === 'agences' && agencies !== null ? (
                <AdminAgencies agencies={agencies} refresh={loadAgencies} />
              ) : (
                <ClientsList clients={clients} onSelect={setSelectedClient} refresh={loadClients}
                  checklist={featuresReady && !FEATURES.allUniverses
                    ? { agency: myAgency, user, gotoSettings: () => setSection('settings') }
                    : null} />
              )}
            </main>
          </div>

          {/* Centre d'aide — première connexion d'un locataire, ou bouton « ? ».
              `onAller` permet à un article d'emmener à l'écran concerné :
              montrer vaut mieux que décrire. */}
          {showGuide && <CentreAide onClose={fermerGuide} onAller={setSection} />}

          {/* Chat bêta — Gil le voit toujours (c'est sa boîte de réception) ;
              un locataire seulement s'il est labellisé bêta-testeur. */}
          {/* Le fil bêta parle À LA PLATEFORME au nom de l'agence : une
              affaire d'owner/admin, pas d'un membre (audit 01/08/2026 —
              la bulle apparaissait chez le plancher, capture de Gil). */}
          {featuresReady && user && (FEATURES.allUniverses
            ? agencies !== null
            : AGENCY.betaChat && MON_ROLE.value !== 'membre') && (
            <ChatBeta user={user} estPlateforme={agencies !== null}
                      agencyId={AGENCY.id} agencyNom={AGENCY.name}
                      externe={agencies !== null ? null
                        : { ouvert: betaOuvert, setOuvert: setBetaOuvert, onNonLus: setBetaNonLus }} />
          )}

          {/* Bottom nav — mobile uniquement, 52px tactile, verre dépoli translucide */}
          {(() => {
            const onglets = [
              ...(MON_ROLE.value === 'membre' ? [] : [{ id: 'overview', icon: Home, label: 'Aperçu' }]),
              ...(MON_ROLE.value === 'membre' && !MES_PRIVILEGES.includes('clients')
                ? [] : [{ id: 'clients', icon: Users, label: 'Clients' }]),
              /* Même condition que le menu desktop : l'agenda éditorial
                 n'existe que pour le métier Communication. Oublié ici à
                 sa naissance — un locataire Communication sur téléphone
                 n'avait AUCUN chemin vers son agenda.
                 SUR LA PLATEFORME (Portfolio + Agences déjà là), Équipe
                 et Messages restent au menu desktop : huit onglets
                 feraient des cibles sous les 44 px du HIG. */
              ...(MES_METIERS.includes('communication') || FEATURES.allUniverses
                ? [{ id: 'agenda', icon: CalendarIcon, label: 'Agenda' },
                   ...(agencies !== null ? [] : [
                     ...(MON_ROLE.value === 'membre'
                       ? [{ id: 'taches', icon: ClipboardList, label: 'Tâches' }] : []),
                     { id: 'equipe', icon: UsersRound, label: 'Équipe' },
                     { id: 'messages', icon: MessageSquare, label: 'Messages' },
                     /* 7 onglets locataire : 46,7 px la cible — au-dessus
                        du plancher HIG de 44 px, vérifié au calcul. */
                     { id: 'drive', icon: FolderOpen, label: 'Drive' },
                   ])] : []),
              ...(MON_ROLE.value === 'membre' ? [] : [{ id: 'revenus', icon: TrendingUp, label: 'Revenus' }]),
              ...(FEATURES.portfolio ? [{ id: 'portfolio', icon: ImageIcon, label: 'Portfolio' }] : []),
              ...(agencies !== null ? [{ id: 'agences', icon: Building2, label: 'Agences' }] : []),
            ];
            const actif = selectedClient ? -1 : onglets.findIndex(o => o.id === section);
            return (
              /* PAS de `relative` sur la barre : `fixed` la positionne DÉJÀ,
                 et suffit donc à ancrer la pastille absolue. En ajouter un
                 second mettait deux utilitaires de position dans la même
                 couche — `relative` l'emportait, la barre perdait son
                 ancrage à l'écran et retombait en bas du document
                 (constaté par Gil sur téléphone). */
              <nav
                className="lg:hidden fixed bottom-4 left-4 right-4 z-30 rounded-[28px] px-2 py-2 flex items-center justify-around"
                style={{
                  boxShadow: neu.raised.boxShadow,
                  background: isDark ? 'rgba(34,38,45,0.5)' : hexVersRgba(neu.raised.backgroundColor, 0.5),
                  border: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(255,255,255,0.55)',
                  backdropFilter: 'saturate(180%) blur(22px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(22px)',
                }}>
                {/* UNE seule pastille, qui GLISSE d'un onglet à l'autre.
                    Avant, chaque bouton faisait apparaître et disparaître la
                    sienne : deux fondus croisés, sans continuité — d'où le
                    passage « brut » signalé par Gil, qu'allonger la durée ne
                    faisait qu'étirer en flou gris.
                    Les boutons étant tous `flex-1`, ils ont la même largeur :
                    le déplacement se fait donc en `translateX` pur, sans
                    animer ni largeur ni position — composité, à 60 fps. */}
                <div
                  aria-hidden="true"
                  className="th-indicateur absolute rounded-2xl pointer-events-none"
                  style={{
                    ...neu.darkSm,
                    top: 8, bottom: 8, left: 8,
                    width: `calc((100% - 16px) / ${onglets.length})`,
                    transform: `translateX(${Math.max(actif, 0) * 100}%)`,
                    opacity: actif < 0 ? 0 : 1,
                  }}
                />
                {onglets.map((n, i) => {
                  const Icon = n.icon;
                  const active = i === actif;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setSection(n.id); setSelectedClient(null); }}
                      aria-current={active ? 'page' : undefined}
                      className={`th-onglet relative z-10 flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 px-1 rounded-2xl active:scale-95 ${active ? 'text-white' : 'text-stone-500'}`}>
                      <span className="relative">
                        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                        {n.id === 'messages' && nonLusMsg > 0 && (
                          <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9.5px] font-bold flex items-center justify-center">
                            {nonLusMsg > 99 ? '99+' : nonLusMsg}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-semibold tracking-tight leading-none">{n.label}</span>
                    </button>
                  );
                })}
              </nav>
            );
          })()}
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
