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
  CheckCircle2, MessageSquare, Maximize2, FolderOpen,
  FileText as FileTextIcon,
  // ━━━ Analytics v2 ━━━
  Hash, Zap, Target, DollarSign, MousePointerClick, TrendingUp, TrendingDown,
  Eye as EyeIcon, Bookmark, Plus, ExternalLink, AlertTriangle,
  Award, Activity, Layers, Heart, Users,
  // ━━━ Stratégies ━━━
  Lightbulb, Link2, ChevronDown, ChevronUp, Copy, Lock
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  // ━━━ Analytics v2 ━━━
  LineChart, Line, ComposedChart, ReferenceLine, Legend
} from 'recharts';

// — Config Supabase injectée par Vite depuis .env (variables VITE_*)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  agencyEmail: D.agencyEmail || 'service@timelesshouse.org',
  agencyLogo: D.agencyLogo || '',
  analyticsEnabled: D.analyticsEnabled === true,
  mediaEnabled:     D.mediaEnabled    !== false,
  invoicesEnabled:  D.invoicesEnabled !== false,
  shootsEnabled:    D.shootsEnabled   !== false,
  documentsEnabled: D.documentsEnabled !== false,
  strategiesEnabled: D.strategiesEnabled !== false,
  media:      D.media      || [],
  invoices:   D.invoices   || [],
  shoots:     D.shoots     || [],
  documents:  D.documents  || [],
  strategies: D.strategies || [],
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
// 🎨 Marque blanche (SaaS B.3) : si l'agence du client a personnalisé
// ses couleurs, la palette CLAIRE est régénérée depuis son fond et son
// accent — le mode sombre garde sa palette graphite, et TimelessHouse
// (couleurs par défaut) garde exactement son design d'origine.
(() => {
  const ag = window.__AGENCY || {};
  const bg  = (ag.bg_color || '#e9e4d9').toLowerCase();
  const acc = (ag.accent_color || '#2a2620').toLowerCase();
  if (bg === '#e9e4d9' && acc === '#2a2620') return;
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, target, f) => {
    const c = rgb(h).map(v => Math.round(v + (target - v) * f));
    return `rgb(${c.join(',')})`;
  };
  const raisedBg  = mix(bg, 255, 0.38);
  const pressedBg = mix(bg, 0, 0.05);
  Object.assign(NEU_LIGHT, {
    base:      { backgroundColor: bg },
    raised:    { backgroundColor: raisedBg,  boxShadow: '10px 10px 24px rgba(0,0,0,0.13), -10px -10px 24px rgba(255,255,255,0.85)' },
    raisedSm:  { backgroundColor: raisedBg,  boxShadow: '5px 5px 12px rgba(0,0,0,0.11), -5px -5px 12px rgba(255,255,255,0.8)' },
    raisedXs:  { backgroundColor: raisedBg,  boxShadow: '3px 3px 7px rgba(0,0,0,0.09), -3px -3px 7px rgba(255,255,255,0.75)' },
    pressed:   { backgroundColor: pressedBg, boxShadow: 'inset 5px 5px 10px rgba(0,0,0,0.13), inset -5px -5px 10px rgba(255,255,255,0.8)' },
    pressedSm: { backgroundColor: pressedBg, boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.11), inset -3px -3px 6px rgba(255,255,255,0.75)' },
    dark:      { backgroundColor: acc, boxShadow: '8px 8px 18px rgba(0,0,0,0.18), -3px -3px 8px rgba(255,255,255,0.5), inset 1px 1px 2px rgba(255,255,255,0.08)' },
    darkSm:    { backgroundColor: acc, boxShadow: '4px 4px 10px rgba(0,0,0,0.18), -2px -2px 6px rgba(255,255,255,0.45)' },
    accent:    acc,
    headerGlass: mix(bg, 255, 0.2).replace('rgb(', 'rgba(').replace(')', ',0.85)'),
    navGlass:    mix(bg, 255, 0.2).replace('rgb(', 'rgba(').replace(')', ',0.5)'),
  });
})();

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
        position: 'relative',
      }}
    >
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

// ━━━ Helpers de format pour Analytics v2 ━━━
const fmtNum = (n) => {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (Math.abs(v) >= 10_000)    return (v / 1_000).toFixed(1).replace('.', ',') + 'k';
  if (Math.abs(v) >= 1_000)     return v.toLocaleString('fr-FR');
  return String(v);
};
const fmtPct   = (n, d = 1) => n == null ? '—' : `${Number(n).toFixed(d).replace('.', ',')}%`;
const fmtMoney = (n, c = 'EUR') => n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
const platformColor = (p) => ({ instagram: '#E1306C', tiktok: '#000000', facebook: '#1877F2', youtube: '#FF0000' }[p] || '#71717a');
const platformLabel = (p) => ({ instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' }[p] || p);

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

  // ⚡ HLS adaptatif (pipeline B2) : master.m3u8 → lecteur hls.js.
  // La qualité s'ajuste automatiquement à la connexion du client,
  // avec badge de qualité + menu manuel (composant HlsPlayer).
  if (/\.m3u8(\?|$)/i.test(path)) {
    return { kind: 'hls', src: url };
  }

  // ⚡ Fichier vidéo direct (mp4, webm, mov, m4v) — B2, S3, Cloudinary, etc.
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

// Renvoie l'URL de la vidéo d'aperçu au hover.
// Priorité : hover_url (mini-MP4 480p généré par le pipeline B2),
// sinon preview_url si c'est un fichier direct. Ne retombe JAMAIS sur
// media.url (vidéo originale) : si pas de version légère, retourne null
// → aucune preview ne se lance (cas 3).
// Renvoie aussi null pour YouTube/Vimeo/Streamable et les .m3u8
// (HLS injouable dans un simple <video> hors Safari).
function getPreviewVideoUrl(media) {
  if (media.type !== 'video') return null;
  const src = media.hover_url || media.preview_url; // versions légères UNIQUEMENT
  if (!src) return null;
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    // HLS : réservé au lecteur de la lightbox
    if (/\.m3u8(\?|$)/i.test(path)) return null;
    // Fichier vidéo direct
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(path)) return src;
    // Cloudinary
    if (/res\.cloudinary\.com\/.*\/video\/upload/.test(src)) return src;
    // Streamable : URLs bloquées cross-origin (CORS) → pas de preview
    if (host === 'streamable.com') return null;
  } catch (e) {}
  return null;
}

