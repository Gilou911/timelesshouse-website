import React, { useState, useMemo, useEffect, useCallback, createContext, useContext } from 'react';
import {
  Home, Image as ImageIcon, FileText, BarChart3, Calendar as CalendarIcon,
  Settings, LogOut, Search, Bell, Plus, Upload, Filter, Download,
  ChevronLeft, ChevronRight, MoreHorizontal, Play, Eye, Heart,
  MessageCircle, Share2, TrendingUp, TrendingDown, Users, Folder,
  Video, Camera, ArrowUpRight, X, Check, Instagram, Facebook,
  Youtube, Twitter, Edit3, Trash2, Send, Sparkles, ChevronDown,
  ArrowRight, Clock, MapPin, Grid, List
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ---------- Neumorphic style tokens ----------
const NEU_LIGHT = {
  base: { backgroundColor: '#e8e9ec' },
  raised: {
    backgroundColor: '#f1f2f5',
    boxShadow: '10px 10px 24px rgba(166, 171, 189, 0.45), -10px -10px 24px rgba(255, 255, 255, 0.95)',
  },
  raisedSm: {
    backgroundColor: '#f1f2f5',
    boxShadow: '5px 5px 12px rgba(166, 171, 189, 0.35), -5px -5px 12px rgba(255, 255, 255, 0.9)',
  },
  raisedXs: {
    backgroundColor: '#f1f2f5',
    boxShadow: '3px 3px 7px rgba(166, 171, 189, 0.3), -3px -3px 7px rgba(255, 255, 255, 0.85)',
  },
  pressed: {
    backgroundColor: '#e8e9ec',
    boxShadow: 'inset 5px 5px 10px rgba(166, 171, 189, 0.35), inset -5px -5px 10px rgba(255, 255, 255, 0.9)',
  },
  pressedSm: {
    backgroundColor: '#e8e9ec',
    boxShadow: 'inset 3px 3px 6px rgba(166, 171, 189, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.85)',
  },
  dark: {
    backgroundColor: '#1a1a1d',
    boxShadow: '8px 8px 18px rgba(166, 171, 189, 0.4), -3px -3px 8px rgba(255, 255, 255, 0.6), inset 1px 1px 2px rgba(255, 255, 255, 0.1)',
  },
  darkSm: {
    backgroundColor: '#1a1a1d',
    boxShadow: '4px 4px 10px rgba(166, 171, 189, 0.4), -2px -2px 6px rgba(255, 255, 255, 0.5)',
  },
};

// ---------- Dark-mode neumorphic tokens ----------
const NEU_DARK = {
  base: { backgroundColor: '#1c1d21' },
  raised: {
    backgroundColor: '#23242a',
    boxShadow: '10px 10px 24px rgba(0, 0, 0, 0.55), -5px -5px 15px rgba(45, 47, 58, 0.28)',
  },
  raisedSm: {
    backgroundColor: '#23242a',
    boxShadow: '5px 5px 12px rgba(0, 0, 0, 0.48), -3px -3px 8px rgba(45, 47, 58, 0.22)',
  },
  raisedXs: {
    backgroundColor: '#23242a',
    boxShadow: '3px 3px 7px rgba(0, 0, 0, 0.42), -2px -2px 5px rgba(45, 47, 58, 0.18)',
  },
  pressed: {
    backgroundColor: '#18191e',
    boxShadow: 'inset 5px 5px 10px rgba(0, 0, 0, 0.55), inset -3px -3px 8px rgba(45, 47, 58, 0.2)',
  },
  pressedSm: {
    backgroundColor: '#18191e',
    boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.48), inset -2px -2px 5px rgba(45, 47, 58, 0.15)',
  },
  dark: {
    backgroundColor: '#2d2e36',
    boxShadow: '8px 8px 18px rgba(0, 0, 0, 0.65), -3px -3px 8px rgba(45, 47, 58, 0.22), inset 1px 1px 2px rgba(255, 255, 255, 0.04)',
  },
  darkSm: {
    backgroundColor: '#2d2e36',
    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.55), -2px -2px 6px rgba(45, 47, 58, 0.18)',
  },
};

// Mutable pointer : reassigned by App component on theme change.
// All components read `neu.X` and get the active token set (re-render is triggered via App key).
let neu = NEU_LIGHT;

// ---------- Theme Context (still kept for components that want isDark/toggleDark) ----------
const ThemeContext = createContext({ isDark: false, toggleDark: () => {} });
const useTheme = () => useContext(ThemeContext);

// ---------- useDarkMode hook ----------
const useDarkMode = () => {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('th-dark-mode') === 'dark'; }
    catch (e) { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('th-dark-mode', isDark ? 'dark' : 'light'); }
    catch (e) {}
  }, [isDark]);
  const toggleDark = useCallback(() => setIsDark(d => !d), []);
  return [isDark, toggleDark];
};

// ---------- DarkToggle component (refined SVG arc) ----------
const C_STEP = 50;
const C_INITIAL = -9.8;

const DarkToggle = ({ isDark, onToggle }) => {
  const [offset, setOffset] = useState(() => {
    try {
      const saved = parseFloat(localStorage.getItem('th-c-offset'));
      return isNaN(saved) ? (isDark ? C_INITIAL + C_STEP : C_INITIAL) : saved;
    } catch (e) { return C_INITIAL; }
  });
  const prevIsDark = React.useRef(isDark);

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
        display: 'inline-block',
        width: 42, height: 22,
        borderRadius: 11,
        background: 'linear-gradient(145deg, #28282c, #323236)',
        position: 'relative',
        border: 'none', cursor: 'pointer', padding: 0,
        flexShrink: 0,
        boxShadow: 'inset 0 1.5px 4px rgba(0,0,0,0.6), inset 0 -1px 1px rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.25)',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
        transition: 'box-shadow 0.4s ease',
      }}
    >
      <svg viewBox="0 0 42 22" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', display: 'block' }}>
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

// ---------- Date helpers (locale-aware, UTC-safe) ----------
const MONTHS_FR_SHORT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const MONTHS_FR_LONG  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

// Parse 'YYYY-MM-DD' as a *local* midnight Date. Using new Date(str) directly
// would parse it as UTC and shift the calendar day in negative-offset zones.
function parseShootDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth()    === b.getMonth() &&
  a.getDate()     === b.getDate();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Mock data ----------
const CLIENTS = [
  { id: 1, name: 'Maison Lumière', sector: 'Hôtellerie de luxe', logo: '🏛', color: '#1a1a1d', initials: 'ML', joined: 'Janv. 2024', mediaCount: 142, invoiceTotal: 12400, status: 'actif' },
  { id: 2, name: 'Côté Jardin', sector: 'Restauration', logo: '🌿', color: '#2d4a3e', initials: 'CJ', joined: 'Mars 2024', mediaCount: 87, invoiceTotal: 6800, status: 'actif' },
  { id: 3, name: 'Atelier Onze', sector: 'Mode & Lifestyle', logo: '✦', color: '#1a1a1d', initials: 'AO', joined: 'Févr. 2024', mediaCount: 213, invoiceTotal: 18900, status: 'actif' },
  { id: 4, name: 'Studio Belmont', sector: 'Architecture', logo: '◐', color: '#1a1a1d', initials: 'SB', joined: 'Sept. 2024', mediaCount: 54, invoiceTotal: 4200, status: 'actif' },
  { id: 5, name: 'Café des Halles', sector: 'Restauration', logo: '☕', color: '#3a2a1a', initials: 'CH', joined: 'Mai 2024', mediaCount: 39, invoiceTotal: 3100, status: 'pause' },
];

