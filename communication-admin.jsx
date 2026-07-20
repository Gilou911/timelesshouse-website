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
      FolderOpen, Download,
      Maximize2, Monitor, Smartphone, ChevronDown, ChevronUp,
      Lightbulb, Copy, Power, Building2
    } from 'lucide-react';
    import AdminPortfolio from './admin-portfolio.jsx';

    // — Config Supabase injectée par Vite depuis .env (variables VITE_*)
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    /* 🔐 Fonctionnalités de l'agence connectée (SaaS B.3, brique 7).
       Renseigné par App dès le chargement de l'agence ; faux par
       défaut → un locataire ne voit ni les analyses sociales (apps
       Meta/TikTok au nom de TimelessHouse) ni le portfolio (outil de
       prospection propre à TimelessHouse). Activables par agence en
       base, sans toucher au code. */
    const FEATURES = { analytics: false, portfolio: false };

    /* ════════════════════════════════════════════════════════════
       ☁️ UPLOAD DIRECT VERS BACKBLAZE B2 (via Edge Function b2-sign)
       Même modèle que ylvfeet : l'admin choisit un fichier, le
       navigateur demande une URL signée puis PUT directement sur B2
       (aucun fichier ne transite par Supabase). Les fichiers > 4 Go
       (films de mariage) passent automatiquement en multipart.
       ════════════════════════════════════════════════════════════ */
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
        const { url, publicUrl, disposition } = await b2Sign({ action: 'sign-put', key, contentType });
        await b2PutRetry(url, file, contentType, onProgress, disposition);
        return publicUrl;
      }

      // Multipart — gros fichiers (l'ETag de chaque part est exigé à la fin)
      const { uploadId } = await b2Sign({ action: 'mpu-create', key, contentType });
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
        const { publicUrl } = await b2Sign({ action: 'mpu-complete', key, uploadId, parts });
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
       📸 UPLOAD PHOTOS → CLOUDINARY (galeries) via Edge Function cloudinary-sign
       L'admin uploade ses photos sans quitter son espace ; elles vont dans
       rootFolder/catégorie/ et la galerie (list-gallery) les liste toute seule.
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
       ════════════════════════════════════════════════════════════ */
    const NEU_LIGHT = {
      base:      { backgroundColor: '#e9e4d9' },
      raised:    { backgroundColor: '#efeae0', boxShadow: '10px 10px 24px rgba(168,156,134,0.32), -10px -10px 24px rgba(255,253,247,0.92)' },
      raisedSm:  { backgroundColor: '#efeae0', boxShadow: '5px 5px 12px rgba(168,156,134,0.26), -5px -5px 12px rgba(255,253,247,0.88)' },
      raisedXs:  { backgroundColor: '#efeae0', boxShadow: '3px 3px 7px rgba(168,156,134,0.22), -3px -3px 7px rgba(255,253,247,0.82)' },
      pressed:   { backgroundColor: '#e3ddd0', boxShadow: 'inset 5px 5px 10px rgba(168,156,134,0.32), inset -5px -5px 10px rgba(255,253,247,0.9)' },
      pressedSm: { backgroundColor: '#e3ddd0', boxShadow: 'inset 3px 3px 6px rgba(168,156,134,0.26), inset -3px -3px 6px rgba(255,253,247,0.85)' },
      dark:      { backgroundColor: '#2a2620', boxShadow: '8px 8px 18px rgba(168,156,134,0.36), -3px -3px 8px rgba(255,253,247,0.6), inset 1px 1px 2px rgba(255,255,255,0.08)' },
      darkSm:    { backgroundColor: '#2a2620', boxShadow: '4px 4px 10px rgba(168,156,134,0.36), -2px -2px 6px rgba(255,253,247,0.5)' },
      accent:    '#2a2620',
      accentText:'#f5f1e6',
    };

    const NEU_DARK = {
      base:      { backgroundColor: '#181b20' },
      raised:    { backgroundColor: '#22262d', boxShadow: '10px 10px 24px rgba(0,0,0,0.55), -5px -5px 15px rgba(54,60,72,0.28)' },
      raisedSm:  { backgroundColor: '#22262d', boxShadow: '5px 5px 12px rgba(0,0,0,0.48), -3px -3px 8px rgba(54,60,72,0.22)' },
      raisedXs:  { backgroundColor: '#22262d', boxShadow: '3px 3px 7px rgba(0,0,0,0.42), -2px -2px 5px rgba(54,60,72,0.18)' },
      pressed:   { backgroundColor: '#14171c', boxShadow: 'inset 5px 5px 10px rgba(0,0,0,0.55), inset -3px -3px 8px rgba(54,60,72,0.2)' },
      pressedSm: { backgroundColor: '#14171c', boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.48), inset -2px -2px 5px rgba(54,60,72,0.15)' },
      dark:      { backgroundColor: '#e8d8be', boxShadow: '8px 8px 18px rgba(0,0,0,0.62), -3px -3px 8px rgba(54,60,72,0.22), inset 1px 1px 2px rgba(255,255,255,0.18), 0 0 0 1px rgba(232,216,190,0.35), 0 0 24px rgba(232,216,190,0.25)' },
      darkSm:    { backgroundColor: '#e8d8be', boxShadow: '4px 4px 10px rgba(0,0,0,0.55), -2px -2px 6px rgba(54,60,72,0.18), 0 0 0 1px rgba(232,216,190,0.3), 0 0 16px rgba(232,216,190,0.2)' },
      accent:    '#e8d8be',
      accentText:'#1a1410',
    };

    // Mutable pointer — reassigned by App on theme change
    let neu = NEU_LIGHT;

    // ---------- useDarkMode hook ----------
    const useDarkMode = () => {
      const [isDark, setIsDark] = useState(() => {
        try { return localStorage.getItem('th-dark-mode') === 'dark'; }
        catch (e) { return false; }
      });
      useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        try { localStorage.setItem('th-dark-mode', isDark ? 'dark' : 'light'); } catch (e) {}
      }, [isDark]);
      const toggleDark = useCallback(() => setIsDark(d => !d), []);
      return [isDark, toggleDark];
    };

    /* Toggle dark mode — fin + arc SVG qui voyage (version raffinée). */
    const C_STEP = 50;
    const C_INITIAL = -9.8;

    const DarkToggle = ({ isDark, onToggle }) => {
      const [offset, setOffset] = useState(() => {
        try {
          const saved = parseFloat(localStorage.getItem('th-c-offset'));
          return isNaN(saved) ? (isDark ? C_INITIAL + C_STEP : C_INITIAL) : saved;
        } catch (e) { return C_INITIAL; }
      });
      const prevIsDark = useRef(isDark);

      useEffect(() => {
        if (prevIsDark.current !== isDark) {
          setOffset(o => {
            const next = o + C_STEP;
            try { localStorage.setItem('th-c-offset', next); } catch (e) {}
            return next;
          });
          prevIsDark.current = isDark;
        }
      }, [isDark]);

      return (
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? 'Passer en mode jour' : 'Passer en mode nuit'}
          title={isDark ? 'Mode jour' : 'Mode nuit'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            alignSelf: 'center',
            width: 42, height: 22,
            minWidth: 42, minHeight: 22,
            maxWidth: 42, maxHeight: 22,
            boxSizing: 'border-box',
            borderRadius: 11,
            background: 'linear-gradient(145deg, #28282c, #323236)',
            border: 'none', cursor: 'pointer', padding: 0,
            boxShadow: 'inset 0 1.5px 4px rgba(0,0,0,0.6), inset 0 -1px 1px rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.25)',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            overflow: 'visible',
            transition: 'box-shadow 0.4s ease',
            position: 'relative',
          }}>
          {/* HIG : étend la zone tactile à ~64×44 sans toucher au visuel 42×22 */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: -11 }} />
          <svg width="42" height="22" viewBox="0 0 42 22" preserveAspectRatio="none"
               style={{ display: 'block', width: 42, height: 22, flex: '0 0 auto', overflow: 'visible', pointerEvents: 'none' }}>
            <rect x="1.2" y="1.2" width="39.6" height="19.6" rx="9.8" ry="9.8" pathLength="100"
                  fill="none"
                  stroke={isDark ? 'rgba(255,255,255,0.92)' : 'rgba(135,135,140,0.75)'}
                  strokeWidth="2.4"
                  strokeDasharray="50 50"
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.65,0.05,0.35,1), stroke 0.7s cubic-bezier(0.65,0.05,0.35,1)' }} />
          </svg>
        </button>
      );
    };

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

    const Field = ({ label, children }) => (
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold block mb-2">{label}</label>
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

    const Select = ({ value, onChange, children }) => (
      <select value={value} onChange={onChange} style={neu.pressedSm} className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px]">
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
      // HIG : verrouille le scroll de la page derrière la modale (sinon le fond
      // défile pendant qu'on la fait défiler — scroll chaining).
      useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
      }, []);

      return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
        {/* dvh (pas vh) : tient compte de la barre d'URL iOS — sinon le bas de
            la modale (boutons Enregistrer) passe sous la barre.
            overscroll-contain : le scroll interne ne « fuit » pas vers la page. */}
        <div
          style={neu.raised}
          className={`rounded-t-[28px] sm:rounded-[32px] p-5 sm:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-7 max-h-[92dvh] sm:max-h-[90dvh] overflow-y-auto overscroll-contain w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
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
    function LoginScreen({ onLogin }) {
      const [email, setEmail] = useState('');
      const [pwd, setPwd] = useState('');
      const [showPwd, setShowPwd] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');

      const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        const { data, error: err } = await sb.auth.signInWithPassword({ email, password: pwd });
        if (err) {
          setError("Identifiants incorrects ou compte non trouvé.");
          setLoading(false);
        } else {
          onLogin(data.user);
        }
      };

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

            <p className="text-[11px] text-stone-400 text-center mt-6">
              Compte créé via Supabase → Authentication → Users.
            </p>
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

    // Jauge de stockage (Vue d'ensemble + cartes agences) — alerte 80 %,
    // dépassement souple : on n'empêche jamais un upload.
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
                Changez de palier, mettez à jour votre carte ou résiliez depuis le portail sécurisé Stripe.
              </p>
              <Btn kind="dark" onClick={() => go('portal')} disabled={busy}>
                {busy ? 'Ouverture…' : 'Gérer mon abonnement'}
              </Btn>
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

    function Overview({ clients, totalMedia, totalRevenue, upcomingShoots, storage, billing }) {
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

          {/* Abonnement (SaaS B.3 — Stripe) */}
          <BillingCard billing={billing} />

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
       👥 CLIENTS LIST
       ════════════════════════════════════════════════════════════ */
    function ClientsList({ clients, onSelect, onCreate, refresh }) {
      const [showNew, setShowNew] = useState(false);
      const [search, setSearch] = useState('');

      const filtered = useMemo(() =>
        clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || '').includes(search.toLowerCase())),
        [clients, search]
      );

      return (
        <div className="space-y-5 lg:space-y-6">
          {/* Search + nouveau bouton — alignés sur tous écrans */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div style={neu.raisedXs} className="rounded-full flex items-center gap-2 px-4 min-h-[44px] w-full sm:w-72">
              <Search size={15} className="text-stone-400 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chercher un client…"
                className="bg-transparent outline-none text-[14px] flex-1 placeholder:text-stone-400 min-w-0"
              />
            </div>
            <Btn kind="dark" icon={Plus} onClick={() => setShowNew(true)} full={false} className="w-full sm:w-auto">
              Nouveau client
            </Btn>
          </div>

          {/* Grille clients */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
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
                <h3 className="text-[19px] lg:text-[20px] tracking-tight mt-4 leading-tight truncate" style={SERIF}>{c.name}</h3>
                <div className="text-[12px] text-stone-500 mt-1 truncate">{c.sector || '—'}</div>
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[9.5px] leading-none">
                    {c.universe || 'communication'}
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
            <button onClick={() => setShowNew(true)} style={neu.pressed} className="rounded-[22px] lg:rounded-[24px] p-6 flex flex-col items-center justify-center text-center min-h-[200px] hover:scale-[1.01] active:scale-[0.99] transition-transform">
              <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4">
                <Plus size={20} />
              </div>
              <div className="text-[15px] font-semibold">Créer un espace</div>
              <div className="text-[12.5px] text-stone-500 mt-1">Onboarder un nouveau client</div>
            </button>
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
        agency_name:       existing?.agency_name       || 'TimelessHouse',
        universe:          existing?.universe          || 'communication',
        redirect_url:      existing?.redirect_url      || '',
        active:            existing?.active ?? true,
        analytics_enabled: existing?.analytics_enabled ?? false,
        media_enabled:     existing?.media_enabled    ?? true,
        invoices_enabled:  existing?.invoices_enabled ?? true,
        shoots_enabled:    existing?.shoots_enabled   ?? true,
        documents_enabled: existing?.documents_enabled ?? true,
        strategies_enabled: existing?.strategies_enabled ?? true,
      });
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');

      const COUPLE_UNIVERSES = ['mariage', 'fiancailles', 'anniversaire-mariage'];
      const isCouple = COUPLE_UNIVERSES.includes(form.universe);

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
          setErr(result.error.message.includes('duplicate') ? 'Ce code est déjà utilisé.' : result.error.message);
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
                const COUPLES = ['mariage', 'fiancailles', 'anniversaire-mariage'];
                // Pour les nouveaux clients couples, on désactive par défaut les 3 modules extras
                // (sauf si l'utilisateur les a déjà touchés ou si on édite un client existant)
                if (!existing && COUPLES.includes(newUniverse) && !COUPLES.includes(form.universe)) {
                  setForm({...form, universe: newUniverse, media_enabled: false, invoices_enabled: false, shoots_enabled: false, documents_enabled: false, strategies_enabled: false});
                } else if (!existing && !COUPLES.includes(newUniverse) && COUPLES.includes(form.universe)) {
                  setForm({...form, universe: newUniverse, media_enabled: true, invoices_enabled: true, shoots_enabled: true, documents_enabled: true, strategies_enabled: true});
                } else {
                  setForm({...form, universe: newUniverse});
                }
              }}>
                <option value="communication">📊 Communication & Marketing (tableau de bord dynamique)</option>
                <option value="mariage">💍 Mariage</option>
                <option value="fiancailles">💎 Fiançailles</option>
                <option value="anniversaire-mariage">🎂 Anniversaire de mariage</option>
                <option value="immobilier">🏠 Immobilier</option>
                <option value="commercial">📸 Commercial</option>
                <option value="court-metrage">🎬 Court-métrage</option>
                <option value="voyage">✈️ Voyage</option>
                <option value="autre">📁 Autre</option>
              </Select>
            </Field>

            {isCouple ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Prénom 1">
                    <Input required value={form.partner1} onChange={e => updatePartners(e.target.value, form.partner2)} placeholder="Précieuse" />
                  </Field>
                  <Field label="Prénom 2">
                    <Input required value={form.partner2} onChange={e => updatePartners(form.partner1, e.target.value)} placeholder="Ronny" />
                  </Field>
                </div>
                <Field label="Code d'accès (sans espaces)">
                  <Input required value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="precieuse-ronny" />
                  <div className="text-[11px] text-stone-500 mt-1.5">Le code est auto-suggéré depuis les prénoms. Tu peux le personnaliser.</div>
                </Field>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nom du client">
                  <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value, initials: form.initials || e.target.value.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)})} placeholder="Maison Lumière" />
                </Field>
                <Field label="Code d'accès (sans espaces)">
                  <Input required value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="maison-lumiere" />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Prénom contact">
                <Input value={form.greeting} onChange={e => setForm({...form, greeting: e.target.value})} placeholder="Camille" />
              </Field>
              <Field label="Initiales">
                <Input value={form.initials} onChange={e => setForm({...form, initials: e.target.value.toUpperCase().slice(0,3)})} placeholder="ML" maxLength={3} />
              </Field>
              <Field label="Secteur">
                <Input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} placeholder="Hôtellerie" />
              </Field>
            </div>

            {form.universe !== 'communication' && (
              <Field label="Page de redirection (laisser vide pour utiliser les templates dynamiques)">
                <Input value={form.redirect_url} onChange={e => setForm({...form, redirect_url: e.target.value})} placeholder="Laisser vide → event-photos.html (template dynamique)" />
                <div className="text-[11px] text-stone-500 mt-1.5">
                  💡 <strong>Recommandé :</strong> laissez vide pour utiliser les templates dynamiques (configurables dans l'onglet "Page client" après création).<br/>
                  Pour pointer vers un fichier HTML spécifique (legacy), entrez son nom : <code>precieuse-ronny.html</code>
                </div>
              </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email du client (pour les notifications)">
                <Input type="email" value={form.client_email} onChange={e => setForm({...form, client_email: e.target.value})} placeholder="contact@maison-lumiere.fr" />
              </Field>
              <Field label="Statut">
                <Select value={form.active ? 'actif' : 'pause'} onChange={e => setForm({...form, active: e.target.value === 'actif'})}>
                  <option value="actif">Actif (le client peut se connecter)</option>
                  <option value="pause">En pause (l'accès est bloqué)</option>
                </Select>
              </Field>
            </div>

            <Field label="Modules visibles dans l'espace client">
              <div className="space-y-2">
                {/* Médias */}
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

                {/* Stratégies */}
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
                {form.universe === 'communication' && FEATURES.analytics && (
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
              {form.universe !== 'communication' && (
                <div className="text-[11px] text-stone-500 mt-2.5">
                  💡 Pour les univers événement, ces modules complètent l'espace galerie/film. Tu peux par exemple n'activer que les Médias pour donner accès à des photos/vidéos additionnelles, ou laisser tout désactivé pour une page de livraison pure.
                </div>
              )}
            </Field>

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
        if (client.universe && client.universe !== 'communication') return 'event_pages';
        if (client.media_enabled !== false) return 'media';
        if (client.invoices_enabled !== false) return 'invoices';
        if (client.shoots_enabled !== false) return 'shoots';
        if (client.analytics_enabled && FEATURES.analytics) return 'analytics';
        return 'media';
      });
      const [editClient, setEditClient] = useState(false);
      const [confirmDelete, setConfirmDelete] = useState(false);
      const [sendingWelcome, setSendingWelcome] = useState(false);

      // Par défaut, les modules sont activés (pour les clients pré-migration v8 qui ont NULL)
      const mediaOn    = client.media_enabled    !== false;
      const invoicesOn = client.invoices_enabled !== false;
      const shootsOn   = client.shoots_enabled   !== false;
      const documentsOn = client.documents_enabled !== false;
      const strategiesOn = client.strategies_enabled !== false;

      const tabs = [
        ...(client.universe && client.universe !== 'communication' ? [{ id: 'event_pages', label: 'Page client', icon: Eye }] : []),
        ...(mediaOn    ? [{ id: 'media',    label: 'Médias',    icon: ImageIcon }]  : []),
        ...(invoicesOn ? [{ id: 'invoices', label: 'Factures',  icon: FileText }]   : []),
        ...(documentsOn ? [{ id: 'documents', label: 'Documents', icon: FolderOpen }] : []),
        ...(strategiesOn ? [{ id: 'strategies', label: 'Stratégies', icon: Lightbulb }] : []),
        ...(shootsOn   ? [{ id: 'shoots',   label: 'Tournages', icon: CalendarIcon }] : []),
        ...(client.analytics_enabled && FEATURES.analytics ? [{ id: 'analytics', label: 'Analyses', icon: BarChart3 }] : []),
      ];

      // Onglet par défaut : Page client si univers événement, sinon Médias (ou premier onglet dispo)
      const defaultTab = (client.universe && client.universe !== 'communication')
        ? 'event_pages'
        : (tabs[0]?.id || 'media');

      const deleteClient = async () => {
        await sb.from('clients').delete().eq('id', client.id);
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
                    <code style={neu.pressedSm} className="px-2 py-0.5 rounded-md font-mono text-[11px] leading-none">{client.code}</code>
                    <span className={client.active ? 'text-emerald-600 font-semibold' : 'text-stone-400'}>{client.active ? '· Actif' : '· En pause'}</span>
                  </div>
                  {client.client_email && (
                    <div className="text-[12px] text-stone-500 mt-1 truncate hidden sm:block">{client.client_email}</div>
                  )}
                </div>
              </div>

              {/* Actions — scroll horizontal sur mobile */}
              <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0 shrink-0 pb-1 lg:pb-0">
                {client.client_email && (
                  <Btn icon={sendingWelcome ? Loader2 : Send} onClick={sendWelcomeEmail} disabled={sendingWelcome}>
                    <span className="hidden sm:inline">{sendingWelcome ? 'Envoi…' : 'Email de bienvenue'}</span>
                    <span className="sm:hidden">{sendingWelcome ? 'Envoi…' : 'Bienvenue'}</span>
                  </Btn>
                )}
                <Btn icon={Edit3} onClick={() => setEditClient(true)}>Modifier</Btn>
                <Btn icon={Trash2} onClick={() => setConfirmDelete(true)} className="text-rose-600">Supprimer</Btn>
              </div>
            </div>
          </div>

          {/* Tabs — scrollable horizontalement sur mobile, 44px tactile */}
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
            <div style={neu.raisedXs} className="rounded-full p-1 inline-flex items-center">
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
          {tab === 'documents' && <DocumentsTab clientId={client.id} />}
          {tab === 'strategies' && <StrategiesTab clientId={client.id} client={client} />}
          {tab === 'shoots' && <ShootsTab clientId={client.id} client={client} />}
          {tab === 'analytics' && <AnalyticsTab clientId={client.id} />}

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
        target = client.universe === 'anniversaire-mariage' ? 'event-anniversary.html'
               : client.universe === 'fiancailles'          ? 'event-engagement.html'
               : 'event-video.html';
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
          // Mène toujours au login de l'espace client (modale auto-ouverte via #clients)
          const deliveryUrl = window.location.origin + '/index.html#clients';

          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body:    JSON.stringify({
              kind: 'event_ready',
              client_id: client.id,
              extra: {
                hasPhotos: !!photosPage,
                hasVideo:  !!videoPage,
                deliveryUrl,
              },
            }),
          });
          if (res.ok) alert(`✓ Email envoyé à ${client.client_email}`);
          else if (res.status === 404) alert("La fonction de notification n'est pas déployée.");
          else alert(`Erreur : ${await res.text()}`);
        } catch (e) { alert("Erreur réseau : " + e.message); }
        setNotifying(false);
      };

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
                    {notifying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {notifying ? 'Envoi…' : 'Notifier le client'}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nombre d'années">
                    <Input type="number" value={c.nombreAnnees || ''} onChange={e => updateConfig('nombreAnnees', parseInt(e.target.value) || 0)} placeholder="50" min="1" max="100" />
                  </Field>
                  <Field label="Type de noces (vide = auto)">
                    <Input value={c.typeNoces || ''} onChange={e => updateConfig('typeNoces', e.target.value)} placeholder="Auto-détecté (Noces d'Or, etc.)" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mt-6 mb-1">Cloudinary</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Cloud Name">
                    <Input required value={c.cloudName || ''} onChange={e => updateConfig('cloudName', e.target.value)} placeholder="dyfa4zztq" />
                  </Field>
                  <Field label="Dossier racine">
                    <Input required value={c.rootFolder || ''} onChange={e => updateConfig('rootFolder', e.target.value)} placeholder="Photos_precieuse-ronny" />
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
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
                  <div className="grid grid-cols-2 gap-4 mt-3">
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
          sb.from('shoots').select('*').eq('client_id', clientId).order('date_day'),
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
        if (!confirm('Supprimer ce média ?')) return;
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
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ client_id: clientId, media_id: media.id, kind: 'new_media', extra: { loginUrl: window.location.origin + '/index.html#clients' } }),
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
                        <button onClick={() => notifyClient(m)} disabled={notifying === m.id} aria-label="Notifier le client" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform" title="Notifier le client par email">
                          {notifying === m.id ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                        </button>
                      )}
                      {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir dans un nouvel onglet" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" title="Ouvrir dans un nouvel onglet"><ExternalLink size={14} /></a>}
                      <button onClick={() => { setEditing(m); setShowForm(true); }} aria-label="Modifier" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" title="Modifier"><Edit3 size={14} /></button>
                      <button onClick={() => remove(m.id)} aria-label="Supprimer" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-95 transition-transform" title="Supprimer"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucun média. Cliquez sur "Ajouter un média" pour commencer.</div>}
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
        // ⚠️ Avertissement si vidéo sans aucune source de lecture ni fichier
        if (form.type === 'video' && !form.preview_url.trim() && !form.url.trim() && !videoFile) {
          if (!window.confirm('⚠️ Aucun fichier ni URL renseigné.\n\nLa vidéo sera invisible pour le client.\n\nVoulez-vous quand même enregistrer ?')) return;
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

          if (videoFile) {
            // Lecture adaptative pas encore générée → afficher la commande
            setEncodeHint({ id: rowId, filename: videoFile.name });
            setLoading(false);
          } else {
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Type">
                <Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="photo">📸 Photo</option>
                  <option value="video">🎥 Vidéo</option>
                </Select>
              </Field>
              <Field label="Tag (catégorie)">
                <Input value={form.tag} onChange={e => setForm({...form, tag: e.target.value})} placeholder="Réseaux sociaux, Site web…" />
              </Field>
            </div>
            <Field label="Titre">
              <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Campagne printemps — Hero" />
            </Field>
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
                </Field>

                {/* État de la lecture adaptative (HLS) */}
                {isHls(form.preview_url) ? (
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

                <button type="button" onClick={() => setShowUrlFields(v => !v)} className="text-[11.5px] text-stone-500 underline underline-offset-2 hover:text-stone-800 transition">
                  {showUrlFields ? '▴ Masquer les URLs manuelles' : '▾ Coller des URLs manuellement (avancé)'}
                </button>
                {showUrlFields && (
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
            ) : (
              <Field label="URL du fichier (Cloudinary, Drive, S3…)">
                <Input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://res.cloudinary.com/…" />
              </Field>
            )}
            <Field label="Tournage associé (optionnel — permet de grouper les médias chez le client)">
              <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                <option value="">— Hors tournage —</option>
                {shoots.map(s => (
                  <option key={s.id} value={s.id}>{s.month_label} {s.date_day} · {s.title}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>

            <Field label={form.type === 'video' ? "Vignette (optionnel — sinon générée automatiquement à l'encodage)" : "Miniature (optionnel)"}>
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
              {/* 3) …ou coller une URL d'image */}
              <Input
                value={form.thumb_url || ''}
                onChange={e => setForm({...form, thumb_url: e.target.value})}
                placeholder="… ou coller une URL d'image"
                style={{ marginTop: '8px' }}
              />

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
                style={form.type === 'video' && !form.preview_url && !videoFile && !form.url ? { background: 'linear-gradient(135deg,#92400e,#b45309)', boxShadow: '0 0 0 2px rgba(245,158,11,0.4)' } : {}}>
                {loading
                  ? (upProgress ? 'Upload en cours…' : 'Enregistrement…')
                  : ((form.type === 'video' && !form.preview_url && !videoFile && !form.url ? '⚠️ ' : '') + (existing ? 'Mettre à jour' : (videoFile ? 'Ajouter et uploader' : 'Ajouter')))}
              </Btn>
            </div>
          </form>
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
            const { data } = await sb.from('shoots').select('id,title,type,date_day,month_label,year')
              .eq('client_id', clientId).order('year', { ascending: false }).order('date_day', { ascending: false });
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
      const [notifying, setNotifying] = useState(null);

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('invoices').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer cette facture ?')) return;
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
          // Mène toujours au login de l'espace client (la modale d'accès s'ouvre via #clients)
          const loginUrl = window.location.origin + '/index.html#clients';
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body:    JSON.stringify({
              kind:      'invoice_ready',
              client_id: clientId,
              extra: {
                reference: inv.reference,
                amount:    parseFloat(inv.amount || 0),
                loginUrl,
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
                        <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shrink-0 leading-none ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-stone-200/60 gap-3">
                        <div>
                          <div className="text-[11.5px] text-stone-500 leading-none">{inv.date_label}</div>
                          <div className="font-semibold text-[18px] leading-none mt-2" style={SERIF}>{parseFloat(inv.amount).toLocaleString('fr-FR')} €</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {client?.client_email && (
                            <button onClick={() => notifyInvoiceReady(inv)} disabled={notifying === inv.id} aria-label="Notifier le client" className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-stone-600 disabled:opacity-50 active:scale-95 transition-transform" title="Prévenir le client que la facture est prête">
                            {notifying === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            </button>
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
                        <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1.5">
                        {client?.client_email && (
                          <button onClick={() => notifyInvoiceReady(inv)} disabled={notifying === inv.id} aria-label="Notifier le client" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 disabled:opacity-50" title="Prévenir le client que la facture est prête">
                            {notifying === inv.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          </button>
                        )}
                        <button onClick={() => { setEditing(inv); setShowForm(true); }} aria-label="Modifier" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"><Edit3 size={13} /></button>
                        <button onClick={() => remove(inv.id)} aria-label="Supprimer" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucune facture.</div>}
              </div>
            )}
          </div>

          {showForm && <InvoiceForm clientId={clientId} existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
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
            ? await sb.from('invoices').update(payload).eq('id', existing.id)
            : await sb.from('invoices').insert(payload);
          if (result.error) throw new Error(result.error.message);
          onSaved();
        } catch (err) {
          setUpPct(null); setLoading(false);
          alert(`✗ ${err.message || 'Erreur'}`);
        }
      };

      return (
        <Modal title={existing ? 'Modifier la facture' : 'Nouvelle facture'} kicker="Facture" onClose={onClose} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Référence">
                <Input required value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="FAC-2026-042" />
              </Field>
              <Field label="Date d'émission">
                <Input type="date" value={form.date_iso_local} onChange={e => handleEmissionDate(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">Libellé : <strong>{form.date_label || '—'}</strong></div>
              </Field>
            </div>
            <Field label="Description">
              <Input required value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Production vidéo — Campagne printemps" />
            </Field>
            <Field label="Tournage couvert (optionnel)">
              <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                <option value="">— Aucun —</option>
                {shoots.map(s => <option key={s.id} value={s.id}>{shootOptionLabel(s)}</option>)}
              </Select>
              <div className="text-[11px] text-stone-500 mt-1">Le client verra à quel tournage cette facture correspond.</div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Montant (€)">
                <Input required type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="3200" />
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
            </div>
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
            </Field>
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

    function DocumentsTab({ clientId }) {
      const [items, setItems] = useState([]);
      const [editing, setEditing] = useState(null);
      const [showForm, setShowForm] = useState(false);
      const [loading, setLoading] = useState(true);

      const load = async () => {
        setLoading(true);
        const { data } = await sb.from('documents').select('*').eq('client_id', clientId).order('position').order('created_at', { ascending: false });
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer ce document ?')) return;
        await sb.from('documents').delete().eq('id', id);
        load();
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
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le document" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100" title="Ouvrir le document"><ExternalLink size={13} /></a>
                          <button onClick={() => { setEditing(doc); setShowForm(true); }} aria-label="Modifier" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"><Edit3 size={13} /></button>
                          <button onClick={() => remove(doc.id)} aria-label="Supprimer" className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucun document. Cliquez sur « Ajouter un document » pour commencer.</div>}
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
            <Field label="Titre">
              <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Contrat de prestation 2026" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Catégorie">
                <Select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Date">
                <Input type="date" value={form.date_iso_local} onChange={e => handleDocDate(e.target.value)} />
                <div className="text-[11px] text-stone-500 mt-1">Libellé : <strong>{form.date_label || '—'}</strong></div>
              </Field>
            </div>
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
            </Field>
            {upPct !== null && (
              <div className="rounded-xl px-4 py-3" style={neu.pressedSm}>
                <div className="flex justify-between text-[11.5px] font-semibold text-stone-600 mb-1.5"><span>☁️ Upload du fichier</span><span>{upPct}%</span></div>
                <div className="h-1.5 rounded-full bg-stone-300/60 overflow-hidden"><div className="h-full bg-stone-900 transition-all" style={{ width: `${upPct}%` }} /></div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tournage lié (optionnel)">
                <Select value={form.shoot_id} onChange={e => setForm({...form, shoot_id: e.target.value})}>
                  <option value="">— Aucun —</option>
                  {shoots.map(s => <option key={s.id} value={s.id}>{shootOptionLabel(s)}</option>)}
                </Select>
              </Field>
              <Field label="Stratégie liée (optionnel)">
                <Select value={form.strategy_id} onChange={e => setForm({...form, strategy_id: e.target.value})}>
                  <option value="">— Aucune —</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>💡 {s.subtitle || s.title}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Taille (optionnel)">
                <Input value={form.size_label} onChange={e => setForm({...form, size_label: e.target.value})} placeholder="1,2 MB" />
              </Field>
              <Field label="Ordre d'affichage">
                <Input type="number" value={form.position} onChange={e => setForm({...form, position: e.target.value})} placeholder="0" />
              </Field>
            </div>
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
                              <button onClick={() => notifyReady(s)} disabled={notifying === s.id} aria-label="Notifier le client" title="Envoyer un email au client" className="w-10 h-10 lg:w-9 lg:h-9 rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition-transform disabled:opacity-50">
                                {notifying === s.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              </button>
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
                  {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucune stratégie. Cliquez sur « Nouvelle stratégie » pour commencer.</div>}
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
        else { setErr(result.error.message); setLoading(false); }
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        const { data } = await sb.from('shoots').select('*').eq('client_id', clientId).order('year').order('date_day');
        setItems(data || []); setLoading(false);
      };
      useEffect(() => { load(); }, [clientId]);

      const remove = async (id) => {
        if (!confirm('Supprimer ce tournage ?')) return;
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
          const loginUrl = window.location.origin + '/index.html#clients';
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
                loginUrl,
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
                      <button onClick={() => notifyScheduled(s)} disabled={notifying === s.id} aria-label="Notifier le client" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform" title="Prévenir le client de ce tournage par email">
                      {notifying === s.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                    )}
                    <button onClick={() => { setEditing(s); setShowForm(true); }} aria-label="Modifier" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"><Edit3 size={14} /></button>
                    <button onClick={() => remove(s.id)} aria-label="Supprimer" style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center text-rose-500 active:scale-95 transition-transform"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="text-center py-12 text-[13px] text-stone-400">Aucun tournage programmé.</div>}
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
          const loginUrl = window.location.origin + '/index.html#clients';
          const url = `${SUPABASE_URL}/functions/v1/notify-client`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
                loginUrl,
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
            <Field label="Titre du tournage">
              <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Shooting éditorial — Maison Lumière" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Type">
                <Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="photo">📸 Photo</option>
                  <option value="video">🎥 Vidéo</option>
                </Select>
              </Field>
              <Field label="Date du tournage">
                <Input required type="date" value={form.date_iso} onChange={e => setForm({...form, date_iso: e.target.value})} />
                <div className="text-[11px] text-stone-500 mt-1">{form.date_iso ? isoToLabel(form.date_iso) : '—'}</div>
              </Field>
              <Field label="Horaire">
                <Input value={form.time_label} onChange={e => setForm({...form, time_label: e.target.value})} placeholder="09:00 — 16:00" />
              </Field>
            </div>
            <Field label="Lieu">
              <Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Studio Bastille, Paris 11" />
            </Field>

            {/* ── Liaison stratégie → concept (chaîne de production) ── */}
            {strategies.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>
            )}
            <Field label="Notes (optionnel, visibles uniquement par vous)">
              <Textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Équipe : 4 personnes. Pré-prod le 3 avril." />
            </Field>
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
      const empty = { name: '', owner_email: '', slug: '', contact_email: '', plan: 'fondateur', accent_color: '#2a2620', bg_color: '#e9e4d9', logo_url: '' };
      const [form, setForm] = useState(empty);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [result, setResult] = useState(null); // { agency, owner } — affiché une seule fois
      const [copied, setCopied] = useState(false);

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
          navigator.clipboard.writeText(`Espace admin : ${window.location.origin}/communication-admin.html\nEmail : ${result.owner.email}\nMot de passe temporaire : ${result.owner.temp_password}`);
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
            <div className="grid sm:grid-cols-2 gap-4">
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

          {/* ─── Agences existantes ─── */}
          <div className="grid sm:grid-cols-2 gap-4">
            {(agencies || []).map(a => (
              <div key={a.id} style={neu.raised} className="rounded-[28px] p-5.5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16.5px] tracking-tight truncate" style={SERIF}>{a.name}</div>
                    <div className="text-[11.5px] text-stone-400 font-mono mt-0.5 truncate">{a.slug}</div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold text-stone-500">
                    <span className={`w-2 h-2 rounded-full ${a.active ? 'bg-emerald-500' : 'bg-stone-400'}`} />
                    {a.active ? 'Active' : 'Inactive'}
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
                <StorageGauge compact storage={{ used_bytes: a.storage_used_bytes, quota_bytes: a.storage_quota_bytes }} />
                <div className="text-[11px] text-stone-400 mt-2">Créée le {new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ════════════════════════════════════════════════════════════
       🌳 ROOT APP
       ════════════════════════════════════════════════════════════ */
    function App() {
      const [isDark, toggleDark] = useDarkMode();
      // Reassign the module-level mutable neu pointer
      neu = isDark ? NEU_DARK : NEU_LIGHT;

      const [user, setUser] = useState(undefined); // undefined = checking, null = logged out, object = logged in
      const [section, setSection] = useState('clients');
      const [selectedClient, setSelectedClient] = useState(null);
      const [clients, setClients] = useState([]);
      const [overviewData, setOverviewData] = useState({ totalMedia: 0, totalRevenue: 0, upcomingShoots: 0 });
      // null = pas propriétaire de la plateforme (section Agences masquée)
      const [agencies, setAgencies] = useState(null);
      const [featuresReady, setFeaturesReady] = useState(false);

      // Vérification session au mount
      useEffect(() => {
        sb.auth.getSession().then(({ data }) => {
          setUser(data.session?.user || null);
        });
        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user || null);
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
        setAgencies(error ? null : (data || []));
      };

      // Fonctionnalités de MON agence (RLS : je ne vois que la mienne).
      // Renseigne FEATURES avant le premier rendu des sections.
      const loadFeatures = async () => {
        const { data } = await sb.from('agencies')
          .select('features_analytics, features_portfolio').limit(1).maybeSingle();
        FEATURES.analytics = data?.features_analytics === true;
        FEATURES.portfolio = data?.features_portfolio === true;
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

      const logout = async () => { await sb.auth.signOut(); };

      if (user === undefined) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-stone-400" size={28} /></div>;
      }

      if (!user) return <LoginScreen onLogin={setUser} />;

      const titles = {
        overview: { t: `Bonjour`, s: 'Vue d\'ensemble de votre studio.' },
        clients:  { t: 'Mes clients', s: 'Tous les espaces que vous avez créés.' },
        portfolio:{ t: 'Portfolio', s: 'Vitrine et espaces de prospection.' },
        agences:  { t: 'Agences', s: 'Les locataires de votre plateforme marque blanche.' },
      };

      return (
        <div className="min-h-screen w-full" style={neu.base}>
          {/* Header mobile — glass blur iOS-style */}
          <header
            className="lg:hidden flex items-center justify-between px-5 py-3.5 sticky top-0 z-30"
            style={{
              backgroundColor: isDark ? 'rgba(34,38,45,0.85)' : 'rgba(239,234,224,0.85)',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              borderBottom: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.06)',
            }}>
            <div className="min-w-0">
              <div className="text-[19px] tracking-tight leading-none truncate" style={{ ...SERIF, fontStyle: 'italic' }}>
                TimelessHouse<span className="text-stone-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mt-1 font-medium">Admin</div>
            </div>
            <div className="flex gap-2 items-center shrink-0">
              <div style={neu.raisedXs} className="h-11 px-3 rounded-full flex items-center justify-center">
                <DarkToggle isDark={isDark} onToggle={toggleDark} />
              </div>
              <a href="communication.html" aria-label="Espace client" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <Eye size={16} />
              </a>
              <button onClick={logout} aria-label="Déconnexion" style={neu.raisedXs} className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <div className="flex gap-5 px-4 pb-28 lg:p-5 lg:pb-5 min-h-screen">
            {/* Sidebar — desktop uniquement */}
            <aside style={neu.raised} className="hidden lg:flex w-[230px] h-[calc(100vh-40px)] sticky top-5 flex-col rounded-[32px] p-5 shrink-0">
              <div className="px-2 pt-2 pb-6">
                <div className="text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
                  TimelessHouse<span className="text-stone-400">.</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mt-1.5 font-medium">Espace agence</div>
              </div>

              <nav className="flex flex-col gap-1.5">
                {[
                  { id: 'overview', icon: Home, label: 'Vue d\'ensemble' },
                  { id: 'clients', icon: Users, label: 'Clients' },
                  ...(FEATURES.portfolio ? [{ id: 'portfolio', icon: ImageIcon, label: 'Portfolio' }] : []),
                  ...(agencies !== null ? [{ id: 'agences', icon: Building2, label: 'Agences' }] : []),
                ].map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setSection(n.id); setSelectedClient(null); }}
                    style={section === n.id && !selectedClient ? neu.pressedSm : {}}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-left transition ${section === n.id && !selectedClient ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                    <n.icon size={18} /> <span className="text-[14px] font-medium tracking-tight">{n.label}</span>
                  </button>
                ))}
              </nav>

              <div style={neu.dark} className="rounded-3xl p-5 text-white mt-6">
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Connecté</div>
                <div className="text-[12.5px] mt-1.5 truncate">{user.email}</div>
              </div>

              <div className="mt-auto pt-4 space-y-1">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Thème</span>
                  <DarkToggle isDark={isDark} onToggle={toggleDark} />
                </div>
                <a href="communication.html" className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-stone-500 hover:text-stone-800 transition">
                  <Eye size={18} /> <span className="text-[14px] font-medium tracking-tight">Espace client</span>
                </a>
                <button onClick={logout} className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] rounded-2xl text-stone-500 hover:text-stone-800 transition">
                  <LogOut size={18} /> <span className="text-[14px] font-medium tracking-tight">Déconnexion</span>
                </button>
              </div>
            </aside>

            {/* Main */}
            <main className="flex-1 min-w-0">
              {!selectedClient && (
                <div className="mb-6 lg:mb-8 pt-4 lg:pt-0">
                  <h1 className="text-[28px] lg:text-[34px] tracking-tight leading-[1.05]" style={SERIF}>{titles[section].t}</h1>
                  <div className="text-[13px] text-stone-500 mt-1.5 leading-relaxed">{titles[section].s}</div>
                </div>
              )}

              {selectedClient ? (
                <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} refresh={() => { loadClients(); loadOverview(); }} />
              ) : section === 'overview' ? (
                <Overview clients={clients} {...overviewData} />
              ) : section === 'portfolio' && FEATURES.portfolio ? (
                <AdminPortfolio sb={sb} neu={neu} SERIF={SERIF} isDark={isDark} />
              ) : section === 'agences' && agencies !== null ? (
                <AdminAgencies agencies={agencies} refresh={loadAgencies} />
              ) : (
                <ClientsList clients={clients} onSelect={setSelectedClient} refresh={loadClients} />
              )}
            </main>
          </div>

          {/* Bottom nav — mobile uniquement, 52px tactile, verre dépoli translucide */}
          <nav
            className="lg:hidden fixed bottom-4 left-4 right-4 z-30 rounded-[28px] px-2 py-2 flex items-center justify-around"
            style={{
              boxShadow: neu.raised.boxShadow,
              background: isDark ? 'rgba(34,38,45,0.5)' : 'rgba(239,234,224,0.5)',
              border: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(255,255,255,0.55)',
              backdropFilter: 'saturate(180%) blur(22px)',
              WebkitBackdropFilter: 'saturate(180%) blur(22px)',
            }}>
            {[
              { id: 'overview', icon: Home, label: 'Aperçu' },
              { id: 'clients', icon: Users, label: 'Clients' },
              ...(FEATURES.portfolio ? [{ id: 'portfolio', icon: ImageIcon, label: 'Portfolio' }] : []),
              ...(agencies !== null ? [{ id: 'agences', icon: Building2, label: 'Agences' }] : []),
            ].map(n => {
              const Icon = n.icon;
              const active = section === n.id && !selectedClient;
              return (
                <button
                  key={n.id}
                  onClick={() => { setSection(n.id); setSelectedClient(null); }}
                  style={active ? neu.darkSm : {}}
                  aria-current={active ? 'page' : undefined}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 px-1 rounded-2xl transition active:scale-95 ${active ? 'text-white' : 'text-stone-500'}`}>
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="text-[10px] font-semibold tracking-tight leading-none">{n.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
