/* ════════════════════════════════════════════════════════════
   📊  COMMUNICATION-APP.JSX — TABLEAU DE BORD CLIENT (v2)
   ════════════════════════════════════════════════════════════
   Nouveautés :
     ▸ Galerie avec lightbox (photos)
     ▸ Lecteur vidéo intégré (Cloudinary, Streamable, YouTube, mp4)
     ▸ Médias regroupés par tournage
     ▸ Téléchargement direct (Cloudinary + Backblaze, iOS compatible)
     ▸ Approbation client (en attente / approuvé / changements)
     ▸ Commentaires par média
   ════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Home, Image as ImageIcon, FileText, BarChart3, Calendar as CalendarIcon,
  LogOut, Search, Bell, Filter, Download, ChevronLeft, ChevronRight,
  Play, X, MessageCircle, Check, AlertCircle, RefreshCw, ArrowUpRight,
  Instagram, Facebook, Youtube, Sparkles, ArrowRight, Clock, MapPin,
  Grid, List, Send, ThumbsUp, Loader2, Camera, Video as VideoIcon,
  CheckCircle2, MessageSquare, Maximize2, FolderOpen, FileText as FileTextIcon
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ────────────────────────────────────────────────────────────
// 🔐 ACCÈS
// ────────────────────────────────────────────────────────────
const accessCode = sessionStorage.getItem('access_granted');
const expectedCode = (window.CLIENT_DATA && window.CLIENT_DATA.code) || null;
if (!accessCode || (expectedCode && accessCode !== expectedCode)) {
  window.location.href = 'communication.html';
}

const sb = window.__SUPABASE;
const D = window.CLIENT_DATA || {};
const CLIENT = {
  name:       D.name       || 'Client',
  initials:   D.initials   || 'CL',
  sector:     D.sector     || '',
  greeting:   D.greeting   || (D.name || 'Client').split(' ')[0],
  agencyName: D.agencyName || 'TimelessHouse',
  analyticsEnabled: D.analyticsEnabled === true,
  mediaEnabled:     D.mediaEnabled    !== false,
  invoicesEnabled:  D.invoicesEnabled !== false,
  shootsEnabled:    D.shootsEnabled   !== false,
  documentsEnabled: D.documentsEnabled !== false,
  media:      D.media      || [],
  invoices:   D.invoices   || [],
  shoots:     D.shoots     || [],
  documents:  D.documents  || [],
  comments:   D.comments   || [],
  analytics:  D.analytics  || {},
};

const A = CLIENT.analytics;
const REVENUE_DATA = A.followerGrowth && A.followerGrowth.length ? A.followerGrowth : [
  { week: 'S1', value: 0 }, { week: 'S2', value: 0 }, { week: 'S3', value: 0 }, { week: 'S4', value: 0 },
];
const ENGAGEMENT_DATA = A.engagementByDay && A.engagementByDay.length ? A.engagementByDay : [
  { day: 'Lun', insta: 0, fb: 0, tt: 0 }, { day: 'Mar', insta: 0, fb: 0, tt: 0 },
  { day: 'Mer', insta: 0, fb: 0, tt: 0 }, { day: 'Jeu', insta: 0, fb: 0, tt: 0 },
  { day: 'Ven', insta: 0, fb: 0, tt: 0 }, { day: 'Sam', insta: 0, fb: 0, tt: 0 },
  { day: 'Dim', insta: 0, fb: 0, tt: 0 },
];

// ────────────────────────────────────────────────────────────
// 🎨 STYLES NÉOMORPHIQUES
// ────────────────────────────────────────────────────────────
// 🎨 Palette LIGHT — cream warm (harmonisée avec communication.html)
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
  textChart: '#2a2620',
};

// 🎨 Palette DARK — graphite bleuté + accent ivoire chaud
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
  textChart: '#e8d8be',
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

// ---------- DarkToggle (fin + arc SVG qui voyage — version raffinée) ----------
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
      }}
    >
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

// ────────────────────────────────────────────────────────────
// 🛠 HELPERS — détection player + format
// ────────────────────────────────────────────────────────────
function getEmbed(url, type) {
  if (!url) return null;
  if (type === 'photo') return { kind: 'image', src: url };

  // Parsing robuste avec l'API URL
  let parsed;
  try { parsed = new URL(url); } catch (e) { return { kind: 'video', src: url }; }
  const host   = parsed.hostname.replace(/^www\./, '');
  const path   = parsed.pathname;
  const search = parsed.search;

  // ⚡ Streamable EN PRIORITÉ — doit être avant le check .mp4 car les liens
  // /l/ID/mp4-mobile.mp4 et /l/ID/mp4-high.mp4 finissent en .mp4 mais ne sont
  // pas lisibles cross-origin dans un <video> (CORS / auth CDN Streamable).
  // On détecte l'ID réel : /e/ID  →  ID direct
  //                        /l/ID/fichier.mp4  →  ID = 2e segment
  //                        /ID  →  page de partage
  if (host === 'streamable.com') {
    const parts = path.split('/').filter(Boolean);
    let id;
    if (parts[0] === 'e' && parts[1]) {
      id = parts[1];                      // déjà un lien embed
    } else if (parts[0] === 'l' && parts[1]) {
      id = parts[1];                      // /l/ID/mp4-mobile.mp4 → ID = parts[1]
    } else {
      id = parts[parts.length - 1];       // /ID (page de partage standard)
    }
    // Sécurité : l'ID Streamable ne contient jamais de point
    if (id && !id.includes('.')) {
      return { kind: 'iframe', src: `https://streamable.com/e/${id}` };
    }
  }

  // ⚡ Fichier vidéo direct (mp4, webm, mov, m4v) — Cloudinary, S3, Google Drive, etc.
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(path)) {
    return { kind: 'video', src: url };
  }

  // YouTube (toutes les variantes : youtube.com/watch?v=, youtu.be/, /embed/, /shorts/)
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
    let id = null;
    if (host === 'youtu.be') {
      id = path.split('/').filter(Boolean)[0];
    } else {
      id = parsed.searchParams.get('v') || path.split('/').filter(Boolean).pop();
    }
    if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}` };
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const numeric = path.split('/').filter(Boolean).find(p => /^\d+$/.test(p));
    if (numeric) return { kind: 'iframe', src: `https://player.vimeo.com/video/${numeric}` };
  }

  // Cloudinary video (URL pattern explicite)
  if (/res\.cloudinary\.com\/.*\/video\/upload/.test(url)) {
    return { kind: 'video', src: url };
  }
  return { kind: 'video', src: url };
}

function getThumbUrl(media) {
  if (media.thumb_url) return media.thumb_url;
  if (media.type === 'photo' && media.url) return media.url;
  if (media.type === 'video') {
    // Cloudinary : on remplace /video/upload/ par /video/upload/so_2,w_640/ + .jpg
    const cl = media.url && media.url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.[a-z0-9]+)?$/i);
    if (cl) return `${cl[1]}so_2,w_640/${cl[2]}.jpg`;
  }
  return null;
}

// Renvoie l'URL de la vidéo ALLÉGÉE (preview_url) pour l'aperçu au hover.
// Ne retombe JAMAIS sur media.url (vidéo originale) : si pas de version
// allégée, retourne null → aucune preview ne se lance (cas 3).
// Renvoie aussi null pour YouTube/Vimeo/Streamable (cas 4).
function getPreviewVideoUrl(media) {
  if (media.type !== 'video') return null;
  const src = media.preview_url; // version allégée UNIQUEMENT
  if (!src) return null;
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    // Fichier vidéo direct
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(path)) return src;
    // Cloudinary
    if (/res\.cloudinary\.com\/.*\/video\/upload/.test(src)) return src;
    // Streamable : URLs bloquées cross-origin (CORS) → pas de preview
    if (host === 'streamable.com') return null;
  } catch (e) {}
  return null;
}

function sanitizeFilename(s) {
  return (s || 'fichier').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 80);
}

function guessExtension(url, type) {
  const m = url && url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  return type === 'video' ? 'mp4' : 'jpg';
}

function frenchDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ────────────────────────────────────────────────────────────
// 📥 DOWNLOAD MOBILE-FRIENDLY (iOS Safari compatible)
// ────────────────────────────────────────────────────────────
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Détecte si l'URL est sur un CDN qu'on sait forcer à servir un
 * Content-Disposition: attachment côté serveur.
 * Note : Backblaze est désormais géré directement via les métadonnées du fichier.
 */
function isForceDownloadCDN(url) {
  if (!url) return false;
  return url.includes('res.cloudinary.com');
}

/**
 * Transforme une URL Cloudinary en URL "download forcé" via fl_attachment.
 * Cloudinary renvoie alors un header Content-Disposition: attachment côté
 * serveur, ce qui déclenche un vrai téléchargement même sur iOS Safari.
 */
function toCloudinaryDownloadUrl(url, filename) {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  if (url.includes('fl_attachment')) return url; // déjà transformée
  const safeName = (filename || 'fichier')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .slice(0, 60);
  return url.replace('/upload/', `/upload/fl_attachment:${safeName}/`);
}

/**
 * Tente de transformer n'importe quelle URL connue en URL de
 * téléchargement forcé.
 */