const MEDIA = [
  { id: 1, type: 'video', title: 'Campagne printemps — Hero', date: '12 Avr 2026', duration: '0:45', size: '128 MB', tag: 'Réseaux sociaux', client: 1, thumb: 'linear-gradient(135deg,#1a1a1d 0%,#3a3a3d 100%)' },
  { id: 2, type: 'photo', title: 'Lookbook capsule SS26', date: '10 Avr 2026', size: '24 MB', tag: 'Site web', client: 1, thumb: 'linear-gradient(135deg,#2d4a3e 0%,#5a7a6e 100%)' },
  { id: 3, type: 'photo', title: 'Portrait fondatrice', date: '08 Avr 2026', size: '18 MB', tag: 'Presse', client: 1, thumb: 'linear-gradient(135deg,#3a2a1a 0%,#6a5a4a 100%)' },
  { id: 4, type: 'video', title: 'Interview client — édit court', date: '05 Avr 2026', duration: '1:20', size: '210 MB', tag: 'YouTube', client: 1, thumb: 'linear-gradient(135deg,#1a1a1d 0%,#4a4a4d 100%)' },
  { id: 5, type: 'photo', title: 'Packshot collection', date: '02 Avr 2026', size: '32 MB', tag: 'E-commerce', client: 1, thumb: 'linear-gradient(135deg,#4a3a2a 0%,#7a6a5a 100%)' },
  { id: 6, type: 'video', title: 'Reel coulisses tournage', date: '28 Mars 2026', duration: '0:30', size: '85 MB', tag: 'Instagram', client: 1, thumb: 'linear-gradient(135deg,#2a2a3d 0%,#5a5a7d 100%)' },
  { id: 7, type: 'photo', title: 'Architecture — façade', date: '25 Mars 2026', size: '28 MB', tag: 'Site web', client: 1, thumb: 'linear-gradient(135deg,#1a2a3a 0%,#4a6a8a 100%)' },
  { id: 8, type: 'video', title: 'Spot 30s — diffusion TV', date: '20 Mars 2026', duration: '0:30', size: '420 MB', tag: 'Publicité', client: 1, thumb: 'linear-gradient(135deg,#3a1a1a 0%,#6a3a3a 100%)' },
];

const INVOICES = [
  { id: 'FAC-2026-042', date: '15 Avr 2026', amount: 3200, status: 'payée', desc: 'Production vidéo — Campagne printemps', client: 1 },
  { id: 'FAC-2026-038', date: '02 Avr 2026', amount: 1850, status: 'payée', desc: 'Shooting photo lookbook', client: 1 },
  { id: 'FAC-2026-035', date: '20 Mars 2026', amount: 2400, status: 'en attente', desc: 'Stratégie réseaux sociaux — Mars', client: 1 },
  { id: 'FAC-2026-029', date: '08 Mars 2026', amount: 980, status: 'payée', desc: 'Retouches photo & livraison', client: 1 },
  { id: 'FAC-2026-024', date: '22 Févr 2026', amount: 4200, status: 'payée', desc: 'Production vidéo institutionnelle', client: 1 },
  { id: 'FAC-2026-018', date: '10 Févr 2026', amount: 1500, status: 'payée', desc: 'Community management — Janvier', client: 1 },
];

const REVENUE_DATA = [
  { month: 'Nov', value: 4200 }, { month: 'Déc', value: 5800 }, { month: 'Jan', value: 4900 },
  { month: 'Fév', value: 7200 }, { month: 'Mar', value: 6400 }, { month: 'Avr', value: 8900 },
];

const ENGAGEMENT_DATA = [
  { day: 'Lun', insta: 2400, fb: 1200, tt: 3200 },
  { day: 'Mar', insta: 3100, fb: 1400, tt: 4100 },
  { day: 'Mer', insta: 2800, fb: 1100, tt: 3800 },
  { day: 'Jeu', insta: 3900, fb: 1600, tt: 5200 },
  { day: 'Ven', insta: 4500, fb: 1900, tt: 6100 },
  { day: 'Sam', insta: 5200, fb: 2200, tt: 7400 },
  { day: 'Dim', insta: 4800, fb: 2000, tt: 6800 },
];

const FOLLOWER_GROWTH = [
  { week: 'S1', value: 12400 }, { week: 'S2', value: 12780 }, { week: 'S3', value: 13150 },
  { week: 'S4', value: 13420 }, { week: 'S5', value: 14100 }, { week: 'S6', value: 14680 },
  { week: 'S7', value: 15200 }, { week: 'S8', value: 15890 },
];

const SHOOTS = [
  { id: 1, date: '2026-04-04', title: 'Shooting éditorial — Maison Lumière',    time: '09:00 — 16:00', location: 'Studio Bastille, Paris 11', team: 4, type: 'photo' },
  { id: 2, date: '2026-04-08', title: 'Tournage spot — Atelier Onze',           time: '08:00 — 18:00', location: 'Loft République',          team: 7, type: 'video' },
  { id: 3, date: '2026-04-12', title: 'Shooting produit — Côté Jardin',         time: '10:00 — 14:00', location: 'Studio Maison',            team: 3, type: 'photo' },
  { id: 4, date: '2026-04-15', title: 'Interview fondateur — Studio Belmont',   time: '14:00 — 17:00', location: 'Bureau client',            team: 3, type: 'video' },
  { id: 5, date: '2026-04-20', title: 'Reels lifestyle — Atelier Onze',         time: '11:00 — 16:00', location: 'Marais',                   team: 5, type: 'video' },
  { id: 6, date: '2026-04-23', title: 'Campagne extérieure — Maison Lumière',   time: '07:00 — 13:00', location: 'Versailles',               team: 6, type: 'photo' },
  { id: 7, date: '2026-04-28', title: 'Podcast vidéo — Côté Jardin',            time: '15:00 — 18:00', location: 'Studio Voltaire',          team: 4, type: 'video' },
  { id: 8, date: '2026-09-26', title: 'Tournage Mariage — Gaëlle & Johan',      time: 'Toute la journée', location: 'À définir',             team: 1, type: 'video', allDay: true },
];

// ---------- Small UI atoms ----------
const Pill = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    style={active ? neu.dark : {}}
    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
      active ? 'text-white' : 'text-stone-500 hover:text-stone-800'
    }`}
  >
    {children}
  </button>
);

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={active ? neu.pressedSm : {}}
    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left transition-all ${
      active ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'
    }`}
  >
    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
    <span className="text-[14px] font-medium tracking-tight">{label}</span>
  </button>
);

const StatCard = ({ label, value, delta, deltaUp, dark }) => (
  <div
    style={dark ? neu.dark : neu.raisedSm}
    className={`rounded-3xl p-6 ${dark ? 'text-white' : 'text-stone-900'}`}
  >
    <div className={`text-[13px] ${dark ? 'text-stone-400' : 'text-stone-500'} font-medium`}>{label}</div>
    <div className="text-[32px] font-semibold tracking-tight mt-2 leading-none" style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>
      {value}
    </div>
    {delta && (
      <div className="flex items-center gap-1.5 mt-3 text-[12px]">
        {deltaUp ? <TrendingUp size={13} className="text-emerald-500" /> : <TrendingDown size={13} className="text-rose-400" />}
        <span className={deltaUp ? 'text-emerald-500 font-semibold' : 'text-rose-400 font-semibold'}>{delta}</span>
        <span className={dark ? 'text-stone-500' : 'text-stone-400'}>vs mois dernier</span>
      </div>
    )}
  </div>
);

// ---------- Sidebar ----------
const Sidebar = ({ mode, section, setSection, agencyName }) => {
  const clientNav = [
    { id: 'dashboard', icon: Home, label: 'Accueil' },
    { id: 'media', icon: ImageIcon, label: 'Médias' },
    { id: 'invoices', icon: FileText, label: 'Factures' },
    { id: 'analytics', icon: BarChart3, label: 'Analyses' },
    { id: 'calendar', icon: CalendarIcon, label: 'Calendrier' },
  ];
  const adminNav = [
    { id: 'overview', icon: Home, label: 'Vue d\'ensemble' },
    { id: 'clients', icon: Users, label: 'Clients' },
    { id: 'deliveries', icon: Upload, label: 'Livraisons' },
    { id: 'billing', icon: FileText, label: 'Facturation' },
    { id: 'planning', icon: CalendarIcon, label: 'Planning' },
  ];
  const nav = mode === 'admin' ? adminNav : clientNav;

  return (
    <aside style={neu.raised} className="w-[230px] h-full flex flex-col rounded-[32px] p-5">
      <div className="px-2 pt-2 pb-6">
        <div className="text-[26px] tracking-tight leading-none" style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400, fontStyle: 'italic' }}>
          {agencyName}<span className="text-stone-400">.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 mt-1.5 font-medium">
          {mode === 'admin' ? 'Espace agence' : 'Espace client'}
        </div>
      </div>

      <nav className="flex flex-col gap-1.5">
        {nav.map(n => (
          <NavItem key={n.id} icon={n.icon} label={n.label} active={section === n.id} onClick={() => setSection(n.id)} />
        ))}
      </nav>

      {/* Promo / status card */}
      <div style={neu.dark} className="rounded-3xl p-5 text-white mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-amber-200" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{mode === 'admin' ? 'Pro plan' : 'Studio plan'}</span>
        </div>
        <div className="text-[15px] leading-snug font-medium">
          {mode === 'admin' ? 'Plan illimité actif' : 'Stockage 84% utilisé'}
        </div>
        <div className="text-[11px] text-stone-400 mt-1 leading-relaxed">
          {mode === 'admin' ? 'Clients & médias illimités' : '12,4 / 15 GB'}
        </div>
        <button className="mt-4 w-full bg-white text-stone-900 text-[12px] font-semibold py-2.5 rounded-full">
          {mode === 'admin' ? 'Voir le plan' : 'Augmenter'}
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        <NavItem icon={Settings} label="Paramètres" />
        <NavItem icon={LogOut} label="Déconnexion" />
      </div>
    </aside>
  );
};

