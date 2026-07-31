/* ════════════════════════════════════════════════════════════
   📓  ESPACE PERSO — perso.timelesshouse.org
   ════════════════════════════════════════════════════════════
   Les pages privées de Gil, type Notion : des pages hiérarchiques
   faites de blocs, partagées arbre par arbre.

   Trois modes, choisis dans App() :
     · JETON     — ?t=<token> dans l'URL : lecture anonyme via la RPC
                   perso_page_par_jeton (fail-closed). Gagne même
                   connecté : c'est l'aperçu « ce que voit le lien ».
     · CONNEXION — pas de session : email → lien magique (edge
                   function perso-invite), repli mot de passe pour
                   Gil, étape TOTP si la double vérification l'exige
                   (sans elle, la policy restrictive aal2 rendrait
                   toutes les requêtes muettes : 0 ligne, 0 erreur).
     · CONNECTÉ  — propriétaire (tout), éditeur ou lecteur d'un
                   arbre : la RLS filtre, l'interface s'adapte.

   Le contenu d'une page vit dans UNE colonne jsonb `blocs`
   (autosave débouncé + garde optimiste sur updated_at). Les types
   de bloc ne sont pas contraints en base : un type inconnu se rend
   en paragraphe (doctrine galleries.template).

   Design : identité laloge-design (néomorphisme crème/graphite,
   tokens NEU canoniques de communication-admin.jsx, Instrument
   Serif + Manrope, règle halo, formulaires en colonne unique,
   cibles ≥ 44 px, deux thèmes de premier ordre).
   ════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import {
  Loader2, Lock, Mail, X, Plus, ChevronUp, ChevronDown, ChevronRight,
  Trash2, Share2, Copy, Check, RefreshCw, LogOut, ShieldCheck,
  AlertCircle, FileText, FilePlus, Heading1, Heading2, Pilcrow, List,
  ListOrdered, CheckSquare, Quote, Minus, Image as ImageIcon,
  ExternalLink, Send, KeyRound, Eye, EyeOff, Link2, Square, Menu, Table,
  Play, Video,
} from 'lucide-react';
import { BaseEditeur, BaseLecture, nouvelleBase } from './base.jsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Le lien magique de l'email porte ?lm=<token_hash> et c'est l'app qui
   l'échange contre une session (verifyOtp) : les scanners de boîtes
   mail pré-visitent les liens, et le lien /verify de Supabase est à
   usage unique — le jeton était grillé avant le clic humain (boucle
   de connexion constatée le 29/07/2026). Un GET de robot n'exécute
   pas ce JavaScript ; le clic humain, si. On photographie le jeton
   puis on nettoie l'URL : un rechargement ne doit pas rejouer un
   échange déjà consommé (la session vit en localStorage). */
const LM_BOOT = new URLSearchParams(window.location.search).get('lm') || '';
if (LM_BOOT) {
  const u = new URL(window.location.href);
  u.searchParams.delete('lm');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

/* Filet pour les liens de l'ancien format (fragment #access_token /
   #error_code posé par le /verify de Supabase) : on photographie le
   fragment AVANT que supabase-js ne le consomme, pour dire « lien
   expiré » proprement au lieu d'un écran de connexion muet. */
const FRAGMENT_BOOT = window.location.hash || '';
const LIEN_EN_ERREUR = /error(_code|_description)?=/.test(FRAGMENT_BOOT)
  ? (/otp_expired|invalid/i.test(FRAGMENT_BOOT)
      ? 'Ce lien a expiré ou a déjà servi — redemandez-en un ci-dessous.'
      : 'La connexion par ce lien a échoué — redemandez-en un ci-dessous.')
  : '';
if (LIEN_EN_ERREUR) {
  // supabase-js ne nettoie le fragment que sur succès.
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Le jeton du lien secret, lu une fois : il fige le mode de l'app.
const JETON_URL = new URLSearchParams(window.location.search).get('t') || '';

/* Aperçu de mise en page — VITE DEV SEULEMENT (import.meta.env.DEV est
   faux en production : Vite élimine tout ce code du bundle). ?demo=1
   rend l'interface connectée avec des données factices, sans toucher
   à Supabase — pour vérifier la maquette sans session. */
const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
const DONNEES_DEMO = () => {
  const r = (id, titre, icone, blocs = []) => ({ id, parent_id: null, racine_id: id, titre, icone, blocs, position: 0, created_at: id, updated_at: id });
  const e = (id, parent, titre, icone) => ({ ...r(id, titre, icone), parent_id: parent, racine_id: parent });
  const pTitre = 'p-titre', pStatut = 'p-statut', pDate = 'p-date', pFait = 'p-fait', pTags = 'p-tags';
  const baseDemo = {
    id: 'bloc-base-demo', type: 'base', nom: 'Tournages', vue: 'table',
    filtres: [], tri: null,
    proprietes: [
      { id: pTitre, nom: 'Nom', type: 'texte' },
      { id: pStatut, nom: 'Statut', type: 'selection' },
      { id: pTags, nom: 'Étiquettes', type: 'etiquettes' },
      { id: pDate, nom: 'Date', type: 'date' },
      { id: pFait, nom: 'Livré', type: 'case' },
    ],
    lignes: [
      { id: 'l1', valeurs: { [pTitre]: 'Mariage Eunice & Josué', [pStatut]: 'Montage', [pTags]: ['mariage', 'urgent'], [pDate]: '2026-07-31', [pFait]: false },
        blocs: [{ id: 'ln1', type: 'paragraphe', texte: 'Brief : drone au golden hour, discours du père à isoler.' }] },
      { id: 'l2', valeurs: { [pTitre]: 'Clip immobilier Vinci', [pStatut]: 'Tourné', [pTags]: ['immobilier'], [pDate]: '2026-07-02', [pFait]: true }, blocs: [] },
      { id: 'l3', valeurs: { [pTitre]: 'Teaser La Loge', [pStatut]: 'Écriture', [pTags]: ['laloge'], [pDate]: '2026-07-18', [pFait]: false }, blocs: [] },
    ],
  };
  return {
    estProprio: true,
    pages: [
      r('a0000000-0000-4000-8000-000000000001', 'Santé & forme', '💪'),
      r('a0000000-0000-4000-8000-000000000002', 'Finances', '💳'),
      r('a0000000-0000-4000-8000-000000000003', 'Projets', '🎬', [
        baseDemo,
        { id: 'bloc-video-demo', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', legende: 'Référence 16:9' },
        { id: 'bloc-shorts-demo', type: 'video', url: 'https://www.youtube.com/shorts/abcdefgHIJK', legende: 'Référence verticale' },
      ]),
      r('a0000000-0000-4000-8000-000000000004', 'Études', '📚'),
      r('a0000000-0000-4000-8000-000000000005', 'Famille & amis', '🫶'),
      e('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003', 'Tournages 2026', '🎥'),
      e('a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003', 'Idées de films', '💡'),
    ],
    roles: new Map(),
    erreur: null,
  };
};

/* ════════════════════════════════════════════════════════════
   🎨 TOKENS NÉOMORPHIQUES (canoniques — communication-admin.jsx)
   ════════════════════════════════════════════════════════════
   Règle « halo » : budget de portée offset+flou par jeton (raised
   21 px, raisedSm 17 px, raisedXs 10 px, dark 13 px) — jamais plus.
   raisedXs porte zIndex:2 : une pastille passe AU-DESSUS des halos
   des cartes voisines. */
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

// Mutable pointer — réassigné par App() à chaque rendu (top-down :
// tous les enfants lisent la bonne palette sans Context ni prop).
// Exporté en liaison vivante ESM : base.jsx suit le thème sans Context.
export let neu = NEU_LIGHT;

export const SERIF = { fontFamily: 'Instrument Serif, serif', fontWeight: 400 };

/* Thème piloté par l'appareil — pas de bascule (décision du 22/07). */
const useDarkMode = () => {
  const mq = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [isDark, setIsDark] = useState(() => !!(mq && mq.matches));
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);
  useEffect(() => {
    if (!mq) return;
    // Rattrapage : certains environnements (webviews, navigateurs
    // intégrés) mentent à l'initialisation puis n'émettent pas de
    // « change » — on relit la vérité au montage. Sans effet ailleurs.
    setIsDark((prev) => (mq.matches !== prev ? mq.matches : prev));
    const suivre = (e) => setIsDark(e.matches);
    if (mq.addEventListener) { mq.addEventListener('change', suivre); return () => mq.removeEventListener('change', suivre); }
    mq.addListener(suivre); return () => mq.removeListener(suivre);
  }, [mq]);
  return isDark;
};

/* ════════════════════════════════════════════════════════════
   🛠 HELPERS
   ════════════════════════════════════════════════════════════ */
export const genId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).replace(/-/g, '').slice(0, 12);

const genToken = () =>
  (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random() + '-' + Math.random())).replace(/-/g, '');

/* Routeur par hash : #/p/<id> = une page, tout le reste = l'accueil.
   Les fragments de supabase-js (retour de lien magique) sont ignorés :
   ils ne ressemblent jamais à « #/… ». */