function toForceDownloadUrl(url, filename) {
  // On ne traite plus Backblaze ici car le paramètre causait une erreur 401.
  // Le téléchargement Backblaze est désormais natif grâce aux métadonnées.
  return toCloudinaryDownloadUrl(url, filename) || null;
}

/**
 * Téléchargement unifié et optimisé pour iOS/Android/Desktop.
 * - Cloudinary → URL "download forcé" (marche partout, même iOS)
 * - iOS hors CDN connu (ex: Backblaze) → navigation directe avec anti-cache
 * - Desktop / Android → fetch + blob classique
 * Retourne true si le téléchargement a été initié.
 */
async function smartDownload(url, filename, type) {
  if (!url || url === '#') return false;
  const ext = guessExtension(url, type);
  const fullName = `${sanitizeFilename(filename)}.${ext}`;

  // 1) CDN reconnus (Cloudinary) → URL "force download"
  const forcedUrl = toForceDownloadUrl(url, fullName);
  if (forcedUrl) {
    if (isIOS()) {
      window.location.href = forcedUrl;
    } else {
      const a = document.createElement('a');
      a.href = forcedUrl;
      a.download = fullName;
      a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    return true;
  }

  // Création d'une URL anti-cache pour contourner les mémoires des navigateurs
  // et les forcer à lire la métadonnée Content-Disposition de Backblaze
  const noCacheUrl = url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now();

  // 2) iOS hors CDN reconnu : ouverture directe
  if (isIOS()) {
    window.location.href = noCacheUrl;
    return true;
  }

  // 3) Desktop / Android : fetch + blob (technique éprouvée)
  try {
    const r = await fetch(noCacheUrl, { mode: 'cors' });
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fullName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  } catch (e) {
    // Ultime fallback : ouverture en nouvel onglet avec l'URL anti-cache
    window.open(noCacheUrl, '_blank', 'noopener');
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// 🎬 MEDIA CARD
// La vidéo est VISIBLE en pause (première frame = vignette naturelle).
// Hover (desktop) → joue. Leave → pause sur la frame courante.
// Mobile : 1er tap → joue, 2e tap → lightbox.
//
// Mémoire : IntersectionObserver charge le src (preload=metadata)
// quand la carte est proche du viewport, et le libère quand elle
// s'en éloigne. Seules les cartes visibles occupent de la RAM.
// ────────────────────────────────────────────────────────────
const isHoverDevice = typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const MediaCard = ({ media: m, thumb, previewVideo, onOpen, neu: neuStyle }) => {
  const videoRef = useRef(null);
  const cardRef  = useRef(null);
  const [playing, setPlaying] = useState(false);

  // ── Charger / décharger le src selon la visibilité (mémoire) ──
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !previewVideo) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const v = videoRef.current;
        if (!v) return;
        if (e.isIntersecting) {
          // Charge juste les métadonnées (1ère frame) pour un hover instantané
          if (v.getAttribute('src') !== previewVideo) {
            v.src = previewVideo;
            v.load();
          }
        } else {
          // Hors viewport élargi → libère le buffer
          v.pause();
          v.removeAttribute('src');
          v.load();
          setPlaying(false);
        }
      });
    }, { rootMargin: '400px 0px' });
    obs.observe(card);
    return () => obs.disconnect();
  }, [previewVideo]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v || !previewVideo) return;
    v.play().catch(() => {});
    setPlaying(true);
  }, [previewVideo]);

  const stop = useCallback(() => {
    const v = videoRef.current;
    if (v) v.pause();
    setPlaying(false);
  }, []);

  // Desktop : hover
  const handleEnter = useCallback(() => { if (isHoverDevice) play(); }, [play]);
  const handleLeave = useCallback(() => { if (isHoverDevice) stop(); }, [stop]);

  // Click / tap
  const handleClick = useCallback((e) => {
    if (!isHoverDevice && previewVideo) {
      if (!playing) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('th-card-preview', { detail: m.id }));
        play();
        return;
      }
      stop();
    }
    onOpen();
  }, [playing, previewVideo, play, stop, onOpen, m.id]);

  // Mobile : stopper quand une autre carte démarre
  useEffect(() => {
    if (isHoverDevice) return;
    const h = (e) => { if (e.detail !== m.id) stop(); };
    window.addEventListener('th-card-preview', h);
    return () => window.removeEventListener('th-card-preview', h);
  }, [m.id, stop]);

  // Mobile : stopper si tap en dehors
  useEffect(() => {
    if (isHoverDevice || !playing) return;
    const h = (e) => { if (!cardRef.current?.contains(e.target)) stop(); };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, [playing, stop]);

  return (
    <button ref={cardRef}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={neuStyle}
      className="rounded-[18px] lg:rounded-[20px] p-2 lg:p-2.5 group text-left active:scale-[0.98] transition-transform">

      <div className="aspect-[4/3] rounded-xl relative overflow-hidden"
        style={{ background: thumb ? `url(${thumb}) center/cover` : m.thumb }}>

        {/* Vidéo allégée — cachée au repos, visible seulement quand elle joue.
            Au repos : vignette perso (cas 1) ou cadre vide (cas 2/3). */}
        {previewVideo && (
          <video ref={videoRef} muted loop playsInline preload="metadata"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playing ? 'opacity-100' : 'opacity-0'}`} />
        )}

        {/* Overlay play — visible uniquement au repos */}
        {m.type === 'video' && !playing && (
          <>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-white/95 flex items-center justify-center group-hover:scale-110 transition">
                <Play size={14} className="text-stone-900 ml-0.5" fill="#2a2620" />
              </div>
            </div>
          </>
        )}

        {m.type === 'video' && m.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
            {m.duration}
          </div>
        )}
        <div className="absolute top-2 right-2 z-10">
          <ApprovalBadge status={m.approval_status} />
        </div>
      </div>

      <div className="px-1 pt-2.5 pb-1">
        <div className="font-medium text-[12.5px] lg:text-[13px] truncate leading-tight">{m.title}</div>
        <div className="text-[10.5px] text-stone-500 mt-1 truncate leading-none">
          {m.date}{m.tag ? ` · ${m.tag}` : ''}
        </div>
      </div>
    </button>
  );
};

// ────────────────────────────────────────────────────────────
// 🧱 ATOMS UI
// ────────────────────────────────────────────────────────────
const Pill = ({ active, children, onClick }) => (
  <button onClick={onClick} style={active ? neu.dark : {}}
    className={`px-5 py-3 rounded-full text-[13px] font-medium tracking-tight transition-all whitespace-nowrap min-h-[44px] ${active ? 'text-white' : 'text-stone-500 hover:text-stone-800'}`}>
    {children}
  </button>
);

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} style={active ? neu.pressedSm : {}}
    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left transition-all min-h-[48px] ${active ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
    <span className="text-[14px] font-medium tracking-tight">{label}</span>
  </button>
);

const StatCard = ({ label, value, delta, deltaUp, dark }) => (
  <div style={dark ? neu.dark : neu.raisedSm} className={`rounded-[22px] lg:rounded-3xl p-5 lg:p-6 ${dark ? 'text-white' : 'text-stone-900'}`}>
    <div className={`text-[12px] lg:text-[13px] ${dark ? 'text-stone-400' : 'text-stone-500'} font-medium leading-none`}>{label}</div>
    <div className="text-[28px] lg:text-[34px] tracking-tight mt-3 leading-none" style={SERIF}>{value}</div>
    {delta && (
      <div className="flex items-center gap-1.5 mt-3 text-[11.5px] lg:text-[12px] leading-none">
        <span className={deltaUp ? 'text-emerald-500 font-semibold' : (dark ? 'text-stone-400 font-medium' : 'text-stone-500 font-medium')}>{delta}</span>
      </div>
    )}
  </div>
);

const ApprovalBadge = ({ status, size = 'sm' }) => {
  const cfg = {
    pending:            { label: 'En attente',         bg: 'bg-amber-100',   text: 'text-amber-700',   icon: Clock },
    approved:           { label: 'Approuvé',           bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
    changes_requested:  { label: 'Changements demandés', bg: 'bg-rose-100',  text: 'text-rose-700',    icon: AlertCircle },
  }[status] || { label: status, bg: 'bg-stone-100', text: 'text-stone-600', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${size === 'lg' ? 'text-[12px] px-3 py-1.5' : 'text-[10px] px-2.5 py-1'} rounded-full font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
      <Icon size={size === 'lg' ? 12 : 10} /> {cfg.label}
    </span>
  );
};

// ────────────────────────────────────────────────────────────
// SIDEBAR (desktop) + BOTTOM NAV (mobile)
// ────────────────────────────────────────────────────────────
const Sidebar = ({ section, setSection, onLogout, isDark, toggleDark }) => {
  const nav = [
    { id: 'dashboard', icon: Home, label: 'Accueil' },
    ...(CLIENT.mediaEnabled    ? [{ id: 'media',    icon: ImageIcon,    label: 'Médias' }]      : []),
    ...(CLIENT.invoicesEnabled ? [{ id: 'invoices', icon: FileText,     label: 'Factures' }]    : []),
    ...(CLIENT.documentsEnabled ? [{ id: 'documents', icon: FolderOpen,  label: 'Documents' }]   : []),
    ...(CLIENT.analyticsEnabled ? [{ id: 'analytics', icon: BarChart3,  label: 'Analyses' }]    : []),
    ...(CLIENT.shootsEnabled   ? [{ id: 'calendar', icon: CalendarIcon, label: 'Calendrier' }]  : []),
  ];

  return (
    <aside style={neu.raised} className="hidden lg:flex w-[230px] h-[calc(100vh-40px)] sticky top-5 flex-col rounded-[32px] p-5 shrink-0">
      <div className="px-2 pt-2 pb-6">
        <div className="text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
          {CLIENT.agencyName}<span className="text-stone-400">.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mt-1.5 font-medium">Espace client</div>
      </div>

      <nav className="flex flex-col gap-1.5">
        {nav.map(n => <NavItem key={n.id} icon={n.icon} label={n.label} active={section === n.id} onClick={() => setSection(n.id)} />)}
      </nav>

      <div style={neu.dark} className="rounded-3xl p-5 text-white mt-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Connecté</div>
        <div className="text-[14px] mt-1.5 font-medium">{CLIENT.name}</div>
        <div className="text-[11px] text-stone-400 mt-0.5">{CLIENT.sector}</div>
      </div>

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Thème</span>
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
        <NavItem icon={LogOut} label="Déconnexion" onClick={onLogout} />
      </div>
    </aside>
  );
};

const MobileHeader = ({ onLogout, isDark, toggleDark }) => (
  <header
    className="lg:hidden flex items-center justify-between px-5 py-3.5 sticky top-0 z-30"
    style={{
      backgroundColor: isDark ? 'rgba(34,38,45,0.85)' : 'rgba(239,234,224,0.85)',
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderBottom: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.06)',
    }}>
    <div className="flex items-center gap-3 min-w-0">
      <div style={neu.darkSm} className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
        {CLIENT.initials}
      </div>
      <div className="min-w-0">
        <div className="text-[17px] tracking-tight leading-none truncate" style={{ ...SERIF, fontStyle: 'italic' }}>
          {CLIENT.agencyName}<span className="text-stone-400">.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400 mt-1 font-medium truncate">
          {CLIENT.name}
        </div>
      </div>
    </div>
    <div className="flex gap-2 items-center shrink-0">
      <div style={neu.raisedXs} className="h-11 px-3 rounded-full flex items-center justify-center">
        <DarkToggle isDark={isDark} onToggle={toggleDark} />
      </div>
      <button onClick={onLogout} aria-label="Déconnexion" style={neu.raisedXs}
        className="w-11 h-11 rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition-transform">
        <LogOut size={16} />
      </button>
    </div>
  </header>
);

const BottomNav = ({ section, setSection, isDark }) => {
  const nav = [
    { id: 'dashboard', icon: Home, label: 'Accueil' },
    ...(CLIENT.mediaEnabled    ? [{ id: 'media',    icon: ImageIcon,    label: 'Médias' }]      : []),
    ...(CLIENT.invoicesEnabled ? [{ id: 'invoices', icon: FileText,     label: 'Factures' }]    : []),
    ...(CLIENT.documentsEnabled ? [{ id: 'documents', icon: FolderOpen,  label: 'Docs' }]        : []),
    ...(CLIENT.analyticsEnabled ? [{ id: 'analytics', icon: BarChart3,  label: 'Analyses' }]    : []),
    ...(CLIENT.shootsEnabled   ? [{ id: 'calendar', icon: CalendarIcon, label: 'Agenda' }]      : []),
  ];
  return (
    <nav
      className="lg:hidden fixed bottom-4 left-4 right-4 z-30 rounded-[28px] px-2 py-2 flex items-center justify-around"
      style={{
        boxShadow: neu.raised.boxShadow,
        background: isDark ? 'rgba(34,38,45,0.5)' : 'rgba(239,234,224,0.5)',
        border: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(255,255,255,0.55)',
        backdropFilter: 'saturate(180%) blur(22px)',
        WebkitBackdropFilter: 'saturate(180%) blur(22px)',
      }}>
      {nav.map(n => {
        const Icon = n.icon;
        const active = section === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setSection(n.id)}
            style={active ? neu.darkSm : {}}
            aria-label={n.label}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 px-1 rounded-2xl transition-all active:scale-95 ${active ? 'text-white' : 'text-stone-500'}`}>
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="text-[10px] font-semibold tracking-tight leading-none">{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

// ────────────────────────────────────────────────────────────
// TOPBAR
// ────────────────────────────────────────────────────────────
const TopBar = ({ title, subtitle }) => (
  <div className="flex items-center justify-between mb-6 lg:mb-8 gap-4 pt-4 lg:pt-0">
    <div className="min-w-0 flex-1">
      <h1 className="text-[28px] lg:text-[34px] tracking-tight leading-[1.05]" style={SERIF}>{title}</h1>
      {subtitle && (
        <div className="text-[13px] lg:text-[13px] text-stone-500 mt-1.5 leading-relaxed">{subtitle}</div>
      )}
    </div>
    <div className="hidden lg:flex items-center gap-3 shrink-0">
      <div style={neu.raisedXs} className="rounded-full pl-2 pr-4 py-1.5 flex items-center gap-2.5">
        <div style={neu.darkSm} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold">{CLIENT.initials}</div>
        <span className="text-[13px] font-medium">{CLIENT.name}</span>
      </div>
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────
// 🏠 DASHBOARD — Refonte Apple-style (mai 2026)
//   • Une hiérarchie claire par bloc, suppression des "kickers" uppercase
//   • Cartes quick-action 56px tactile sur mobile, alignées dans une grille 2 col
//   • Espacement vertical cohérent (gap-4 mobile, gap-5 desktop)
//   • Plus de respiration, moins de décorations parasites
// ────────────────────────────────────────────────────────────
const Dashboard = ({ goTo }) => {
  const totalSpent = CLIENT.invoices.reduce((a, b) => a + b.amount, 0);
  const upcomingShoots = CLIENT.shoots.length;
  const engagement = (A.kpis && A.kpis.engagement) || '—';
  const pending = CLIENT.media.filter(m => m.approval_status === 'pending').length;

  // Build stat list dynamically (max 4)
  const stats = [];
  if (CLIENT.invoicesEnabled) stats.push({ key: 'spent', dark: true, label: 'Total facturé', value: `${totalSpent.toLocaleString('fr-FR')} €`, delta: A.kpis?.spentDelta, deltaUp: true });
  if (CLIENT.mediaEnabled)    stats.push({ key: 'media', label: 'Médias livrés', value: CLIENT.media.length, delta: A.kpis?.mediaDelta, deltaUp: true });
  if (CLIENT.mediaEnabled)    stats.push({ key: 'valid', label: 'À valider', value: pending, delta: pending > 0 ? 'en attente' : 'tout est OK' });
  if (CLIENT.analyticsEnabled) stats.push({ key: 'eng', label: 'Engagement', value: engagement, delta: A.kpis?.engagementDelta, deltaUp: true });
  else if (CLIENT.shootsEnabled) stats.push({ key: 'shoots', label: 'Tournages', value: upcomingShoots, delta: upcomingShoots > 0 ? 'planifiés' : '—' });

  // Quick actions
  const actions = [];
  if (CLIENT.mediaEnabled)     actions.push({ id: 'media',     icon: ImageIcon,    title: 'Mes médias',  sub: `${CLIENT.media.length} fichiers · ${pending} à valider` });
  if (CLIENT.analyticsEnabled) actions.push({ id: 'analytics', icon: BarChart3,    title: 'Analyses',    sub: 'Mise à jour temps réel' });
  else if (CLIENT.shootsEnabled) actions.push({ id: 'calendar', icon: CalendarIcon, title: 'Calendrier',  sub: `${upcomingShoots} tournage${upcomingShoots > 1 ? 's' : ''} à venir` });
  else if (CLIENT.invoicesEnabled) actions.push({ id: 'invoices', icon: FileText,   title: 'Factures',    sub: `${CLIENT.invoices.length} facture${CLIENT.invoices.length > 1 ? 's' : ''}` });
  if (CLIENT.documentsEnabled) actions.push({ id: 'documents', icon: FolderOpen, title: 'Documents', sub: `${CLIENT.documents.length} document${CLIENT.documents.length > 1 ? 's' : ''}` });

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-5">
      {/* ── Stats ── 2 col mobile, 4 col desktop ── */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4 lg:gap-5">
        {stats.slice(0, 4).map(s => (
          <StatCard key={s.key} dark={s.dark} label={s.label} value={s.value} delta={s.delta} deltaUp={s.deltaUp} />
        ))}
      </div>

      {/* ── Bloc principal : Analytics ou CTA Option ── */}
      {CLIENT.analyticsEnabled ? (
        <div style={neu.raised} className="lg:col-span-8 rounded-[24px] lg:rounded-[28px] p-6 lg:p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.08] pointer-events-none" style={{ background: `radial-gradient(circle, ${neu.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
          <h2 className="text-[22px] lg:text-[28px] tracking-tight leading-[1.1] max-w-md" style={SERIF}>Évolution de votre audience</h2>
          <div className="text-[13px] text-stone-500 mt-1.5 leading-relaxed">Sur les 4 dernières semaines.</div>
          <div className="mt-6 h-[180px] lg:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA}>
                <defs>
                  <linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={neu.textChart} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={neu.textChart} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke={neu.textChart} strokeWidth={2.2} fill="url(#cgrad)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={neu.raised} className="lg:col-span-8 rounded-[24px] lg:rounded-[28px] p-6 lg:p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.08] pointer-events-none" style={{ background: 'radial-gradient(circle, #b08968 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
          <div className="relative">
            <h2 className="text-[22px] lg:text-[28px] tracking-tight leading-[1.1] max-w-md" style={SERIF}>
              Suivez vos réseaux <em className="italic text-stone-500">en temps réel</em>
            </h2>
            <p className="text-[13px] lg:text-[13.5px] text-stone-500 mt-3 max-w-md leading-relaxed">
              Analyses Instagram, Facebook & TikTok intégrées : audience, engagement et synthèse hebdomadaire — directement dans votre tableau de bord.
            </p>
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <a href="mailto:contact@timelesshouse.org?subject=Activer%20les%20analyses%20réseaux%20sociaux"
                style={neu.darkSm} className="px-5 py-3 rounded-full text-white text-[13px] font-semibold flex items-center gap-2 min-h-[44px] active:scale-95 transition-transform">
                <ArrowUpRight size={14} /> Activer cette option
              </a>
              <span className="text-[12px] text-stone-400">À partir de 49 €/mois</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick actions ── grille adaptative, cartes pleines hauteur ── */}
      <div className="grid grid-cols-1 gap-3 lg:col-span-4 lg:gap-4">
        {actions.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              onClick={() => goTo(a.id)}
              style={neu.raised}
              className="rounded-[22px] lg:rounded-[24px] p-5 text-left flex items-center justify-between gap-4 group min-h-[88px] active:scale-[0.99] transition-transform">
              <div className="flex items-center gap-4 min-w-0">
                <div style={neu.darkSm} className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0">
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] tracking-tight">{a.title}</div>
                  <div className="text-[12px] text-stone-500 mt-0.5 truncate">{a.sub}</div>
                </div>
              </div>
              <ArrowUpRight size={18} className="text-stone-400 group-hover:text-stone-900 transition shrink-0" />
            </button>
          );
        })}
      </div>

      {/* ── Prochains tournages ── titre direct, pas de kicker ── */}
      {CLIENT.shootsEnabled && (
        <div style={neu.raised} className={`rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 ${CLIENT.invoicesEnabled ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          <div className="flex items-end justify-between mb-5 gap-3">
            <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-none" style={SERIF}>Prochains tournages</h3>
            <button onClick={() => goTo('calendar')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900 shrink-0 min-h-[32px]">
              Tout voir <ArrowRight size={13} />
            </button>
          </div>
          <div className="space-y-2.5">
            {CLIENT.shoots.slice(0, 3).map(s => (
              <div key={s.id} style={neu.pressedSm} className="rounded-2xl p-3.5 lg:p-4 flex items-center gap-4">
                <div style={neu.darkSm} className="w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white shrink-0">
                  <div className="text-[8.5px] uppercase tracking-wider text-stone-400 leading-none">{s.month}</div>
                  <div className="text-[16px] font-semibold leading-none mt-1" style={SERIF}>{s.date}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px] truncate leading-tight">{s.title}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-stone-500 flex-wrap leading-none">
                    {s.time && <span className="flex items-center gap-1"><Clock size={11} /> {s.time}</span>}
                    {s.location && <span className="flex items-center gap-1"><MapPin size={11} /> {s.location}</span>}
                  </div>
                </div>
                <div className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 font-semibold ${s.type === 'video' ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700'}`}>
                  {s.type}
                </div>
              </div>
            ))}
            {CLIENT.shoots.length === 0 && (
              <div className="text-center py-10 text-[13px] text-stone-400">Aucun tournage programmé.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Dernières factures ── */}
      {CLIENT.invoicesEnabled && (
        <div style={neu.raised} className={`rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 ${CLIENT.shootsEnabled ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
          <div className="flex items-end justify-between mb-5 gap-3">
            <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-none" style={SERIF}>Dernières factures</h3>
            <button onClick={() => goTo('invoices')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900 shrink-0 min-h-[32px]">
              Tout voir <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-stone-200/60">
            {CLIENT.invoices.slice(0, 4).map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-medium text-[13.5px] truncate leading-tight">{inv.id}</div>
                  <div className="text-[11.5px] text-stone-500 mt-0.5 leading-none">{inv.date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-[14px] leading-none">{inv.amount.toLocaleString('fr-FR')} €</div>
                  <div className={`text-[10px] uppercase tracking-wider mt-1 font-semibold leading-none ${inv.status === 'payée' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {inv.status}
                  </div>
                </div>
              </div>
            ))}
            {CLIENT.invoices.length === 0 && (
              <div className="text-center py-8 text-[13px] text-stone-400">Aucune facture émise.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 💬 LIGHTBOX (image / vidéo + approbation + commentaires)
// ────────────────────────────────────────────────────────────
const Lightbox = ({ items, index, onIndex, onClose, onMediaUpdate }) => {
  const m = items[index];
  // Pour la LECTURE : privilégier la vidéo allégée (preview_url) si fournie.
  // Le téléchargement utilise toujours m.url (haute qualité, plus bas dans downloadOne).
  const playableSrc = (m.type === 'video' && m.preview_url) ? m.preview_url : m.url;
  const embed = useMemo(() => getEmbed(playableSrc, m.type), [m, playableSrc]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [localStatus, setLocalStatus] = useState(m.approval_status);

  // Recharger les commentaires à chaque changement de média
  useEffect(() => {
    setLocalStatus(m.approval_status);
    setNewComment('');
    let cancelled = false;
    (async () => {
      const { data } = await sb.from('media_comments').select('*').eq('media_id', m.id).order('created_at');
      if (!cancelled) setComments(data || []);
    })();
    return () => { cancelled = true; };
  }, [m.id]);

  // Navigation clavier
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  const sendComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    const payload = {
      media_id:    m.id,
      author_name: CLIENT.greeting || CLIENT.name || 'Client',
      is_admin:    false,
      comment:     newComment.trim(),
    };
    const { data, error } = await sb.from('media_comments').insert(payload).select().single();
    if (!error && data) {
      setComments([...comments, data]);
      setNewComment('');

      // 💬 Notifier l'admin qu'un commentaire a été posté
      try {
        fetch(`${window.SUPABASE_URL}/functions/v1/notify-client`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}` },
          body:    JSON.stringify({
            kind:      'admin_new_comment',
            client_id: window.__CLIENT.id,
            media_id:  m.id,
            comment:   payload.comment,
          }),
        }).catch(() => {});
      } catch (e) {}
    } else {
      alert("Impossible d'envoyer le commentaire.");
    }
    setPosting(false);
  };

  const setApproval = async (status) => {
    setSavingApproval(true);
    const { error } = await sb.rpc('update_media_approval', { p_media_id: m.id, p_status: status });
    if (!error) {
      setLocalStatus(status);
      onMediaUpdate && onMediaUpdate(m.id, status);

      // Notifier l'admin lors d'une approbation ou d'une demande de changements
      if (status === 'approved' || status === 'changes_requested') {
        try {
          fetch(`${window.SUPABASE_URL}/functions/v1/notify-client`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}` },
            body:    JSON.stringify({
              kind:       status === 'approved' ? 'admin_media_approved' : 'admin_changes_requested',
              client_id:  window.__CLIENT.id,
              media_id:   m.id,
              dedupe_key: `${status}:${m.id}:${new Date().toISOString().slice(0,10)}`,
            }),
          }).catch(() => {});
        } catch (e) {}
      }
    } else {
      alert("Impossible de changer le statut.");
    }
    setSavingApproval(false);
  };

  const downloadOne = async () => {
    if (!m.url) return;
    const ok = await smartDownload(m.url, m.title, m.type);
    // Sur iOS hors CDN reconnu, expliquer comment sauvegarder le fichier
    if (ok && isIOS() && !isForceDownloadCDN(m.url)) {
      setTimeout(() => {
        alert(
          "Le fichier s'est ouvert dans Safari.\n\n" +
          "Pour l'enregistrer sur votre iPhone :\n" +
          "1. Appuyez sur l'icône Partager (carré avec flèche)\n" +
          "2. Choisissez « Enregistrer dans Fichiers »\n" +
          "   ou « Enregistrer la vidéo / l'image »"
        );
      }, 800);
    }
  };

  const [tab, setTab] = useState('info'); // mobile uniquement : info | comments

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-stone-900/95 backdrop-blur-sm">
      {/* Zone média — hauteur fixe sur mobile pour ne pas déborder sur l'aside */}
      <div className="flex items-center justify-center relative p-3 sm:p-6 lg:p-8 min-w-0 lg:flex-1 h-[55vh] lg:h-auto shrink-0 overflow-hidden">
        {/* Nav buttons */}
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} className="absolute left-2 lg:left-4 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur z-10">
            <ChevronLeft size={20} />
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={() => onIndex(index + 1)} className="absolute right-2 lg:right-4 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur z-10">
            <ChevronRight size={20} />
          </button>
        )}

        <div className="absolute top-3 left-3 lg:top-4 lg:left-4 text-white/70 text-[11px] lg:text-[12px] font-medium z-10 bg-white/5 backdrop-blur px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full">
          {index + 1} / {items.length}
        </div>

        <button onClick={onClose} className="absolute top-3 right-3 lg:top-4 lg:right-4 w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur z-10">
          <X size={16} />
        </button>

        <div className="max-w-full max-h-full flex items-center justify-center w-full h-full">
          {!embed && <div className="text-stone-400">Aucun aperçu disponible</div>}
          {embed && embed.kind === 'image' && (
            <img src={embed.src} alt={m.title} className="max-w-full max-h-full object-contain rounded-xl" />
          )}
          {embed && embed.kind === 'video' && (
            <video src={embed.src} controls playsInline className="max-w-full max-h-full object-contain rounded-xl bg-black" />
          )}
          {embed && embed.kind === 'iframe' && (
            <div className="w-full max-w-[1200px] aspect-video">
              <iframe src={embed.src} className="w-full h-full rounded-xl" frameBorder="0" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            </div>
          )}
        </div>
      </div>

      {/* Panneau (latéral desktop / panneau bas mobile) */}
      <aside className="lg:w-[380px] shrink-0 bg-stone-50 flex flex-col flex-1 lg:flex-none overflow-hidden border-t lg:border-t-0 border-stone-200">
        {/* Onglets mobile uniquement */}
        <div className="lg:hidden flex border-b border-stone-200 bg-white">
          <button onClick={() => setTab('info')}
            className={`flex-1 py-3 text-[12px] font-semibold uppercase tracking-wider transition ${tab === 'info' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400'}`}>
            Détails
          </button>
          <button onClick={() => setTab('comments')}
            className={`flex-1 py-3 text-[12px] font-semibold uppercase tracking-wider transition ${tab === 'comments' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400'}`}>
            Commentaires {comments.length > 0 && <span className="text-stone-500">({comments.length})</span>}
          </button>
        </div>

        {/* Conteneur info (header + validation) — scrollable sur mobile */}
        <div className={`${tab !== 'info' ? 'hidden lg:block' : 'flex flex-col'} lg:block lg:overflow-visible overflow-y-auto`}>
          {/* Header + actions */}
          <div className="p-5 lg:p-6 border-b border-stone-200">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {m.type === 'video' ? <VideoIcon size={14} className="text-stone-500" /> : <Camera size={14} className="text-stone-500" />}
              <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">{m.type === 'video' ? 'Vidéo' : 'Photo'}</span>
              {m.tag && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">{m.tag}</span>}
            </div>
            <h3 className="text-[20px] lg:text-[22px] tracking-tight leading-tight" style={SERIF}>{m.title}</h3>
            <div className="text-[12px] text-stone-500 mt-1">
              {m.date}{m.duration ? ` · ${m.duration}` : ''}{m.size ? ` · ${m.size}` : ''}
            </div>
            <button onClick={downloadOne} className="mt-4 w-full px-4 py-3 rounded-full bg-stone-900 text-white text-[12.5px] font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-95 transition-transform">
              <Download size={14} /> Télécharger{m.type === 'video' && m.preview_url ? ' (version HD)' : ''}
            </button>
            {m.type === 'video' && m.preview_url && (
              <div className="mt-2 text-[10.5px] text-stone-500 text-center leading-relaxed">
                Vous regardez la version allégée. La version originale haute qualité (plus lourde) est disponible au téléchargement.
              </div>
            )}
          </div>

          {/* Approbation */}
          <div className="p-5 lg:p-6 border-b border-stone-200">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-3">Validation</div>
            <div className="mb-3"><ApprovalBadge status={localStatus} size="lg" /></div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setApproval('approved')} disabled={savingApproval || localStatus === 'approved'}
                className={`px-3 py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition ${localStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} disabled:opacity-50`}>
                <ThumbsUp size={13} /> Approuver
              </button>
              <button onClick={() => setApproval('changes_requested')} disabled={savingApproval || localStatus === 'changes_requested'}
                className={`px-3 py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition ${localStatus === 'changes_requested' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'} disabled:opacity-50`}>
                <RefreshCw size={13} /> Changements
              </button>
            </div>
            {localStatus !== 'pending' && (
              <button onClick={() => setApproval('pending')} disabled={savingApproval} className="mt-2 w-full px-3 py-1.5 text-[11px] text-stone-500 hover:text-stone-900">
                Remettre en attente
              </button>
            )}
          </div>
        </div>

        {/* Commentaires */}
        <div className={`${tab !== 'comments' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col overflow-hidden min-h-[200px]`}>
          <div className="hidden lg:block px-6 pt-6 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={13} className="text-stone-500" />
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">Commentaires ({comments.length})</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 lg:px-6 pt-4 lg:pt-0 space-y-3 pb-3">
            {comments.length === 0 && <div className="text-[12px] text-stone-400 text-center py-6">Aucun commentaire.<br/>Démarrez la conversation.</div>}
            {comments.map(c => (
              <div key={c.id} className={`flex flex-col ${c.is_admin ? 'items-start' : 'items-end'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl ${c.is_admin ? 'bg-stone-200 text-stone-800 rounded-tl-sm' : 'bg-stone-900 text-white rounded-tr-sm'}`}>
                  <div className={`text-[10px] font-semibold mb-1 ${c.is_admin ? 'text-stone-500' : 'text-stone-400'}`}>
                    {c.author_name}{c.is_admin && ' · agence'}
                  </div>
                  <div className="text-[13px] leading-snug whitespace-pre-wrap">{c.comment}</div>
                </div>
                <div className="text-[10px] text-stone-400 mt-1 px-1">{frenchDate(c.created_at)}</div>
              </div>
            ))}
          </div>

          <div className="p-3 lg:p-4 border-t border-stone-200">
            <div className="flex items-end gap-2">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                placeholder="Écrire un commentaire…"
                rows={2}
                className="flex-1 px-3 py-2 rounded-xl bg-stone-100 text-[13px] resize-none focus:outline-none focus:bg-white focus:ring-1 focus:ring-stone-300"
              />
              <button onClick={sendComment} disabled={posting || !newComment.trim()} className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-800 disabled:opacity-50 shrink-0">
                {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 📸 MEDIA VIEW (galerie + tournages)
// ────────────────────────────────────────────────────────────
const Media = () => {
  const [filter,   setFilter]   = useState('tous');   // tous | photo | video | a-valider | approuves
  const [search,   setSearch]   = useState('');       // recherche par titre
  const [activeTag, setActiveTag] = useState('');     // tag sélectionné ('' = tous)
  const [view,     setView]     = useState('grid');   // grid | list
  const [lightbox, setLightbox] = useState({ open: false, items: [], index: 0 });
  const [media,    setMedia]    = useState(CLIENT.media);

  // Tags uniques présents dans les médias (tri alphabétique)
  const allTags = useMemo(() => {
    const tags = [...new Set(media.map(m => m.tag).filter(Boolean))].sort();
    return tags;
  }, [media]);

  // Application de tous les filtres en cascade
  const filtered = useMemo(() => {
    let res = media;
    // Filtre type / statut
    if (filter === 'photo')     res = res.filter(m => m.type === 'photo');
    if (filter === 'video')     res = res.filter(m => m.type === 'video');
    if (filter === 'a-valider') res = res.filter(m => m.approval_status === 'pending');
    if (filter === 'approuves') res = res.filter(m => m.approval_status === 'approved');
    // Filtre tag
    if (activeTag)              res = res.filter(m => m.tag === activeTag);
    // Recherche textuelle (insensible à la casse + accents)
    if (search.trim()) {
      const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      res = res.filter(m => {
        const t = (m.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return t.includes(q);
      });
    }
    return res;
  }, [filter, activeTag, search, media]);

  // Regroupement par tournage (mode grille)
  const groups = useMemo(() => {
    const byShoot = new Map();
    filtered.forEach(m => {
      const key = m.shoot_id || '__no_shoot__';
      if (!byShoot.has(key)) byShoot.set(key, []);
      byShoot.get(key).push(m);
    });
    const arr = [];
    CLIENT.shoots.forEach(s => {
      if (byShoot.has(s.id)) {
        arr.push({ shoot: s, items: byShoot.get(s.id) });
        byShoot.delete(s.id);
      }
    });
    if (byShoot.has('__no_shoot__')) arr.push({ shoot: null, items: byShoot.get('__no_shoot__') });
    return arr;
  }, [filtered]);

  const openLightbox = (items, item) => {
    const idx = items.findIndex(x => x.id === item.id);
    setLightbox({ open: true, items, index: idx });
  };

  const onMediaUpdate = (id, status) => {
    setMedia(prev => prev.map(m => m.id === id ? { ...m, approval_status: status } : m));
  };

  const hasActiveFilters = filter !== 'tous' || activeTag || search.trim();
  const photos   = media.filter(m => m.type === 'photo').length;
  const videos   = media.filter(m => m.type === 'video').length;
  const aValider = media.filter(m => m.approval_status === 'pending').length;
  const approuves = media.filter(m => m.approval_status === 'approved').length;

  return (
    <div className="space-y-4 lg:space-y-5">

      {/* ── Barre supérieure : recherche + toggle vue ── */}
      <div className="flex items-center gap-3">
        {/* Champ de recherche */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un fichier…"
            style={neu.pressedSm}
            className="w-full pl-9 pr-4 py-3 rounded-full text-[13.5px] placeholder:text-stone-400 bg-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Toggle grille / liste */}
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center shrink-0">
          <button onClick={() => setView('grid')}
            style={view === 'grid' ? neu.darkSm : {}}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${view === 'grid' ? 'text-white' : 'text-stone-500'}`}
            title="Vue grille">
            <Grid size={15} />
          </button>
          <button onClick={() => setView('list')}
            style={view === 'list' ? neu.darkSm : {}}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${view === 'list' ? 'text-white' : 'text-stone-500'}`}
            title="Vue liste">
            <List size={15} />
          </button>
        </div>
      </div>

      {/* ── Filtres type ── */}
      <div style={neu.raisedXs} className="rounded-full p-1 flex items-center overflow-x-auto no-scrollbar">
        <Pill active={filter === 'tous'}      onClick={() => setFilter('tous')}>Tous ({media.length})</Pill>
        <Pill active={filter === 'photo'}     onClick={() => setFilter('photo')}>📸 Photos ({photos})</Pill>
        <Pill active={filter === 'video'}     onClick={() => setFilter('video')}>🎥 Vidéos ({videos})</Pill>
        <Pill active={filter === 'a-valider'} onClick={() => setFilter('a-valider')}>⏳ À valider ({aValider})</Pill>
        <Pill active={filter === 'approuves'} onClick={() => setFilter('approuves')}>✓ Approuvés ({approuves})</Pill>
      </div>

      {/* ── Filtres tags (n'apparaît que s'il y a 2+ tags distincts) ── */}
      {allTags.length >= 2 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold shrink-0">Tag</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTag('')}
              style={!activeTag ? neu.darkSm : neu.raisedXs}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition active:scale-95 ${!activeTag ? 'text-white' : 'text-stone-600'}`}>
              Tous
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                style={activeTag === tag ? neu.darkSm : neu.raisedXs}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition active:scale-95 ${activeTag === tag ? 'text-white' : 'text-stone-600'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats — 2 cols mobile, 4 cols desktop ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Total" value={media.length} />
        <StatCard label="Photos" value={photos} />
        <StatCard label="Vidéos" value={videos} />
        <StatCard label="À valider" value={aValider} delta={`${approuves} approuvés`} />
      </div>

      {/* ── Résultats filtrés : label + reset ── */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12.5px] text-stone-500">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            {search ? ` pour « ${search} »` : ''}
            {activeTag ? ` · tag "${activeTag}"` : ''}
          </span>
          <button onClick={() => { setFilter('tous'); setActiveTag(''); setSearch(''); }}
            className="text-[12px] text-stone-400 hover:text-stone-700 flex items-center gap-1 transition">
            <X size={12} /> Réinitialiser
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          VUE GRILLE — groupée par tournage
          ══════════════════════════════════════════════ */}
      {view === 'grid' && (
        <>
          {groups.map((g, gi) => (
            <div key={g.shoot?.id || `no-${gi}`} style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
              {/* En-tête du groupe */}
              <div className="flex items-center gap-4 mb-5">
                {g.shoot ? (
                  <div style={g.shoot.type === 'video' ? neu.dark : neu.darkSm} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-white shrink-0">
                    <div className="text-[9px] uppercase tracking-wider text-stone-400 leading-none">{g.shoot.month}</div>
                    <div className="text-[18px] leading-none font-semibold mt-1" style={SERIF}>{g.shoot.date}</div>
                  </div>
                ) : (
                  <div style={neu.pressedSm} className="w-14 h-14 rounded-2xl flex items-center justify-center text-stone-400 shrink-0">
                    <ImageIcon size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[20px] lg:text-[24px] tracking-tight leading-tight truncate" style={SERIF}>
                    {g.shoot ? g.shoot.title : 'Médias divers'}
                  </h3>
                  <div className="text-[12px] text-stone-500 mt-1 leading-none">
                    {g.items.length} fichier{g.items.length > 1 ? 's' : ''}
                    {g.shoot?.location ? ` · ${g.shoot.location}` : ''}
                  </div>
                </div>
              </div>

              {/* Grille de cartes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                {g.items.map(m => {
                  const isVideo = m.type === 'video';
                  // Preview au hover = vidéo allégée uniquement (jamais l'originale)
                  const previewVideo = isVideo ? getPreviewVideoUrl(m) : null;
                  // Au repos : vidéo → SEULEMENT la vignette perso uploadée
                  // (sinon cadre vide) ; photo → son image normale
                  const thumb = isVideo ? (m.thumb_url || null) : getThumbUrl(m);
                  return (
                    <MediaCard
                      key={m.id}
                      media={m}
                      thumb={thumb}
                      previewVideo={previewVideo}
                      onOpen={() => openLightbox(g.items, m)}
                      neu={neu.raisedSm}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ══════════════════════════════════════════════
          VUE LISTE — plate, tous les médias en lignes
          ══════════════════════════════════════════════ */}
      {view === 'list' && (
        <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] overflow-hidden">
          {/* En-têtes desktop */}
          <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3.5 text-[10.5px] uppercase tracking-[0.16em] text-stone-400 font-semibold border-b border-stone-200/60">
            <div className="col-span-1" />
            <div className="col-span-4">Titre</div>
            <div className="col-span-2">Tag</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1">Durée / Taille</div>
            <div className="col-span-1 text-center">Statut</div>
            <div className="col-span-1 text-right">Ouvrir</div>
          </div>

          <div className="divide-y divide-stone-200/40">
            {filtered.map(m => {
              const thumb = getThumbUrl(m);
              return (
                <button key={m.id} onClick={() => openLightbox(filtered, m)}
                  className="w-full text-left hover:bg-stone-50/50 transition-colors active:bg-stone-100/60 group">

                  {/* Mobile : carte horizontale compacte */}
                  <div className="lg:hidden flex items-center gap-3.5 px-4 py-3.5">
                    {/* Vignette */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 relative"
                      style={{ background: thumb ? `url(${thumb}) center/cover` : m.thumb }}>
                      {m.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play size={12} className="text-white" fill="white" />
                        </div>
                      )}
                    </div>
                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13.5px] truncate leading-tight">{m.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {m.tag && (
                          <span style={neu.pressedSm} className="text-[10px] px-2 py-0.5 rounded-full text-stone-600 font-medium">{m.tag}</span>
                        )}
                        <span className="text-[11px] text-stone-400">{m.date}</span>
                        {m.duration && <span className="text-[11px] text-stone-400">{m.duration}</span>}
                        {m.size && <span className="text-[11px] text-stone-400">{m.size}</span>}
                      </div>
                    </div>
                    {/* Badge + icône */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <ApprovalBadge status={m.approval_status} />
                    </div>
                  </div>

                  {/* Desktop : ligne grille */}
                  <div className="hidden lg:grid grid-cols-12 gap-3 items-center px-5 py-3.5">
                    {/* Vignette */}
                    <div className="col-span-1">
                      <div className="w-10 h-10 rounded-lg overflow-hidden relative"
                        style={{ background: thumb ? `url(${thumb}) center/cover` : m.thumb }}>
                        {m.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play size={10} className="text-white ml-px" fill="white" />
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Titre */}
                    <div className="col-span-4">
                      <div className="font-medium text-[13.5px] truncate leading-tight">{m.title}</div>
                      <div className="text-[11px] text-stone-400 mt-0.5 leading-none">
                        {m.type === 'video' ? 'Vidéo' : 'Photo'}
                      </div>
                    </div>
                    {/* Tag */}
                    <div className="col-span-2">
                      {m.tag
                        ? <span style={neu.pressedSm} className="text-[11px] px-2.5 py-1 rounded-full text-stone-600 font-medium inline-block">{m.tag}</span>
                        : <span className="text-[11px] text-stone-300">—</span>
                      }
                    </div>
                    {/* Date */}
                    <div className="col-span-2 text-[12px] text-stone-500">{m.date || '—'}</div>
                    {/* Durée / Taille */}
                    <div className="col-span-1 text-[12px] text-stone-500">
                      {m.duration || m.size || '—'}
                    </div>
                    {/* Statut */}
                    <div className="col-span-1 flex justify-center">
                      <ApprovalBadge status={m.approval_status} />
                    </div>
                    {/* Bouton ouvrir */}
                    <div className="col-span-1 flex justify-end">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 group-hover:text-stone-900 group-hover:bg-stone-100 transition">
                        <Maximize2 size={13} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── État vide ── */}
      {media.length === 0 && (
        <div style={neu.raised} className="rounded-[28px] p-16 text-center">
          <div style={neu.darkSm} className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <ImageIcon size={22} />
          </div>
          <h3 className="text-[20px] tracking-tight" style={SERIF}>Aucun média pour l'instant</h3>
          <p className="text-[13px] text-stone-500 mt-2">Vos livraisons apparaîtront ici dès qu'elles seront prêtes.</p>
        </div>
      )}

      {/* ── Aucun résultat avec filtres actifs ── */}
      {media.length > 0 && filtered.length === 0 && (
        <div style={neu.raised} className="rounded-[28px] p-12 text-center">
          <div style={neu.pressedSm} className="w-14 h-14 rounded-2xl flex items-center justify-center text-stone-400 mx-auto mb-4">
            <Search size={20} />
          </div>
          <h3 className="text-[18px] tracking-tight" style={SERIF}>Aucun résultat</h3>
          <p className="text-[13px] text-stone-500 mt-2">Essayez d'autres termes ou réinitialisez les filtres.</p>
          <button onClick={() => { setFilter('tous'); setActiveTag(''); setSearch(''); }}
            className="mt-4 px-5 py-2.5 rounded-full text-[12.5px] font-semibold transition active:scale-95"
            style={neu.dark}>
            <span className="text-white">Tout afficher</span>
          </button>
        </div>
      )}

      {lightbox.open && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndex={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox({ ...lightbox, open: false })}
          onMediaUpdate={onMediaUpdate}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 💶 INVOICES (inchangé)
// ────────────────────────────────────────────────────────────
const Invoices = () => {
  const total = CLIENT.invoices.reduce((a, b) => a + b.amount, 0);
  const paid = CLIENT.invoices.filter(i => i.status === 'payée').reduce((a, b) => a + b.amount, 0);
  const pending = CLIENT.invoices.filter(i => i.status === 'en attente').reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Stats — empilées sur mobile pour bien souffler */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-5">
        <div style={neu.dark} className="rounded-[22px] lg:rounded-[24px] p-6 text-white">
          <div className="text-[12px] text-stone-400 font-medium leading-none">Total facturé</div>
          <div className="text-[34px] lg:text-[42px] tracking-tight mt-3 leading-none" style={SERIF}>{total.toLocaleString('fr-FR')} €</div>
        </div>
        <div style={neu.raisedSm} className="rounded-[22px] lg:rounded-[24px] p-6">
          <div className="text-[12px] text-stone-500 font-medium leading-none">Réglé</div>
          <div className="text-[28px] lg:text-[32px] tracking-tight mt-3 leading-none" style={SERIF}>{paid.toLocaleString('fr-FR')} €</div>
          <div className="mt-4 h-1.5 rounded-full" style={neu.pressedSm}>
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: total > 0 ? `${(paid/total)*100}%` : '0%' }} />
          </div>
        </div>
        <div style={neu.raisedSm} className="rounded-[22px] lg:rounded-[24px] p-6">
          <div className="text-[12px] text-stone-500 font-medium leading-none">En attente</div>
          <div className="text-[28px] lg:text-[32px] tracking-tight mt-3 leading-none" style={SERIF}>{pending.toLocaleString('fr-FR')} €</div>
          <div className="mt-4 h-1.5 rounded-full" style={neu.pressedSm}>
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: total > 0 ? `${(pending/total)*100}%` : '0%' }} />
          </div>
        </div>
      </div>

      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
        <h3 className="text-[20px] lg:text-[22px] tracking-tight mb-5 leading-none" style={SERIF}>Historique des factures</h3>

        {/* En-têtes desktop uniquement */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-4 pb-3 text-[10.5px] uppercase tracking-[0.16em] text-stone-400 font-semibold border-b border-stone-200/60">
          <div className="col-span-3">Référence</div><div className="col-span-4">Description</div><div className="col-span-2">Date</div><div className="col-span-2">Montant</div><div className="col-span-1 text-right">Statut</div>
        </div>

        <div className="space-y-2 lg:space-y-1 lg:mt-2">
          {CLIENT.invoices.map(inv => (
            <div key={inv.id} style={neu.pressedSm} className="rounded-2xl p-4 lg:p-4 lg:bg-transparent lg:shadow-none" >
              {/* Mobile : carte verticale aérée */}
              <div className="lg:hidden">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] font-semibold leading-none">{inv.id}</div>
                    <div className="text-[13px] text-stone-700 mt-2 leading-snug line-clamp-2">{inv.desc}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shrink-0 leading-none ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-stone-200/60">
                  <div className="text-[11.5px] text-stone-500 leading-none">{inv.date}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[18px] leading-none" style={SERIF}>{inv.amount.toLocaleString('fr-FR')} €</span>
                    {inv.url && (
                      <button
                        onClick={() => smartDownload(inv.url, `Facture-${inv.id}`, 'pdf')}
                        aria-label="Télécharger la facture"
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-stone-600 shrink-0 active:scale-95 transition-transform"
                        title="Télécharger la facture"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop : ligne grille */}
              <div className="hidden lg:grid grid-cols-12 gap-4 items-center py-1">
                <div className="col-span-3 font-mono text-[13px] font-medium">{inv.id}</div>
                <div className="col-span-4 text-[13px] text-stone-700">{inv.desc}</div>
                <div className="col-span-2 text-[12px] text-stone-500">{inv.date}</div>
                <div className="col-span-2 font-semibold text-[14px]" style={SERIF}>{inv.amount.toLocaleString('fr-FR')} €</div>
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                  {inv.url && (
                    <button
                      onClick={() => smartDownload(inv.url, `Facture-${inv.id}`, 'pdf')}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"
                      title="Télécharger la facture"
                    >
                      <Download size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {CLIENT.invoices.length === 0 && <div className="text-center py-12 text-[14px] text-stone-400">Aucune facture émise pour le moment.</div>}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 📁 DOCUMENTS (contrats, chartes graphiques, devis…)
// ────────────────────────────────────────────────────────────
const docCategoryStyle = (category) => ({
  'Contrat':          'bg-indigo-100 text-indigo-700',
  'Charte graphique': 'bg-fuchsia-100 text-fuchsia-700',
  'Devis':            'bg-amber-100 text-amber-700',
  'Brief':            'bg-sky-100 text-sky-700',
}[category] || 'bg-stone-100 text-stone-600');

const Documents = () => {
  const [filter, setFilter] = useState('all');
  const docs = CLIENT.documents;
  const categories = ['all', ...Array.from(new Set(docs.map(d => d.category).filter(Boolean)))];
  const shown = filter === 'all' ? docs : docs.filter(d => d.category === filter);

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Filtre par catégorie */}
      {categories.length > 2 && (
        <div style={neu.raisedXs} className="rounded-full p-1 inline-flex items-center overflow-x-auto no-scrollbar max-w-full">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              style={filter === c ? neu.darkSm : {}}
              className={`px-4 py-2.5 min-h-[40px] rounded-full text-[12.5px] font-medium whitespace-nowrap transition active:scale-95 ${filter === c ? 'text-white' : 'text-stone-500'}`}>
              {c === 'all' ? 'Tous' : c}
            </button>
          ))}
        </div>
      )}

      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
        <h3 className="text-[20px] lg:text-[22px] tracking-tight mb-5 leading-none" style={SERIF}>
          Vos documents {docs.length > 0 && <span className="text-stone-400">({docs.length})</span>}
        </h3>

        {/* En-têtes desktop */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-4 pb-3 text-[10.5px] uppercase tracking-[0.16em] text-stone-400 font-semibold border-b border-stone-200/60">
          <div className="col-span-5">Document</div><div className="col-span-3">Catégorie</div><div className="col-span-2">Date</div><div className="col-span-2 text-right">Fichier</div>
        </div>

        <div className="space-y-2 lg:space-y-1 lg:mt-2">
          {shown.map(doc => (
            <div key={doc.id} style={neu.pressedSm} className="rounded-2xl p-4 lg:p-4 lg:bg-transparent lg:shadow-none">
              {/* Mobile : carte verticale */}
              <div className="lg:hidden">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold leading-snug line-clamp-2 flex items-start gap-2">
                      <FileTextIcon size={15} className="text-stone-400 shrink-0 mt-0.5" /> <span>{doc.title}</span>
                    </div>
                    <div className="text-[11.5px] text-stone-500 mt-1.5 leading-none">{doc.date}{doc.size && ` · ${doc.size}`}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shrink-0 leading-none ${docCategoryStyle(doc.category)}`}>{doc.category}</span>
                </div>
                <div className="flex items-center justify-end pt-3 border-t border-stone-200/60">
                  {doc.url && (
                    <button
                      onClick={() => smartDownload(doc.url, doc.title || 'Document', 'pdf')}
                      aria-label="Télécharger le document"
                      className="px-4 h-10 rounded-full flex items-center gap-2 text-[12.5px] font-medium bg-white text-stone-700 active:scale-95 transition-transform"
                      title="Télécharger le document">
                      <Download size={14} /> Télécharger
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop : ligne grille */}
              <div className="hidden lg:grid grid-cols-12 gap-4 items-center py-1">
                <div className="col-span-5 text-[13px] text-stone-800 font-medium truncate flex items-center gap-2">
                  <FileTextIcon size={14} className="text-stone-400 shrink-0" /> {doc.title}
                </div>
                <div className="col-span-3">
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${docCategoryStyle(doc.category)}`}>{doc.category}</span>
                </div>
                <div className="col-span-2 text-[12px] text-stone-500">{doc.date}{doc.size && ` · ${doc.size}`}</div>
                <div className="col-span-2 flex items-center justify-end">
                  {doc.url && (
                    <button
                      onClick={() => smartDownload(doc.url, doc.title || 'Document', 'pdf')}
                      className="px-3.5 h-9 rounded-full flex items-center gap-2 text-[12px] font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                      title="Télécharger le document">
                      <Download size={13} /> Télécharger
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="text-center py-12 text-[14px] text-stone-400">
              {docs.length === 0 ? 'Aucun document partagé pour le moment.' : 'Aucun document dans cette catégorie.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 📊 ANALYTICS (inchangé)
// ────────────────────────────────────────────────────────────
const Analytics = () => {
  const [platform, setPlatform] = useState('all');
  const [timeRange, setTimeRange] = useState('7j');
  const k = A.kpis || {};
  const platforms = A.platforms || [];
  const demo = A.demographics || [{ name: '25-34', v: 0 }, { name: '18-24', v: 0 }, { name: '35-44', v: 0 }, { name: '45+', v: 0 }];

  const iconFor = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('insta')) return Instagram;
    if (n.includes('face'))  return Facebook;
    if (n.includes('you'))   return Youtube;
    return Sparkles;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center overflow-x-auto no-scrollbar">
          <Pill active={platform === 'all'} onClick={() => setPlatform('all')}>Tous réseaux</Pill>
          {platforms.map(p => <Pill key={p.name} active={platform === p.name} onClick={() => setPlatform(p.name)}>{p.name}</Pill>)}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full" style={neu.raisedXs}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-stone-700">Live</span>
          </div>
          <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
            {['24h', '7j', '30j', '12m'].map(t => <Pill key={t} active={timeRange === t} onClick={() => setTimeRange(t)}>{t}</Pill>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard dark label="Abonnés totaux" value={k.totalFollowers || '—'} delta={k.followersDelta} deltaUp />
        <StatCard label="Engagement" value={k.engagement || '—'} delta={k.engagementDelta} deltaUp />
        <StatCard label="Reach hebdo" value={k.reach || '—'} delta={k.reachDelta} deltaUp />
        <StatCard label="Clics sortants" value={k.clicks || '—'} delta={k.clicksDelta} />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div style={neu.raised} className="col-span-12 lg:col-span-8 rounded-[28px] p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Engagement par jour</div>
              <h3 className="text-[22px] tracking-tight mt-1" style={SERIF}>Interactions hebdomadaires</h3>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-stone-900" /> Instagram</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-stone-400" /> Facebook</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-stone-200" /> TikTok</span>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ENGAGEMENT_DATA} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e2e6" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }} />
                <Bar dataKey="insta" fill={neu.textChart} radius={[8, 8, 0, 0]} />
                <Bar dataKey="fb"    fill="#9ca3af" radius={[8, 8, 0, 0]} />
                <Bar dataKey="tt"    fill="#d1d5db" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={neu.raised} className="col-span-12 lg:col-span-4 rounded-[28px] p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Répartition audience</div>
          <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={SERIF}>Démographie</h3>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={demo} innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="v">
                  {[neu.textChart, '#4a4a4d', '#9ca3af', '#d1d5db'].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Total</div>
              <div className="text-[24px] leading-none mt-1" style={SERIF}>{k.totalFollowers || '—'}</div>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {demo.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: [neu.textChart, '#4a4a4d', '#9ca3af', '#d1d5db'][i] }} /> {r.name}</span>
                <span className="font-semibold">{r.v}%</span>
              </div>
            ))}
          </div>
        </div>

        {platforms.map(p => {
          const Icon = iconFor(p.name);
          return (
            <div key={p.name} style={neu.raisedSm} className="col-span-6 lg:col-span-3 rounded-[24px] p-5">
              <div className="flex items-center justify-between mb-3">
                <div style={neu.darkSm} className="w-10 h-10 rounded-xl flex items-center justify-center text-white"><Icon size={16} /></div>
                {p.delta && <span className="text-[11px] text-emerald-600 font-semibold">{p.delta}</span>}
              </div>
              <div className="font-semibold text-[14px]">{p.name}</div>
              <div className="text-[24px] tracking-tight mt-1 leading-none" style={SERIF}>{p.followers}</div>
              <div className="text-[11px] text-stone-500 mt-2">Engagement {p.engagement}</div>
            </div>
          );
        })}
      </div>

      {A.aiSummary && (
        <div style={neu.dark} className="rounded-[28px] p-7 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(40%, -40%)' }} />
          <div className="flex items-center gap-2 mb-2 relative">
            <Sparkles size={14} className="text-amber-200" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Synthèse de la semaine</span>
          </div>
          <h3 className="text-[26px] tracking-tight max-w-2xl leading-[1.15] relative" style={SERIF}>{A.aiSummary.headline}</h3>
          <p className="text-[13px] text-stone-300 mt-3 max-w-xl leading-relaxed relative">{A.aiSummary.body}</p>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 🗓 CALENDAR (inchangé)
// ────────────────────────────────────────────────────────────
const Calendar = () => {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const monthDays = Array.from({ length: 30 }, (_, i) => i + 1);
  const today = new Date().getDate();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[20px] lg:text-[22px] tracking-tight" style={SERIF}>Avril 2026</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Vue calendrier — desktop uniquement (illisible sur mobile) */}
        <div style={neu.raised} className="hidden lg:block lg:col-span-8 rounded-[28px] p-6">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {days.map(d => <div key={d} className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold text-center py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map(day => {
              const events = CLIENT.shoots.filter(s => s.date === day);
              const isToday = day === today;
              return (
                <div key={day} style={isToday ? neu.dark : (events.length ? neu.pressedSm : {})}
                  className={`aspect-square rounded-2xl p-2 flex flex-col ${isToday ? 'text-white' : ''} cursor-pointer hover:scale-[1.02] transition`}>
                  <div className={`text-[13px] font-semibold ${isToday ? '' : events.length ? 'text-stone-900' : 'text-stone-400'}`}>{day}</div>
                  <div className="mt-auto space-y-1">
                    {events.slice(0, 2).map(e => (
                      <div key={e.id} className={`text-[8px] truncate px-1.5 py-0.5 rounded-md font-medium ${e.type === 'video' ? (isToday ? 'bg-white text-stone-900' : 'bg-stone-900 text-white') : (isToday ? 'bg-stone-700 text-stone-200' : 'bg-stone-300 text-stone-700')}`}>
                        {e.type === 'video' ? '🎥' : '📸'} {e.title.split('—')[0].trim().slice(0, 12)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Liste prochains événements (mobile : pleine largeur) */}
        <div className="lg:col-span-4 space-y-4">
          <div style={neu.raised} className="rounded-[20px] lg:rounded-[24px] p-5">
            <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-4">Prochains événements</div>
            <div className="space-y-3">
              {CLIENT.shoots.map(s => (
                <div key={s.id} className="flex gap-3">
                  <div style={s.type === 'video' ? neu.darkSm : neu.pressedSm} className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${s.type === 'video' ? 'text-white' : ''}`}>
                    <div className={`text-[8px] uppercase tracking-wider ${s.type === 'video' ? 'text-stone-400' : 'text-stone-500'}`}>{s.month}</div>
                    <div className="text-[14px] leading-none font-semibold" style={SERIF}>{s.date}</div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="font-medium text-[13px] truncate">{s.title}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5 truncate">{s.time}{s.location && ` · ${s.location}`}</div>
                  </div>
                </div>
              ))}
              {CLIENT.shoots.length === 0 && <div className="text-[12px] text-stone-400 text-center py-4">Aucun événement</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 🌳 ROOT
// ────────────────────────────────────────────────────────────
function App() {
  const [isDark, toggleDark] = useDarkMode();
  // Reassign module-level mutable neu pointer for all components
  neu = isDark ? NEU_DARK : NEU_LIGHT;

  const [section, setSection] = useState('dashboard');

  const handleLogout = () => {
    sessionStorage.removeItem('access_granted');
    window.location.href = 'communication.html';
  };

  const titles = {
    dashboard: { t: `Bonjour ${CLIENT.greeting}`, s: 'Voici un aperçu de votre activité.' },
    media:     { t: 'Vos médias',                  s: 'Touchez un fichier pour le visualiser, le télécharger ou le valider.' },
    invoices:  { t: 'Vos factures',                s: 'Historique complet de votre facturation.' },
    documents: { t: 'Vos documents',               s: 'Contrats, chartes graphiques, devis et autres fichiers partagés.' },
    analytics: { t: 'Analyses temps réel',         s: 'Performance de vos réseaux sociaux.' },
    calendar:  { t: 'Vos tournages',               s: 'Calendrier des prochains shootings.' },
  };
  const titleData = titles[section] || titles.dashboard;

  return (
    <div className="min-h-screen w-full" style={{ ...neu.base, fontFamily: '"Manrope", system-ui, sans-serif' }}>
      <MobileHeader onLogout={handleLogout} isDark={isDark} toggleDark={toggleDark} />
      <div className="flex gap-5 px-4 pb-28 lg:p-5 lg:pb-5 min-h-screen">
        <Sidebar section={section} setSection={setSection} onLogout={handleLogout} isDark={isDark} toggleDark={toggleDark} />
        <main className="flex-1 min-w-0">
          <TopBar title={titleData.t} subtitle={titleData.s} />
          {section === 'dashboard' && <Dashboard goTo={setSection} />}
          {section === 'media'     && (CLIENT.mediaEnabled    ? <Media />    : <Dashboard goTo={setSection} />)}
          {section === 'invoices'  && (CLIENT.invoicesEnabled ? <Invoices /> : <Dashboard goTo={setSection} />)}
          {section === 'documents' && (CLIENT.documentsEnabled ? <Documents /> : <Dashboard goTo={setSection} />)}
          {section === 'analytics' && (CLIENT.analyticsEnabled ? <Analytics /> : <Dashboard goTo={setSection} />)}
          {section === 'calendar'  && (CLIENT.shootsEnabled   ? <Calendar /> : <Dashboard goTo={setSection} />)}
        </main>
      </div>
      <BottomNav section={section} setSection={setSection} isDark={isDark} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);