// ---------- TopBar ----------
const TopBar = ({ title, subtitle, mode, setMode, currentClient, setCurrentClient }) => {
  const { isDark, toggleDark } = useTheme();
  return (
  <div className="flex items-center justify-between mb-7">
    <div>
      <h1 className="text-[34px] tracking-tight leading-[1.05]" style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>
        {title}
      </h1>
      {subtitle && <div className="text-[13px] text-stone-500 mt-1">{subtitle}</div>}
    </div>

    <div className="flex items-center gap-3">
      {/* Mode toggle */}
      <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
        <Pill active={mode === 'admin'} onClick={() => setMode('admin')}>Admin</Pill>
        <Pill active={mode === 'client'} onClick={() => setMode('client')}>Client</Pill>
      </div>

      {/* Client selector — only in client mode */}
      {mode === 'client' && (
        <div style={neu.raisedXs} className="rounded-full pl-2 pr-4 py-1.5 flex items-center gap-2.5">
          <div style={neu.darkSm} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold">
            {CLIENTS[currentClient - 1].initials}
          </div>
          <span className="text-[13px] font-medium">{CLIENTS[currentClient - 1].name}</span>
          <ChevronDown size={14} className="text-stone-400" />
        </div>
      )}

      {/* Search */}
      <div style={neu.raisedXs} className="rounded-full flex items-center gap-2 px-4 py-2.5 w-56">
        <Search size={15} className="text-stone-400" />
        <input
          placeholder="Rechercher…"
          className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-stone-400"
        />
      </div>

      {/* Bell */}
      <button style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center relative">
        <Bell size={16} className="text-stone-700" />
        <div className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rose-400" />
      </button>

      {/* Dark mode toggle */}
      <div style={neu.raisedXs} className="h-10 px-3 rounded-full flex items-center justify-center">
        <DarkToggle isDark={isDark} onToggle={toggleDark} />
      </div>

      {/* Avatar */}
      <div style={neu.raisedXs} className="w-10 h-10 rounded-full p-1">
        <div className="w-full h-full rounded-full bg-gradient-to-br from-stone-400 to-stone-700" />
      </div>
    </div>
  </div>
  );
};

// ---------- CLIENT VIEWS ----------