const lireRoute = () => {
  const h = window.location.hash || '';
  const m = h.match(/^#\/p\/([0-9a-f-]{36})$/i);
  return m ? { vue: 'page', id: m[1] } : { vue: 'accueil' };
};
const allerA = (pageId) => { window.location.hash = pageId ? `#/p/${pageId}` : '#/'; };

const appelPersoInvite = (payload, jwt) =>
  fetch(`${SUPABASE_URL}/functions/v1/perso-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

/* ── Upload B2 (v2, 30/07/2026) ──
   Chemin simple uniquement (une image ≤ 25 Mo, pas de multipart) :
   b2-sign signe un PUT sur perso/<racine_id>/<fichier> — réservé au
   propriétaire et aux éditeurs de l'arbre —, le navigateur envoie
   directement chez B2. XHR et non fetch : fetch ne sait pas suivre
   la progression d'un envoi. */
const b2SafeName = (name) => String(name || 'image')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 120);

async function b2Sign(payload) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Session expirée — reconnectez-vous.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/b2-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(corps?.error || `Signature impossible (${res.status})`);
  return corps;
}

const b2Put = (url, file, contentType, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', url);
  xhr.setRequestHeader('Content-Type', contentType);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
  };
  xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
    ? resolve()
    : reject(new Error(`Envoi refusé (${xhr.status})`));
  xhr.onerror = () => reject(new Error("L'envoi a échoué — vérifiez votre connexion."));
  xhr.send(file);
});

async function televerserFichierPerso(file, racineId, onProgress, { prefixe, maxMo, quoi }) {
  if (!file.type.startsWith(prefixe)) throw new Error(`Choisissez ${quoi}.`);
  if (file.size > maxMo * 1024 * 1024) throw new Error(`Fichier trop lourd (${maxMo} Mo maximum).`);
  const contentType = file.type || 'application/octet-stream';
  const key = `perso/${racineId}/${Date.now()}-${b2SafeName(file.name)}`;
  const { url, publicUrl } = await b2Sign({ action: 'sign-put', key, contentType, size: file.size });
  // un réessai : les hoquets réseau sont fréquents sur téléphone
  try { await b2Put(url, file, contentType, onProgress); }
  catch { await b2Put(url, file, contentType, onProgress); }
  return publicUrl;
}

export const televerserImage = (file, racineId, onProgress) =>
  televerserFichierPerso(file, racineId, onProgress, { prefixe: 'image/', maxMo: 25, quoi: 'une image' });

const televerserVideo = (file, racineId, onProgress) =>
  televerserFichierPerso(file, racineId, onProgress, { prefixe: 'video/', maxMo: 300, quoi: 'une vidéo' });

/* ── Analyse d'un lien vidéo ──
   D'où qu'il vienne, un lien devient { genre, src, ratio } :
   · fichier (mp4/webm/mov… ou téléversé chez nous) → <video> natif,
     qui épouse tout seul le format réel ;
   · YouTube (Shorts en 9/16), Vimeo, Dailymotion, Instagram (reels
     en 9/16) → iframe au bon ratio ;
   · le reste (Pinterest exige son script externe — CSP maison) →
     carte-lien élégante. */
function analyserVideo(brut) {
  const url = String(brut || '').trim();
  if (!url) return null;
  if (/\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url) || /\/perso\//.test(url)) {
    return { genre: 'fichier', src: url };
  }
  let u;
  try { u = new URL(url); } catch { return { genre: 'inconnu', src: url }; }
  const hote = u.hostname.replace(/^www\./, '');

  if (hote === 'youtu.be' || hote.endsWith('youtube.com') || hote.endsWith('youtube-nocookie.com')) {
    const shorts = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
    const embed = u.pathname.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
    const id = shorts?.[1] || embed?.[1]
      || (hote === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.searchParams.get('v'));
    if (id) return {
      genre: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${id}`,
      ratio: shorts ? '9 / 16' : '16 / 9',
    };
  }
  if (hote === 'vimeo.com' || hote === 'player.vimeo.com') {
    const id = u.pathname.match(/\/(?:video\/)?(\d{6,})/)?.[1];
    if (id) return { genre: 'iframe', src: `https://player.vimeo.com/video/${id}`, ratio: '16 / 9' };
  }
  if (hote === 'dailymotion.com' || hote === 'dai.ly') {
    const id = hote === 'dai.ly'
      ? u.pathname.slice(1).split('/')[0]
      : u.pathname.match(/\/video\/([A-Za-z0-9]+)/)?.[1];
    if (id) return { genre: 'iframe', src: `https://www.dailymotion.com/embed/video/${id}`, ratio: '16 / 9' };
  }
  if (hote === 'instagram.com') {
    const m = u.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return {
      genre: 'iframe',
      src: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/`,
      ratio: m[1] === 'p' ? '4 / 5' : '9 / 16',
    };
  }
  return { genre: 'inconnu', src: url };
}

/* Rendu partagé lecture/édition : le fichier épouse son propre format
   (height auto), l'iframe reçoit le ratio déduit — les verticales
   restent des colonnes, jamais des murs. */
function RenduVideo({ bloc }) {
  const [illisible, setIllisible] = useState(false);
  const v = analyserVideo(bloc.url);
  useEffect(() => { setIllisible(false); }, [v?.src]);
  if (!v) return null;
  if (v.genre === 'fichier') {
    // Un fichier peut être bien servi et pourtant illisible ICI : le
    // codec (AV1 d'un retéléchargement YouTube, ProRes…) dépend du
    // navigateur. Safari répond par un play barré muet — on explique
    // à sa place (constaté le 30/07 sur un mp4 AV1).
    if (illisible) return (
      <div style={neu.pressedSm} className="rounded-2xl p-4 space-y-3 max-w-[52ch]">
        <div className="flex items-start gap-2 text-[12.5px] text-amber-800 leading-relaxed">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>
            Ce navigateur ne sait pas lire le codec de cette vidéo (souvent : AV1 d'un
            fichier retéléchargé depuis YouTube, ou ProRes). Téléversez l'export
            H.264 d'origine, ou collez le lien YouTube/Vimeo — leur lecteur s'adapte
            à chaque appareil.
          </span>
        </div>
        <a href={v.src} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 min-h-[44px] text-[12.5px] font-semibold text-stone-700 hover:text-stone-900">
          <ExternalLink size={13} /> Ouvrir le fichier quand même
        </a>
      </div>
    );
    return (
      <video src={v.src} controls playsInline preload="metadata"
        onError={() => setIllisible(true)}
        className="max-w-full h-auto rounded-2xl" style={{ ...neu.raisedSm, maxHeight: '75vh' }} />
    );
  }
  if (v.genre === 'iframe') {
    const vertical = v.ratio === '9 / 16';
    return (
      <iframe src={v.src} title={bloc.legende || 'Vidéo'} allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        className={`w-full rounded-2xl border-0 ${vertical ? 'max-w-[340px]' : ''}`}
        style={{ ...neu.raisedSm, aspectRatio: v.ratio }} loading="lazy" />
    );
  }
  return (
    <a href={v.src} target="_blank" rel="noopener noreferrer" style={neu.raisedXs}
      className="inline-flex items-center gap-2.5 px-4 py-3 min-h-[44px] rounded-2xl text-[14px] font-medium text-stone-800 active:scale-[0.98] transition max-w-full">
      <Play size={14} className="shrink-0 text-stone-500" />
      <span className="truncate">{bloc.legende || v.src}</span>
    </a>
  );
}

/* ════════════════════════════════════════════════════════════
   🔧 ATOMS (au niveau module — jamais dans un composant, sinon
   chaque rendu REMONTE les champs contrôlés et le focus saute)
   ════════════════════════════════════════════════════════════ */
export const Btn = ({ kind = 'soft', onClick, children, type = 'button', disabled, full, icon: Icon, className = '' }) => {
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
      {Icon && <Icon size={14} className={Icon === Loader2 ? 'animate-spin' : ''} />}
      {children}
    </button>
  );
};

// Bouton rond icône seule — 40 px dessinés, zone tactile 44+ via tap-ext.
const IconBtn = ({ onClick, label, icon: Icon, danger, busy, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    aria-label={label}
    title={label}
    style={neu.raisedXs}
    className={`w-10 h-10 tap-ext rounded-full flex items-center justify-center shrink-0 transition active:scale-95 disabled:opacity-50 ${danger ? 'text-rose-500' : 'text-stone-600'} ${className}`}
  >
    {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
  </button>
);

export const Field = ({ label, children }) => (
  <div>
    <label className="text-[13px] text-stone-700 font-medium block mb-2 leading-snug">{label}</label>
    {children}
  </div>
);

export const Input = (props) => (
  <input
    {...props}
    style={{ ...neu.pressedSm, ...(props.style || {}) }}
    className={`w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px] placeholder:text-stone-400 ${props.className || ''}`}
  />
);

export const Select = ({ value, onChange, children, ...rest }) => (
  <select value={value} onChange={onChange} {...rest} style={neu.pressedSm}
    className="w-full px-4 py-3 rounded-xl bg-transparent text-[16px] sm:text-[14px]">
    {children}
  </select>
);

/* Textarea qui grandit avec son contenu (aucun précédent au dépôt —
   les blocs de texte en ont besoin : un paragraphe n'a pas d'ascenseur
   dans Notion). Hauteur recalée sur scrollHeight à chaque frappe. */
const TextareaAuto = ({ value, onChange, className = '', style = {}, ...rest }) => {
  const ref = useRef(null);
  const ajuster = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(ajuster, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      style={{ overflow: 'hidden', resize: 'none', ...style }}
      className={`w-full bg-transparent text-[16px] placeholder:text-stone-400 ${className}`}
      {...rest}
    />
  );
};

const EmptyState = ({ icon: Icon, title, text, children }) => (
  <div style={neu.raisedSm} className="rounded-3xl p-10 text-center">
    <div style={neu.pressedSm} className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-stone-500 mb-4">
      <Icon size={20} />
    </div>
    <div className="text-[17px] text-stone-800" style={SERIF}>{title}</div>
    {text && <p className="text-[13px] text-stone-500 mt-2 max-w-[42ch] mx-auto leading-relaxed">{text}</p>}
    {children && <div className="mt-5 flex justify-center">{children}</div>}
  </div>
);

const CopyButton = ({ value, label = 'Copier le lien' }) => {
  const [ok, setOk] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1600);
  };
  return (
    <Btn onClick={copier} icon={ok ? Check : Copy}>{ok ? 'Copié' : label}</Btn>
  );
};

export const Modal = ({ title, kicker, onClose, children, size = 'md' }) => {
  const boxRef = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    const origine = document.activeElement;
    document.body.style.overflow = 'hidden';
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
      <div
        ref={boxRef}
        tabIndex={-1}
        style={neu.raised}
        className={`th-modal-boite rounded-t-[28px] sm:rounded-[32px] p-5 sm:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-7 max-h-[92dvh] sm:max-h-[90dvh] overflow-y-auto overscroll-contain w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1 bg-stone-300 rounded-full mx-auto mb-4" />
        <div className="flex items-start justify-between mb-5 gap-3">
          <div className="min-w-0 flex-1">
            {kicker && <div className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{kicker}</div>}
            <h2 className="text-[20px] sm:text-[24px] tracking-tight mt-1 leading-tight" style={SERIF}>{title}</h2>
          </div>
          <button style={neu.raisedXs} onClick={onClose} aria-label="Fermer"
            className="w-9 h-9 tap-ext rounded-full flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* Petite confirmation destructive — HIG §12 : verbe précis, action
   risquée en rouge, jamais en défaut, « Annuler » toujours là. */
const ConfirmModal = ({ title, text, verbe, onConfirm, onClose, busy }) => (
  <Modal title={title} onClose={onClose}>
    <p className="text-[13.5px] text-stone-600 leading-relaxed">{text}</p>
    <div className="flex flex-col gap-3 mt-6">
      <button onClick={onConfirm} disabled={busy}
        className="w-full min-h-[48px] rounded-full bg-rose-600 text-white text-[14px] font-semibold active:scale-[0.99] transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} {verbe}
      </button>
      <Btn onClick={onClose} full>Annuler</Btn>
    </div>
  </Modal>
);

/* ════════════════════════════════════════════════════════════
   🧱 BLOCS — modèle, rendu, édition
   ════════════════════════════════════════════════════════════ */
const TYPES_BLOC = [
  { type: 'titre1',     label: 'Grand titre',     icon: Heading1,   hint: 'Une section majeure' },
  { type: 'titre2',     label: 'Sous-titre',      icon: Heading2,   hint: 'Une sous-section' },
  { type: 'paragraphe', label: 'Texte',           icon: Pilcrow,    hint: 'Un paragraphe libre' },
  { type: 'puces',      label: 'Liste à puces',   icon: List,       hint: 'Des points, sans ordre' },
  { type: 'numerotee',  label: 'Liste numérotée', icon: ListOrdered, hint: 'Des étapes, dans l’ordre' },
  { type: 'cases',      label: 'Liste à cocher',  icon: CheckSquare, hint: 'Des choses à faire' },
  { type: 'citation',   label: 'Citation',        icon: Quote,      hint: 'Un passage mis en avant' },
  { type: 'separateur', label: 'Séparateur',      icon: Minus,      hint: 'Une respiration' },
  { type: 'image',      label: 'Image',           icon: ImageIcon,  hint: 'Téléversée depuis l’appareil' },
  { type: 'video',      label: 'Vidéo',           icon: Video,      hint: 'Téléversée, YouTube, Vimeo…' },
  { type: 'lien',       label: 'Lien',            icon: Link2,      hint: 'Vers un site, un document' },
  { type: 'base',       label: 'Base de données', icon: Table,      hint: 'Table, liste ou galerie' },
];

const nouveauBloc = (type) => {
  const base = { id: genId(), type };
  if (type === 'base') return { ...base, ...nouvelleBase() };
  if (type === 'puces' || type === 'numerotee') return { ...base, items: [''] };
  if (type === 'cases') return { ...base, items: [{ texte: '', coche: false }] };
  if (type === 'image' || type === 'video') return { ...base, url: '', legende: '' };
  if (type === 'lien') return { ...base, url: '', titre: '' };
  if (type === 'separateur') return base;
  return { ...base, texte: '' };
};

const STYLE_TITRE1 = { ...SERIF, fontSize: '28px', lineHeight: 1.2 };
const STYLE_TITRE2 = { ...SERIF, fontSize: '21px', lineHeight: 1.3 };

/* ── Rendu lecture seule (lecteur connecté et lien secret) ── */
export function RenduBloc({ bloc }) {
  const t = bloc?.type;
  if (t === 'base') return <BaseLecture bloc={bloc} />;
  if (t === 'separateur') return <hr className="border-stone-300 my-2" />;
  if (t === 'titre1') return <h2 className="text-stone-900 mt-4" style={STYLE_TITRE1}>{bloc.texte}</h2>;
  if (t === 'titre2') return <h3 className="text-stone-900 mt-2" style={STYLE_TITRE2}>{bloc.texte}</h3>;
  if (t === 'citation') return (
    <blockquote className="border-l-2 border-stone-900 pl-4 py-1 text-[16px] italic text-stone-700 leading-relaxed" style={SERIF}>
      {bloc.texte}
    </blockquote>
  );
  if (t === 'puces' || t === 'numerotee') {
    const Tag = t === 'puces' ? 'ul' : 'ol';
    return (
      <Tag className={`${t === 'puces' ? 'list-disc' : 'list-decimal'} pl-6 space-y-1.5 text-[16px] text-stone-800 leading-relaxed`}>
        {(bloc.items || []).map((it, i) => <li key={i}>{String(it ?? '')}</li>)}
      </Tag>
    );
  }
  if (t === 'cases') return (
    <ul className="space-y-2">
      {(bloc.items || []).map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[16px] text-stone-800 leading-relaxed">
          <span aria-hidden="true" className={`mt-[3px] shrink-0 ${it.coche ? 'text-stone-900' : 'text-stone-400'}`}>
            {it.coche ? <CheckSquare size={17} /> : <Square size={17} />}
          </span>
          <span className={it.coche ? 'line-through text-stone-500' : ''}>{it.texte}</span>
        </li>
      ))}
    </ul>
  );
  if (t === 'image') {
    if (!bloc.url) return null;
    return (
      <figure className="my-2">
        <img src={bloc.url} alt={bloc.legende || ''} loading="lazy"
          className="max-w-full rounded-2xl" style={neu.raisedSm} />
        {bloc.legende && <figcaption className="text-[12.5px] text-stone-500 mt-2">{bloc.legende}</figcaption>}
      </figure>
    );
  }
  if (t === 'video') {
    if (!bloc.url) return null;
    return (
      <figure className="my-2">
        <RenduVideo bloc={bloc} />
        {bloc.legende && <figcaption className="text-[12.5px] text-stone-500 mt-2">{bloc.legende}</figcaption>}
      </figure>
    );
  }
  if (t === 'lien') {
    if (!bloc.url) return null;
    return (
      <a href={bloc.url} target="_blank" rel="noopener noreferrer" style={neu.raisedXs}
        className="inline-flex items-center gap-2.5 px-4 py-3 min-h-[44px] rounded-2xl text-[14px] font-medium text-stone-800 active:scale-[0.98] transition max-w-full">
        <ExternalLink size={14} className="shrink-0 text-stone-500" />
        <span className="truncate">{bloc.titre || bloc.url}</span>
      </a>
    );
  }
  // Type inconnu (venu d'une version future) : on montre son texte
  // plutôt que de casser la page.
  return <p className="text-[16px] text-stone-800 leading-relaxed whitespace-pre-wrap">{bloc?.texte || ''}</p>;
}