// ─── Qualité de l'ORIGINAL (métadonnées mesurées par le pipeline B2) ───
// Sert à afficher au client que la lecture est une version adaptée et
// que le fichier final téléchargeable est d'une qualité supérieure.
function sourceQualityLabel(m) {
  const w = Number(m.source_width), h = Number(m.source_height);
  if (!w || !h) return null;
  const side = Math.min(w, h); // petit côté : vaut aussi pour les vidéos verticales
  if (side >= 2160) return '4K';
  if (side >= 1440) return '1440p';
  if (side >= 1080) return '1080p';
  if (side >= 720)  return '720p';
  return `${side}p`;
}
function sourceSizeLabel(m) {
  const b = Number(m.source_size_bytes);
  if (b > 0) {
    return b >= 1e9
      ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go`
      : `${Math.round(b / 1e6)} Mo`;
  }
  return m.size || null;
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
 * URLs servies par notre stockage B2 (directement ou via media.timelesshouse.org).
 * Ces fichiers portent un Content-Disposition: attachment posé à l'upload :
 * le navigateur les télécharge nativement.
 */
function isB2Url(url) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h === 'media.timelesshouse.org' || h.endsWith('.backblazeb2.com');
  } catch (e) { return false; }
}

/**
 * Détecte si l'URL est sur un stockage qu'on sait servir un
 * Content-Disposition: attachment (téléchargement forcé sans intervention).
 */
function isForceDownloadCDN(url) {
  if (!url) return false;
  return url.includes('res.cloudinary.com') || isB2Url(url);
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

  // 2) Stockage B2 : le fichier porte déjà Content-Disposition: attachment
  //    → navigation directe, le navigateur télécharge lui-même.
  //    ⚠️ Ne PAS passer par fetch + blob ici : cela chargerait tout le fichier
  //    en mémoire (nos originaux font 400 Mo à 5 Go) — ça échouait, et le repli
  //    se contentait d'ouvrir la vidéo dans un onglet au lieu de la télécharger.
  //    Bonus : marche aussi sur iOS, et le navigateur gère progression + reprise.
  if (isB2Url(url)) {
    const a = document.createElement('a');
    a.href = noCacheUrl;
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  }

  // 3) iOS hors CDN reconnu : ouverture directe
  if (isIOS()) {
    window.location.href = noCacheUrl;
    return true;
  }

  // 4) Desktop / Android : fetch + blob (technique éprouvée)
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
            Au repos : vignette perso (cas 1) ou cadre vide (cas 2/3).
            🎯 object-position + scale : appliquent le cadrage défini par l'admin
            pour éliminer d'éventuelles bandes noires intégrées dans le fichier MP4
            ou recentrer le sujet. Sans cadrage admin (defaults 50/50/1), le rendu
            est identique au comportement object-cover classique. */}
        {previewVideo && (() => {
          const fx = Number.isFinite(+m?.preview_focus_x) ? +m.preview_focus_x : 50;
          const fy = Number.isFinite(+m?.preview_focus_y) ? +m.preview_focus_y : 50;
          const pz = Number.isFinite(+m?.preview_zoom) && +m.preview_zoom > 0 ? +m.preview_zoom : 1;
          return (
            <video ref={videoRef} muted loop playsInline preload="metadata"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${playing ? 'opacity-100' : 'opacity-0'}`}
              style={{
                objectPosition: `${fx}% ${fy}%`,
                transform: pz !== 1 ? `scale(${pz})` : undefined,
                transformOrigin: `${fx}% ${fy}%`,
              }} />
          );
        })()}

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
    ...(CLIENT.strategiesEnabled ? [{ id: 'strategies', icon: Lightbulb, label: 'Stratégies' }]  : []),
    ...(CLIENT.analyticsEnabled ? [{ id: 'analytics', icon: BarChart3,  label: 'Analyses' }]    : []),
    ...(CLIENT.shootsEnabled   ? [{ id: 'calendar', icon: CalendarIcon, label: 'Calendrier' }]  : []),
  ];

  return (
    <aside style={neu.raised} className="hidden lg:flex w-[230px] h-[calc(100vh-40px)] sticky top-5 flex-col rounded-[32px] p-5 shrink-0">
      <div className="px-2 pt-2 pb-6">
        {CLIENT.agencyLogo ? (
          <img src={CLIENT.agencyLogo} alt={CLIENT.agencyName} className="max-h-10 max-w-[170px] object-contain object-left" />
        ) : (
          <div className="text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
            {CLIENT.agencyName}<span className="text-stone-400">.</span>
          </div>
        )}
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
      backgroundColor: isDark ? 'rgba(34,38,45,0.85)' : (NEU_LIGHT.headerGlass || 'rgba(239,234,224,0.85)'),
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderBottom: isDark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.06)',
    }}>
    <div className="flex items-center gap-3 min-w-0">
      <div style={neu.darkSm} className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
        {CLIENT.initials}
      </div>
      <div className="min-w-0">
        {CLIENT.agencyLogo ? (
          <img src={CLIENT.agencyLogo} alt={CLIENT.agencyName} className="max-h-7 max-w-[140px] object-contain object-left" />
        ) : (
          <div className="text-[17px] tracking-tight leading-none truncate" style={{ ...SERIF, fontStyle: 'italic' }}>
            {CLIENT.agencyName}<span className="text-stone-400">.</span>
          </div>
        )}
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
    ...(CLIENT.strategiesEnabled ? [{ id: 'strategies', icon: Lightbulb, label: 'Idées' }]       : []),
    ...(CLIENT.analyticsEnabled ? [{ id: 'analytics', icon: BarChart3,  label: 'Analyses' }]    : []),
    ...(CLIENT.shootsEnabled   ? [{ id: 'calendar', icon: CalendarIcon, label: 'Agenda' }]      : []),
  ];
  return (
    <nav
      className="lg:hidden fixed bottom-4 left-4 right-4 z-30 rounded-[28px] px-2 py-2 flex items-center justify-around"
      style={{
        boxShadow: neu.raised.boxShadow,
        background: isDark ? 'rgba(34,38,45,0.5)' : (NEU_LIGHT.navGlass || 'rgba(239,234,224,0.5)'),
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
  if (CLIENT.strategiesEnabled) actions.push({ id: 'strategies', icon: Lightbulb, title: 'Stratégies', sub: `${CLIENT.strategies.length} stratégie${CLIENT.strategies.length > 1 ? 's' : ''}` });

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
              <a href={`mailto:${CLIENT.agencyEmail}?subject=Activer%20les%20analyses%20réseaux%20sociaux`}
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
            <button onClick={() => goTo('calendar')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900 shrink-0 min-h-[44px]">
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
            <button onClick={() => goTo('invoices')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900 shrink-0 min-h-[44px]">
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
// 🎞 LECTEUR HLS ADAPTATIF (pipeline B2)
// La qualité s'ajuste en continu à la connexion du client (hls.js).
// Le badge affiche la qualité RÉELLEMENT en cours de lecture — pour
// que le client ne croie jamais que l'original a cette qualité — et
// ouvre un menu de choix manuel (Auto / 1080p / 720p / 480p…).
// Safari ancien (pas de MSE) : lecture HLS native, adaptative aussi,
// mais palier illisible → badge "AUTO" seul.
// ────────────────────────────────────────────────────────────
const HlsPlayer = ({ src, onRatio, boxStyle }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [levels, setLevels] = useState([]);           // paliers dispo, triés qualité desc
  const [manualLevel, setManualLevel] = useState(-1); // -1 = auto
  const [activeSide, setActiveSide] = useState(null); // palier réellement joué (1080, 720…)
  const [menuOpen, setMenuOpen] = useState(false);
  const [nativeOnly, setNativeOnly] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls = null, cancelled = false;
    (async () => {
      let Hls;
      try { Hls = (await import('hls.js')).default; } catch (e) { Hls = null; }
      if (cancelled) return;
      if (Hls && Hls.isSupported()) {
        hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          if (cancelled) return;
          const lv = (data.levels || [])
            // petit côté = nom du palier (vaut aussi pour les vidéos verticales)
            .map((l, i) => ({ index: i, side: Math.min(l.width || 0, l.height || 0) || (l.height || 0) }))
            .sort((a, b) => b.side - a.side);
          setLevels(lv);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          if (cancelled) return;
          const l = hls.levels[data.level];
          if (l) setActiveSide(Math.min(l.width || 0, l.height || 0) || (l.height || 0));
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (cancelled || !data.fatal) return;
          // Réseau : on retente ; sinon lecture impossible
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setFailed(true);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        setNativeOnly(true);
        video.src = src;
      } else {
        setFailed(true);
      }
    })();
    return () => { cancelled = true; if (hls) hls.destroy(); hlsRef.current = null; };
  }, [src]);

  const pick = (index) => {
    setManualLevel(index);
    setMenuOpen(false);
    if (hlsRef.current) hlsRef.current.currentLevel = index; // -1 = auto
  };

  if (failed) {
    return (
      <div className="text-stone-400 text-[13px] text-center px-6">
        Lecture impossible sur ce navigateur.<br />Utilisez le bouton Télécharger pour récupérer la vidéo.
      </div>
    );
  }

  const badge = nativeOnly
    ? 'AUTO'
    : activeSide
      ? (manualLevel === -1 ? `AUTO · ${activeSide}p` : `${activeSide}p`)
      : 'AUTO';

  return (
    <div style={{ ...boxStyle, position: 'relative' }} className="rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight && onRatio) onRatio(v.videoWidth / v.videoHeight);
        }}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      {/* Badge qualité + menu. Sur mobile, décalé SOUS la zone de la croix
          de fermeture de la lightbox (top-14) pour ne jamais la recouvrir ;
          en haut à droite classique sur desktop. */}
      <div className="absolute top-14 lg:top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5">
        <button
          type="button"
          aria-label="Choisir la qualité de lecture"
          onClick={() => setMenuOpen(o => !o)}
          disabled={nativeOnly}
          className="px-3 py-1.5 lg:px-2.5 lg:py-1 rounded-full bg-black/60 text-white text-[11px] lg:text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm hover:bg-black/80 transition disabled:cursor-default"
          title={nativeOnly ? 'Qualité automatique (gérée par votre appareil)' : 'Choisir la qualité'}
        >
          {badge}{!nativeOnly && <span className="ml-1 opacity-60">▾</span>}
        </button>
        {menuOpen && !nativeOnly && levels.length > 0 && (
          <div className="rounded-xl bg-black/80 backdrop-blur-md py-1.5 min-w-[150px] shadow-xl">
            <button
              type="button"
              onClick={() => pick(-1)}
              className={`w-full text-left px-4 py-2.5 lg:py-1.5 text-[13px] lg:text-[12px] ${manualLevel === -1 ? 'text-white font-semibold' : 'text-white/60 hover:text-white'}`}
            >
              Auto (recommandé)
            </button>
            {levels.map(l => (
              <button
                key={l.index}
                type="button"
                onClick={() => pick(l.index)}
                className={`w-full text-left px-4 py-2.5 lg:py-1.5 text-[13px] lg:text-[12px] ${manualLevel === l.index ? 'text-white font-semibold' : 'text-white/60 hover:text-white'}`}
              >
                {l.side}p
              </button>
            ))}
          </div>
        )}
      </div>
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

  // 📐 Ratio naturel du média (largeur / hauteur), lu au chargement.
  //   - <video>  : via onLoadedMetadata → videoWidth / videoHeight
  //   - <img>    : via onLoad           → naturalWidth / naturalHeight
  //   - <iframe> : non lisible (cross-origin) → 16/9 par défaut
  // Permet à la boîte de prendre le ratio du média lui-même, donc :
  //   - vidéo paysage (16:9) → boîte 16:9 → remplit largeur dispo
  //   - vidéo portrait (9:16) → boîte 9:16 → remplit hauteur dispo
  //   - aucune bande noire ajoutée par object-fit: contain.
  const [mediaRatio, setMediaRatio] = useState(16 / 9);
  useEffect(() => { setMediaRatio(16 / 9); }, [m.id]); // reset à chaque changement de média

  // Recharger les commentaires à chaque changement de média
  useEffect(() => {
    setLocalStatus(m.approval_status);
    setNewComment('');
    let cancelled = false;
    (async () => {
      // RPC scellée (SaaS B.2) : lecture vérifiée par le code d'accès
      const { data } = await sb.rpc('get_media_comments', { p_code: window.__CLIENT.code, p_media_id: m.id });
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

  // 🔒 Verrouille le défilement de la page derrière la lightbox.
  // body en position:fixed = seule technique fiable sur Safari iOS (overflow
  // hidden seul laisse passer le scroll tactile). Position restaurée à la
  // fermeture.
  useEffect(() => {
    const y = window.scrollY;
    const b = document.body.style;
    const prev = {
      position: b.position, top: b.top, left: b.left,
      right: b.right, width: b.width, overflow: b.overflow,
    };
    b.position = 'fixed';
    b.top = `-${y}px`;
    b.left = '0';
    b.right = '0';
    b.width = '100%';
    b.overflow = 'hidden';
    return () => {
      b.position = prev.position;
      b.top = prev.top;
      b.left = prev.left;
      b.right = prev.right;
      b.width = prev.width;
      b.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, []);

  const sendComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    const payload = {
      media_id:    m.id,
      author_name: CLIENT.greeting || CLIENT.name || 'Client',
      is_admin:    false,
      comment:     newComment.trim(),
    };
    // RPC scellée (SaaS B.2) : l'insert vérifie côté serveur que le média
    // appartient bien au client du code d'accès
    const { data, error } = await sb.rpc('add_media_comment', {
      p_code:        window.__CLIENT.code,
      p_media_id:    m.id,
      p_author_name: payload.author_name,
      p_comment:     payload.comment,
    });
    if (!error && data) {
      setComments([...comments, data]);
      setNewComment('');

      // 💬 Notifier l'admin qu'un commentaire a été posté
      try {
        fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
    // Signature scellée (SaaS B.2) : le code d'accès authentifie le client
    const { error } = await sb.rpc('update_media_approval', { p_code: window.__CLIENT.code, p_media_id: m.id, p_status: status });
    if (!error) {
      setLocalStatus(status);
      onMediaUpdate && onMediaUpdate(m.id, status);

      // Notifier l'admin lors d'une approbation ou d'une demande de changements
      if (status === 'approved' || status === 'changes_requested') {
        try {
          fetch(`${SUPABASE_URL}/functions/v1/notify-client`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
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
    <div
      className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-stone-900/95 backdrop-blur-sm"
      style={{
        // Encoche/barre iPhone : les contrôles ne passent jamais dessous.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Zone média — hauteur fixe sur mobile pour ne pas déborder sur l'aside
          Desktop : lg:h-full + lg:min-h-screen → la chaîne de h-full peut se résoudre
          jusqu'au <video>/<img> (sinon, height: 100% reste en "auto" et le média
          s'affiche à sa taille intrinsèque, souvent minuscule pour un preview allégé). */}
      <div className="flex items-center justify-center relative p-3 sm:p-6 lg:p-8 min-w-0 lg:flex-1 h-[55vh] lg:h-full lg:min-h-screen shrink-0 overflow-hidden">
        {/* Nav buttons */}
        {index > 0 && (
          <button aria-label="Média précédent" onClick={() => onIndex(index - 1)} className="absolute left-2 lg:left-4 top-1/2 -translate-y-1/2 w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur z-20">
            <ChevronLeft size={20} />
          </button>
        )}
        {index < items.length - 1 && (
          <button aria-label="Média suivant" onClick={() => onIndex(index + 1)} className="absolute right-2 lg:right-4 top-1/2 -translate-y-1/2 w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur z-20">
            <ChevronRight size={20} />
          </button>
        )}

        <div className="absolute top-3 left-3 lg:top-4 lg:left-4 text-white/70 text-[11px] lg:text-[12px] font-medium z-10 bg-white/5 backdrop-blur px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full">
          {index + 1} / {items.length}
        </div>

        {/* Croix : TOUJOURS au-dessus du lecteur (z-30 > badge qualité z-10),
            cible tactile 44px, fond sombre lisible sur vidéo claire. */}
        <button aria-label="Fermer" onClick={onClose} className="absolute top-3 right-3 lg:top-4 lg:right-4 w-11 h-11 lg:w-10 lg:h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur z-30">
          <X size={18} />
        </button>

        <div className="flex items-center justify-center w-full h-full min-h-0 min-w-0">
          {!embed && <div className="text-stone-400">Aucun aperçu disponible</div>}

          {/* Pattern de boîte adaptative au ratio du média :
              • height: 100%          → la boîte fait la hauteur dispo
              • aspect-ratio: ratio    → width se calcule depuis la height
              • max-width: 100%        → si ça déborde en largeur, on cape ; la height
                                         se recalcule alors automatiquement via aspect-ratio
              ⇒ Plus de bandes noires : la boîte épouse exactement le ratio du média
                et le navigateur trouve la plus grande taille qui tient dans le parent. */}

          {embed && embed.kind === 'image' && (
            <img
              src={embed.src}
              alt={m.title}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setMediaRatio(img.naturalWidth / img.naturalHeight);
                }
              }}
              className="rounded-xl"
              style={{
                height: '100%',
                maxWidth: '100%',
                width: 'auto',
                aspectRatio: mediaRatio,
                objectFit: 'contain',
              }}
            />
          )}

          {embed && embed.kind === 'video' && (
            <video
              src={embed.src}
              controls
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) {
                  setMediaRatio(v.videoWidth / v.videoHeight);
                }
              }}
              className="rounded-xl bg-black"
              style={{
                height: '100%',
                maxWidth: '100%',
                width: 'auto',
                aspectRatio: mediaRatio,
                objectFit: 'contain',
              }}
            />
          )}

          {/* HLS adaptatif (B2) : qualité auto selon la connexion + badge */}
          {embed && embed.kind === 'hls' && (
            <HlsPlayer
              src={embed.src}
              onRatio={setMediaRatio}
              boxStyle={{
                height: '100%',
                maxWidth: '100%',
                width: 'auto',
                aspectRatio: mediaRatio,
              }}
            />
          )}

          {/* Iframe (Streamable, YouTube…) : dimensions cross-origin illisibles → 16/9 par défaut */}
          {embed && embed.kind === 'iframe' && (
            <div
              className="rounded-xl overflow-hidden bg-black"
              style={{
                height: '100%',
                maxWidth: '100%',
                width: 'auto',
                aspectRatio: '16 / 9',
              }}
            >
              <iframe
                src={embed.src}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  border: 0,
                }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
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
        <div className={`${tab !== 'info' ? 'hidden lg:block' : 'flex flex-col'} lg:block lg:overflow-visible overflow-y-auto overscroll-contain`}>
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
              <Download size={14} /> Télécharger
              {m.type === 'video' && m.preview_url
                ? ` l'original${sourceQualityLabel(m) ? ' ' + sourceQualityLabel(m) : ''}`
                : ''}
            </button>
            {m.type === 'video' && m.preview_url && (
              <div className="mt-2 text-[10.5px] text-stone-500 text-center leading-relaxed">
                {(() => {
                  const q = sourceQualityLabel(m);
                  const s = sourceSizeLabel(m);
                  const detail = [q, s].filter(Boolean).join(' · ');
                  return detail
                    ? <>La lecture s'adapte à votre connexion — la qualité affichée n'est pas celle du fichier final. Votre original ({detail}), non compressé, est disponible au téléchargement.</>
                    : <>Vous regardez la version allégée. La version originale haute qualité (plus lourde) est disponible au téléchargement.</>;
                })()}
              </div>
            )}
          </div>

          {/* Approbation */}
          <div className="p-5 lg:p-6 border-b border-stone-200">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-3">Validation</div>
            <div className="mb-3"><ApprovalBadge status={localStatus} size="lg" /></div>
            <div className="grid grid-cols-2 gap-2">
              {/* HIG : min-h-[44px] — actions principales du client, cible tactile
                  complète + retour d'enfoncement au tap */}
              <button onClick={() => setApproval('approved')} disabled={savingApproval || localStatus === 'approved'}
                className={`px-3 py-2.5 min-h-[44px] rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 ${localStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} disabled:opacity-50 disabled:active:scale-100`}>
                <ThumbsUp size={13} /> Approuver
              </button>
              <button onClick={() => setApproval('changes_requested')} disabled={savingApproval || localStatus === 'changes_requested'}
                className={`px-3 py-2.5 min-h-[44px] rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 ${localStatus === 'changes_requested' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'} disabled:opacity-50 disabled:active:scale-100`}>
                <RefreshCw size={13} /> Changements
              </button>
            </div>
            {localStatus !== 'pending' && (
              <button onClick={() => setApproval('pending')} disabled={savingApproval} className="mt-1 w-full px-3 min-h-[44px] text-[11px] text-stone-500 hover:text-stone-900 active:scale-95 transition">
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

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 lg:px-6 pt-4 lg:pt-0 space-y-3 pb-3">
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
const Media = ({ navTarget, clearTarget }) => {
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

  // ── Navigation croisée : scroll vers le groupe du tournage demandé ──
  // requestAnimationFrame : attend que les groupes soient effectivement rendus.
  useEffect(() => {
    if (!navTarget?.shootId) return;
    const id = `media-shoot-${navTarget.shootId}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    clearTarget && clearTarget();
  }, []);

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
            className={`w-9 h-9 tap-ext rounded-full flex items-center justify-center transition active:scale-95 ${view === 'grid' ? 'text-white' : 'text-stone-500'}`}
            title="Vue grille">
            <Grid size={15} />
          </button>
          <button onClick={() => setView('list')}
            style={view === 'list' ? neu.darkSm : {}}
            className={`w-9 h-9 tap-ext rounded-full flex items-center justify-center transition active:scale-95 ${view === 'list' ? 'text-white' : 'text-stone-500'}`}
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
          {/* HIG : chips ≥44px (mesurées 30px) + 8px d'espacement entre cibles */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTag('')}
              style={!activeTag ? neu.darkSm : neu.raisedXs}
              className={`px-4 py-2 min-h-[44px] rounded-full text-[12px] font-medium transition active:scale-95 ${!activeTag ? 'text-white' : 'text-stone-600'}`}>
              Tous
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                style={activeTag === tag ? neu.darkSm : neu.raisedXs}
                className={`px-4 py-2 min-h-[44px] rounded-full text-[12px] font-medium transition active:scale-95 ${activeTag === tag ? 'text-white' : 'text-stone-600'}`}>
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
            <div key={g.shoot?.id || `no-${gi}`} id={g.shoot ? `media-shoot-${g.shoot.id}` : undefined} style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6 scroll-mt-24">
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
                      <div className="w-8 h-8 tap-ext rounded-full flex items-center justify-center text-stone-400 group-hover:text-stone-900 group-hover:bg-stone-100 transition">
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
// ── Chip de liaison vers un tournage (factures, documents) ──
// Cliquable si la rubrique Calendrier est active : ouvre le tournage ciblé.
const ShootChip = ({ shootId, goTo }) => {
  const shoot = (CLIENT.shoots || []).find(s => s.id === shootId);
  if (!shoot) return null;
  const clickable = CLIENT.shootsEnabled && goTo;
  return (
    <span
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); goTo('calendar', { shootId: shoot.id }); } : undefined}
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full leading-none max-w-full ${clickable ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      style={{ background: 'rgba(138,122,102,0.12)', color: '#8a7a66', border: '1px solid rgba(138,122,102,0.25)' }}
      title={clickable ? 'Voir ce tournage dans le calendrier' : undefined}
    >
      {shoot.type === 'video' ? '🎥' : '📸'}
      <span className="truncate">{shoot.title}</span>
      {clickable && <ChevronRight size={10} className="shrink-0" />}
    </span>
  );
};

// ── Chip de liaison vers une stratégie (documents) ──
const StrategyChip = ({ strategyId, goTo }) => {
  const strat = (CLIENT.strategies || []).find(s => s.id === strategyId);
  if (!strat) return null;
  const clickable = CLIENT.strategiesEnabled && goTo;
  return (
    <span
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); goTo('strategies', { strategyId: strat.id }); } : undefined}
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded-full leading-none max-w-full ${clickable ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      style={{ background: 'rgba(201,168,76,0.12)', color: '#a8893d', border: '1px solid rgba(201,168,76,0.3)' }}
      title={clickable ? 'Voir cette stratégie' : undefined}
    >
      💡 <span className="truncate">{strat.subtitle || strat.title}</span>
      {clickable && <ChevronRight size={10} className="shrink-0" />}
    </span>
  );
};

const Invoices = ({ goTo }) => {
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
                    {inv.shoot_id && <div className="mt-2"><ShootChip shootId={inv.shoot_id} goTo={goTo} /></div>}
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
                <div className="col-span-4 text-[13px] text-stone-700">
                  {inv.desc}
                  {inv.shoot_id && <div className="mt-1"><ShootChip shootId={inv.shoot_id} goTo={goTo} /></div>}
                </div>
                <div className="col-span-2 text-[12px] text-stone-500">{inv.date}</div>
                <div className="col-span-2 font-semibold text-[14px]" style={SERIF}>{inv.amount.toLocaleString('fr-FR')} €</div>
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                  {inv.url && (
                    <button
                      onClick={() => smartDownload(inv.url, `Facture-${inv.id}`, 'pdf')}
                      className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100"
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

const Documents = ({ goTo }) => {
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
                    {(doc.shoot_id || doc.strategy_id) && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        {doc.shoot_id && <ShootChip shootId={doc.shoot_id} goTo={goTo} />}
                        {doc.strategy_id && <StrategyChip strategyId={doc.strategy_id} goTo={goTo} />}
                      </div>
                    )}
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
                  {(doc.shoot_id || doc.strategy_id) && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {doc.shoot_id && <ShootChip shootId={doc.shoot_id} goTo={goTo} />}
                      {doc.strategy_id && <StrategyChip strategyId={doc.strategy_id} goTo={goTo} />}
                    </div>
                  )}
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

/* ════════════════════════════════════════════════════════════
   📊  ANALYTICS v2 — Module Vite/Tailwind v4
   ════════════════════════════════════════════════════════════
   Drop-in remplaçant le composant Analytics actuel
   (lignes 1732-1879 de communication-app.jsx).

   Compatible avec l'architecture migrée :
     ▸ Vite 5 + @vitejs/plugin-react (Babel)
     ▸ Tailwind CSS v4 via @tailwindcss/vite (scan AOT auto)
     ▸ Imports ESM natifs (lucide-react, recharts bundlés)
     ▸ Supabase via const sb = window.__SUPABASE (déjà initialisé
       par communication-dashboard.html)
     ▸ CLIENT.id lu depuis window.CLIENT_DATA.id
     ▸ Variables env : SUPABASE_URL / SUPABASE_ANON_KEY
       déjà disponibles en haut du fichier parent

   ────────────────────────────────────────────────────────────
   ⚠️  Ce fichier N'EST PAS un module ESM autonome.
       Il s'insère DANS communication-app.jsx, et réutilise :
         • neu, NEU_LIGHT, NEU_DARK     (styles)
         • SERIF                         (typo)
         • Pill, StatCard                (atoms)
         • sb, D, CLIENT                 (données runtime)
         • SUPABASE_URL/SUPABASE_ANON_KEY pour les Edge Functions
   ════════════════════════════════════════════════════════════ */


/* ────────────────────────────────────────────────────────────
   📦  IMPORTS À AJOUTER EN HAUT DE communication-app.jsx
   ────────────────────────────────────────────────────────────

   La migration Vite a déjà supprimé toutes les références CDN.
   On étend uniquement les blocs d'import lucide-react et
   recharts existants. Pas de nouvelle dépendance npm requise.

   REMPLACE la liste lucide-react actuelle (lignes 15-22)
   par la suivante (les nouveaux imports sont marqués │NEW│) :

   import {
     Home, Image as ImageIcon, FileText, BarChart3, Calendar as CalendarIcon,
     LogOut, Search, Bell, Filter, Download, ChevronLeft, ChevronRight,
     Play, X, MessageCircle, Check, AlertCircle, RefreshCw, ArrowUpRight,
     Instagram, Facebook, Youtube, Sparkles, ArrowRight, Clock, MapPin,
     Grid, List, Send, ThumbsUp, Loader2, Camera, Video as VideoIcon,
     CheckCircle2, MessageSquare, Maximize2, FolderOpen,
     FileText as FileTextIcon,
     // │NEW│ — Analytics v2
     Hash, Zap, Target, DollarSign, MousePointerClick, TrendingUp,
     TrendingDown, Eye as EyeIcon, Bookmark, Plus, ExternalLink,
     AlertTriangle, Award, Activity, Layers, Heart, Users
   } from 'lucide-react';

   REMPLACE la liste recharts actuelle (lignes 23-26) par :

   import {
     BarChart, Bar, AreaChart, Area, XAxis, YAxis,
     CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
     // │NEW│ — Analytics v2
     LineChart, Line, ComposedChart, ReferenceLine, Legend
   } from 'recharts';
   ──────────────────────────────────────────────────────────── */





/* ════════════════════════════════════════════════════════════
   🪝 HOOK : useSocialData
   ────────────────────────────────────────────────────────────
   Charge les données du client depuis Supabase. S'appuie sur
   le client `sb` déjà initialisé en haut de communication-app.jsx.
   ════════════════════════════════════════════════════════════ */
const useSocialData = (clientId, { platform = 'all', range = '30j' } = {}) => {
  const [state, setState] = useState({
    loading: true, accounts: [], posts: [], campaigns: [], alerts: [], insights: null
  });

  useEffect(() => {
    // Le jeton d'accès est le code client (RPC scellée SaaS B.2) ;
    // clientId ne sert plus qu'à invalider le hook si le client change.
    const code = window.__CLIENT && window.__CLIENT.code;
    if (!sb || !code) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;

    (async () => {
      setState(s => ({ ...s, loading: true }));

      try {
        // RPC scellée (SaaS B.2) : toutes les données sociales en un appel,
        // vérifié par le code d'accès (la fenêtre temporelle est calculée
        // côté serveur depuis p_range)
        const { data, error } = await sb.rpc('get_client_social', {
          p_code:  code,
          p_range: range,
        });
        if (error) throw error;

        if (cancelled) return;

        const d = data || {};
        // Pour chaque campagne, la liste des post_ids associés
        const campaigns = d.campaigns || [];
        const links     = d.campaign_posts || [];
        campaigns.forEach(c => {
          c.post_ids = links.filter(l => l.campaign_id === c.campaign_id).map(l => l.post_id);
        });

        setState({
          loading: false,
          accounts: d.accounts || [],
          posts: (d.posts || []).filter(p => platform === 'all' || p.platform === platform),
          campaigns,
          alerts: d.alerts || [],
          insights: d.insights || null,
        });
      } catch (err) {
        console.error('[Analytics v2] data load failed:', err);
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [clientId, platform, range]);

  return state;
};


/* ════════════════════════════════════════════════════════════
   🎨 ATOMS supplémentaires
   ──────────────────────────────────────────────────────────── */

const MetricTile = ({ icon: IconComp, label, value, sub, tone = 'neutral' }) => {
  const toneClasses = {
    neutral: 'text-stone-500',
    good:    'text-emerald-600',
    bad:     'text-rose-600',
    warn:    'text-amber-600',
  };
  return (
    <div style={neu.raisedXs} className="rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <IconComp size={13} className="text-stone-400" />
        <span className="text-[10.5px] uppercase tracking-[0.15em] text-stone-400 font-semibold">{label}</span>
      </div>
      <div className="text-[22px] tracking-tight leading-none" style={SERIF}>{value}</div>
      {sub && <div className={`text-[11px] mt-2 leading-tight ${toneClasses[tone]}`}>{sub}</div>}
    </div>
  );
};

const VelocityBadge = ({ score }) => {
  if (score == null) return null;
  if (score >= 3)   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700"><Zap size={10}/> VIRAL</span>;
  if (score >= 1.5) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><TrendingUp size={10}/> TENDANCE</span>;
  if (score < 0.5)  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500"><TrendingDown size={10}/> Sous moyenne</span>;
  return null;
};

const PlatformBadge = ({ platform, size = 'sm' }) => {
  const IconMap = { instagram: Instagram, tiktok: Sparkles, facebook: Facebook, youtube: Youtube };
  const IconComp = IconMap[platform] || Sparkles;
  const px = size === 'lg' ? 16 : 12;
  return (
    <span className="inline-flex items-center gap-1.5">
      <IconComp size={px} style={{ color: platformColor(platform) }} />
      {size === 'lg' && <span className="text-[12px] font-medium">{platformLabel(platform)}</span>}
    </span>
  );
};

const Metric = ({ label, value, sub, highlight }) => (
  <div>
    <div className="text-[9.5px] uppercase tracking-wider text-stone-400 font-semibold">{label}</div>
    <div className={`text-[14px] tracking-tight leading-none mt-1 ${highlight ? 'text-emerald-700 font-bold' : ''}`} style={SERIF}>{value}</div>
    {sub && <div className="text-[9.5px] text-stone-400 mt-0.5">{sub}</div>}
  </div>
);


/* ════════════════════════════════════════════════════════════
   📊  COMPOSANT PRINCIPAL — remplace l'ancien Analytics
   ════════════════════════════════════════════════════════════ */
const Analytics = () => {
  const [platform, setPlatform]   = useState('all');
  const [timeRange, setTimeRange] = useState('30j');
  const [tab, setTab]             = useState('overview');

  // CLIENT.id provient de window.CLIENT_DATA.id (peuplé par
  // communication-dashboard.html avant l'import dynamique de ce fichier)
  const clientId = D.id;

  const { loading, accounts, posts, campaigns, alerts, insights } =
    useSocialData(clientId, { platform, range: timeRange });

  const kpis = useMemo(() => {
    if (!posts.length) return null;
    const sum = (k) => posts.reduce((s, p) => s + (Number(p[k]) || 0), 0);
    const totalReach        = sum('reach');
    const totalEngagements  = posts.reduce((s, p) =>
      s + (+p.likes || 0) + (+p.comments || 0) + (+p.shares || 0) + (+p.saves || 0), 0);
    const totalImpressions  = sum('impressions');
    const totalSaves        = sum('saves');
    const totalClicks       = sum('website_clicks');
    const avgER             = totalReach > 0 ? (totalEngagements / totalReach * 100) : null;
    const nfReachWeighted   = sum('reach_from_non_followers');
    const nfPct             = totalReach > 0 ? (nfReachWeighted / totalReach * 100) : null;
    return { totalReach, totalEngagements, totalImpressions, totalSaves, totalClicks, avgER, nfPct, postsCount: posts.length };
  }, [posts]);

  // État de chargement
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} style={neu.raisedSm} className="rounded-[22px] h-[120px] animate-pulse" />
          ))}
        </div>
        <div style={neu.raised} className="rounded-[28px] h-[300px] animate-pulse" />
      </div>
    );
  }

  // Aucun compte connecté → onboarding
  if (accounts.length === 0) return <NoAccountsConnected />;

  return (
    <div className="space-y-5">
      <AnalyticsHeader
        accounts={accounts}
        platform={platform} setPlatform={setPlatform}
        timeRange={timeRange} setTimeRange={setTimeRange}
      />

      {alerts.length > 0 && <AlertsStrip alerts={alerts} />}

      {/* Onglets */}
      <div style={neu.raisedXs} className="rounded-full p-1 flex items-center w-fit overflow-x-auto">
        {[
          { id: 'overview',  label: "Vue d'ensemble", icon: BarChart3 },
          { id: 'posts',     label: 'Posts',          icon: Layers },
          { id: 'campaigns', label: 'Campagnes',      icon: Target },
          { id: 'audience',  label: 'Audience',       icon: Users },
        ].map(t => {
          const IconComp = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={tab === t.id ? neu.dark : {}}
              className={`px-4 py-2.5 rounded-full text-[12.5px] font-medium tracking-tight transition-all flex items-center gap-2 whitespace-nowrap ${tab === t.id ? 'text-white' : 'text-stone-500 hover:text-stone-800'}`}
            >
              <IconComp size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview'  && <OverviewTab  kpis={kpis} posts={posts} insights={insights} accounts={accounts} />}
      {tab === 'posts'     && <PostsTab     posts={posts} />}
      {tab === 'campaigns' && <CampaignsTab campaigns={campaigns} posts={posts} />}
      {tab === 'audience'  && <AudienceTab  accounts={accounts} posts={posts} />}
    </div>
  );
};


/* ════════════════════════════════════════════════════════════
   HEADER
   ──────────────────────────────────────────────────────────── */
const AnalyticsHeader = ({ accounts, platform, setPlatform, timeRange, setTimeRange }) => {
  const lastSync = accounts.reduce(
    (a, b) => !a || (b.last_sync_at && b.last_sync_at > a) ? b.last_sync_at : a,
    null
  );
  const ago = lastSync ? Math.round((Date.now() - new Date(lastSync).getTime()) / 60000) : null;
  const agoStr = ago == null ? 'jamais' : ago < 60 ? `il y a ${ago} min` : `il y a ${Math.round(ago/60)}h`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div style={neu.raisedXs} className="rounded-full p-1 flex items-center overflow-x-auto">
        <Pill active={platform === 'all'} onClick={() => setPlatform('all')}>Tous</Pill>
        {accounts.map(a => (
          <Pill key={a.id} active={platform === a.platform} onClick={() => setPlatform(a.platform)}>
            <span className="flex items-center gap-1.5">
              <PlatformBadge platform={a.platform} /> {platformLabel(a.platform)}
            </span>
          </Pill>
        ))}
        {/* Connecter la plateforme manquante (Instagram/TikTok) */}
        {['instagram', 'tiktok'].filter(p => !accounts.some(a => a.platform === p)).map(p => (
          <a key={p}
             href={`${SUPABASE_URL}/functions/v1/social-oauth/start/${p}?code=${encodeURIComponent(CLIENT.code || '')}`}
             className="px-3 py-1.5 text-[11.5px] text-stone-400 hover:text-stone-800 whitespace-nowrap transition">
            + {platformLabel(p)}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-full" style={neu.raisedXs}>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium text-stone-700">Sync · {agoStr}</span>
        </div>
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
          {['24h', '7j', '30j', '12m'].map(t =>
            <Pill key={t} active={timeRange === t} onClick={() => setTimeRange(t)}>{t}</Pill>
          )}
        </div>
      </div>
    </div>
  );
};


/* ════════════════════════════════════════════════════════════
   ALERTES
   ──────────────────────────────────────────────────────────── */
const AlertsStrip = ({ alerts }) => {
  const iconFor = (kind) => ({
    viral_post:         { i: Zap,           c: 'text-rose-500'     },
    engagement_drop:    { i: TrendingDown,  c: 'text-amber-500'    },
    spend_pace:         { i: DollarSign,    c: 'text-amber-500'    },
    sentiment_negative: { i: AlertTriangle, c: 'text-rose-500'     },
    follower_spike:     { i: TrendingUp,    c: 'text-emerald-500'  },
    kpi_target_hit:     { i: Award,         c: 'text-emerald-500'  },
  }[kind] || { i: AlertCircle, c: 'text-stone-500' });

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {alerts.map(a => {
        const { i: IconComp, c } = iconFor(a.kind);
        return (
          <div key={a.id} style={neu.raisedSm} className="rounded-2xl p-3.5 flex items-start gap-3 min-w-[280px]">
            <div className={`shrink-0 ${c}`}><IconComp size={16} /></div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold leading-tight">{a.title}</div>
              {a.body && <div className="text-[11px] text-stone-500 mt-1 leading-snug line-clamp-2">{a.body}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};


/* ════════════════════════════════════════════════════════════
   ONGLET 1 — VUE D'ENSEMBLE
   ──────────────────────────────────────────────────────────── */
const OverviewTab = ({ kpis, posts, insights, accounts }) => {
  const totalFollowers = accounts.reduce((s, a) => s + (Number(a.follower_count) || 0), 0);

  const topPosts = useMemo(() =>
    [...posts].sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0)).slice(0, 3),
  [posts]);

  const timeline = useMemo(() => {
    const buckets = {};
    posts.forEach(p => {
      const d = p.published_at.slice(0, 10);
      buckets[d] = buckets[d] || { date: d, label: fmtDate(d), reach: 0, engagements: 0 };
      buckets[d].reach += +p.reach || 0;
      buckets[d].engagements += (+p.likes || 0) + (+p.comments || 0) + (+p.shares || 0) + (+p.saves || 0);
    });
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard dark label="Audience totale" value={fmtNum(totalFollowers)} delta={`${accounts.length} compte${accounts.length > 1 ? 's' : ''}`} />
        <StatCard label="Engagement moyen" value={fmtPct(kpis?.avgER)} delta={kpis?.postsCount ? `${kpis.postsCount} posts` : '—'} deltaUp />
        <StatCard label="Reach total" value={fmtNum(kpis?.totalReach)} delta={kpis?.totalImpressions ? `${fmtNum(kpis.totalImpressions)} impressions` : '—'} deltaUp />
        <StatCard label="Non-followers" value={fmtPct(kpis?.nfPct, 0)} delta="Indicateur viralité" deltaUp />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div style={neu.raised} className="col-span-12 lg:col-span-8 rounded-[28px] p-6 lg:p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Performance dans le temps</div>
              <h3 className="text-[22px] tracking-tight mt-1" style={SERIF}>Reach & engagement par jour</h3>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-stone-900" /> Reach</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-stone-400" /> Engagements</span>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6cfc0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="e" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }} />
                <Bar yAxisId="r" dataKey="reach" fill="#2a2620" radius={[6, 6, 0, 0]} />
                <Line yAxisId="e" type="monotone" dataKey="engagements" stroke="#9ca3af" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={neu.raised} className="col-span-12 lg:col-span-4 rounded-[28px] p-6 lg:p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Podium</div>
          <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={SERIF}>Posts les plus engageants</h3>
          <div className="space-y-3">
            {topPosts.length === 0 && <div className="text-[12px] text-stone-400 italic">Aucun post sur la période</div>}
            {topPosts.map((p, i) => (
              <a key={p.id} href={p.permalink || '#'} target="_blank" rel="noreferrer"
                 style={neu.raisedXs}
                 className="rounded-2xl p-3 flex gap-3 items-center hover:opacity-90 transition">
                <div className="text-[20px] font-bold text-stone-400 w-6 text-center" style={SERIF}>{i + 1}</div>
                <div className="w-12 h-12 rounded-xl bg-stone-200 shrink-0 overflow-hidden"
                     style={p.thumbnail_url ? { backgroundImage: `url(${p.thumbnail_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <PlatformBadge platform={p.platform} />
                    <span className="text-[10px] text-stone-400">{fmtDate(p.published_at)}</span>
                  </div>
                  <div className="text-[11.5px] text-stone-700 truncate">{p.caption || '(sans légende)'}</div>
                  <div className="text-[11px] font-semibold mt-0.5 text-emerald-700">{fmtPct(p.engagement_rate)} engagement</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {accounts.map(a => (
          <div key={a.id} style={neu.raisedSm} className="rounded-[22px] p-5">
            <div className="flex items-center justify-between mb-3">
              <PlatformBadge platform={a.platform} size="lg" />
              {a.sync_status === 'ok'    && <span className="text-[10px] text-emerald-600 font-semibold">● Live</span>}
              {a.sync_status === 'error' && <span className="text-[10px] text-rose-600 font-semibold">● Erreur</span>}
            </div>
            <div className="text-[12px] text-stone-500 truncate">@{a.account_name}</div>
            <div className="text-[24px] tracking-tight mt-1 leading-none" style={SERIF}>{fmtNum(a.follower_count)}</div>
            <div className="text-[11px] text-stone-400 mt-2">{fmtNum(a.total_posts)} publications</div>
          </div>
        ))}
      </div>

      {insights && (
        <div style={neu.dark} className="rounded-[28px] p-7 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20"
               style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(40%, -40%)' }} />
          <div className="flex items-center gap-2 mb-2 relative">
            <Sparkles size={14} className="text-amber-200" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
              Synthèse IA · {insights.period_start ? new Date(insights.period_start).toLocaleDateString('fr-FR') : 'Cette semaine'}
            </span>
          </div>
          <h3 className="text-[26px] tracking-tight max-w-2xl leading-[1.15] relative" style={SERIF}>{insights.headline}</h3>
          {insights.body && <p className="text-[13px] text-stone-300 mt-3 max-w-xl leading-relaxed relative">{insights.body}</p>}
          {Array.isArray(insights.recommendations) && insights.recommendations.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 relative">
              {insights.recommendations.slice(0, 3).map((r, i) => (
                <div key={i} className="rounded-2xl p-4 bg-white/10 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-wider text-amber-200 font-semibold mb-1">Recommandation</div>
                  <div className="text-[13px] font-semibold leading-snug">{r.title}</div>
                  {r.body && <div className="text-[11px] text-stone-300 mt-1.5 leading-snug">{r.body}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};


/* ════════════════════════════════════════════════════════════
   ONGLET 2 — POSTS
   ──────────────────────────────────────────────────────────── */
const PostsTab = ({ posts }) => {
  const [sort, setSort]     = useState('published');
  const [format, setFormat] = useState('all');

  const filtered = useMemo(() => {
    let r = format === 'all' ? posts : posts.filter(p => p.post_type === format);
    const sorters = {
      published:  (a, b) => new Date(b.published_at) - new Date(a.published_at),
      engagement: (a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0),
      reach:      (a, b) => (b.reach || 0) - (a.reach || 0),
      saves:      (a, b) => (b.saves || 0) - (a.saves || 0),
      velocity:   (a, b) => (b.velocity_score || 0) - (a.velocity_score || 0),
    };
    return [...r].sort(sorters[sort]);
  }, [posts, sort, format]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center overflow-x-auto">
          {[['all','Tous'],['reel','Reels'],['carousel','Carrousels'],['image','Photos'],['tiktok_video','Vidéos TikTok'],['story','Stories']].map(([id, lbl]) => (
            <Pill key={id} active={format === id} onClick={() => setFormat(id)}>{lbl}</Pill>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-stone-500">
          <span>Trier par</span>
          <select value={sort} onChange={e => setSort(e.target.value)}
                  style={neu.raisedXs}
                  className="rounded-full px-3 py-2 text-[12px] font-medium bg-transparent outline-none border-none">
            <option value="published">Plus récent</option>
            <option value="engagement">Engagement</option>
            <option value="reach">Reach</option>
            <option value="saves">Saves</option>
            <option value="velocity">Vélocité</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(p => <PostCard key={p.id} post={p} />)}
      </div>
      {filtered.length === 0 && (
        <div style={neu.raised} className="rounded-[24px] p-10 text-center text-stone-400 text-[13px]">
          Aucun post sur la période.
        </div>
      )}
    </div>
  );
};

const PostCard = ({ post }) => (
  <div style={neu.raised} className="rounded-[24px] p-5 flex gap-4">
    <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-2xl shrink-0 overflow-hidden relative"
         style={{ background: post.thumbnail_url ? `url(${post.thumbnail_url}) center/cover` : 'linear-gradient(135deg,#1a1a1d 0%,#3a3a3d 100%)' }}>
      {(post.post_type === 'reel' || post.post_type === 'tiktok_video' || post.post_type === 'video') && (
        <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold">
          ▶ {post.duration_seconds ? `${Math.round(post.duration_seconds)}s` : ''}
        </div>
      )}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={post.platform} />
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">{post.post_type?.replace('_', ' ')}</span>
          <span className="text-[10px] text-stone-400">· {fmtDate(post.published_at)}</span>
        </div>
        <VelocityBadge score={post.velocity_score} />
      </div>

      <div className="text-[12.5px] text-stone-700 line-clamp-2 leading-snug mb-3">
        {post.caption || <i className="text-stone-400">(sans légende)</i>}
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        <Metric label="Reach"     value={fmtNum(post.reach)} />
        <Metric label="Eng. rate" value={fmtPct(post.engagement_rate)} highlight />
        <Metric label="Likes"     value={fmtNum(post.likes)} />
        <Metric label="Comments"  value={fmtNum(post.comments)} />
        {post.platform === 'instagram' && (
          <Metric label="Saves" value={fmtNum(post.saves)} sub={post.save_rate ? fmtPct(post.save_rate) : null} />
        )}
        <Metric label="Shares" value={fmtNum(post.shares)} />
        {(post.platform === 'tiktok' || post.post_type === 'reel') && (
          <Metric label="Views" value={fmtNum(post.views || post.plays)} />
        )}
        {post.watch_through_rate != null && (
          <Metric label="Watch" value={fmtPct(post.watch_through_rate, 0)} />
        )}
      </div>

      {Array.isArray(post.hashtags) && post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.hashtags.slice(0, 5).map(h => (
            <span key={h} className="text-[10px] text-stone-500 bg-stone-100/80 px-1.5 py-0.5 rounded">#{h}</span>
          ))}
          {post.hashtags.length > 5 && <span className="text-[10px] text-stone-400">+{post.hashtags.length - 5}</span>}
        </div>
      )}
    </div>
  </div>
);


/* ════════════════════════════════════════════════════════════
   ONGLET 3 — CAMPAGNES
   ──────────────────────────────────────────────────────────── */
const CampaignsTab = ({ campaigns, posts }) => {
  const [selected, setSelected] = useState(campaigns[0]?.campaign_id || null);
  const campaign = campaigns.find(c => c.campaign_id === selected);

  if (campaigns.length === 0) {
    return (
      <div style={neu.raised} className="rounded-[28px] p-10 text-center">
        <Target size={32} className="text-stone-300 mx-auto mb-3" strokeWidth={1.5} />
        <h3 className="text-[22px] tracking-tight" style={SERIF}>Aucune campagne créée</h3>
        <p className="text-[13px] text-stone-500 mt-2 max-w-md mx-auto">
          Regroupez vos posts en campagnes pour suivre vos ROAS, ROI, CPM et conversions en un coup d'œil.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {campaigns.map(c => {
          const active = c.campaign_id === selected;
          return (
            <button key={c.campaign_id} onClick={() => setSelected(c.campaign_id)}
                    style={active ? neu.dark : neu.raisedSm}
                    className={`rounded-2xl p-4 min-w-[220px] text-left transition-all ${active ? 'text-white' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-400">{c.status}</div>
              </div>
              <div className="text-[15px] font-semibold leading-tight" style={SERIF}>{c.name}</div>
              <div className={`text-[11px] mt-1.5 ${active ? 'text-stone-400' : 'text-stone-500'}`}>
                {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
              </div>
            </button>
          );
        })}
      </div>

      {campaign && (
        <>
          <div style={neu.raised} className="rounded-[28px] p-6 lg:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
                Objectif · {campaign.objective || 'Non défini'}
              </div>
              <h3 className="text-[26px] tracking-tight mt-1" style={SERIF}>{campaign.name}</h3>
              <div className="text-[12.5px] text-stone-500 mt-2">
                {fmtDate(campaign.start_date)} → {fmtDate(campaign.end_date)} · {campaign.posts_count || 0} posts · {fmtMoney(campaign.total_ad_spend, campaign.currency)} dépensés sur {fmtMoney(campaign.budget_total, campaign.currency)}
              </div>
            </div>
            <BudgetRing spent={Number(campaign.total_ad_spend) || 0} total={Number(campaign.budget_total) || 0} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
            <MetricTile icon={EyeIcon}            label="Reach"           value={fmtNum(campaign.total_reach)}        sub={`${fmtNum(campaign.total_impressions)} impressions`} />
            <MetricTile icon={Heart}              label="Engagement rate" value={fmtPct(campaign.avg_engagement_rate)} sub={`${fmtNum(campaign.total_engagements)} interactions`} tone="good" />
            <MetricTile icon={DollarSign}         label="CPM"             value={fmtMoney(campaign.cpm, campaign.currency)} sub="coût pour 1000 impressions" />
            <MetricTile icon={MousePointerClick} label="CPC"             value={fmtMoney(campaign.cpc, campaign.currency)} sub={`${fmtNum(campaign.total_clicks)} clics`} />
            <MetricTile icon={Zap}                label="CPE"             value={fmtMoney(campaign.cpe, campaign.currency)} sub="coût par engagement" />
            <MetricTile icon={Target}             label="Conversion rate" value={fmtPct(campaign.conversion_rate)}     sub={`${fmtNum(campaign.total_conversions)} conversions`} tone="good" />
            <MetricTile icon={Award}              label="ROAS"            value={campaign.roas != null ? `${Number(campaign.roas).toFixed(2).replace('.', ',')}×` : '—'} sub={fmtMoney(campaign.total_revenue, campaign.currency)} tone={campaign.roas >= 2 ? 'good' : 'warn'} />
            <MetricTile icon={TrendingUp}         label="ROI"             value={fmtPct(campaign.roi, 0)} sub={campaign.roi >= 0 ? 'rentable' : 'déficit'} tone={campaign.roi >= 0 ? 'good' : 'bad'} />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-3">Publications de cette campagne</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {posts
                .filter(p => Array.isArray(campaign.post_ids) && campaign.post_ids.includes(p.id))
                .slice(0, 6)
                .map(p => <PostCard key={p.id} post={p} />)}
            </div>
          </div>

          <UTMHelper campaign={campaign} />
        </>
      )}
    </div>
  );
};

const BudgetRing = ({ spent, total }) => {
  if (!total) return null;
  const pct = Math.min(100, (spent / total) * 100);
  const data = [{ name: 'spent', v: pct }, { name: 'left', v: 100 - pct }];
  const tone = pct > 95 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981';
  return (
    <div className="relative w-28 h-28 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={38} outerRadius={50} startAngle={90} endAngle={-270} dataKey="v" stroke="none">
            <Cell fill={tone} />
            <Cell fill="rgba(0,0,0,0.06)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[18px] leading-none" style={SERIF}>{Math.round(pct)}%</div>
        <div className="text-[9px] text-stone-400 uppercase tracking-wider mt-0.5">consommé</div>
      </div>
    </div>
  );
};

const UTMHelper = ({ campaign }) => {
  const utm = campaign.utm_params || {};
  const url = campaign.landing_url || 'https://votresite.com';
  const built = url + (url.includes('?') ? '&' : '?') + new URLSearchParams({
    utm_source:   utm.source   || 'instagram',
    utm_medium:   utm.medium   || 'social',
    utm_campaign: utm.campaign || campaign.slug || campaign.name?.toLowerCase().replace(/\s+/g, '-'),
    utm_content:  utm.content  || 'organic',
  }).toString();

  return (
    <div style={neu.raisedSm} className="rounded-[24px] p-5">
      <div className="flex items-center gap-2 mb-2">
        <ExternalLink size={13} className="text-stone-400" />
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Lien tracké (UTM)</div>
      </div>
      <div className="text-[12px] font-mono bg-stone-100/80 p-3 rounded-xl break-all text-stone-700">{built}</div>
      <button onClick={() => navigator.clipboard?.writeText(built)}
              className="mt-2 text-[11px] text-stone-500 hover:text-stone-800">
        📋 Copier
      </button>
    </div>
  );
};


/* ════════════════════════════════════════════════════════════
   ONGLET 4 — AUDIENCE
   ──────────────────────────────────────────────────────────── */
const AudienceTab = ({ accounts, posts }) => {
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, er: 0, total: 0 }))
    );
    posts.forEach(p => {
      const d = new Date(p.published_at);
      const day = (d.getDay() + 6) % 7; // lundi = 0
      const hour = d.getHours();
      grid[day][hour].count++;
      grid[day][hour].total += p.engagement_rate || 0;
    });
    grid.forEach(row => row.forEach(c => c.er = c.count ? c.total / c.count : 0));
    return grid;
  }, [posts]);

  const maxER = Math.max(0.1, ...heatmap.flat().map(c => c.er));
  const days  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const hashtagPerf = useMemo(() => {
    const m = {};
    posts.forEach(p => (p.hashtags || []).forEach(h => {
      m[h] = m[h] || { tag: h, count: 0, reach: 0, _totEr: 0 };
      m[h].count++;
      m[h].reach += +p.reach || 0;
      m[h]._totEr += +p.engagement_rate || 0;
    }));
    return Object.values(m)
      .map(x => ({ ...x, er: x._totEr / x.count }))
      .sort((a, b) => b.reach - a.reach)
      .slice(0, 12);
  }, [posts]);

  const formats = useMemo(() => {
    const m = {};
    posts.forEach(p => {
      const k = p.post_type || 'autre';
      m[k] = m[k] || { format: k, count: 0, _er: 0, reach: 0 };
      m[k].count++;
      m[k]._er += p.engagement_rate || 0;
      m[k].reach += +p.reach || 0;
    });
    return Object.values(m).map(x => ({ ...x, er: x._er / x.count }));
  }, [posts]);

  return (
    <div className="space-y-5">
      <div style={neu.raised} className="rounded-[28px] p-6 lg:p-7">
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Meilleurs créneaux</div>
            <h3 className="text-[22px] tracking-tight mt-1" style={SERIF}>Engagement par jour × heure</h3>
          </div>
          <div className="text-[10px] text-stone-400">Calculé sur vos posts</div>
        </div>
        <div className="overflow-x-auto mt-5">
          <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: 'auto repeat(24, 18px)' }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[9px] text-stone-400 text-center font-medium">{h}h</div>
            ))}
            {days.map((d, di) => (
              <React.Fragment key={d}>
                <div className="text-[10px] text-stone-500 font-semibold pr-2 leading-[18px]">{d}</div>
                {heatmap[di].map((c, hi) => {
                  const intensity = c.count ? Math.min(1, c.er / maxER) : 0;
                  return (
                    <div key={hi}
                         title={c.count ? `${c.count} post${c.count > 1 ? 's' : ''} · ER moyen ${c.er.toFixed(2)}%` : 'Aucun post'}
                         className="w-[18px] h-[18px] rounded-[3px]"
                         style={{ background: c.count ? `rgba(42, 38, 32, ${0.12 + intensity * 0.78})` : 'rgba(0,0,0,0.04)' }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-4">
          <span>Moins engageant</span>
          <div className="flex gap-0.5">
            {[0.12, 0.3, 0.5, 0.7, 0.9].map(o => (
              <div key={o} className="w-3.5 h-3.5 rounded-sm" style={{ background: `rgba(42, 38, 32, ${o})` }} />
            ))}
          </div>
          <span>Plus engageant</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div style={neu.raised} className="col-span-12 lg:col-span-5 rounded-[28px] p-6 lg:p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Format vs performance</div>
          <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={SERIF}>Que créer en priorité ?</h3>
          <div className="space-y-3">
            {formats.map(f => (
              <div key={f.format}>
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="font-semibold capitalize">{f.format.replace('_', ' ')}</span>
                  <span className="text-stone-500">{fmtPct(f.er)} · {f.count} posts</span>
                </div>
                <div className="h-2 bg-stone-200/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                       style={{ width: `${Math.min(100, (f.er / Math.max(...formats.map(x => x.er), 1)) * 100)}%`, background: '#2a2620' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={neu.raised} className="col-span-12 lg:col-span-7 rounded-[28px] p-6 lg:p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Hashtags</div>
          <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={SERIF}>Performance par hashtag</h3>
          <div className="space-y-2">
            {hashtagPerf.length === 0 && <div className="text-[12px] text-stone-400 italic">Aucun hashtag détecté</div>}
            {hashtagPerf.map(h => (
              <div key={h.tag} className="flex items-center gap-3 text-[12px]">
                <Hash size={12} className="text-stone-400" />
                <span className="font-medium min-w-[120px] truncate">{h.tag}</span>
                <div className="flex-1 h-1.5 bg-stone-200/60 rounded-full overflow-hidden">
                  <div className="h-full" style={{ width: `${(h.reach / hashtagPerf[0].reach) * 100}%`, background: '#2a2620' }} />
                </div>
                <span className="text-stone-500 text-[11px] w-16 text-right">{fmtNum(h.reach)}</span>
                <span className="text-emerald-700 font-semibold w-14 text-right text-[11px]">{fmtPct(h.er)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


/* ════════════════════════════════════════════════════════════
   ONBOARDING — aucun compte connecté
   ──────────────────────────────────────────────────────────── */
const NoAccountsConnected = () => {
  // Redirection plein écran vers l'Edge Function social-oauth (start/<plateforme>),
  // qui envoie vers Meta / TikTok puis revient sur le portail. Le code d'accès
  // du client identifie qui connecte son compte.
  const oauthStart = (platform) =>
    `${SUPABASE_URL}/functions/v1/social-oauth/start/${platform}?code=${encodeURIComponent(CLIENT.code || '')}`;
  // Affiche la raison si le retour OAuth est en erreur (?social=error&reason=…)
  const qs = new URLSearchParams(window.location.search);
  const oauthError = qs.get('social') === 'error' ? (qs.get('reason') || 'erreur inconnue') : null;

  return (
    <div style={neu.raised} className="rounded-[28px] p-10 text-center">
      <div style={neu.darkSm} className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-5">
        <Activity size={26} />
      </div>
      <h3 className="text-[28px] tracking-tight" style={SERIF}>Connectez vos réseaux</h3>
      <p className="text-[13.5px] text-stone-500 mt-3 max-w-md mx-auto leading-relaxed">
        Reliez vos comptes Instagram et TikTok pour activer le suivi :
        posts, engagement, audience — mis à jour automatiquement toutes les 6 heures.
        Vos données restent privées et vos accès chiffrés.
      </p>
      {oauthError && (
        <div className="mt-5 mx-auto max-w-md text-[12px] rounded-xl px-4 py-3"
             style={{ background: 'rgba(225,29,72,0.08)', border: '1px solid rgba(225,29,72,0.25)', color: '#9f1239' }}>
          La connexion a échoué : {oauthError}. Réessayez, ou contactez l'agence.
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
        <a href={oauthStart('instagram')} style={neu.dark}
           className="text-white px-6 py-3.5 rounded-2xl text-[13px] font-semibold inline-flex items-center gap-2.5 justify-center">
          <Instagram size={16} /> Connecter Instagram
        </a>
        <a href={oauthStart('tiktok')} style={neu.raisedSm}
           className="px-6 py-3.5 rounded-2xl text-[13px] font-semibold inline-flex items-center gap-2.5 justify-center">
          <Sparkles size={16} /> Connecter TikTok
        </a>
      </div>
      <p className="text-[11px] text-stone-400 mt-4 max-w-md mx-auto leading-relaxed">
        Instagram : compte professionnel ou créateur requis.
        L'agence vous accompagne lors de la première connexion.
      </p>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   ✅  FIN — Le composant `Analytics` ci-dessus remplace
        directement celui des lignes 1732-1879 de
        communication-app.jsx. Le composant `Calendar` qui suit
        immédiatement reste intact.
   ════════════════════════════════════════════════════════════ */

// ────────────────────────────────────────────────────────────
// 🗓 CALENDAR (date-aware, syncs with shoot year/month/day)
// ────────────────────────────────────────────────────────────
const MOIS_FR_SHORT = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
const MOIS_FR_LONG  = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Normalise a French month label to a 0-11 index. Tolerates case, accents,
// and the common "Sept" vs "Septembre" / "Fév" vs "Février" / etc. variants.
const _strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const monthLabelToIndex = (label) => {
  const k = _strip(label);
  if (!k) return null;
  for (let i = 0; i < MOIS_FR_SHORT.length; i++) {
    const a = _strip(MOIS_FR_SHORT[i]);
    const b = _strip(MOIS_FR_LONG[i]);
    if (k === a || k === b || a.startsWith(k) || b.startsWith(k)) return i;
  }
  return null;
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const Calendar = ({ navTarget, clearTarget, goTo }) => {
  const dayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Stable "today", midnight-aligned.
  const today = useMemo(() => startOfDay(new Date()), []);

  // Parse every shoot into a real Date once. Drop rows we cannot place.
  const shoots = useMemo(() => {
    const fallbackYear = today.getFullYear();
    return (CLIENT.shoots || [])
      .map(s => {
        const mi  = monthLabelToIndex(s.month);
        const day = Number(s.date);
        const yr  = Number(s.year) || fallbackYear;
        if (mi == null || !Number.isFinite(day) || day < 1 || day > 31) return null;
        return { ...s, dateObj: new Date(yr, mi, day) };
      })
      .filter(Boolean)
      .sort((a, b) => a.dateObj - b.dateObj);
  }, [today]);

  // Auto-focus rule: first upcoming shoot's month, else current month.
  const focusMonth = useMemo(() => {
    const upcoming = shoots.find(s => s.dateObj >= today);
    const anchor   = upcoming ? upcoming.dateObj : today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  }, [shoots, today]);

  const [cursor, setCursor] = useState(focusMonth);
  // Re-anchor when data refreshes (e.g. Supabase pushes new shoots).
  useEffect(() => { setCursor(focusMonth); }, [focusMonth]);

  // ── Navigation croisée : un autre onglet a demandé CE tournage ──
  // Déclaré APRÈS le re-anchor pour que le ciblage gagne au montage.
  const [highlightId, setHighlightId] = useState(null);
  useEffect(() => {
    if (!navTarget?.shootId) return;
    const target = shoots.find(x => x.id === navTarget.shootId);
    if (target) {
      setCursor(new Date(target.dateObj.getFullYear(), target.dateObj.getMonth(), 1));
      setHighlightId(target.id);
      setTimeout(() => setHighlightId(null), 3500);
    }
    clearTarget && clearTarget();
  }, []);

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();      // 28/29/30/31
  const firstDow = new Date(year, month, 1).getDay();              // 0=Sun..6=Sat
  const offset = (firstDow + 6) % 7;                               // Monday-first

  const monthLabel = `${MOIS_FR_LONG[month]} ${year}`;

  const prevMonth = useCallback(() => setCursor(new Date(year, month - 1, 1)), [year, month]);
  const nextMonth = useCallback(() => setCursor(new Date(year, month + 1, 1)), [year, month]);

  // Strict filter: year + month + day. No more day-only collisions.
  const eventsOn = useCallback(
    (day) => shoots.filter(s =>
      s.dateObj.getFullYear() === year &&
      s.dateObj.getMonth()    === month &&
      s.dateObj.getDate()     === day
    ),
    [shoots, year, month]
  );

  // Side panel: chronological upcoming list (future only).
  const upcomingList = useMemo(
    () => shoots.filter(s => s.dateObj >= today),
    [shoots, today]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} aria-label="Mois précédent"
                  style={neu.raisedXs} className="w-9 h-9 tap-ext rounded-full flex items-center justify-center hidden lg:flex">
            <ChevronLeft size={15} />
          </button>
          <h3 className="text-[20px] lg:text-[22px] tracking-tight" style={SERIF}>{monthLabel}</h3>
          <button onClick={nextMonth} aria-label="Mois suivant"
                  style={neu.raisedXs} className="w-9 h-9 tap-ext rounded-full flex items-center justify-center hidden lg:flex">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Vue calendrier — desktop uniquement (illisible sur mobile) */}
        <div style={neu.raised} className="hidden lg:block lg:col-span-8 rounded-[28px] p-6">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {dayHeaders.map(d => <div key={d} className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold text-center py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const events  = eventsOn(day);
              const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
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
              {upcomingList.map(s => {
                const isTarget = s.id === highlightId;
                const hasMedia = CLIENT.mediaEnabled && (CLIENT.media || []).some(m => m.shoot_id === s.id);
                return (
                <div key={s.id}
                     onClick={() => setCursor(new Date(s.dateObj.getFullYear(), s.dateObj.getMonth(), 1))}
                     className="flex gap-3 cursor-pointer rounded-xl transition-shadow duration-500"
                     style={isTarget ? { boxShadow: `0 0 0 2px ${neu.accent}`, padding: '6px', margin: '-6px' } : {}}>
                  <div style={s.type === 'video' ? neu.darkSm : neu.pressedSm} className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${s.type === 'video' ? 'text-white' : ''}`}>
                    <div className={`text-[8px] uppercase tracking-wider ${s.type === 'video' ? 'text-stone-400' : 'text-stone-500'}`}>{MOIS_FR_SHORT[s.dateObj.getMonth()]}</div>
                    <div className="text-[14px] leading-none font-semibold" style={SERIF}>{s.dateObj.getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="font-medium text-[13px] truncate">{s.title}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5 truncate">{s.time}{s.location && ` · ${s.location}`}</div>
                    {hasMedia && goTo && (
                      <span role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); goTo('media', { shootId: s.id }); }}
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold mt-1 cursor-pointer"
                        style={{ color: neu.accent }}>
                        <ImageIcon size={10} /> Voir les médias →
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
              {upcomingList.length === 0 && <div className="text-[12px] text-stone-400 text-center py-4">Aucun événement</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// 📑 STRATÉGIES — composant partagé + onglet client
// ────────────────────────────────────────────────────────────
/* ───────────── Palette de tags (accents, indépendante du thème) ─────────────
   Chaque tag a une couleur d'accent. On dérive un fond translucide léger
   pour rester lisible aussi bien en light qu'en dark. */
const STRATEGY_TAG_COLORS = {
  'Lead Gen':   '#C9A84C',
  'Éducation':  '#2D7A5F',
  'Education':  '#2D7A5F',
  'Désir':      '#7B5EA7',
  'Desir':      '#7B5EA7',
  'Viral':      '#C0392B',
  'Confiance':  '#2980B9',
  'Conversion': '#E67E22',
};

const strategyTagColor = (tag) => STRATEGY_TAG_COLORS[tag] || '#8a7a66';

// Convertit un hex en rgba avec alpha (pour les fonds de pastille)
const hexA = (hex, a) => {
  const h = (hex || '#8a7a66').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const StrategyTag = ({ tag, size = 'sm' }) => {
  if (!tag) return null;
  const c = strategyTagColor(tag);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wider shrink-0 leading-none ${size === 'lg' ? 'text-[11px] px-3 py-1.5' : 'text-[10px] px-2.5 py-1'}`}
      style={{ background: hexA(c, 0.14), color: c, border: `1px solid ${hexA(c, 0.35)}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {tag}
    </span>
  );
};

/* ════════════════════════════════════════════════════════════
   StrategyView — props :
     • strategy : { title, subtitle, sector_label, intro, format_note,
                    concepts[], kpis[], stats[] }
     • neu, SERIF : tokens de thème (passés depuis le contexte hôte)
     • compact (bool) : version resserrée (carte d'aperçu dans la liste)
   ════════════════════════════════════════════════════════════ */
function StrategyView({ strategy, neu, SERIF, ChevronDownIcon, ChevronUpIcon, production = {}, onOpenShoot }) {
  const [openId, setOpenId] = useState(null);

  const concepts = Array.isArray(strategy?.concepts) ? strategy.concepts : [];
  const kpis     = Array.isArray(strategy?.kpis)     ? strategy.kpis     : [];
  const stats    = Array.isArray(strategy?.stats)    ? strategy.stats    : [];

  // ── Avancement de production (déduit de production: conceptId → {shoot, delivered}) ──
  const delivered = concepts.filter(c => production[c.id]?.delivered).length;
  const planned   = concepts.filter(c => production[c.id] && !production[c.id].delivered).length;
  const hasProduction = delivered + planned > 0;

  const selected = concepts.find((c) => String(c.id) === String(openId));

  // Scroll fluide vers le storyboard à l'ouverture d'une carte (mobile :
  // le panneau s'ouvre sous la grille, hors viewport sinon).
  const storyboardRef = useRef(null);
  useEffect(() => {
    if (openId != null && storyboardRef.current) {
      storyboardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [openId]);

  return (
    // strategy-root : ancrage CSS pour le durcissement tactile (voir <style>).
    <div className="strategy-root" style={{ touchAction: 'pan-y', overflowX: 'hidden', maxWidth: '100%' }}>

      {/* ── En-tête ── */}
      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 sm:p-6 lg:p-7 mb-5 lg:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-2 h-7 rounded-full shrink-0" style={{ background: neu.accent }} />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
                {strategy?.title || 'Stratégie de contenu'}
              </span>
            </div>
            {strategy?.subtitle && (
              <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] tracking-tight leading-[1.1]" style={SERIF}>
                {strategy.subtitle}
              </h2>
            )}
            {strategy?.sector_label && (
              <p className="text-[12.5px] sm:text-[13px] text-stone-500 mt-2 leading-relaxed">
                {strategy.sector_label}
              </p>
            )}
          </div>

          {stats.length > 0 && (
            <div className="flex gap-4 sm:gap-6 shrink-0 flex-wrap">
              {stats.slice(0, 4).map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-[22px] sm:text-[26px] leading-none" style={{ ...SERIF, color: neu.accent }}>{s.n}</div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-stone-400 mt-1.5 font-semibold">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {strategy?.intro && (
          <div style={neu.pressedSm} className="rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 mt-5 flex items-start gap-3">
            <span className="text-[18px] shrink-0 leading-none mt-0.5">🎯</span>
            <p className="text-[12.5px] sm:text-[13.5px] text-stone-600 leading-relaxed m-0">{strategy.intro}</p>
          </div>
        )}

        {/* ── Avancement de production (visible uniquement dans l'espace client) ── */}
        {hasProduction && concepts.length > 0 && (
          <div style={neu.pressedSm} className="rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 mt-4">
            <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400 font-semibold">Avancement de production</span>
              <span className="text-[12px] font-semibold" style={{ color: neu.accent }}>
                {delivered}/{concepts.length} concept{concepts.length > 1 ? 's' : ''} produit{delivered > 1 ? 's' : ''}
                {planned > 0 && <span className="text-stone-400 font-medium"> · {planned} planifié{planned > 1 ? 's' : ''}</span>}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex" style={{ background: hexA('#8a7a66', 0.15) }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(delivered / concepts.length) * 100}%`, background: '#2D7A5F' }} />
              <div className="h-full transition-all duration-700" style={{ width: `${(planned / concepts.length) * 100}%`, background: hexA(neu.accent === '#e8d8be' ? '#e8d8be' : '#8a7a66', 0.45) }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Grille de concepts ── */}
      {concepts.length === 0 ? (
        <div style={neu.raised} className="rounded-[24px] p-10 text-center text-[13px] text-stone-400">
          Aucun concept pour l'instant.
        </div>
      ) : (
        <div className="strategy-grid grid gap-4 sm:gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 270px), 1fr))' }}>
          {concepts.map((c) => {
            const isOpen = String(openId) === String(c.id);
            const accent = strategyTagColor(c.tag);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenId(isOpen ? null : c.id)}
                aria-expanded={isOpen}
                style={{
                  ...(isOpen ? neu.raised : neu.raisedSm),
                  borderLeft: `3px solid ${accent}`,
                  touchAction: 'pan-y',
                }}
                className="strategy-card text-left rounded-[20px] p-5 relative overflow-hidden transition active:scale-[0.99] w-full"
              >
                {/* Filigrane numéro */}
                <span
                  className="absolute top-2.5 right-3.5 leading-none select-none pointer-events-none"
                  style={{ ...SERIF, fontSize: 46, color: hexA(neu.accent, 0.06) }}
                >
                  {String(c.id).padStart(2, '0')}
                </span>

                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-[26px] leading-none">{c.emoji}</span>
                  <StrategyTag tag={c.tag} />
                </div>

                <h3 className="text-[15px] leading-snug mb-2.5 pr-6" style={SERIF}>{c.titre}</h3>

                {c.hook && (
                  <p className="text-[12px] text-stone-500 leading-relaxed italic line-clamp-2 m-0 mb-3">{c.hook}</p>
                )}

                {c.angle && (
                  <div style={neu.pressedSm} className="rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                    <span className="text-[11px] text-stone-500 leading-snug">{c.angle}</span>
                  </div>
                )}

                {/* ── État de production du concept (espace client uniquement) ── */}
                {production[c.id] && (() => {
                  const prod = production[c.id];
                  const label = prod.delivered
                    ? '✓ Livré'
                    : `🎬 Tournage ${prod.shoot.date ? `le ${prod.shoot.date} ${prod.shoot.month}` : 'planifié'}`;
                  const clickable = !!onOpenShoot;
                  return (
                    <span
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? (e) => { e.stopPropagation(); onOpenShoot(prod.shoot.id); } : undefined}
                      title={clickable ? 'Voir ce tournage dans le calendrier' : undefined}
                      className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1.5 rounded-full leading-none mb-3 ${clickable ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                      style={prod.delivered
                        ? { background: hexA('#2D7A5F', 0.14), color: '#2D7A5F', border: `1px solid ${hexA('#2D7A5F', 0.35)}` }
                        : { background: hexA('#2980B9', 0.12), color: '#2980B9', border: `1px solid ${hexA('#2980B9', 0.3)}` }}>
                      {label}
                    </span>
                  );
                })()}

                <div className="text-[11px] text-right tracking-[0.06em] font-medium flex items-center justify-end gap-1"
                     style={{ color: isOpen ? neu.accent : '#9b8d78' }}>
                  {isOpen
                    ? <>{ChevronUpIcon && <ChevronUpIcon size={13} />} Masquer le storyboard</>
                    : <>{ChevronDownIcon && <ChevronDownIcon size={13} />} Voir le storyboard</>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Storyboard déplié ── */}
      {selected && (
        <div ref={storyboardRef} style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 sm:p-7 lg:p-8 mt-5 lg:mt-6">
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <span className="text-[34px] leading-none">{selected.emoji}</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: neu.accent }}>
                Concept #{selected.id} — Storyboard
              </div>
              <h3 className="text-[20px] sm:text-[24px] tracking-tight leading-tight" style={SERIF}>{selected.titre}</h3>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
            {/* HOOK */}
            <div style={neu.pressedSm} className="rounded-[18px] p-4 sm:p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: neu.accent }}>🎣 Hook</div>
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-stone-400 mb-3 font-semibold">3 premières secondes</div>
              <p className="text-[13.5px] text-stone-700 leading-relaxed italic m-0 pl-3" style={{ borderLeft: `3px solid ${neu.accent}` }}>
                {selected.hook}
              </p>
            </div>

            {/* VISUEL */}
            <div style={neu.pressedSm} className="rounded-[18px] p-4 sm:p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1 text-sky-600">📷 Visuel</div>
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-stone-400 mb-3 font-semibold">Ce qu'on montre à l'écran</div>
              <p className="text-[12.5px] text-stone-600 leading-relaxed m-0">{selected.visuel}</p>
            </div>

            {/* TEXTE ÉCRAN */}
            <div style={neu.pressedSm} className="rounded-[18px] p-4 sm:p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1 text-violet-600">✍️ Texte écran</div>
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-stone-400 mb-3 font-semibold">Supers & typographie</div>
              <div className="flex flex-col gap-2">
                {(selected.texteEcran || []).map((line, i) => (
                  <div key={i} className="rounded-lg px-3 py-2 text-[12.5px] text-stone-700 leading-snug"
                       style={{ background: hexA('#7B5EA7', 0.10), border: `1px solid ${hexA('#7B5EA7', 0.20)}` }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div style={neu.pressedSm} className="rounded-[18px] p-4 sm:p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1 text-emerald-600">📣 Call to action</div>
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-stone-400 mb-3 font-semibold">CTA de fin — mesurable</div>
              {selected.cta && (
                <div className="rounded-xl px-4 py-3.5 text-[14px] font-bold text-center text-emerald-700"
                     style={{ background: hexA('#2D7A5F', 0.12), border: `1.5px solid ${hexA('#2D7A5F', 0.30)}` }}>
                  {selected.cta}
                </div>
              )}
            </div>
          </div>

          {/* Bandeau angle + objectif */}
          {(selected.angle || selected.tag) && (
            <div style={neu.pressedSm} className="rounded-2xl px-4 sm:px-5 py-3.5 mt-4 flex items-center justify-between flex-wrap gap-3">
              {selected.angle && (
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-stone-400">Angle stratégique :</span>
                  <span className="font-semibold" style={{ color: neu.accent }}>{selected.angle}</span>
                </div>
              )}
              {selected.tag && (
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-stone-400">Objectif :</span>
                  <StrategyTag tag={selected.tag} size="lg" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Objectifs / KPIs (bandeau bas) ── */}
      {kpis.length > 0 && (
        <div className="grid gap-3 sm:gap-4 mt-6 lg:mt-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {kpis.map((k, i) => {
            const c = k.color || neu.accent;
            return (
              <div key={i} style={{ ...neu.raisedSm, borderLeft: `3px solid ${c}` }} className="rounded-[20px] p-5">
                <div className="text-[22px] mb-2.5 leading-none">{k.icon}</div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: c }}>{k.label}</div>
                {k.count && <div className="text-[20px] leading-none mb-1.5" style={SERIF}>{k.count}</div>}
                {k.desc && <p className="text-[12px] text-stone-500 leading-relaxed m-0">{k.desc}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pied ── */}
      {strategy?.format_note && (
        <div className="text-center text-[11px] text-stone-400 tracking-[0.08em] mt-8 pt-6 border-t border-stone-200/60">
          {strategy.format_note}
        </div>
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   📑 STRATEGIES — onglet espace client
   Liste les stratégies du client + lecture + lien de partage.
   ════════════════════════════════════════════════════════════ */
const Strategies = ({ goTo, navTarget, clearTarget }) => {
  const list = CLIENT.strategies || [];
  // Si on arrive via un chip « stratégie » (document lié), on ouvre la bonne.
  const [activeId, setActiveId] = useState(navTarget?.strategyId || list[0]?.id || null);
  const [copiedId, setCopiedId] = useState(null);
  useEffect(() => { if (navTarget?.strategyId) clearTarget && clearTarget(); }, []);

  const active = list.find(s => s.id === activeId) || list[0];

  // ── Suivi de production : concept → tournage (→ média livré) ──
  // Chaîne déduite des FK : shoots.strategy_id/concept_id, puis media.shoot_id.
  // État « livré » prioritaire sur « planifié » si plusieurs tournages.
  const production = useMemo(() => {
    if (!active) return {};
    const map = {};
    (CLIENT.shoots || [])
      .filter(s => s.strategy_id === active.id && s.concept_id != null)
      .forEach(s => {
        const delivered = (CLIENT.media || []).some(m => m.shoot_id === s.id);
        const cur = map[s.concept_id];
        if (!cur || (delivered && !cur.delivered)) map[s.concept_id] = { shoot: s, delivered };
      });
    return map;
  }, [active]);

  const openShoot = CLIENT.shootsEnabled && goTo
    ? (shootId) => goTo('calendar', { shootId })
    : null;

  const shareBase = (() => {
    // strategie.html vit à la racine du site, à côté de communication-dashboard.html
    const path = window.location.pathname.replace(/[^/]*$/, '');
    return window.location.origin + path + 'strategie.html';
  })();

  const copyShareLink = async (s) => {
    if (!s.share_enabled || !s.share_token) return;
    const link = shareBase + '?s=' + s.share_token;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      // Fallback : sélection manuelle via prompt
      window.prompt('Copiez ce lien :', link);
    }
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 2200);
  };

  if (list.length === 0) {
    return (
      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-8 lg:p-10 text-center">
        <div style={neu.darkSm} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
          <Lightbulb size={20} />
        </div>
        <h3 className="text-[20px] tracking-tight" style={SERIF}>Aucune stratégie pour le moment</h3>
        <p className="text-[13px] text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">
          Vos stratégies de contenu apparaîtront ici dès qu'elles seront prêtes. Vous pourrez les consulter et les partager à vos collaborateurs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Sélecteur de stratégie (si plusieurs) */}
      {list.length > 1 && (
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0" style={{ touchAction: 'pan-x' }}>
          <div style={neu.raisedXs} className="rounded-full p-1 inline-flex items-center gap-1">
            {list.map(s => (
              <button key={s.id} onClick={() => setActiveId(s.id)}
                style={s.id === (active && active.id) ? neu.dark : {}}
                className={`px-4 py-2.5 min-h-[40px] rounded-full text-[12.5px] font-medium whitespace-nowrap transition active:scale-95 ${s.id === (active && active.id) ? 'text-white' : 'text-stone-500'}`}>
                {s.subtitle || s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Barre de partage */}
      {active && (
        <div style={neu.raised} className="rounded-[20px] lg:rounded-[24px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div style={neu.pressedSm} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0">
              <Link2 size={16} className="text-stone-500" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight">Partager cette stratégie</div>
              <div className="text-[11.5px] text-stone-500 mt-0.5 leading-snug">
                {active.share_enabled
                  ? 'Envoyez ce lien à vos collaborateurs — aucune connexion requise.'
                  : 'Le partage public est désactivé pour cette stratégie.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => copyShareLink(active)}
            disabled={!active.share_enabled || !active.share_token}
            style={active.share_enabled ? neu.darkSm : neu.pressedSm}
            className={`px-4 py-2.5 min-h-[44px] rounded-full text-[12.5px] font-semibold flex items-center justify-center gap-2 shrink-0 active:scale-95 transition ${active.share_enabled ? 'text-white' : 'text-stone-400'} disabled:active:scale-100`}>
            {copiedId === active.id ? <><Check size={14} /> Lien copié</> : <><Copy size={14} /> Copier le lien</>}
          </button>
        </div>
      )}

      {/* Rendu de la stratégie */}
      {active && (
        <StrategyView strategy={active} neu={neu} SERIF={SERIF} ChevronDownIcon={ChevronDown} ChevronUpIcon={ChevronUp} production={production} onOpenShoot={openShoot} />
      )}
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

  // ── Navigation croisée entre rubriques ──
  // goTo('calendar', { shootId }) : ouvre une rubrique SUR un élément précis.
  // Chaque section consomme navTarget à son montage (scroll/highlight) puis
  // le réinitialise via clearTarget pour ne pas rejouer au montage suivant.
  const [navTarget, setNavTarget] = useState(null);
  const goTo = (sec, target = null) => { setNavTarget(target); setSection(sec); };
  const clearTarget = () => setNavTarget(null);

  const handleLogout = () => {
    sessionStorage.removeItem('access_granted');
    try { localStorage.removeItem('th_access_code'); } catch (e) {}
    window.location.href = 'communication.html';
  };

  const titles = {
    dashboard: { t: `Bonjour ${CLIENT.greeting}`, s: 'Voici un aperçu de votre activité.' },
    media:     { t: 'Vos médias',                  s: 'Touchez un fichier pour le visualiser, le télécharger ou le valider.' },
    invoices:  { t: 'Vos factures',                s: 'Historique complet de votre facturation.' },
    documents: { t: 'Vos documents',               s: 'Contrats, chartes graphiques, devis et autres fichiers partagés.' },
    strategies: { t: 'Vos stratégies',             s: 'Vos stratégies de contenu — à consulter et à partager.' },
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
          {section === 'dashboard' && <Dashboard goTo={goTo} />}
          {section === 'media'     && (CLIENT.mediaEnabled    ? <Media navTarget={navTarget} clearTarget={clearTarget} />    : <Dashboard goTo={goTo} />)}
          {section === 'invoices'  && (CLIENT.invoicesEnabled ? <Invoices goTo={goTo} /> : <Dashboard goTo={goTo} />)}
          {section === 'documents' && (CLIENT.documentsEnabled ? <Documents goTo={goTo} /> : <Dashboard goTo={goTo} />)}
          {section === 'strategies' && (CLIENT.strategiesEnabled ? <Strategies goTo={goTo} navTarget={navTarget} clearTarget={clearTarget} /> : <Dashboard goTo={goTo} />)}
          {section === 'analytics' && (CLIENT.analyticsEnabled ? <Analytics /> : <Dashboard goTo={goTo} />)}
          {section === 'calendar'  && (CLIENT.shootsEnabled   ? <Calendar navTarget={navTarget} clearTarget={clearTarget} goTo={goTo} /> : <Dashboard goTo={goTo} />)}
        </main>
      </div>
      <BottomNav section={section} setSection={setSection} isDark={isDark} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);