const ClientDashboard = ({ goTo }) => (
  <div className="grid grid-cols-12 gap-5">
    <div className="col-span-3"><StatCard dark label="Total dépensé" value="14 130 €" delta="+8,4%" deltaUp /></div>
    <div className="col-span-3"><StatCard label="Médias livrés" value="142" delta="+12 ce mois" deltaUp /></div>
    <div className="col-span-3"><StatCard label="Tournages à venir" value="3" delta="dans les 30 j." /></div>
    <div className="col-span-3"><StatCard label="Engagement moy." value="4,8%" delta="+0,6 pts" deltaUp /></div>

    {/* Hero card */}
    <div style={neu.raised} className="col-span-8 rounded-[28px] p-7 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #1a1a1d 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Performance globale</div>
      <h2 className="text-[28px] tracking-tight mt-2 leading-[1.1] max-w-md" style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}>
        Une croissance régulière depuis le début de l'année
      </h2>
      <div className="mt-5 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={FOLLOWER_GROWTH}>
            <defs>
              <linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1a1a1d" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#1a1a1d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#1a1a1d" strokeWidth={2.2} fill="url(#cgrad)" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Quick actions */}
    <div className="col-span-4 flex flex-col gap-4">
      <button onClick={() => goTo('media')} style={neu.raised} className="rounded-[24px] p-5 text-left flex items-center justify-between group">
        <div>
          <div style={neu.darkSm} className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-3">
            <ImageIcon size={18} />
          </div>
          <div className="font-semibold text-[15px]">Mes médias</div>
          <div className="text-[12px] text-stone-500 mt-0.5">142 fichiers — 12 nouveaux</div>
        </div>
        <ArrowUpRight size={18} className="text-stone-400 group-hover:text-stone-900 transition" />
      </button>
      <button onClick={() => goTo('analytics')} style={neu.raised} className="rounded-[24px] p-5 text-left flex items-center justify-between group">
        <div>
          <div style={neu.darkSm} className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-3">
            <BarChart3 size={18} />
          </div>
          <div className="font-semibold text-[15px]">Analyses live</div>
          <div className="text-[12px] text-stone-500 mt-0.5">Mise à jour il y a 2 min</div>
        </div>
        <ArrowUpRight size={18} className="text-stone-400 group-hover:text-stone-900 transition" />
      </button>
    </div>

    {/* Upcoming shoots */}
    <div style={neu.raised} className="col-span-7 rounded-[28px] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">À venir</div>
          <h3 className="text-[20px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Prochains tournages</h3>
        </div>
        <button onClick={() => goTo('calendar')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900">
          Voir tout <ArrowRight size={13} />
        </button>
      </div>
      <div className="space-y-3">
        {SHOOTS
          .map(s => ({ ...s, dateObj: parseShootDate(s.date) }))
          .filter(s => s.dateObj && s.dateObj >= startOfDay(new Date()))
          .sort((a, b) => a.dateObj - b.dateObj)
          .slice(0, 3)
          .map(s => (
          <div key={s.id} style={neu.pressedSm} className="rounded-2xl p-4 flex items-center gap-4">
            <div style={neu.darkSm} className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center text-white">
              <div className="text-[9px] uppercase tracking-wider text-stone-400">{MONTHS_FR_SHORT[s.dateObj.getMonth()]}</div>
              <div className="text-[16px] font-semibold leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>{s.dateObj.getDate()}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[14px] truncate">{s.title}</div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500">
                <span className="flex items-center gap-1"><Clock size={11} /> {s.time}</span>
                <span className="flex items-center gap-1"><MapPin size={11} /> {s.location}</span>
              </div>
            </div>
            <div className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full ${s.type === 'video' ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700'}`}>
              {s.type}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Recent invoices */}
    <div style={neu.raised} className="col-span-5 rounded-[28px] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Récent</div>
          <h3 className="text-[20px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Dernières factures</h3>
        </div>
        <button onClick={() => goTo('invoices')} className="text-[12px] text-stone-500 flex items-center gap-1 hover:text-stone-900">
          Voir tout <ArrowRight size={13} />
        </button>
      </div>
      <div className="space-y-2.5">
        {INVOICES.slice(0, 4).map(inv => (
          <div key={inv.id} className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium text-[13px]">{inv.id}</div>
              <div className="text-[11px] text-stone-500">{inv.date}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-[14px]">{inv.amount.toLocaleString('fr-FR')} €</div>
              <div className={`text-[10px] uppercase tracking-wider ${inv.status === 'payée' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {inv.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ClientMedia = () => {
  const [filter, setFilter] = useState('tous');
  const [view, setView] = useState('grid');
  const filtered = filter === 'tous' ? MEDIA : MEDIA.filter(m => m.type === filter);

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
          <Pill active={filter === 'tous'} onClick={() => setFilter('tous')}>Tous</Pill>
          <Pill active={filter === 'photo'} onClick={() => setFilter('photo')}>Photos</Pill>
          <Pill active={filter === 'video'} onClick={() => setFilter('video')}>Vidéos</Pill>
        </div>
        <div className="flex items-center gap-3">
          <button style={neu.raisedXs} className="px-4 py-2.5 rounded-full text-[13px] font-medium flex items-center gap-2">
            <Filter size={14} /> Filtrer
          </button>
          <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
            <button onClick={() => setView('list')} style={view === 'list' ? neu.darkSm : {}} className={`w-9 h-9 rounded-full flex items-center justify-center ${view === 'list' ? 'text-white' : 'text-stone-500'}`}>
              <List size={15} />
            </button>
            <button onClick={() => setView('grid')} style={view === 'grid' ? neu.darkSm : {}} className={`w-9 h-9 rounded-full flex items-center justify-center ${view === 'grid' ? 'text-white' : 'text-stone-500'}`}>
              <Grid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total fichiers" value="142" />
        <StatCard label="Photos" value="89" />
        <StatCard label="Vidéos" value="53" />
        <StatCard label="Stockage utilisé" value="12,4 GB" delta="84% capacité" />
      </div>

      {/* Media grid */}
      {view === 'grid' ? (
        <div className="grid grid-cols-4 gap-5">
          {filtered.map(m => (
            <div key={m.id} style={neu.raised} className="rounded-[24px] p-3 group cursor-pointer">
              <div className="aspect-[4/3] rounded-2xl relative overflow-hidden" style={{ background: m.thumb }}>
                {m.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play size={16} className="text-stone-900 ml-0.5" fill="#1a1a1d" />
                    </div>
                  </div>
                )}
                {m.type === 'video' && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-white text-[10px] font-medium">
                    {m.duration}
                  </div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur text-stone-800 text-[9px] font-semibold uppercase tracking-wider">
                  {m.type}
                </div>
              </div>
              <div className="px-2 pt-3 pb-1">
                <div className="font-medium text-[13px] truncate">{m.title}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-stone-500">{m.date}</span>
                  <span className="text-[10px] text-stone-500 px-2 py-0.5 rounded-full" style={neu.pressedSm}>{m.tag}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={neu.raised} className="rounded-[28px] p-2">
          {filtered.map((m, i) => (
            <div key={m.id} className={`flex items-center gap-4 p-3 rounded-2xl ${i !== 0 ? 'border-t border-stone-200/60' : ''}`}>
              <div className="w-14 h-14 rounded-xl" style={{ background: m.thumb }} />
              <div className="flex-1">
                <div className="font-medium text-[14px]">{m.title}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">{m.date} · {m.size}{m.duration ? ` · ${m.duration}` : ''}</div>
              </div>
              <span className="text-[10px] text-stone-500 px-2.5 py-1 rounded-full" style={neu.pressedSm}>{m.tag}</span>
              <button style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center"><Download size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ClientInvoices = () => {
  const total = INVOICES.reduce((a, b) => a + b.amount, 0);
  const paid = INVOICES.filter(i => i.status === 'payée').reduce((a, b) => a + b.amount, 0);
  const pending = INVOICES.filter(i => i.status === 'en attente').reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-5">
        <div style={neu.dark} className="rounded-[24px] p-6 text-white col-span-1">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Total facturé 2026</div>
          <div className="text-[42px] tracking-tight mt-2 leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>
            {total.toLocaleString('fr-FR')} €
          </div>
          <div className="flex items-center gap-2 mt-4 text-[12px]">
            <TrendingUp size={13} className="text-emerald-400" />
            <span className="text-emerald-400 font-medium">+18% sur l'année</span>
          </div>
        </div>
        <div style={neu.raisedSm} className="rounded-[24px] p-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Réglé</div>
          <div className="text-[32px] tracking-tight mt-2 leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>
            {paid.toLocaleString('fr-FR')} €
          </div>
          <div className="mt-4 h-1.5 rounded-full" style={neu.pressedSm}>
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(paid / total) * 100}%` }} />
          </div>
        </div>
        <div style={neu.raisedSm} className="rounded-[24px] p-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">En attente</div>
          <div className="text-[32px] tracking-tight mt-2 leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>
            {pending.toLocaleString('fr-FR')} €
          </div>
          <div className="mt-4 h-1.5 rounded-full" style={neu.pressedSm}>
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(pending / total) * 100}%` }} />
          </div>
        </div>
      </div>

      <div style={neu.raised} className="rounded-[28px] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[20px] tracking-tight" style={{ fontFamily: 'Instrument Serif, serif' }}>Historique des factures</h3>
          <div className="flex items-center gap-2">
            <button style={neu.raisedXs} className="px-4 py-2.5 rounded-full text-[12px] font-medium flex items-center gap-2"><Filter size={13} /> 2026</button>
            <button style={neu.raisedXs} className="px-4 py-2.5 rounded-full text-[12px] font-medium flex items-center gap-2"><Download size={13} /> Exporter</button>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">
          <div className="col-span-3">Référence</div>
          <div className="col-span-4">Description</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2">Montant</div>
          <div className="col-span-1 text-right">Statut</div>
        </div>
        <div className="space-y-2">
          {INVOICES.map(inv => (
            <div key={inv.id} style={neu.pressedSm} className="grid grid-cols-12 gap-4 px-4 py-4 rounded-2xl items-center">
              <div className="col-span-3 font-mono text-[13px] font-medium">{inv.id}</div>
              <div className="col-span-4 text-[13px] text-stone-700">{inv.desc}</div>
              <div className="col-span-2 text-[12px] text-stone-500">{inv.date}</div>
              <div className="col-span-2 font-semibold text-[14px]" style={{ fontFamily: 'Instrument Serif, serif' }}>{inv.amount.toLocaleString('fr-FR')} €</div>
              <div className="col-span-1 flex items-center justify-end gap-2">
                <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {inv.status}
                </span>
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900"><Download size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ClientAnalytics = () => {
  const [platform, setPlatform] = useState('all');
  const [timeRange, setTimeRange] = useState('7j');

  return (
    <div className="space-y-5">
      {/* Filter row */}
      <div className="flex items-center justify-between">
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
          <Pill active={platform === 'all'} onClick={() => setPlatform('all')}>Tous réseaux</Pill>
          <Pill active={platform === 'insta'} onClick={() => setPlatform('insta')}>Instagram</Pill>
          <Pill active={platform === 'fb'} onClick={() => setPlatform('fb')}>Facebook</Pill>
          <Pill active={platform === 'tt'} onClick={() => setPlatform('tt')}>TikTok</Pill>
          <Pill active={platform === 'yt'} onClick={() => setPlatform('yt')}>YouTube</Pill>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full" style={neu.raisedXs}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-stone-700">Live · Mis à jour il y a 12 s</span>
          </div>
          <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
            {['24h', '7j', '30j', '12m'].map(t => (
              <Pill key={t} active={timeRange === t} onClick={() => setTimeRange(t)}>{t}</Pill>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard dark label="Abonnés totaux" value="48 320" delta="+5,2%" deltaUp />
        <StatCard label="Engagement" value="4,8%" delta="+0,6 pts" deltaUp />
        <StatCard label="Reach hebdo" value="284 K" delta="+12,4%" deltaUp />
        <StatCard label="Clics sortants" value="1 247" delta="-2,1%" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-5">
        <div style={neu.raised} className="col-span-8 rounded-[28px] p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Engagement par jour</div>
              <h3 className="text-[22px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Interactions hebdomadaires</h3>
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
                <Bar dataKey="insta" fill="#1a1a1d" radius={[8, 8, 0, 0]} />
                <Bar dataKey="fb" fill="#9ca3af" radius={[8, 8, 0, 0]} />
                <Bar dataKey="tt" fill="#d1d5db" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Audience donut */}
        <div style={neu.raised} className="col-span-4 rounded-[28px] p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Répartition audience</div>
          <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={{ fontFamily: 'Instrument Serif, serif' }}>Démographie</h3>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[{ name: '18-24', v: 28 }, { name: '25-34', v: 42 }, { name: '35-44', v: 18 }, { name: '45+', v: 12 }]}
                  innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="v"
                >
                  {['#1a1a1d', '#4a4a4d', '#9ca3af', '#d1d5db'].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Total</div>
              <div className="text-[24px] leading-none mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>48 320</div>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {[
              { l: '25-34 ans', v: '42%', c: '#1a1a1d' },
              { l: '18-24 ans', v: '28%', c: '#4a4a4d' },
              { l: '35-44 ans', v: '18%', c: '#9ca3af' },
              { l: '45+ ans', v: '12%', c: '#d1d5db' },
            ].map(r => (
              <div key={r.l} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-sm" style={{ background: r.c }} /> {r.l}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform breakdown cards */}
        {[
          { name: 'Instagram', icon: Instagram, followers: '24,3K', delta: '+8,2%', engagement: '5,4%' },
          { name: 'Facebook', icon: Facebook, followers: '12,1K', delta: '+1,8%', engagement: '2,1%' },
          { name: 'TikTok', icon: Sparkles, followers: '8,9K', delta: '+24,7%', engagement: '8,9%' },
          { name: 'YouTube', icon: Youtube, followers: '3,1K', delta: '+4,1%', engagement: '3,2%' },
        ].map(p => (
          <div key={p.name} style={neu.raisedSm} className="col-span-3 rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-3">
              <div style={neu.darkSm} className="w-10 h-10 rounded-xl flex items-center justify-center text-white">
                <p.icon size={16} />
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold">{p.delta}</span>
            </div>
            <div className="font-semibold text-[14px]">{p.name}</div>
            <div className="text-[24px] tracking-tight mt-1 leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>{p.followers}</div>
            <div className="text-[11px] text-stone-500 mt-2">Engagement {p.engagement}</div>
          </div>
        ))}
      </div>

      {/* AI Analysis */}
      <div style={neu.dark} className="rounded-[28px] p-7 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(40%, -40%)' }} />
        <div className="flex items-center gap-2 mb-2 relative">
          <Sparkles size={14} className="text-amber-200" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Analyse IA · Synthèse de la semaine</span>
        </div>
        <h3 className="text-[26px] tracking-tight max-w-2xl leading-[1.15] relative" style={{ fontFamily: 'Instrument Serif, serif' }}>
          Vos contenus vidéos performent <span className="italic">3,2× mieux</span> que les photos sur TikTok cette semaine.
        </h3>
        <p className="text-[13px] text-stone-300 mt-3 max-w-xl leading-relaxed relative">
          Les reels de coulisses publiés mercredi et samedi génèrent l'essentiel de la croissance. Recommandation : augmenter la fréquence à 3 vidéos / semaine et tester un format interview court le jeudi.
        </p>
        <div className="flex items-center gap-3 mt-5 relative">
          <button className="bg-white text-stone-900 text-[13px] font-semibold px-5 py-2.5 rounded-full flex items-center gap-2">
            Lancer une analyse approfondie <ArrowRight size={14} />
          </button>
          <button className="text-[13px] text-stone-300 px-5 py-2.5 rounded-full border border-stone-700 font-medium">
            Comparer aux mois précédents
          </button>
        </div>
      </div>
    </div>
  );
};

const ClientCalendar = () => {
  const [viewType, setViewType] = useState('mois');
  const dayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // 1) "Today" — stable for the component lifetime, midnight-aligned.
  const today = useMemo(() => startOfDay(new Date()), []);

  // 2) Parse shoots once, drop invalid rows, sort chronologically.
  const shoots = useMemo(
    () => SHOOTS
      .map(s => ({ ...s, dateObj: parseShootDate(s.date) }))
      .filter(s => s.dateObj && !isNaN(s.dateObj))
      .sort((a, b) => a.dateObj - b.dateObj),
    []
  );

  // 3) Auto-focus rule: first upcoming shoot's month, else current month.
  const focusMonth = useMemo(() => {
    const next = shoots.find(s => s.dateObj >= today);
    const anchor = next ? next.dateObj : today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  }, [shoots, today]);

  // 4) Cursor = first day of the displayed month.
  const [cursor, setCursor] = useState(focusMonth);
  // Re-anchor if the shoot list changes (e.g. data refresh).
  useEffect(() => { setCursor(focusMonth); }, [focusMonth]);

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();      // 28/29/30/31, per month
  const firstDow = new Date(year, month, 1).getDay();              // 0=Sun..6=Sat
  const offset = (firstDow + 6) % 7;                               // Monday-first

  const monthLabel = `${capitalize(MONTHS_FR_LONG[month])} ${year}`;

  const prevMonth = useCallback(() => setCursor(new Date(year, month - 1, 1)), [year, month]);
  const nextMonth = useCallback(() => setCursor(new Date(year, month + 1, 1)), [year, month]);

  // 5) Strict filter: year + month + day (no more day-only collisions).
  const eventsOn = useCallback(
    (day) => shoots.filter(s =>
      s.dateObj.getFullYear() === year &&
      s.dateObj.getMonth()    === month &&
      s.dateObj.getDate()     === day
    ),
    [shoots, year, month]
  );

  const upcoming     = useMemo(() => shoots.filter(s => s.dateObj >= today).slice(0, 5), [shoots, today]);
  const todaysShoots = useMemo(() => shoots.filter(s => sameDay(s.dateObj, today)),       [shoots, today]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} aria-label="Mois précédent"
                  style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center">
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-[22px] tracking-tight min-w-[170px] text-center"
              style={{ fontFamily: 'Instrument Serif, serif' }}>
            {monthLabel}
          </h3>
          <button onClick={nextMonth} aria-label="Mois suivant"
                  style={neu.raisedXs} className="w-10 h-10 rounded-full flex items-center justify-center">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
            {['jour', 'semaine', 'mois'].map(t => (
              <Pill key={t} active={viewType === t} onClick={() => setViewType(t)}>{capitalize(t)}</Pill>
            ))}
          </div>
          <button style={neu.dark} className="px-5 py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center gap-2">
            <Plus size={14} /> Nouveau tournage
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Calendar grid */}
        <div style={neu.raised} className="col-span-8 rounded-[28px] p-6">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {dayHeaders.map(d => (
              <div key={d} className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold text-center py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const events  = eventsOn(day);
              const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
              return (
                <div
                  key={day}
                  style={isToday ? neu.dark : (events.length ? neu.pressedSm : {})}
                  className={`aspect-square rounded-2xl p-2 flex flex-col cursor-pointer hover:scale-[1.02] transition ${isToday ? 'text-white' : ''}`}
                >
                  <div className={`text-[13px] font-semibold ${isToday ? '' : events.length ? 'text-stone-900' : 'text-stone-400'}`}>
                    {day}
                  </div>
                  <div className="mt-auto space-y-1">
                    {events.slice(0, 2).map(e => (
                      <div
                        key={e.id}
                        className={`text-[8px] truncate px-1.5 py-0.5 rounded-md font-medium ${
                          e.type === 'video'
                            ? (isToday ? 'bg-white text-stone-900' : 'bg-stone-900 text-white')
                            : (isToday ? 'bg-stone-700 text-stone-200' : 'bg-stone-300 text-stone-700')
                        }`}
                      >
                        {e.type === 'video' ? '🎥' : '📸'} {e.title.split('—')[0].trim().slice(0, 12)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today / upcoming */}
        <div className="col-span-4 space-y-4">
          <div style={neu.raised} className="rounded-[24px] p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Aujourd'hui</div>
            <div className="text-[28px] tracking-tight mt-1 leading-none" style={{ fontFamily: 'Instrument Serif, serif' }}>
              {today.getDate()} {capitalize(MONTHS_FR_LONG[today.getMonth()])}
            </div>
            <div className="text-[12px] text-stone-500 mt-1">
              {todaysShoots.length === 0
                ? 'Aucun tournage prévu — journée de post-production'
                : `${todaysShoots.length} tournage${todaysShoots.length > 1 ? 's' : ''} aujourd'hui`}
            </div>
          </div>

          <div style={neu.raised} className="rounded-[24px] p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-4">Prochains événements</div>
            <div className="space-y-3">
              {upcoming.length === 0 && (
                <div className="text-[12px] text-stone-500">Aucun tournage à venir.</div>
              )}
              {upcoming.map(s => (
                <div key={s.id}
                     onClick={() => setCursor(new Date(s.dateObj.getFullYear(), s.dateObj.getMonth(), 1))}
                     className="flex gap-3 group cursor-pointer">
                  <div style={s.type === 'video' ? neu.darkSm : neu.pressedSm}
                       className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${s.type === 'video' ? 'text-white' : ''}`}>
                    <div className={`text-[8px] uppercase tracking-wider ${s.type === 'video' ? 'text-stone-400' : 'text-stone-500'}`}>
                      {MONTHS_FR_SHORT[s.dateObj.getMonth()]}
                    </div>
                    <div className="text-[14px] leading-none font-semibold" style={{ fontFamily: 'Instrument Serif, serif' }}>
                      {s.dateObj.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="font-medium text-[12.5px] truncate">{s.title}</div>
                    <div className="text-[10.5px] text-stone-500 mt-0.5">{s.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- ADMIN VIEWS ----------

const AdminOverview = ({ goTo }) => (
  <div className="grid grid-cols-12 gap-5">
    <div className="col-span-3"><StatCard dark label="Revenus du mois" value="48 920 €" delta="+22,4%" deltaUp /></div>
    <div className="col-span-3"><StatCard label="Clients actifs" value={CLIENTS.filter(c => c.status === 'actif').length} delta="+1 ce mois" deltaUp /></div>
    <div className="col-span-3"><StatCard label="Médias livrés" value="535" delta="+47 ce mois" deltaUp /></div>
    <div className="col-span-3"><StatCard label="Tournages prévus" value="12" delta="ce mois" /></div>

    {/* Revenue chart */}
    <div style={neu.raised} className="col-span-8 rounded-[28px] p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Revenus 6 derniers mois</div>
          <h3 className="text-[22px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Performance financière</h3>
        </div>
        <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
          <Pill active={false}>Semaine</Pill>
          <Pill active={true}>Mois</Pill>
          <Pill active={false}>Année</Pill>
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={REVENUE_DATA} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e2e6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }} />
            <Bar dataKey="value" radius={[12, 12, 0, 0]}>
              {REVENUE_DATA.map((d, i) => (
                <Cell key={i} fill={i === REVENUE_DATA.length - 1 ? '#1a1a1d' : '#9ca3af'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Top clients */}
    <div style={neu.raised} className="col-span-4 rounded-[28px] p-6">
      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-1">Top clients</div>
      <h3 className="text-[20px] tracking-tight mb-5" style={{ fontFamily: 'Instrument Serif, serif' }}>Par chiffre d'affaires</h3>
      <div className="space-y-3.5">
        {[...CLIENTS].sort((a, b) => b.invoiceTotal - a.invoiceTotal).slice(0, 5).map((c, i) => (
          <div key={c.id} className="flex items-center gap-3">
            <div className="text-[10px] text-stone-400 font-mono w-4">0{i + 1}</div>
            <div style={neu.darkSm} className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[10px] font-semibold">{c.initials}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[13px] truncate">{c.name}</div>
              <div className="text-[10.5px] text-stone-500">{c.sector}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-[13px]" style={{ fontFamily: 'Instrument Serif, serif' }}>{c.invoiceTotal.toLocaleString('fr-FR')} €</div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Quick actions */}
    <div style={neu.dark} className="col-span-12 rounded-[28px] p-7 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', transform: 'translate(30%, -50%)' }} />
      <div className="grid grid-cols-12 gap-5 items-center relative">
        <div className="col-span-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Actions rapides</div>
          <h3 className="text-[26px] tracking-tight mt-1 leading-[1.15]" style={{ fontFamily: 'Instrument Serif, serif' }}>
            Gérez tout votre studio depuis un seul espace.
          </h3>
        </div>
        <div className="col-span-7 grid grid-cols-3 gap-3">
          {[
            { icon: Plus, label: 'Nouveau client', go: 'clients' },
            { icon: Upload, label: 'Livrer médias', go: 'deliveries' },
            { icon: FileText, label: 'Créer facture', go: 'billing' },
          ].map(a => (
            <button key={a.label} onClick={() => goTo(a.go)} className="bg-white/5 hover:bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4 text-left transition">
              <a.icon size={18} className="text-amber-200 mb-3" />
              <div className="text-[14px] font-medium">{a.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const AdminClients = ({ goToClient }) => {
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={neu.raisedXs} className="rounded-full p-1 flex items-center">
            <Pill active>Tous ({CLIENTS.length})</Pill>
            <Pill active={false}>Actifs ({CLIENTS.filter(c => c.status === 'actif').length})</Pill>
            <Pill active={false}>En pause</Pill>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button style={neu.raisedXs} className="px-4 py-2.5 rounded-full text-[13px] font-medium flex items-center gap-2"><Filter size={14} /> Filtrer</button>
          <button style={neu.dark} onClick={() => setShowNew(true)} className="px-5 py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center gap-2">
            <Plus size={14} /> Nouvel espace client
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {CLIENTS.map(c => (
          <div key={c.id} style={neu.raised} className="rounded-[24px] p-6 cursor-pointer group" onClick={() => goToClient(c.id)}>
            <div className="flex items-start justify-between">
              <div style={neu.darkSm} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[18px] font-semibold" style={{ ...neu.darkSm, backgroundColor: c.color }}>
                {c.initials}
              </div>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${c.status === 'actif' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                {c.status}
              </span>
            </div>
            <h3 className="text-[20px] tracking-tight mt-4 leading-tight" style={{ fontFamily: 'Instrument Serif, serif' }}>{c.name}</h3>
            <div className="text-[12px] text-stone-500 mt-0.5">{c.sector}</div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div style={neu.pressedSm} className="rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Médias</div>
                <div className="text-[18px] font-semibold mt-0.5" style={{ fontFamily: 'Instrument Serif, serif' }}>{c.mediaCount}</div>
              </div>
              <div style={neu.pressedSm} className="rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">CA total</div>
                <div className="text-[18px] font-semibold mt-0.5" style={{ fontFamily: 'Instrument Serif, serif' }}>{(c.invoiceTotal / 1000).toFixed(1)}K€</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-stone-200/60">
              <span className="text-[11px] text-stone-500">Client depuis {c.joined}</span>
              <ArrowUpRight size={16} className="text-stone-400 group-hover:text-stone-900 transition" />
            </div>
          </div>
        ))}

        {/* Add new client card */}
        <button onClick={() => setShowNew(true)} style={neu.pressed} className="rounded-[24px] p-6 flex flex-col items-center justify-center text-center min-h-[280px] hover:scale-[1.01] transition">
          <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4">
            <Plus size={20} />
          </div>
          <div className="text-[16px] font-semibold">Créer un espace</div>
          <div className="text-[12px] text-stone-500 mt-1 max-w-[180px]">Onboarder un nouveau client en quelques clics</div>
        </button>
      </div>

      {/* New client modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-stone-900/30 backdrop-blur-sm" onClick={() => setShowNew(false)}>
          <div style={neu.raised} className="rounded-[32px] p-8 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Nouveau</div>
                <h2 className="text-[28px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Créer un espace client</h2>
              </div>
              <button style={neu.raisedXs} onClick={() => setShowNew(false)} className="w-9 h-9 rounded-full flex items-center justify-center"><X size={15} /></button>
            </div>
            <div className="space-y-4">
              {[
                { l: 'Nom de la marque', p: 'Ex. Maison Lumière' },
                { l: 'Secteur d\'activité', p: 'Ex. Hôtellerie, Restauration…' },
                { l: 'Email du contact principal', p: 'contact@marque.fr' },
              ].map(f => (
                <div key={f.l}>
                  <label className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">{f.l}</label>
                  <input style={neu.pressedSm} placeholder={f.p} className="w-full mt-2 px-5 py-3.5 rounded-2xl bg-transparent outline-none text-[14px] placeholder:text-stone-400" />
                </div>
              ))}
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Modules activés</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['Médias', 'Factures', 'Analyses', 'Calendrier'].map(m => (
                    <label key={m} style={neu.pressedSm} className="rounded-xl px-4 py-3 flex items-center gap-2.5 cursor-pointer">
                      <div style={neu.dark} className="w-5 h-5 rounded-md flex items-center justify-center"><Check size={11} className="text-white" /></div>
                      <span className="text-[13px] font-medium">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={() => setShowNew(false)} style={neu.raisedXs} className="flex-1 py-3 rounded-full text-[13px] font-medium">Annuler</button>
              <button onClick={() => setShowNew(false)} style={neu.dark} className="flex-1 py-3 rounded-full text-white text-[13px] font-semibold">Créer l'espace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminDeliveries = () => {
  const [selectedClient, setSelectedClient] = useState(1);
  const [files, setFiles] = useState([
    { name: 'campagne_print_hero_v3.mp4', size: '128 MB', type: 'video', progress: 100 },
    { name: 'lookbook_SS26_001.dng', size: '24 MB', type: 'photo', progress: 100 },
    { name: 'reel_coulisses_final.mp4', size: '85 MB', type: 'video', progress: 64 },
  ]);

  return (
    <div className="space-y-5">
      <div style={neu.raised} className="rounded-[28px] p-7">
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Étape 1</div>
        <h3 className="text-[22px] tracking-tight mt-1 mb-5" style={{ fontFamily: 'Instrument Serif, serif' }}>Choisir un espace client</h3>
        <div className="grid grid-cols-5 gap-3">
          {CLIENTS.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClient(c.id)}
              style={selectedClient === c.id ? neu.pressed : neu.raisedSm}
              className="rounded-2xl p-4 text-left transition"
            >
              <div style={neu.darkSm} className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-semibold mb-2">{c.initials}</div>
              <div className="text-[12.5px] font-medium truncate">{c.name}</div>
              <div className="text-[10px] text-stone-500 mt-0.5 truncate">{c.sector}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Upload zone */}
        <div style={neu.raised} className="col-span-7 rounded-[28px] p-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Étape 2</div>
          <h3 className="text-[22px] tracking-tight mt-1 mb-5" style={{ fontFamily: 'Instrument Serif, serif' }}>Téléverser les médias</h3>
          <div style={neu.pressed} className="rounded-3xl p-12 text-center border-2 border-dashed border-stone-300/60">
            <div style={neu.dark} className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
              <Upload size={22} />
            </div>
            <div className="text-[16px] font-semibold">Glissez vos fichiers ici</div>
            <div className="text-[12.5px] text-stone-500 mt-1">ou parcourez votre ordinateur — Photos, vidéos, jusqu'à 5 GB</div>
            <button style={neu.dark} className="mt-5 px-6 py-3 rounded-full text-white text-[13px] font-semibold">Sélectionner des fichiers</button>
          </div>

          <div className="mt-5 space-y-2.5">
            {files.map((f, i) => (
              <div key={i} style={neu.pressedSm} className="rounded-2xl p-3 flex items-center gap-3">
                <div style={neu.darkSm} className="w-10 h-10 rounded-xl flex items-center justify-center text-white">
                  {f.type === 'video' ? <Video size={15} /> : <Camera size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] truncate">{f.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-stone-200">
                      <div className={`h-full rounded-full ${f.progress === 100 ? 'bg-emerald-500' : 'bg-stone-900'}`} style={{ width: `${f.progress}%` }} />
                    </div>
                    <span className="text-[10px] text-stone-500 w-10 text-right">{f.progress}%</span>
                  </div>
                </div>
                <span className="text-[11px] text-stone-500">{f.size}</span>
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-rose-500"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="col-span-5 space-y-4">
          <div style={neu.raised} className="rounded-[28px] p-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Étape 3</div>
            <h3 className="text-[20px] tracking-tight mt-1 mb-4" style={{ fontFamily: 'Instrument Serif, serif' }}>Détails de la livraison</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Nom du dossier</label>
                <input style={neu.pressedSm} defaultValue="Campagne Printemps 2026" className="w-full mt-2 px-4 py-3 rounded-xl bg-transparent outline-none text-[13px]" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Tag</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['Réseaux sociaux', 'Site web', 'Presse', 'E-commerce'].map((t, i) => (
                    <span key={t} style={i === 0 ? neu.dark : neu.pressedSm} className={`text-[11px] px-3 py-1.5 rounded-full font-medium ${i === 0 ? 'text-white' : 'text-stone-600'}`}>{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Message au client (optionnel)</label>
                <textarea style={neu.pressedSm} placeholder="Bonjour, voici la livraison de la campagne…" rows={3} className="w-full mt-2 px-4 py-3 rounded-xl bg-transparent outline-none text-[13px] resize-none" />
              </div>
            </div>
            <button style={neu.dark} className="w-full mt-5 py-3.5 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2">
              <Send size={14} /> Livrer à {CLIENTS[selectedClient - 1].name}
            </button>
          </div>

          <div style={neu.dark} className="rounded-[24px] p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-amber-200" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Astuce</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-stone-300">
              Le client recevra un email automatique avec un lien direct vers son espace. Tous les fichiers sont chiffrés et téléchargeables en HD.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminBilling = () => (
  <div className="space-y-5">
    <div className="grid grid-cols-3 gap-5">
      <StatCard dark label="Facturé ce mois" value="48 920 €" delta="+22%" deltaUp />
      <StatCard label="Encaissé" value="42 100 €" delta="86% du facturé" />
      <StatCard label="En attente" value="6 820 €" delta="3 factures" />
    </div>

    <div style={neu.raised} className="rounded-[28px] p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Toutes les factures</div>
          <h3 className="text-[22px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Facturation studio</h3>
        </div>
        <button style={neu.dark} className="px-5 py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center gap-2">
          <Plus size={14} /> Nouvelle facture
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">
        <div className="col-span-2">Référence</div>
        <div className="col-span-3">Client</div>
        <div className="col-span-3">Description</div>
        <div className="col-span-2">Date</div>
        <div className="col-span-1">Montant</div>
        <div className="col-span-1 text-right">Statut</div>
      </div>
      <div className="space-y-2">
        {[
          { id: 'FAC-2026-042', client: CLIENTS[0], date: '15 Avr 2026', amount: 3200, status: 'payée', desc: 'Production vidéo printemps' },
          { id: 'FAC-2026-041', client: CLIENTS[2], date: '14 Avr 2026', amount: 5800, status: 'payée', desc: 'Campagne SS26 complète' },
          { id: 'FAC-2026-040', client: CLIENTS[1], date: '10 Avr 2026', amount: 1850, status: 'en attente', desc: 'Shooting menu printemps' },
          { id: 'FAC-2026-039', client: CLIENTS[3], date: '08 Avr 2026', amount: 2400, status: 'payée', desc: 'Identité visuelle' },
          { id: 'FAC-2026-038', client: CLIENTS[0], date: '02 Avr 2026', amount: 1850, status: 'payée', desc: 'Shooting lookbook' },
          { id: 'FAC-2026-037', client: CLIENTS[2], date: '28 Mars 2026', amount: 3100, status: 'en attente', desc: 'Reels mensuels mars' },
          { id: 'FAC-2026-036', client: CLIENTS[1], date: '22 Mars 2026', amount: 980, status: 'payée', desc: 'Community management' },
        ].map(inv => (
          <div key={inv.id} style={neu.pressedSm} className="grid grid-cols-12 gap-4 px-4 py-3.5 rounded-2xl items-center">
            <div className="col-span-2 font-mono text-[12.5px] font-medium">{inv.id}</div>
            <div className="col-span-3 flex items-center gap-2.5">
              <div style={neu.darkSm} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold">{inv.client.initials}</div>
              <span className="text-[13px] font-medium truncate">{inv.client.name}</span>
            </div>
            <div className="col-span-3 text-[12.5px] text-stone-700 truncate">{inv.desc}</div>
            <div className="col-span-2 text-[12px] text-stone-500">{inv.date}</div>
            <div className="col-span-1 font-semibold text-[13px]" style={{ fontFamily: 'Instrument Serif, serif' }}>{inv.amount.toLocaleString('fr-FR')} €</div>
            <div className="col-span-1 flex items-center justify-end gap-1.5">
              <span className={`text-[9.5px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold ${inv.status === 'payée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {inv.status}
              </span>
              <button className="w-7 h-7 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-900"><MoreHorizontal size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const AdminPlanning = () => {
  const today = useMemo(() => startOfDay(new Date()), []);

  // Group all shoots by year+month, sort chronologically.
  const shoots = useMemo(
    () => SHOOTS
      .map(s => ({ ...s, dateObj: parseShootDate(s.date) }))
      .filter(s => s.dateObj && !isNaN(s.dateObj))
      .sort((a, b) => a.dateObj - b.dateObj),
    []
  );

  // Active month for the header: next month containing an upcoming shoot,
  // else the current calendar month.
  const activeMonth = useMemo(() => {
    const next = shoots.find(s => s.dateObj >= today);
    return next ? next.dateObj : today;
  }, [shoots, today]);

  const headerMonthLabel = capitalize(MONTHS_FR_LONG[activeMonth.getMonth()]);

  // Show shoots from the active month onward (upcoming-first view).
  const visibleShoots = shoots.filter(s =>
    (s.dateObj.getFullYear() > activeMonth.getFullYear()) ||
    (s.dateObj.getFullYear() === activeMonth.getFullYear() && s.dateObj.getMonth() >= activeMonth.getMonth())
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard dark label="Tournages ce mois" value="12" delta="+3 vs mars" deltaUp />
        <StatCard label="Heures planifiées" value="186 h" />
        <StatCard label="Équipes mobilisées" value="32" delta="techniciens" />
        <StatCard label="Lieux de tournage" value="9" />
      </div>

      <div style={neu.raised} className="rounded-[28px] p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Planning consolidé</div>
            <h3 className="text-[22px] tracking-tight mt-1" style={{ fontFamily: 'Instrument Serif, serif' }}>Tous les tournages — {headerMonthLabel}</h3>
          </div>
          <button style={neu.dark} className="px-5 py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center gap-2">
            <Plus size={14} /> Programmer un tournage
          </button>
        </div>

        <div className="space-y-2.5">
          {visibleShoots.map(s => {
            const client = CLIENTS.find(c => s.title.includes(c.name));
            return (
              <div key={s.id} style={neu.pressedSm} className="rounded-2xl p-4 flex items-center gap-4">
                <div style={s.type === 'video' ? neu.dark : neu.raisedXs} className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${s.type === 'video' ? 'text-white' : 'text-stone-700'}`}>
                  <div className={`text-[9px] uppercase tracking-wider ${s.type === 'video' ? 'text-stone-400' : 'text-stone-400'}`}>{MONTHS_FR_SHORT[s.dateObj.getMonth()]}</div>
                  <div className="text-[18px] leading-none font-semibold" style={{ fontFamily: 'Instrument Serif, serif' }}>{s.dateObj.getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="font-medium text-[14px]">{s.title}</div>
                    <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold ${s.type === 'video' ? 'bg-stone-900 text-white' : 'bg-stone-300 text-stone-700'}`}>
                      {s.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-stone-500">
                    <span className="flex items-center gap-1"><Clock size={11} /> {s.time}</span>
                    <span className="flex items-center gap-1"><MapPin size={11} /> {s.location}</span>
                    <span className="flex items-center gap-1"><Users size={11} /> {s.team} pers.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center"><Edit3 size={13} /></button>
                  <button style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center"><MoreHorizontal size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------- ROOT ----------
export default function App() {
  const [isDark, toggleDark] = useDarkMode();
  // Re-assign the module-level mutable `neu` pointer so every component
  // reads the active token set during render.
  neu = isDark ? NEU_DARK : NEU_LIGHT;

  const themeValue = useMemo(() => ({
    isDark,
    toggleDark,
  }), [isDark, toggleDark]);

  const [mode, setMode] = useState('admin');
  const [adminSection, setAdminSection] = useState('overview');
  const [clientSection, setClientSection] = useState('dashboard');
  const [currentClient, setCurrentClient] = useState(1);

  const goToClientView = (id) => {
    setCurrentClient(id);
    setMode('client');
    setClientSection('dashboard');
  };

  const sectionTitles = {
    admin: {
      overview: { t: 'Bonjour Camille', s: 'Voici la performance de votre studio aujourd\'hui.' },
      clients: { t: 'Mes clients', s: 'Tous les espaces que vous avez créés.' },
      deliveries: { t: 'Nouvelle livraison', s: 'Téléversez et envoyez les médias à vos clients.' },
      billing: { t: 'Facturation', s: 'Suivi de toutes les factures émises.' },
      planning: { t: 'Planning des tournages', s: 'Vue consolidée de tous vos clients.' },
    },
    client: {
      dashboard: { t: `Bonjour ${CLIENTS[currentClient - 1].name.split(' ')[0]}`, s: 'Voici un aperçu de votre activité.' },
      media: { t: 'Vos médias', s: 'Toutes vos photos et vidéos produites par le studio.' },
      invoices: { t: 'Vos factures', s: 'Historique complet de votre facturation.' },
      analytics: { t: 'Analyses temps réel', s: 'Performance de vos réseaux sociaux, mise à jour en continu.' },
      calendar: { t: 'Vos tournages', s: 'Calendrier des prochains shootings et tournages prévus.' },
    },
  };

  const section = mode === 'admin' ? adminSection : clientSection;
  const setSection = mode === 'admin' ? setAdminSection : setClientSection;
  const titles = sectionTitles[mode][section];

  return (
    <ThemeContext.Provider value={themeValue}>
    <div className="min-h-screen w-full" style={{ ...neu.base, fontFamily: '"Manrope", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap');
        body { background: ${isDark ? '#1c1d21' : '#e8e9ec'}; transition: background 0.5s ease; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(80,82,90,0.55)' : 'rgba(120,120,130,0.3)'}; border-radius: 4px; }

        /* ─── Dark-mode color overrides for Tailwind classes ─── */
        [data-theme="dark"] .text-stone-900 { color: #e2e3e8 !important; }
        [data-theme="dark"] .text-stone-800 { color: #d4d5da !important; }
        [data-theme="dark"] .text-stone-700 { color: #b8b9c0 !important; }
        [data-theme="dark"] .text-stone-600 { color: #9899a0 !important; }
        [data-theme="dark"] .text-stone-500 { color: #82838a !important; }
        [data-theme="dark"] .text-stone-400 { color: #6b6c73 !important; }
        [data-theme="dark"] .text-stone-300 { color: #545560 !important; }
        [data-theme="dark"] .bg-white { background-color: #2d2e36 !important; }
        [data-theme="dark"] .bg-stone-50 { background-color: #23242a !important; }
        [data-theme="dark"] .bg-stone-100 { background-color: #2d2e36 !important; }
        [data-theme="dark"] .bg-stone-900 { background-color: #f1f2f5 !important; }
        [data-theme="dark"] .text-white { color: #1a1a1d !important; }
        [data-theme="dark"] .placeholder\\:text-stone-400::placeholder { color: #6b6c73 !important; }
        [data-theme="dark"] .border-stone-200 { border-color: rgba(255,255,255,0.07) !important; }
        [data-theme="dark"] .border-stone-300 { border-color: rgba(255,255,255,0.1) !important; }
        [data-theme="dark"] hr { border-color: rgba(255,255,255,0.07) !important; }

        /* Smooth transitions on theme change */
        * { transition: background-color 0.5s ease, color 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease; }
      `}</style>

      <div className="flex gap-5 p-5 min-h-screen">
        <Sidebar mode={mode} section={section} setSection={setSection} agencyName="Atelier" />

        <main className="flex-1 min-w-0">
          <TopBar
            title={titles.t}
            subtitle={titles.s}
            mode={mode}
            setMode={(m) => {
              setMode(m);
              if (m === 'admin') setAdminSection('overview');
              else setClientSection('dashboard');
            }}
            currentClient={currentClient}
            setCurrentClient={setCurrentClient}
          />

          {mode === 'client' && section === 'dashboard' && <ClientDashboard goTo={setClientSection} />}
          {mode === 'client' && section === 'media' && <ClientMedia />}
          {mode === 'client' && section === 'invoices' && <ClientInvoices />}
          {mode === 'client' && section === 'analytics' && <ClientAnalytics />}
          {mode === 'client' && section === 'calendar' && <ClientCalendar />}

          {mode === 'admin' && section === 'overview' && <AdminOverview goTo={setAdminSection} />}
          {mode === 'admin' && section === 'clients' && <AdminClients goToClient={goToClientView} />}
          {mode === 'admin' && section === 'deliveries' && <AdminDeliveries />}
          {mode === 'admin' && section === 'billing' && <AdminBilling />}
          {mode === 'admin' && section === 'planning' && <AdminPlanning />}
        </main>
      </div>
    </div>
    </ThemeContext.Provider>
  );
}