/* ── Édition d'un bloc ──
   Le contenu s'édite « à plat » (champs transparents, la page reste
   calme) ; les commandes vivent dans une grappe discrète à droite,
   toujours visible — le survol n'existe pas au tactile (HIG §4). */
function BoutonBloc({ onClick, label, icon: Icon, danger, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      onMouseDown={(e) => e.preventDefault()}
      className={`w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white ${danger ? 'text-rose-500' : 'text-stone-500'} disabled:opacity-30 active:scale-95 transition`}>
      <Icon size={14} />
    </button>
  );
}

function EditeurListe({ bloc, onChange, cases }) {
  const items = bloc.items || [];
  const setItems = (next) => onChange({ ...bloc, items: next });
  const setItem = (i, val) => setItems(items.map((it, idx) => (idx === i ? val : it)));
  const texteDe = (it) => (cases ? it.texte : String(it ?? ''));
  const avecTexte = (it, texte) => (cases ? { ...it, texte } : texte);

  const onKeyDown = (i) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const vide = cases ? { texte: '', coche: false } : '';
      setItems([...items.slice(0, i + 1), vide, ...items.slice(i + 1)]);
      // le focus suit au prochain rendu
      requestAnimationFrame(() => {
        const champs = e.target.closest('[data-liste]')?.querySelectorAll('input[data-item]');
        champs?.[i + 1]?.focus();
      });
    }
    if (e.key === 'Backspace' && texteDe(items[i]) === '' && items.length > 1) {
      e.preventDefault();
      setItems(items.filter((_, idx) => idx !== i));
      requestAnimationFrame(() => {
        const champs = e.target.closest('[data-liste]')?.querySelectorAll('input[data-item]');
        champs?.[Math.max(0, i - 1)]?.focus();
      });
    }
  };

  return (
    <div data-liste className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2.5">
          {cases ? (
            <button type="button" role="checkbox" aria-checked={!!it.coche}
              aria-label={it.coche ? 'Décocher' : 'Cocher'}
              onClick={() => setItem(i, { ...it, coche: !it.coche })}
              className={`tap-ext shrink-0 ${it.coche ? 'text-stone-900' : 'text-stone-400'} active:scale-90 transition`}>
              {it.coche ? <CheckSquare size={17} /> : <Square size={17} />}
            </button>
          ) : (
            <span aria-hidden="true" className="shrink-0 w-5 text-center text-stone-500 text-[15px] leading-none">
              {bloc.type === 'numerotee' ? `${i + 1}.` : '•'}
            </span>
          )}
          <input
            data-item
            value={texteDe(it)}
            onChange={(e) => setItem(i, avecTexte(it, e.target.value))}
            onKeyDown={onKeyDown(i)}
            placeholder="Élément de liste"
            className={`flex-1 bg-transparent text-[16px] leading-relaxed placeholder:text-stone-400 ${cases && it.coche ? 'line-through text-stone-500' : 'text-stone-800'}`}
          />
        </div>
      ))}
      <div className="text-[11px] text-stone-400 pl-7">Entrée : nouvel élément · Effacer un élément vide le retire</div>
    </div>
  );
}

/* Bloc image : téléversement direct vers B2 (avec progression) ou
   adresse collée — les deux chemins remplissent le même `url`. */
function BlocImageEditeur({ bloc, set, racineId }) {
  const fileRef = useRef(null);
  const [pct, setPct] = useState(null); // null = repos
  const [erreur, setErreur] = useState('');

  const surFichier = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErreur(''); setPct(0);
    try {
      const url = await televerserImage(file, racineId, (p) => setPct(Math.round(p * 100)));
      set({ url });
    } catch (err) {
      setErreur(err?.message || "L'envoi a échoué — réessayez.");
    }
    setPct(null);
  };

  return (
    <div className="space-y-3">
      {bloc.url ? (
        <img src={bloc.url} alt={bloc.legende || ''} loading="lazy" className="max-w-full rounded-2xl" style={neu.raisedSm} />
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={surFichier} />
      {pct !== null ? (
        <div className="space-y-1.5">
          <div style={neu.pressedSm} className="rounded-full h-3 overflow-hidden"
            role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Envoi de l'image">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: neu.accent }} />
          </div>
          <div className="text-[11.5px] text-stone-500">Envoi… {pct}%</div>
        </div>
      ) : (
        <Btn onClick={() => fileRef.current?.click()} icon={ImageIcon}>
          {bloc.url ? "Remplacer l'image" : 'Téléverser une image'}
        </Btn>
      )}
      {erreur && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
          <AlertCircle size={14} className="shrink-0" /> {erreur}
        </div>
      )}
      <Input type="url" inputMode="url" value={bloc.url || ''} onChange={(e) => set({ url: e.target.value.trim() })}
        placeholder="… ou collez une adresse (URL)" />
      <Input value={bloc.legende || ''} onChange={(e) => set({ legende: e.target.value })} placeholder="Légende (facultative)" />
    </div>
  );
}

/* Bloc vidéo : téléversement direct vers B2 (300 Mo max) ou lien —
   fichier mp4, YouTube, Vimeo, Dailymotion, Instagram… Le rendu
   s'ajuste au format (Shorts et reels restent verticaux). */
function BlocVideoEditeur({ bloc, set, racineId }) {
  const fileRef = useRef(null);
  const [pct, setPct] = useState(null);
  const [erreur, setErreur] = useState('');

  const surFichier = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErreur(''); setPct(0);
    try {
      const url = await televerserVideo(file, racineId, (p) => setPct(Math.round(p * 100)));
      set({ url });
    } catch (err) {
      setErreur(err?.message || "L'envoi a échoué — réessayez.");
    }
    setPct(null);
  };

  return (
    <div className="space-y-3">
      {bloc.url ? <RenduVideo bloc={bloc} /> : null}
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={surFichier} />
      {pct !== null ? (
        <div className="space-y-1.5">
          <div style={neu.pressedSm} className="rounded-full h-3 overflow-hidden"
            role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Envoi de la vidéo">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: neu.accent }} />
          </div>
          <div className="text-[11.5px] text-stone-500">Envoi… {pct}% — une vidéo peut prendre un moment</div>
        </div>
      ) : (
        <Btn onClick={() => fileRef.current?.click()} icon={Video}>
          {bloc.url ? 'Remplacer la vidéo' : 'Téléverser une vidéo'}
        </Btn>
      )}
      {erreur && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
          <AlertCircle size={14} className="shrink-0" /> {erreur}
        </div>
      )}
      <Input type="url" inputMode="url" value={bloc.url || ''} onChange={(e) => set({ url: e.target.value.trim() })}
        placeholder="… ou collez un lien (mp4, YouTube, Vimeo, Dailymotion, Instagram…)" />
      <Input value={bloc.legende || ''} onChange={(e) => set({ legende: e.target.value })} placeholder="Légende (facultative)" />
    </div>
  );
}

function EditeurBloc({ bloc, onChange, racineId, onEntree, onEffacerVide }) {
  const t = bloc.type;
  const set = (patch) => onChange({ ...bloc, ...patch });
  /* Gestes Notion sur les blocs de texte : Entrée enchaîne sur un
     nouveau paragraphe (Maj+Entrée pour un retour à la ligne),
     Effacer dans un bloc vide le retire et remonte au précédent. */
  const clavier = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && onEntree) { e.preventDefault(); onEntree(); return; }
    if (e.key === 'Backspace' && !(bloc.texte || '') && onEffacerVide) { e.preventDefault(); onEffacerVide(); }
  };
  if (t === 'separateur') return <hr className="border-stone-300 my-3" />;
  if (t === 'titre1' || t === 'titre2') return (
    <TextareaAuto value={bloc.texte || ''} onChange={(e) => set({ texte: e.target.value })} onKeyDown={clavier}
      placeholder={t === 'titre1' ? 'Grand titre' : 'Sous-titre'}
      className="text-stone-900" style={t === 'titre1' ? STYLE_TITRE1 : STYLE_TITRE2} />
  );
  if (t === 'citation') return (
    <div className="border-l-2 border-stone-900 pl-4">
      <TextareaAuto value={bloc.texte || ''} onChange={(e) => set({ texte: e.target.value })} onKeyDown={clavier}
        placeholder="Citation" className="italic text-stone-700 leading-relaxed" style={SERIF} />
    </div>
  );
  if (t === 'base') return <BaseEditeur bloc={bloc} onChange={onChange} racineId={racineId} />;
  if (t === 'puces' || t === 'numerotee') return <EditeurListe bloc={bloc} onChange={onChange} />;
  if (t === 'cases') return <EditeurListe bloc={bloc} onChange={onChange} cases />;
  if (t === 'image') return <BlocImageEditeur bloc={bloc} set={set} racineId={racineId} />;
  if (t === 'video') return <BlocVideoEditeur bloc={bloc} set={set} racineId={racineId} />;
  if (t === 'lien') return (
    <div className="space-y-3">
      <Input type="url" inputMode="url" value={bloc.url || ''} onChange={(e) => set({ url: e.target.value.trim() })}
        placeholder="https://…" />
      <Input value={bloc.titre || ''} onChange={(e) => set({ titre: e.target.value })} placeholder="Intitulé du lien (facultatif)" />
    </div>
  );
  return (
    <TextareaAuto value={bloc.texte || ''} onChange={(e) => set({ texte: e.target.value })} onKeyDown={clavier}
      placeholder="" className="text-stone-800 leading-relaxed" />
  );
}

/* Le menu des types — feuille en bas sur mobile, boîte en desktop.
   Une colonne (règle formulaire) : dix lignes se parcourent mieux
   qu'une grille au pouce. */
function MenuTypes({ onPick, onClose, typesExclus = [] }) {
  return (
    <Modal title="Ajouter un bloc" onClose={onClose}>
      <div className="space-y-2">
        {TYPES_BLOC.filter(({ type }) => !typesExclus.includes(type)).map(({ type, label, icon: Icon, hint }) => (
          <button key={type} type="button" onClick={() => onPick(type)} style={neu.raisedXs}
            className="w-full min-h-[52px] px-4 py-3 rounded-2xl flex items-center gap-3.5 text-left active:scale-[0.99] transition">
            <span style={neu.pressedSm} className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 shrink-0">
              <Icon size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-stone-800">{label}</span>
              <span className="block text-[12px] text-stone-500">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ListeBlocsEditeur({ blocs, onChange, racineId, typesExclus }) {
  const [menuApres, setMenuApres] = useState(null); // index d'insertion après
  const conteneurRef = useRef(null);

  // Rend la main au champ du bloc visé (fin de texte). Le nœud peut ne
  // pas être encore peint au premier souffle : on réessaie quelques
  // trames plutôt que de perdre le curseur.
  const focaliser = (id) => {
    let essais = 0;
    const tenter = () => {
      const el = conteneurRef.current?.querySelector(`[data-bloc="${id}"] textarea, [data-bloc="${id}"] input`);
      if (el) {
        el.focus();
        const n = el.value?.length ?? 0;
        try { el.setSelectionRange(n, n); } catch (_) {}
        return;
      }
      if (++essais < 5) requestAnimationFrame(tenter);
    };
    requestAnimationFrame(tenter);
  };

  const setBloc = (i, next) => onChange(blocs.map((b, idx) => (idx === i ? next : b)));
  const retirer = (i) => onChange(blocs.filter((_, idx) => idx !== i));
  const deplacer = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blocs.length) return;
    const copie = [...blocs];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    onChange(copie);
  };
  const insererApres = (i, type, texte = '') => {
    const b = { ...nouveauBloc(type), ...(texte ? { texte } : {}) };
    const idx = i === null || i >= blocs.length ? blocs.length : i + 1;
    onChange([...blocs.slice(0, idx), b, ...blocs.slice(idx)]);
    focaliser(b.id);
  };

  // Entrée dans un bloc de texte → paragraphe suivant ; Effacer un
  // bloc vide → on remonte au précédent.
  const surEntree = (i) => insererApres(i, 'paragraphe');
  const surEffacerVide = (i) => {
    const precedent = blocs[i - 1];
    retirer(i);
    if (precedent) focaliser(precedent.id);
  };

  return (
    <div ref={conteneurRef} className="space-y-0.5">
      {blocs.map((bloc, i) => (
        // En étroit la grappe passe AU-DESSUS du bloc (col-reverse) :
        // à côté, elle amputait la colonne à 108 px sur 280 (mesuré,
        // audit responsive 31/07 — le calendrier était écrasé).
        <div key={bloc.id || i} data-bloc={bloc.id} className="group flex flex-col-reverse sm:flex-row sm:items-start gap-1 sm:gap-2">
          <div className="flex-1 min-w-0 py-1">
            <EditeurBloc bloc={bloc} onChange={(next) => setBloc(i, next)} racineId={racineId}
              onEntree={() => surEntree(i)} onEffacerVide={() => surEffacerVide(i)} />
          </div>
          {/* Les commandes s'effacent seulement là où le survol existe
              pour les rappeler : discrètes mais TOUJOURS actives au
              tactile (audit HIG 30/07 — un séparateur n'a aucun champ à
              focaliser, ses commandes devenaient inatteignables), et
              pleines dès que le bloc a le focus. Interstice 12 px entre
              pastilles (règle halo). */}
          <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto pt-1 opacity-60 sm:opacity-0 sm:pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto transition-opacity">
            <BoutonBloc onClick={() => setMenuApres(i)} label="Insérer un bloc dessous" icon={Plus} />
            <BoutonBloc onClick={() => deplacer(i, -1)} label="Monter" icon={ChevronUp} disabled={i === 0} />
            <BoutonBloc onClick={() => deplacer(i, 1)} label="Descendre" icon={ChevronDown} disabled={i === blocs.length - 1} />
            <BoutonBloc onClick={() => retirer(i)} label="Supprimer le bloc" icon={Trash2} danger />
          </div>
        </div>
      ))}

      {/* La ligne d'écriture : on tape, le paragraphe naît — comme dans
          Notion. « / » ouvre le choix de bloc. Toujours là, jamais de
          bouton à trouver pour commencer à écrire. */}
      <div className="py-1">
        <TextareaAuto
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (val === '/') { setMenuApres(blocs.length - 1); return; }
            if (val) insererApres(blocs.length - 1, 'paragraphe', val);
          }}
          placeholder={blocs.length === 0
            ? 'Écrivez, ou tapez « / » pour choisir un type de bloc'
            : 'Écrivez, « / » pour un bloc…'}
          aria-label="Écrire un nouveau paragraphe"
          className="text-stone-800 leading-relaxed py-2.5"
        />
      </div>

      {menuApres !== null && (
        <MenuTypes
          onPick={(type) => { insererApres(menuApres, type); setMenuApres(null); }}
          onClose={() => setMenuApres(null)}
          typesExclus={typesExclus}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   🌳 ARBRE — helpers de hiérarchie (avec garde anti-cycle : un
   parent_id forgé par API ne doit jamais faire boucler le rendu)
   ════════════════════════════════════════════════════════════ */
const trierPages = (a, b) =>
  (a.position - b.position) || String(a.created_at).localeCompare(String(b.created_at));

const enfantsDe = (pages, id) => pages.filter(p => p.parent_id === id).sort(trierPages);

const cheminVers = (pages, id) => {
  const parId = new Map(pages.map(p => [p.id, p]));
  const chemin = [];
  const visites = new Set();
  let courant = parId.get(id);
  while (courant && !visites.has(courant.id)) {
    visites.add(courant.id);
    chemin.unshift(courant);
    courant = courant.parent_id ? parId.get(courant.parent_id) : null;
  }
  return chemin;
};

const titreDe = (p) => (p?.titre?.trim() ? p.titre : 'Sans titre');

/* ════════════════════════════════════════════════════════════
   🔐 CONNEXION (lien magique d'abord, mot de passe en repli, TOTP)
   ════════════════════════════════════════════════════════════ */
function EcranMfa({ onDone, onAbandon }) {
  const [facteurs, setFacteurs] = useState(null); // null = recherche en cours
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panne, setPanne] = useState('');

  const trouverFacteurs = useCallback(async () => {
    setPanne('');
    // Trois sources, de la plus fraîche à la plus locale — une session
    // née d'un lien magique n'expose pas ses facteurs partout pareil.
    // On garde TOUS les facteurs TOTP (vérifiés d'abord) : chaque
    // configuration 2FA abandonnée laisse un fantôme, et challenger le
    // seul « premier » faisait rejeter des codes pourtant justes
    // (constaté le 30/07 : la console acceptait, l'espace perso non).
    // Et quoi qu'il arrive, cet écran ne se déconnecte JAMAIS tout seul.
    const { data: fs } = await sb.auth.mfa.listFactors().catch(() => ({ data: null }));
    const { data: u } = await sb.auth.getUser().catch(() => ({ data: null }));
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: null }));
    const tous = new Map();
    [...(fs?.totp || []), ...(u?.user?.factors || []), ...(s?.session?.user?.factors || [])]
      .filter((x) => (x.factor_type ?? 'totp') === 'totp')
      .forEach((x) => { if (!tous.has(x.id)) tous.set(x.id, x); });
    const liste = [...tous.values()]
      .sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1));
    if (!liste.length) {
      setPanne(`Aucun facteur de double vérification trouvé (sdk ${fs?.totp?.length ?? '?'} · serveur ${u?.user?.factors?.length ?? '?'} · session ${s?.session?.user?.factors?.length ?? '?'}).`);
      setFacteurs([]);
      return;
    }
    setFacteurs(liste);
  }, []);

  useEffect(() => { trouverFacteurs(); }, [trouverFacteurs]);

  const verifier = async (e) => {
    e.preventDefault();
    if (!facteurs?.length || busy) return;
    setBusy(true); setError('');
    // Le même code est essayé contre CHAQUE facteur : celui de ton
    // application n'est juste que pour le facteur dont elle porte le
    // secret — les fantômes des configurations passées échouent, le
    // vrai répond.
    let dernier = null;
    for (const f of facteurs) {
      try {
        const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: f.id });
        if (e1) { dernier = e1; continue; }
        const { error: e2 } = await sb.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: code.trim() });
        if (e2) { dernier = e2; continue; }
        setBusy(false);
        onDone();
        return;
      } catch (err) { dernier = err; }
    }
    setError(/invalid|expired/i.test(dernier?.message || '')
      ? 'Code incorrect ou expiré — regardez le nouveau code dans votre application.'
      : 'La vérification a échoué — réessayez.');
    setCode('');
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div style={neu.raised} className="rounded-[32px] p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <ShieldCheck size={20} />
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Double vérification</div>
          <h1 className="text-[34px] tracking-tight mt-1 leading-none" style={SERIF}>Votre code</h1>
          <p className="text-[13px] text-stone-500 mt-3">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
        </div>
        {panne ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-[12.5px]">
              <AlertCircle size={14} className="shrink-0" />
              {panne}
            </div>
            <Btn kind="dark" full onClick={trouverFacteurs} icon={RefreshCw}>Réessayer</Btn>
            <button type="button" onClick={onAbandon}
              className="w-full min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
              Revenir à la connexion
            </button>
          </div>
        ) : (
        <form onSubmit={verifier} className="space-y-4">
          <Field label="Code à 6 chiffres">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus required
              className="text-center tracking-[0.4em] font-semibold" />
          </Field>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
          <button type="submit" disabled={busy || code.length < 6} style={neu.dark}
            className="w-full min-h-[48px] rounded-full text-white text-[14px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform">
            {busy ? 'Vérification…' : 'Entrer'}
          </button>
          <button type="button" onClick={onAbandon}
            className="w-full min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
            Revenir à la connexion
          </button>
        </form>
        )}
      </div>
    </div>
  );
}

function Connexion({ avertissement }) {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  // Repli mot de passe (Gil) — replié par défaut : les invités n'en ont pas.
  const [avecMdp, setAvecMdp] = useState(false);
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busyMdp, setBusyMdp] = useState(false);
  const [error, setError] = useState('');

  const demanderLien = async (e) => {
    e.preventDefault();
    if (!email.trim() || envoi) return;
    setEnvoi(true); setError('');
    try {
      await appelPersoInvite({ action: 'lien', email: email.trim(), redirect_to: window.location.origin });
    } catch { /* réponse volontairement identique */ }
    setEnvoye(true); setEnvoi(false);
  };

  const entrerParMdp = async (e) => {
    e.preventDefault();
    setBusyMdp(true); setError('');
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
    if (err) {
      setError('Identifiants incorrects ou compte non trouvé.');
      setBusyMdp(false);
      return;
    }
    // La suite (TOTP éventuel) est prise en charge par poserSession dans App.
    setBusyMdp(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div style={neu.raised} className="rounded-[32px] p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <Lock size={20} />
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">TimelessHouse</div>
          <h1 className="text-[34px] tracking-tight mt-1 leading-none" style={SERIF}>Espace perso</h1>
          <p className="text-[13px] text-stone-500 mt-3">Saisissez votre adresse : si elle a accès, un lien de connexion arrive par email.</p>
        </div>

        {avertissement && !envoye && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-[12.5px] mb-4">
            <AlertCircle size={14} className="shrink-0" /> {avertissement}
          </div>
        )}

        {envoye ? (
          <div className="text-center space-y-5">
            <div style={neu.pressedSm} className="rounded-2xl p-5">
              <Send size={18} className="mx-auto text-stone-500 mb-2" />
              <p className="text-[13.5px] text-stone-700 leading-relaxed">
                Si <strong>{email.trim()}</strong> a accès à cet espace, un email vient de partir.
                Ouvrez-le et touchez « Ouvrir l'espace ».
              </p>
            </div>
            <button type="button" onClick={() => setEnvoye(false)}
              className="min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
              Renvoyer vers une autre adresse
            </button>
          </div>
        ) : (
          <form onSubmit={avecMdp ? entrerParMdp : demanderLien} className="space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <Input type="email" inputMode="email" autoComplete="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" style={{ paddingLeft: '42px' }} />
              </div>
            </Field>

            {avecMdp && (
              <Field label="Mot de passe">
                <div className="relative">
                  <KeyRound size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input type={showPwd ? 'text' : 'password'} autoComplete="current-password" required value={pwd}
                    onChange={(e) => setPwd(e.target.value)} placeholder="••••••••"
                    style={{ paddingLeft: '42px', paddingRight: '42px' }} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-stone-400 hover:text-stone-700">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-[12.5px]">
                <AlertCircle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={avecMdp ? busyMdp : envoi} style={neu.dark}
              className="w-full min-h-[48px] rounded-full text-white text-[14px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform flex items-center justify-center gap-2">
              {(avecMdp ? busyMdp : envoi) && <Loader2 size={15} className="animate-spin" />}
              {avecMdp ? (busyMdp ? 'Connexion…' : 'Entrer') : (envoi ? 'Envoi…' : 'Recevoir mon lien')}
            </button>

            <button type="button" onClick={() => { setAvecMdp(!avecMdp); setError(''); }}
              className="w-full min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
              {avecMdp ? 'Recevoir un lien par email plutôt' : "J'ai un mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   🔗 MODE JETON — lecture anonyme par lien secret
   ════════════════════════════════════════════════════════════ */
function VueJeton() {
  const [etat, setEtat] = useState('chargement'); // chargement | ok | mort
  const [donnees, setDonnees] = useState(null);   // { page, arbre }

  const charger = useCallback(async (pageId) => {
    setEtat('chargement');
    const { data, error } = await sb.rpc('perso_page_par_jeton', {
      p_token: JETON_URL, p_page: pageId || null,
    });
    if (error || !data) { setEtat('mort'); return; }
    setDonnees(data); setEtat('ok');
  }, []);

  useEffect(() => {
    const route = lireRoute();
    charger(route.vue === 'page' ? route.id : null);
    const onHash = () => {
      const r = lireRoute();
      charger(r.vue === 'page' ? r.id : null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [charger]);

  if (etat === 'chargement') return <PleinEcranChargement />;
  if (etat === 'mort') return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div style={neu.raised} className="rounded-[32px] p-10 max-w-md w-full text-center">
        <div style={neu.pressedSm} className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-stone-500 mb-4">
          <Lock size={20} />
        </div>
        <h1 className="text-[26px] tracking-tight" style={SERIF}>Lien inactif</h1>
        <p className="text-[13px] text-stone-500 mt-3 leading-relaxed">
          Ce lien de lecture n'est plus valable — il a peut-être été désactivé ou remplacé.
          Rapprochez-vous de la personne qui vous l'a envoyé.
        </p>
      </div>
    </div>
  );

  const { page, arbre } = donnees;
  const sousPages = (arbre || []).filter(p => p.parent_id === page.id).sort(trierPages);
  const chemin = cheminVers(arbre || [], page.id);
  const naviguer = (id) => { window.location.hash = `#/p/${id}`; };

  return (
    <div className="min-h-screen" style={neu.base}>
      <header className="max-w-3xl mx-auto px-5 sm:px-8 pt-6 flex items-center justify-between gap-3">
        <div className="text-[12px] uppercase tracking-[0.2em] text-stone-500 font-semibold">Espace perso</div>
        <div style={neu.pressedSm} className="px-3.5 py-2 rounded-full text-[11.5px] font-semibold text-stone-500 flex items-center gap-1.5">
          <Eye size={12} /> Lecture
        </div>
      </header>
      <main className="th-vue max-w-3xl mx-auto px-5 sm:px-8 py-8">
        <FilAriane chemin={chemin} naviguer={naviguer} />
        <PageLecture page={page} sousPages={sousPages} naviguer={naviguer} />
      </main>
    </div>
  );
}

function PleinEcranChargement() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={neu.base}>
      <Loader2 size={22} className="animate-spin text-stone-400" />
    </div>
  );
}

/* Squelettes bornés dans le temps : au-delà de 8 s, quelque chose ne
   va pas — on le dit et on donne le geste (HIG §10, jamais d'attente
   muette sans issue). */
function ChargementOuPanne({ onRetry }) {
  const [tropLong, setTropLong] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTropLong(true), 8000);
    return () => clearTimeout(t);
  }, []);
  if (tropLong) return (
    <EmptyState icon={AlertCircle} title="Le chargement n'aboutit pas"
      text="Le réseau ou le serveur n'a pas répondu. Réessayez — si ça persiste, dites-le à Gil.">
      <Btn kind="dark" onClick={onRetry} icon={RefreshCw}>Réessayer</Btn>
    </EmptyState>
  );
  return (
    <div className="th-squelette space-y-4">
      <div style={neu.raisedSm} className="h-20 rounded-3xl" />
      <div style={neu.raisedSm} className="h-20 rounded-3xl" />
      <div style={neu.raisedSm} className="h-20 rounded-3xl" />
    </div>
  );
}

function FilAriane({ chemin, naviguer, racineLabel }) {
  if (!chemin || chemin.length === 0) return null;
  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center flex-wrap gap-1 text-[12.5px] text-stone-500 mb-6">
      {racineLabel && (
        <>
          <button type="button" onClick={() => naviguer(null)}
            className="min-h-[32px] px-1.5 tap-ext rounded-lg hover:text-stone-800 transition">{racineLabel}</button>
          <ChevronRight size={12} className="shrink-0 text-stone-400" />
        </>
      )}
      {chemin.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && <ChevronRight size={12} className="shrink-0 text-stone-400" />}
          {i === chemin.length - 1 ? (
            <span className="px-1.5 text-stone-700 font-medium">{p.icone ? `${p.icone} ` : ''}{titreDe(p)}</span>
          ) : (
            <button type="button" onClick={() => naviguer(p.id)}
              className="min-h-[32px] px-1.5 tap-ext rounded-lg hover:text-stone-800 transition">
              {p.icone ? `${p.icone} ` : ''}{titreDe(p)}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function ListeSousPages({ sousPages, naviguer }) {
  if (!sousPages.length) return null;
  return (
    <section className="mt-10">
      <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold mb-3">Sous-pages</div>
      <div className="th-liste space-y-3">
        {sousPages.map(sp => (
          <button key={sp.id} type="button" onClick={() => naviguer(sp.id)} style={neu.raisedSm}
            className="th-press w-full min-h-[56px] px-5 py-4 rounded-2xl flex items-center gap-3 text-left">
            <span className="text-[18px] leading-none" aria-hidden="true">{sp.icone || '📄'}</span>
            <span className="flex-1 min-w-0 text-[15px] font-medium text-stone-800 truncate">{titreDe(sp)}</span>
            <ChevronRight size={15} className="shrink-0 text-stone-400" />
          </button>
        ))}
      </div>
    </section>
  );
}

function PageLecture({ page, sousPages, naviguer }) {
  return (
    <>
      <h1 className="text-[30px] sm:text-[36px] tracking-tight text-stone-900 leading-tight" style={SERIF}>
        {page.icone ? `${page.icone} ` : ''}{titreDe(page)}
      </h1>
      <div className="mt-6 space-y-4">
        {(Array.isArray(page.blocs) ? page.blocs : []).map((b, i) => <RenduBloc key={b.id || i} bloc={b} />)}
        {(!page.blocs || page.blocs.length === 0) && (
          <p className="text-[14px] text-stone-500 italic">Cette page est encore vide.</p>
        )}
      </div>
      <ListeSousPages sousPages={sousPages} naviguer={naviguer} />
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   🤝 MODALE PARTAGE (propriétaire, par arbre)
   ════════════════════════════════════════════════════════════ */
function ModalePartage({ racine, onClose }) {
  const [membres, setMembres] = useState(null);
  const [partage, setPartage] = useState(null);
  const [emailInvite, setEmailInvite] = useState('');
  const [roleInvite, setRoleInvite] = useState('lecteur');
  const [busyInvite, setBusyInvite] = useState(false);
  const [message, setMessage] = useState(null); // { ok, texte }
  const [busyPartage, setBusyPartage] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const charger = useCallback(async () => {
    const [m, p] = await Promise.all([
      sb.from('perso_membres').select('*').eq('racine_id', racine.id).order('created_at'),
      sb.from('perso_partages').select('*').eq('racine_id', racine.id).maybeSingle(),
    ]);
    setMembres(m.data || []);
    setPartage(p.data || null);
  }, [racine.id]);

  useEffect(() => { charger(); }, [charger]);

  const inviter = async (e) => {
    e.preventDefault();
    if (busyInvite || !emailInvite.trim()) return;
    setBusyInvite(true); setMessage(null);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await appelPersoInvite({
        action: 'inviter',
        email: emailInvite.trim(),
        racine_id: racine.id,
        role: roleInvite,
        redirect_to: window.location.origin,
      }, session?.access_token);
      const corps = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corps?.error || 'Invitation impossible.');
      setMessage({ ok: true, texte: `Invitation envoyée à ${emailInvite.trim()}.` });
      setEmailInvite('');
      await charger();
    } catch (err) {
      setMessage({ ok: false, texte: err?.message || 'Invitation impossible.' });
    }
    setBusyInvite(false);
  };

  const changerRole = async (m, role) => {
    await sb.from('perso_membres').update({ role })
      .eq('racine_id', m.racine_id).eq('user_id', m.user_id);
    await charger();
  };

  const revoquer = async (m) => {
    await sb.from('perso_membres').delete()
      .eq('racine_id', m.racine_id).eq('user_id', m.user_id);
    await charger();
  };

  const basculerLien = async () => {
    if (!partage || busyPartage) return;
    setBusyPartage(true);
    await sb.from('perso_partages').update({ enabled: !partage.enabled }).eq('racine_id', racine.id);
    await charger();
    setBusyPartage(false);
  };

  const regenerer = async () => {
    setBusyPartage(true);
    await sb.from('perso_partages').update({ token: genToken(), enabled: true }).eq('racine_id', racine.id);
    await charger();
    setBusyPartage(false);
    setConfirmRegen(false);
  };

  const lienSecret = partage ? `${window.location.origin}/?t=${partage.token}` : '';

  return (
    <Modal title={titreDe(racine)} kicker="Partager" onClose={onClose} size="lg">
      {membres === null ? (
        <div className="th-squelette space-y-3">
          <div style={neu.pressedSm} className="h-14 rounded-2xl" />
          <div style={neu.pressedSm} className="h-14 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-7">
          {/* ── Inviter ── */}
          <form onSubmit={inviter} className="space-y-4">
            <Field label="Inviter par email">
              <Input type="email" inputMode="email" autoComplete="off" value={emailInvite}
                onChange={(e) => setEmailInvite(e.target.value)} placeholder="prenom@exemple.com" />
            </Field>
            <Field label="Son droit">
              <Select value={roleInvite} onChange={(e) => setRoleInvite(e.target.value)}>
                <option value="lecteur">Lecture — consulte, sans modifier</option>
                <option value="editeur">Édition — modifie les pages de cet arbre</option>
              </Select>
            </Field>
            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-[12.5px] ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {message.ok ? <Check size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                {message.texte}
              </div>
            )}
            <Btn type="submit" kind="dark" full disabled={busyInvite} icon={busyInvite ? Loader2 : Send}>
              {busyInvite ? 'Envoi…' : "Envoyer l'invitation"}
            </Btn>
          </form>

          {/* ── Membres ── */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold mb-3">
              Accès nominatifs
            </div>
            {membres.length === 0 ? (
              <p className="text-[13px] text-stone-500">Personne pour l'instant — cet arbre n'est visible que de vous.</p>
            ) : (
              <ul className="space-y-3">
                {membres.map((m) => (
                  <li key={m.user_id} style={neu.pressedSm} className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <span className="flex-1 min-w-[140px] text-[13.5px] font-medium text-stone-800 truncate">{m.email}</span>
                    <select value={m.role} onChange={(e) => changerRole(m, e.target.value)}
                      aria-label={`Droit de ${m.email}`} style={neu.raisedXs}
                      className="min-h-[40px] px-3 rounded-full text-[12.5px] font-semibold text-stone-700 bg-transparent">
                      <option value="lecteur">Lecture</option>
                      <option value="editeur">Édition</option>
                    </select>
                    <IconBtn onClick={() => revoquer(m)} label={`Révoquer ${m.email}`} icon={Trash2} danger />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Lien secret ── */}
          <section>
            <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold mb-3">
              Lien secret de lecture
            </div>
            <div style={neu.pressedSm} className="rounded-2xl px-4 py-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-[13px] text-stone-700 leading-snug">
                  {partage?.enabled
                    ? 'Actif : toute personne ayant ce lien peut lire cet arbre.'
                    : 'Coupé : le lien ne montre rien.'}
                </span>
                <button type="button" role="switch" aria-checked={!!partage?.enabled} onClick={basculerLien}
                  disabled={busyPartage} aria-label="Activer le lien secret"
                  className="th-hit-44 relative w-[46px] h-[26px] rounded-full transition-colors shrink-0"
                  style={{ backgroundColor: partage?.enabled ? neu.accent : 'rgba(120,113,108,0.35)' }}>
                  <span className="absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white transition-all"
                    style={{ left: partage?.enabled ? '23px' : '3px' }} />
                </button>
              </div>
              {partage?.enabled && (
                <>
                  <div className="text-[12px] text-stone-500 break-all leading-relaxed select-all">{lienSecret}</div>
                  <div className="flex flex-wrap gap-3">
                    <CopyButton value={lienSecret} />
                    <Btn onClick={() => setConfirmRegen(true)} icon={RefreshCw}>Régénérer</Btn>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {confirmRegen && (
        <ConfirmModal
          title="Régénérer le lien ?"
          text="L'ancien lien cessera immédiatement de fonctionner pour tous ceux qui l'ont. Un nouveau lien sera créé."
          verbe="Régénérer le lien"
          busy={busyPartage}
          onConfirm={regenerer}
          onClose={() => setConfirmRegen(false)}
        />
      )}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════
   📄 VUE PAGE (lecture ou édition selon le rôle)
   ════════════════════════════════════════════════════════════ */
function VuePage({ pageId, pages, rolePour, recharger, estProprio }) {
  const page = pages.find(p => p.id === pageId);
  const [brouillon, setBrouillon] = useState(null);   // { titre, icone, blocs }
  const chargeA = useRef(null);                       // updated_at au chargement
  const timerRef = useRef(null);
  const brouillonRef = useRef(null);
  const sauvegardeEnCours = useRef(false);
  const [etatSauvegarde, setEtatSauvegarde] = useState('repos'); // repos | attente | envoi | conflit
  const [partageOuvert, setPartageOuvert] = useState(false);
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const [busySuppr, setBusySuppr] = useState(false);

  const role = page ? rolePour(page.racine_id) : null;
  const peutEditer = role === 'proprietaire' || role === 'editeur';

  // (Re)charge le brouillon quand on change de page ou après recharge.
  useEffect(() => {
    if (!page) return;
    setBrouillon({
      titre: page.titre || '',
      icone: page.icone || '',
      blocs: Array.isArray(page.blocs) ? page.blocs : [],
    });
    chargeA.current = page.updated_at;
    setEtatSauvegarde('repos');
  }, [pageId, page?.updated_at]);

  useEffect(() => { brouillonRef.current = brouillon; }, [brouillon]);

  /* Autosave : 800 ms après la dernière frappe, garde optimiste sur
     updated_at — 0 ligne modifiée = la page a bougé ailleurs (autre
     onglet, autre éditeur) : on recharge au lieu d'écraser. */
  const sauver = useCallback(async () => {
    if (DEMO) { setEtatSauvegarde('repos'); return; } // maquette : rien à écrire
    const b = brouillonRef.current;
    if (!b || sauvegardeEnCours.current) return;
    sauvegardeEnCours.current = true;
    setEtatSauvegarde('envoi');
    const { data, error } = await sb.from('perso_pages')
      .update({ titre: b.titre, icone: b.icone || null, blocs: b.blocs })
      .eq('id', pageId)
      .eq('updated_at', chargeA.current)
      .select('updated_at');
    sauvegardeEnCours.current = false;
    if (error || !data || data.length === 0) {
      setEtatSauvegarde('conflit');
      await recharger();
      return;
    }
    chargeA.current = data[0].updated_at;
    setEtatSauvegarde('repos');
  }, [pageId, recharger]);

  const marquer = (patch) => {
    setBrouillon(prev => ({ ...prev, ...patch }));
    setEtatSauvegarde('attente');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(sauver, 800);
  };

  // Filet : la sauvegarde part avant de quitter (nav, onglet caché, fermeture).
  useEffect(() => {
    const flush = () => {
      if (etatSauvegarde === 'attente') { clearTimeout(timerRef.current); sauver(); }
    };
    const onVis = () => { if (document.hidden) flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush(); // départ de la page (hashchange → démontage)
    };
  }, [etatSauvegarde, sauver]);

  if (!page) return (
    <EmptyState icon={FileText} title="Page introuvable"
      text="Elle a peut-être été supprimée, ou son partage a été retiré.">
      <Btn onClick={() => allerA(null)}>Revenir à l'accueil</Btn>
    </EmptyState>
  );

  const chemin = cheminVers(pages, page.id);
  const sousPages = enfantsDe(pages, page.id);
  const estRacine = !page.parent_id;

  // Toute action qui recharge le magasin embarque d'abord les frappes
  // en attente — sinon recharger() écraserait le brouillon local.
  const flushAvant = async () => {
    if (etatSauvegarde === 'attente') { clearTimeout(timerRef.current); await sauver(); }
  };

  const creerSousPage = async () => {
    await flushAvant();
    const position = sousPages.length ? Math.max(...sousPages.map(s => s.position)) + 1 : 0;
    const { data, error } = await sb.from('perso_pages')
      .insert({ parent_id: page.id, titre: '', position })
      .select('id').single();
    if (!error && data) { await recharger(); allerA(data.id); }
  };

  const supprimer = async () => {
    setBusySuppr(true);
    await sb.from('perso_pages').delete().eq('id', page.id);
    setBusySuppr(false);
    setConfirmSuppr(false);
    await recharger();
    allerA(page.parent_id || null);
  };

  const temoinSauvegarde = {
    attente: 'Modifié…', envoi: 'Enregistrement…', repos: 'Enregistré',
    conflit: 'Modifiée ailleurs — rechargée',
  }[etatSauvegarde];

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <FilAriane chemin={chemin} naviguer={(id) => allerA(id)} racineLabel="Accueil" />
        <div className="flex items-center gap-2 shrink-0">
          {peutEditer && (
            <span aria-live="polite" className={`text-[11.5px] ${etatSauvegarde === 'conflit' ? 'text-amber-700' : 'text-stone-400'}`}>
              {temoinSauvegarde}
            </span>
          )}
          {estProprio && estRacine && (
            <IconBtn onClick={() => setPartageOuvert(true)} label="Partager cet arbre" icon={Share2} />
          )}
          {(estProprio || (peutEditer && !estRacine)) && (
            <IconBtn onClick={() => setConfirmSuppr(true)} label="Supprimer la page" icon={Trash2} danger />
          )}
        </div>
      </div>

      {etatSauvegarde === 'conflit' && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-[12.5px] mb-4">
          <AlertCircle size={14} className="shrink-0" />
          Cette page a été modifiée ailleurs — la dernière version vient d'être rechargée.
        </div>
      )}

      {peutEditer && brouillon ? (
        <>
          {/* Le titre s'édite dans un textarea : un h1 hors écran garde
              la hiérarchie pour les lecteurs d'écran (HIG §16). */}
          <h1 className="sr-only">{titreDe(page)}</h1>
          <div className="flex items-start gap-3">
            <input value={brouillon.icone} onChange={(e) => marquer({ icone: e.target.value.slice(0, 4) })}
              placeholder="📄" aria-label="Emoji de la page"
              className="w-14 min-h-[44px] shrink-0 bg-transparent text-[30px] sm:text-[36px] leading-tight text-center placeholder:opacity-40" />
            <TextareaAuto value={brouillon.titre} onChange={(e) => marquer({ titre: e.target.value.replace(/\n/g, '') })}
              placeholder="Sans titre" aria-label="Titre de la page"
              className="text-stone-900 tracking-tight min-h-[44px]"
              style={{ ...SERIF, fontSize: 'clamp(30px, 5vw, 36px)', lineHeight: 1.2 }} />
          </div>
          <div className="mt-6">
            <ListeBlocsEditeur blocs={brouillon.blocs} onChange={(blocs) => marquer({ blocs })} racineId={page.racine_id} />
          </div>
        </>
      ) : (
        <PageLecture page={page} sousPages={[]} naviguer={(id) => allerA(id)} />
      )}

      <ListeSousPages sousPages={sousPages} naviguer={(id) => allerA(id)} />

      {peutEditer && (
        <div className="mt-6">
          <Btn onClick={creerSousPage} icon={FilePlus}>Nouvelle sous-page</Btn>
        </div>
      )}

      {partageOuvert && <ModalePartage racine={page} onClose={() => setPartageOuvert(false)} />}
      {confirmSuppr && (
        <ConfirmModal
          title={estRacine ? 'Supprimer cet arbre ?' : 'Supprimer cette page ?'}
          text={estRacine
            ? `« ${titreDe(page)} », toutes ses sous-pages, ses accès et son lien secret seront supprimés. Cette action est définitive.`
            : `« ${titreDe(page)} » et toutes ses sous-pages seront supprimées. Cette action est définitive.`}
          verbe="Supprimer"
          busy={busySuppr}
          onConfirm={supprimer}
          onClose={() => setConfirmSuppr(false)}
        />
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   🏠 ACCUEIL — les arbres accessibles
   ════════════════════════════════════════════════════════════ */
function Accueil({ pages, estProprio, rolePour, creerRacine, busyCreation }) {
  const racines = pages.filter(p => !p.parent_id).sort(trierPages);

  if (racines.length === 0) {
    return estProprio ? (
      <EmptyState icon={FileText} title="Votre espace est prêt"
        text="Créez votre première page : elle deviendra un arbre que vous pourrez remplir de blocs et partager.">
        <Btn kind="dark" onClick={creerRacine} disabled={busyCreation} icon={busyCreation ? Loader2 : Plus}>
          Créer ma première page
        </Btn>
      </EmptyState>
    ) : (
      <EmptyState icon={Lock} title="Rien ne vous est partagé"
        text="Quand une page vous sera ouverte, elle apparaîtra ici. Rapprochez-vous de la personne qui vous a invité." />
    );
  }

  return (
    <>
      <div className="flex items-end justify-between gap-3 mb-7 flex-wrap">
        <h1 className="text-[30px] sm:text-[36px] tracking-tight text-stone-900 leading-none" style={SERIF}>
          {estProprio ? 'Mes pages' : 'Partagé avec vous'}
        </h1>
        {estProprio && (
          <Btn kind="dark" onClick={creerRacine} disabled={busyCreation} icon={busyCreation ? Loader2 : Plus}>
            Nouvelle page
          </Btn>
        )}
      </div>
      {/* Grille de cartes façon « second cerveau » : la vignette en
          creux porte l'emoji, le titre en serif — règle halo : cartes
          raised espacées d'au moins 16 px. */}
      <div className="th-liste grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {racines.map((r) => {
          const nb = enfantsDe(pages, r.id).length;
          const role = rolePour(r.racine_id);
          return (
            <button key={r.id} type="button" onClick={() => allerA(r.id)} style={neu.raised}
              className="th-press rounded-3xl p-5 text-left flex flex-col gap-3 min-h-[150px]">
              <span style={neu.pressedSm} aria-hidden="true"
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-[22px] leading-none">
                {r.icone || '📄'}
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] text-stone-900 leading-snug" style={SERIF}>{titreDe(r)}</span>
                <span className="block text-[12px] text-stone-500 mt-1">
                  {nb === 0 ? 'Aucune sous-page' : nb === 1 ? '1 sous-page' : `${nb} sous-pages`}
                </span>
              </span>
              {!estProprio && (
                <span style={neu.pressedSm}
                  className="mt-auto self-start px-2.5 py-1 rounded-full text-[10.5px] font-semibold uppercase tracking-wider text-stone-600">
                  {role === 'editeur' ? 'Édition' : 'Lecture'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   🧭 NAVIGATION — barre latérale (desktop) et volet (téléphone)
   ════════════════════════════════════════════════════════════
   Structure inspirée d'un « second cerveau » Notion : l'arborescence
   vit à gauche en permanence sur grand écran ; sur téléphone, le
   volet de verre de « Concevoir la galerie », ancré à GAUCHE. */
function ItemNav({ actif, profondeur = 0, onClick, icone, titre, aDesEnfants, ouvert, onBascule }) {
  return (
    <div className="flex items-center gap-1" style={{ paddingLeft: `${profondeur * 14}px` }}>
      {aDesEnfants ? (
        <button type="button" onClick={onBascule} aria-expanded={ouvert}
          aria-label={ouvert ? 'Replier' : 'Déplier'}
          className="w-8 h-8 tap-ext rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 shrink-0 transition">
          <ChevronRight size={13} className={`transition-transform ${ouvert ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span className="w-8 shrink-0" aria-hidden="true" />
      )}
      <button type="button" onClick={onClick} aria-current={actif ? 'page' : undefined}
        style={actif ? neu.pressedSm : undefined}
        className={`flex-1 min-w-0 min-h-[44px] px-3 rounded-xl flex items-center gap-2 text-left transition ${actif ? 'text-stone-900' : 'text-stone-600 hover:text-stone-900'}`}>
        <span className="text-[15px] leading-none shrink-0" aria-hidden="true">{icone || '📄'}</span>
        <span className="truncate text-[13.5px] font-medium">{titre}</span>
      </button>
    </div>
  );
}

function BrancheNav({ page, pages, routeId, naviguer, profondeur, ouverts, bascule }) {
  if (profondeur > 6) return null; // garde anti-cycle (parent_id forgé)
  const enfants = enfantsDe(pages, page.id);
  const ouvert = ouverts.has(page.id);
  return (
    <>
      <ItemNav actif={routeId === page.id} profondeur={profondeur} icone={page.icone}
        titre={titreDe(page)} aDesEnfants={enfants.length > 0} ouvert={ouvert}
        onBascule={() => bascule(page.id)} onClick={() => naviguer(page.id)} />
      {ouvert && enfants.map((e) => (
        <BrancheNav key={e.id} page={e} pages={pages} routeId={routeId} naviguer={naviguer}
          profondeur={profondeur + 1} ouverts={ouverts} bascule={bascule} />
      ))}
    </>
  );
}

function SidebarContenu({ donnees, routeId, naviguer, creerRacine, busyCreation, email, onSecurite, onDeconnecter, onFermer }) {
  const racines = donnees.pages.filter((p) => !p.parent_id).sort(trierPages);
  // Les ancêtres de la page ouverte se déplient d'office : on doit
  // toujours voir OÙ l'on est dans l'arbre.
  const [ouverts, setOuverts] = useState(() => new Set(cheminVers(donnees.pages, routeId).map((p) => p.id)));
  useEffect(() => {
    if (!routeId) return;
    setOuverts((prev) => {
      const s = new Set(prev);
      cheminVers(donnees.pages, routeId).forEach((p) => s.add(p.id));
      return s;
    });
  }, [routeId, donnees.pages]);
  const bascule = (id) => setOuverts((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-2 shrink-0">
        <button type="button" onClick={() => naviguer(null)}
          className="min-h-[44px] tap-ext text-[12px] uppercase tracking-[0.2em] text-stone-500 font-semibold hover:text-stone-800 transition">
          Espace perso
        </button>
        {onFermer && (
          <button type="button" onClick={onFermer} aria-label="Fermer le menu" style={neu.raisedXs}
            className="w-9 h-9 tap-ext rounded-full flex items-center justify-center text-stone-600 active:scale-95 transition shrink-0">
            <X size={14} />
          </button>
        )}
      </div>

      {donnees.estProprio && (
        <div className="px-4 pb-1 shrink-0">
          <button type="button" onClick={creerRacine} disabled={busyCreation}
            className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-2 text-left text-stone-600 hover:text-stone-900 transition disabled:opacity-50">
            {busyCreation ? <Loader2 size={15} className="animate-spin shrink-0" /> : <Plus size={15} className="shrink-0" />}
            <span className="text-[13.5px] font-medium">Nouvelle page</span>
          </button>
        </div>
      )}

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 pb-4" aria-label="Pages">
        <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold px-2 pt-3 pb-2">
          {donnees.estProprio ? 'Mes pages' : 'Partagé avec vous'}
        </div>
        <div className="space-y-0.5">
          {racines.map((r) => (
            <BrancheNav key={r.id} page={r} pages={donnees.pages} routeId={routeId}
              naviguer={naviguer} profondeur={0} ouverts={ouverts} bascule={bascule} />
          ))}
          {racines.length === 0 && (
            <p className="px-2 py-3 text-[12.5px] text-stone-500">Aucune page pour l'instant.</p>
          )}
        </div>
      </nav>

      <div className="px-4 py-4 shrink-0" style={{ borderTop: '1px solid rgba(120,113,108,0.18)' }}>
        <div className="text-[11.5px] text-stone-500 truncate px-2 mb-3">{email}</div>
        <div className="flex items-center gap-3 px-1">
          <IconBtn onClick={onSecurite} label="Double vérification" icon={ShieldCheck} />
          <IconBtn onClick={onDeconnecter} label="Se déconnecter" icon={LogOut} />
        </div>
      </div>
    </div>
  );
}

/* Le volet mobile : TOUJOURS monté, seule la classe bascule — c'est le
   mécanisme du panneau de « Concevoir la galerie » (.masque), et le
   seul qui garantisse que la transition parte du bon état peint. */
function VoletNav({ ouvert, onFermer, children }) {
  const aOuvertUneFois = useRef(false);
  const voletRef = useRef(null);
  if (ouvert) aOuvertUneFois.current = true;
  useEffect(() => {
    if (!ouvert) return;
    const prev = document.body.style.overflow;
    const origine = document.activeElement;
    document.body.style.overflow = 'hidden';
    // HIG §12/§16 : le focus clavier vit DANS le volet tant qu'il est
    // ouvert (audit 30/07 — Tab s'échappait derrière le scrim), et
    // revient au bouton d'origine à la fermeture.
    const focusables = () => [...(voletRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || [])].filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus?.();
    const onKey = (e) => {
      if (e.key === 'Escape') { onFermer(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const debut = f[0], fin = f[f.length - 1];
      if (e.shiftKey && document.activeElement === debut) { e.preventDefault(); fin.focus(); }
      else if (!e.shiftKey && document.activeElement === fin) { e.preventDefault(); debut.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey, true);
      if (origine && origine.focus) origine.focus();
    };
  }, [ouvert, onFermer]);
  return (
    <>
      {ouvert && <div className="th-scrim lg:hidden" onClick={onFermer} aria-hidden="true" />}
      <div ref={voletRef}
        className={`th-volet lg:hidden ${ouvert ? '' : aOuvertUneFois.current ? 'ferme' : 'ferme jamais-ouvert'}`}
        role="dialog" aria-modal={ouvert || undefined} aria-label="Navigation"
        aria-hidden={ouvert ? undefined : true} inert={ouvert ? undefined : ''}>
        {children}
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   🛡 SÉCURITÉ — gérer sa double vérification depuis l'app
   ════════════════════════════════════════════════════════════
   Leçons du 30/07 appliquées : l'entrée s'appelle « Espace perso »
   (deux facteurs nommés « Console » étaient indistinguables), et un
   enrôlement abandonné est désenrôlé aussitôt — c'est un facteur
   fantôme de ce genre qui a fait rejeter des codes justes. */
function ModaleSecurite({ onClose }) {
  const [facteurs, setFacteurs] = useState(null);
  const [etape, setEtape] = useState('liste'); // liste | qr
  const [enrole, setEnrole] = useState(null);  // { id, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmRetrait, setConfirmRetrait] = useState(null); // id à confirmer

  const charger = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    setFacteurs((u?.user?.factors || []).filter((f) => (f.factor_type ?? 'totp') === 'totp'));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Fermer en pleine activation = désenrôler le facteur en attente,
  // sinon il resterait un fantôme « unverified » sur le compte.
  const fermer = () => {
    if (enrole && etape === 'qr') sb.auth.mfa.unenroll({ factorId: enrole.id }).catch(() => {});
    onClose();
  };

  const activer = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Espace perso' });
    setBusy(false);
    if (error || !data) {
      setMessage({ ok: false, texte: error?.message || "L'activation a échoué — réessayez." });
      return;
    }
    setEnrole({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret });
    setEtape('qr'); setCode('');
  };

  const annulerActivation = async () => {
    if (enrole) await sb.auth.mfa.unenroll({ factorId: enrole.id }).catch(() => {});
    setEnrole(null); setEtape('liste'); setCode(''); setMessage(null);
    await charger();
  };

  const confirmer = async (e) => {
    e.preventDefault();
    if (!enrole || busy) return;
    setBusy(true); setMessage(null);
    try {
      const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: enrole.id });
      if (e1) throw e1;
      const { error: e2 } = await sb.auth.mfa.verify({ factorId: enrole.id, challengeId: ch.id, code: code.trim() });
      if (e2) throw e2;
      setMessage({ ok: true, texte: "Double vérification activée — l'entrée s'appelle « Espace perso » dans votre application." });
      setEtape('liste'); setEnrole(null); setCode('');
      await charger();
    } catch (err) {
      setMessage({
        ok: false,
        texte: /invalid|expired/i.test(err?.message || '')
          ? 'Code incorrect — attendez le code suivant et réessayez.'
          : 'La vérification a échoué — réessayez.',
      });
    }
    setBusy(false);
  };

  const retirer = async (f) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    const { error } = await sb.auth.mfa.unenroll({ factorId: f.id });
    setBusy(false);
    setConfirmRetrait(null);
    if (error) {
      setMessage({ ok: false, texte: error.message || 'Le retrait a échoué.' });
      return;
    }
    await charger();
  };

  return (
    <Modal title="Double vérification" kicker="Sécurité" onClose={fermer}>
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-[12.5px] mb-4 ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.ok ? <Check size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          {message.texte}
        </div>
      )}

      {etape === 'qr' && enrole ? (
        <form onSubmit={confirmer} className="space-y-4">
          <p className="text-[13.5px] text-stone-600 leading-relaxed">
            Scannez ce code avec votre application d'authentification — une entrée
            «&nbsp;Espace perso&nbsp;» va s'y ajouter — puis saisissez le code à 6 chiffres
            qu'elle affiche.
          </p>
          {enrole.qr && (
            <div className="bg-white rounded-2xl p-4 flex justify-center" style={neu.pressedSm}>
              <img src={enrole.qr} alt="QR code d'enrôlement" className="w-44 h-44" />
            </div>
          )}
          {enrole.secret && (
            <p className="text-[11.5px] text-stone-500 break-all leading-relaxed">
              Sans appareil photo : saisissez cette clé à la main — <span className="select-all font-mono">{enrole.secret}</span>
            </p>
          )}
          <Field label="Code à 6 chiffres">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required
              className="text-center tracking-[0.4em] font-semibold" />
          </Field>
          <Btn type="submit" kind="dark" full disabled={busy || code.length < 6} icon={busy ? Loader2 : ShieldCheck}>
            {busy ? 'Vérification…' : 'Activer'}
          </Btn>
          <button type="button" onClick={annulerActivation}
            className="w-full min-h-[44px] text-[12.5px] text-stone-500 hover:text-stone-800">
            Annuler l'activation
          </button>
        </form>
      ) : facteurs === null ? (
        <div className="th-squelette space-y-3">
          <div style={neu.pressedSm} className="h-14 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {facteurs.length === 0 ? (
            <p className="text-[13.5px] text-stone-600 leading-relaxed">
              Sans double vérification, le lien magique reçu par email est la seule
              serrure de votre espace. Ajoutez un code à 6 chiffres pour verrouiller
              davantage&nbsp;: il vous sera demandé à chaque connexion.
            </p>
          ) : (
            <ul className="space-y-3">
              {facteurs.map((f) => (
                <li key={f.id} style={neu.pressedSm} className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
                  <ShieldCheck size={15} className={`shrink-0 ${f.status === 'verified' ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span className="flex-1 min-w-[120px] text-[13.5px] font-medium text-stone-800 truncate">
                    {f.friendly_name || 'Sans nom'}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    {f.status === 'verified' ? 'Active' : 'Inachevée'}
                  </span>
                  {confirmRetrait === f.id ? (
                    <button type="button" onClick={() => retirer(f)} disabled={busy}
                      className="min-h-[40px] px-4 rounded-full bg-rose-600 text-white text-[12px] font-semibold active:scale-95 transition disabled:opacity-50">
                      Confirmer le retrait
                    </button>
                  ) : (
                    <IconBtn onClick={() => setConfirmRetrait(f.id)} label={`Retirer ${f.friendly_name || 'ce facteur'}`} icon={Trash2} danger />
                  )}
                </li>
              ))}
            </ul>
          )}
          <Btn kind="dark" full onClick={activer} disabled={busy} icon={busy ? Loader2 : Plus}>
            {facteurs.length === 0 ? 'Activer la double vérification' : 'Ajouter un facteur'}
          </Btn>
        </div>
      )}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════
   🚪 APP
   ════════════════════════════════════════════════════════════ */
function App() {
  const isDark = useDarkMode();
  neu = isDark ? NEU_DARK : NEU_LIGHT;   // avant les enfants (rendu top-down)

  const [session, setSession] = useState(undefined);  // undefined = en cours
  const [mfaEnAttente, setMfaEnAttente] = useState(false);
  const [route, setRoute] = useState(lireRoute());
  const [donnees, setDonnees] = useState(null); // { estProprio, pages, roles }
  const [avisLien, setAvisLien] = useState(LIEN_EN_ERREUR);
  const [securiteOuverte, setSecuriteOuverte] = useState(false);
  // Tant que l'échange ?lm= n'a pas conclu, les « session nulle » qui
  // arrivent entre-temps (INITIAL_SESSION…) ne doivent pas monter
  // l'écran de connexion : ils perdraient la course contre verifyOtp.
  const lmEnCours = useRef(!!LM_BOOT);
  // La session courante, lisible sans repasser par sb.auth.getSession()
  // (qui prend le verrou interne du SDK — évitons de nous y coincer).
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session || null; }, [session]);

  /* Une session n'ouvre l'espace que si la double vérification est
     satisfaite — sans cette garde, la policy restrictive aal2 rendrait
     toutes les requêtes muettes (0 ligne, 0 erreur). Un échec de l'API
     MFA ne mure jamais la porte. */
  const poserSession = async (s) => {
    if (!s?.user) {
      if (lmEnCours.current) return;
      setMfaEnAttente(false); setSession(null); return;
    }
    try {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      let besoinCode = !!(aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2');
      if (!besoinCode && aal && aal.currentLevel !== 'aal2') {
        // getAAL se fie aux facteurs portés par la session ; une session
        // née d'un lien magique arrive parfois SANS eux — le portillon
        // laissait alors entrer une session aal1, que la policy
        // restrictive rend muette (0 ligne partout, constaté 29/07).
        // On demande donc la liste réelle au serveur.
        const { data: u } = await sb.auth.getUser();
        besoinCode = (u?.user?.factors || []).some(
          (f) => f.factor_type === 'totp' && f.status === 'verified'
        );
      }
      if (besoinCode) { setMfaEnAttente(true); setSession(null); return; }
    } catch (_) {}
    setMfaEnAttente(false);
    setSession(s);
  };

  useEffect(() => {
    if (DEMO) { setSession({ user: { id: 'demo', email: 'demo@exemple.com' } }); return; }
    if (JETON_URL) { setSession(null); return; } // mode jeton : pas d'auth
    (async () => {
      // Échange du lien magique (?lm=) contre une session — voir LM_BOOT.
      if (LM_BOOT) {
        // Le jeton est né « magiclink » ; certains GoTrue le rangent
        // sous le type consolidé « email ». On tente les deux.
        let { error } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: LM_BOOT });
        if (error) {
          ({ error } = await sb.auth.verifyOtp({ type: 'email', token_hash: LM_BOOT }));
        }
        lmEnCours.current = false;
        if (error) {
          // Jeton consommé ou périmé. S'il reste une session en poche
          // (localStorage), on entre quand même ; sinon, on l'explique.
          const { data } = await sb.auth.getSession();
          if (!data.session) {
            setAvisLien('Ce lien a expiré ou a déjà servi — redemandez-en un ci-dessous.');
            setSession(null);
            return;
          }
        }
      }
      const { data } = await sb.auth.getSession();
      if (data.session) poserSession(data.session); else setSession(null);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => { poserSession(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(lireRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const recharger = useCallback(async () => {
    if (DEMO) { setDonnees(DONNEES_DEMO()); return; }
    try {
      const uid = sessionRef.current?.user?.id;
      if (!uid) return;
      const [proprio, pages, roles] = await Promise.all([
        sb.from('perso_proprietaires').select('user_id').eq('user_id', uid).maybeSingle(),
        sb.from('perso_pages').select('*'),
        sb.from('perso_membres').select('racine_id, role').eq('user_id', uid),
      ]);
      const souci = proprio.error || pages.error || roles.error;
      if (souci) console.error('[perso] chargement :', souci);
      setDonnees({
        estProprio: !!proprio.data,
        pages: pages.data || [],
        roles: new Map((roles.data || []).map(r => [r.racine_id, r.role])),
        erreur: souci ? (souci.message || 'Le chargement a échoué.') : null,
      });
    } catch (err) {
      // Un squelette qui pulse sans fin ne dit rien à personne (HIG §10) :
      // l'échec s'affiche, avec de quoi réessayer.
      console.error('[perso] chargement :', err);
      setDonnees({ estProprio: false, pages: [], roles: new Map(), erreur: err?.message || 'Le chargement a échoué.' });
    }
  }, []);

  useEffect(() => { if (session?.user) recharger(); else setDonnees(null); }, [session, recharger]);

  const deconnecter = async () => { await sb.auth.signOut(); allerA(null); };

  const [voletOuvert, setVoletOuvert] = useState(false);
  const naviguer = (id) => { allerA(id); setVoletOuvert(false); };

  // La création d'une racine vit ici : la barre latérale, le volet et
  // l'accueil déclenchent tous le même geste.
  const [busyCreation, setBusyCreation] = useState(false);
  const creerRacine = async () => {
    if (busyCreation || !donnees) return;
    setBusyCreation(true);
    const racines = donnees.pages.filter((p) => !p.parent_id);
    const position = racines.length ? Math.max(...racines.map((r) => r.position)) + 1 : 0;
    const { data, error } = await sb.from('perso_pages')
      .insert({ titre: '', position })
      .select('id').single();
    setBusyCreation(false);
    if (!error && data) { await recharger(); naviguer(data.id); }
  };

  // ── Mode jeton : il gagne même connecté (aperçu du lien) ──
  if (JETON_URL) return <VueJeton />;

  if (session === undefined) return <PleinEcranChargement />;
  if (mfaEnAttente) return (
    <EcranMfa
      onDone={async () => { const { data } = await sb.auth.getSession(); await poserSession(data.session); }}
      onAbandon={async () => { await sb.auth.signOut(); setMfaEnAttente(false); }}
    />
  );
  if (!session) return <Connexion avertissement={avisLien} />;

  const rolePour = (racineId) => {
    if (donnees?.estProprio) return 'proprietaire';
    return donnees?.roles.get(racineId) || 'lecteur';
  };

  const contenuSidebar = donnees ? (
    <SidebarContenu
      donnees={donnees}
      routeId={route.vue === 'page' ? route.id : null}
      naviguer={naviguer}
      creerRacine={creerRacine}
      busyCreation={busyCreation}
      email={session.user.email}
      onSecurite={() => { setSecuriteOuverte(true); setVoletOuvert(false); }}
      onDeconnecter={deconnecter}
      onFermer={voletOuvert ? () => setVoletOuvert(false) : undefined}
    />
  ) : (
    <div className="th-squelette p-5 space-y-3">
      <div style={neu.pressedSm} className="h-10 rounded-xl" />
      <div style={neu.pressedSm} className="h-10 rounded-xl" />
      <div style={neu.pressedSm} className="h-10 rounded-xl" />
    </div>
  );

  return (
    <div className="min-h-screen lg:flex" style={neu.base}>
      {/* Barre latérale persistante — grand écran seulement */}
      <aside className="hidden lg:flex lg:flex-col w-72 shrink-0 sticky top-0 h-screen"
        style={{ borderRight: '1px solid rgba(120,113,108,0.16)' }}>
        {contenuSidebar}
      </aside>

      <div className="flex-1 min-w-0">
        {/* Barre haute — téléphone seulement : le menu vit dans le volet */}
        <header className="lg:hidden max-w-3xl mx-auto px-5 sm:px-8 pt-6 flex items-center justify-between gap-3">
          <IconBtn onClick={() => setVoletOuvert(true)} label="Ouvrir le menu" icon={Menu} />
          <button type="button" onClick={() => naviguer(null)}
            className="min-h-[44px] tap-ext text-[12px] uppercase tracking-[0.2em] text-stone-500 font-semibold hover:text-stone-800 transition">
            Espace perso
          </button>
          <span className="w-10 shrink-0" aria-hidden="true" />
        </header>

      {/* xl : la colonne s'élargit — un kanban ou une table y respire,
          sans étirer la prose au-delà du lisible (audit responsive 31/07). */}
      <main key={`${route.vue}:${route.id || ''}`} className="th-vue max-w-3xl xl:max-w-4xl mx-auto px-5 sm:px-8 py-8 pb-24">
        {donnees === null ? (
          <ChargementOuPanne onRetry={recharger} />
        ) : donnees.erreur ? (
          <EmptyState icon={AlertCircle} title="Le chargement a échoué"
            text={donnees.erreur}>
            <Btn kind="dark" onClick={recharger} icon={RefreshCw}>Réessayer</Btn>
          </EmptyState>
        ) : route.vue === 'page' ? (
          <VuePage pageId={route.id} pages={donnees.pages} rolePour={rolePour}
            recharger={recharger} estProprio={donnees.estProprio} />
        ) : (
          <Accueil pages={donnees.pages} estProprio={donnees.estProprio}
            rolePour={rolePour} creerRacine={creerRacine} busyCreation={busyCreation} />
        )}
      </main>
      </div>

      <VoletNav ouvert={voletOuvert} onFermer={() => setVoletOuvert(false)}>
        {contenuSidebar}
      </VoletNav>

      {securiteOuverte && <ModaleSecurite onClose={() => setSecuriteOuverte(false)} />}
    </div>
  );
}

/* Garde de montage : avec le cycle perso ⇄ base, le rechargement à
   chaud de Vite ré-exécute ce module d'entrée — sans le garde, un
   second createRoot sur le même nœud fait hurler React en dev.
   Sans effet en production (une seule exécution). */
const racineDom = document.getElementById('root');
if (!racineDom.dataset.monte) {
  racineDom.dataset.monte = '1';
  ReactDOM.createRoot(racineDom).render(<App />);
}
