/* ════════════════════════════════════════════════════════════
   🎞️  PORTFOLIO-PUBLIC.JSX — Espace portfolio public (lecture seule)
   ════════════════════════════════════════════════════════════
   Chargé par portfolio.html. AUCUNE authentification :
   lit ?s=TOKEN dans l'URL, appelle la RPC get_portfolio_space_by_token,
   affiche les sections choisies + un formulaire de mise en relation
   (Edge Function notify-lead).

   Embarque son propre jeu de tokens néo + SERIF (autonome), comme
   strategie-public.jsx.
   ════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Loader2, Lock, X, Play, Check, ArrowRight, Mail, Phone, Send } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ───────────── Tokens néomorphiques (identiques au reste du site) ─────────────
const NEU_LIGHT = {
  base:      { backgroundColor: '#e9e4d9' },
  raised:    { backgroundColor: '#efeae0', boxShadow: '10px 10px 24px rgba(168,156,134,0.32), -10px -10px 24px rgba(255,253,247,0.92)' },
  raisedSm:  { backgroundColor: '#efeae0', boxShadow: '5px 5px 12px rgba(168,156,134,0.26), -5px -5px 12px rgba(255,253,247,0.88)' },
  raisedXs:  { backgroundColor: '#efeae0', boxShadow: '3px 3px 7px rgba(168,156,134,0.22), -3px -3px 7px rgba(255,253,247,0.82)' },
  pressed:   { backgroundColor: '#e3ddd0', boxShadow: 'inset 5px 5px 10px rgba(168,156,134,0.32), inset -5px -5px 10px rgba(255,253,247,0.9)' },
  pressedSm: { backgroundColor: '#e3ddd0', boxShadow: 'inset 3px 3px 6px rgba(168,156,134,0.26), inset -3px -3px 6px rgba(255,253,247,0.85)' },
  dark:      { backgroundColor: '#2a2620', boxShadow: '8px 8px 18px rgba(168,156,134,0.36), -3px -3px 8px rgba(255,253,247,0.6), inset 1px 1px 2px rgba(255,255,255,0.08)' },
  darkSm:    { backgroundColor: '#2a2620', boxShadow: '4px 4px 10px rgba(168,156,134,0.36), -2px -2px 6px rgba(255,253,247,0.5)' },
  accent:    '#2a2620', accentText: '#f5f1e6',
};
const NEU_DARK = {
  base:      { backgroundColor: '#181b20' },
  raised:    { backgroundColor: '#22262d', boxShadow: '10px 10px 24px rgba(0,0,0,0.55), -5px -5px 15px rgba(54,60,72,0.28)' },
  raisedSm:  { backgroundColor: '#22262d', boxShadow: '5px 5px 12px rgba(0,0,0,0.48), -3px -3px 8px rgba(54,60,72,0.22)' },
  raisedXs:  { backgroundColor: '#22262d', boxShadow: '3px 3px 7px rgba(0,0,0,0.4), -2px -2px 6px rgba(54,60,72,0.18)' },
  pressed:   { backgroundColor: '#1d2025', boxShadow: 'inset 5px 5px 10px rgba(0,0,0,0.5), inset -5px -5px 10px rgba(54,60,72,0.22)' },
  pressedSm: { backgroundColor: '#1d2025', boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(54,60,72,0.18)' },
  dark:      { backgroundColor: '#e8d8be', boxShadow: '8px 8px 18px rgba(0,0,0,0.5), -3px -3px 8px rgba(54,60,72,0.3)' },
  darkSm:    { backgroundColor: '#e8d8be', boxShadow: '4px 4px 10px rgba(0,0,0,0.45)' },
  accent:    '#e8d8be', accentText: '#1a1410',
};
const SERIF = { fontFamily: '"Instrument Serif", serif', fontWeight: 400 };

let neu = NEU_LIGHT;

// ────────────────────────────────────────────────────────────
// 🛠️ Helpers média (portés de communication-app.jsx)
// ────────────────────────────────────────────────────────────
function getThumbUrl(item) {
  if (item.thumb_url) return item.thumb_url;
  if (item.type === 'photo' && item.url) return item.url;
  if (item.type === 'video' && item.url) {
    const cl = item.url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.[a-z0-9]+)?$/i);
    if (cl) return `${cl[1]}so_2,w_800/${cl[2]}.jpg`;
  }
  return null;
}

// Aperçu au survol : version ALLÉGÉE uniquement (jamais l'original).
function getPreviewVideoUrl(item) {
  if (item.type !== 'video') return null;
  const src = item.preview_url;
  if (!src) return null;
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^www\./, '');
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname)) return src;
    if (/res\.cloudinary\.com\/.*\/video\/upload/.test(src)) return src;
    if (host === 'streamable.com') return null;
  } catch (e) {}
  return null;
}

function getLightboxVideoUrl(item) {
  return item.preview_url || item.url || null;
}

// ────────────────────────────────────────────────────────────
// 🎬 Carte média — poster + preview vidéo au survol (desktop)
// ────────────────────────────────────────────────────────────
function MediaCard({ item, onOpen }) {
  const videoRef = useRef(null);
  const thumb = getThumbUrl(item);
  const preview = getPreviewVideoUrl(item);
  const isVideo = item.type === 'video';
  const focusX = item.preview_focus_x ?? 50;
  const focusY = item.preview_focus_y ?? 50;
  const zoom   = item.preview_zoom ?? 1;

  const play = () => { const v = videoRef.current; if (v) v.play().catch(() => {}); };
  const stop = () => { const v = videoRef.current; if (v) { v.pause(); } };

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      onMouseEnter={preview ? play : undefined}
      onMouseLeave={preview ? stop : undefined}
      style={neu.raisedSm}
      className="portfolio-card relative block w-full overflow-hidden rounded-[20px] transition active:scale-[0.99]">
      <div className="relative w-full" style={{ aspectRatio: '4 / 5' }}>
        {thumb ? (
          <img src={thumb} alt={item.title || ''} loading="lazy"
               className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0"
               style={{ background: item.thumb_grad || 'linear-gradient(135deg,#1a1a1d,#3a3a3d)' }} />
        )}

        {preview && (
          <video
            ref={videoRef}
            src={preview}
            muted loop playsInline preload="none"
            className="portfolio-preview absolute inset-0 w-full h-full object-cover opacity-0"
            style={{ objectPosition: `${focusX}% ${focusY}%`, transform: `scale(${zoom})` }} />
        )}

        <div className="absolute inset-x-0 bottom-0 p-3 pt-10 pointer-events-none"
             style={{ background: 'linear-gradient(to top, rgba(20,18,15,0.72), transparent)' }}>
          <div className="text-white text-[13px] font-medium leading-snug truncate">{item.title}</div>
          {item.caption && <div className="text-white/70 text-[11px] truncate mt-0.5">{item.caption}</div>}
        </div>

        {isVideo && (
          <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center"
               style={{ background: 'rgba(20,18,15,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <Play size={12} className="text-white" fill="white" />
          </div>
        )}
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// 🖼️ Lightbox — body-lock iOS-safe
// ────────────────────────────────────────────────────────────
function Lightbox({ item, onClose }) {
  useEffect(() => {
    if (!item) return;
    const y = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, y);
    };
  }, [item]);

  if (!item) return null;
  const isVideo = item.type === 'video';
  const vsrc = getLightboxVideoUrl(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(15,13,11,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
         onClick={onClose}>
      <button onClick={onClose} aria-label="Fermer"
        className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-95 transition"
        style={{ background: 'rgba(255,255,255,0.14)' }}>
        <X size={20} />
      </button>
      <div className="w-full max-w-[1100px] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video src={vsrc} controls autoPlay playsInline
                 className="max-w-full rounded-2xl" style={{ maxHeight: '86dvh' }} />
        ) : (
          <img src={item.url || getThumbUrl(item)} alt={item.title || ''}
               className="max-w-full rounded-2xl object-contain" style={{ maxHeight: '86dvh' }} />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ✉️ Formulaire de mise en relation
// ────────────────────────────────────────────────────────────
function LeadForm({ token, kind }) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [message, setMessage] = useState('');
  const [state, setState]     = useState('idle'); // idle | sending | done
  const [err, setErr]         = useState('');

  const inputCls = 'w-full min-h-[48px] px-4 rounded-2xl text-[14px] text-stone-700 placeholder:text-stone-400 bg-transparent';

  const submit = async () => {
    setErr('');
    if (!name.trim()) { setErr('Indiquez votre nom.'); return; }
    if (!email.trim() && !phone.trim()) { setErr('Laissez au moins un email ou un téléphone.'); return; }
    setState('sending');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ token, name, email, phone, message }),
      });
      if (res.ok) { setState('done'); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Envoi impossible pour le moment.');
      setState('idle');
    } catch (e) {
      setErr('Erreur réseau. Réessayez dans un instant.');
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <div style={neu.raised} className="rounded-[28px] p-8 sm:p-10 text-center">
        <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check size={22} style={{ color: neu.accentText }} />
        </div>
        <h3 className="text-[24px] tracking-tight" style={SERIF}>Message envoyé</h3>
        <p className="text-[13.5px] text-stone-500 mt-2 leading-relaxed">Merci. Je vous recontacte très vite.</p>
      </div>
    );
  }

  return (
    <div style={neu.raised} className="rounded-[28px] p-6 sm:p-8">
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">
        {kind === 'ambassador' ? 'Travaillons ensemble' : 'Parlons de votre projet'}
      </div>
      <h3 className="text-[24px] sm:text-[27px] tracking-tight mt-1.5 leading-tight" style={SERIF}>
        Demander à être recontacté
      </h3>
      <p className="text-[13px] text-stone-500 mt-2 leading-relaxed">
        Quelques mots sur votre projet et la meilleure façon de vous joindre.
      </p>

      <div className="mt-5 space-y-3">
        <div style={neu.pressedSm} className="rounded-2xl">
          <input className={inputCls} placeholder="Votre nom *" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div style={neu.pressedSm} className="rounded-2xl flex items-center pl-4">
            <Mail size={15} className="text-stone-400 shrink-0" />
            <input className={inputCls + ' pl-2'} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={neu.pressedSm} className="rounded-2xl flex items-center pl-4">
            <Phone size={15} className="text-stone-400 shrink-0" />
            <input className={inputCls + ' pl-2'} type="tel" placeholder="Téléphone" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>
        <div style={neu.pressedSm} className="rounded-2xl">
          <textarea className={inputCls + ' py-3 resize-none'} rows={4} placeholder="Votre projet (date, lieu, type de prestation…)"
                    value={message} onChange={e => setMessage(e.target.value)} />
        </div>
      </div>

      {err && <div className="text-[12.5px] text-rose-500 mt-3">{err}</div>}

      <button onClick={submit} disabled={state === 'sending'} style={neu.dark}
        className="mt-5 w-full min-h-[52px] rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
        type="button">
        {state === 'sending'
          ? <><Loader2 size={16} className="animate-spin" style={{ color: neu.accentText }} /><span style={{ color: neu.accentText }}>Envoi…</span></>
          : <><span style={{ color: neu.accentText }}>Envoyer ma demande</span><Send size={15} style={{ color: neu.accentText }} /></>}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 🌳 ROOT — page publique
// ────────────────────────────────────────────────────────────
function PublicApp() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [active, setActive] = useState(null); // item ouvert en lightbox

  // Thème : clair par défaut (lien envoyé à des tiers), respecte un choix sombre stocké.
  const isDark = (() => { try { return localStorage.getItem('th-dark-mode') === 'dark'; } catch (e) { return false; } })();
  neu = isDark ? NEU_DARK : NEU_LIGHT;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('s');
    if (!token) { setState({ loading: false, error: 'missing', data: null }); return; }
    (async () => {
      const { data, error } = await sb.rpc('get_portfolio_space_by_token', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState({ loading: false, error: 'notfound', data: null }); return; }
      document.title = (row.title || 'Portfolio') + ' — ' + (row.agency_name || 'TimelessHouse');
      setState({ loading: false, error: null, data: { ...row, token } });
      // Compteur d'ouvertures (best-effort)
      sb.rpc('bump_portfolio_view', { p_token: token }).catch(() => {});
    })();
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={neu.base}>
        <Loader2 className="animate-spin text-stone-400" size={28} />
      </div>
    );
  }

  if (state.error) {
    const msg = state.error === 'missing'
      ? "Ce lien est incomplet. Demandez à votre contact de vous le renvoyer."
      : "Cet espace n'est pas disponible. Le lien a peut-être été désactivé ou n'est pas encore publié.";
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6" style={neu.base}>
        <div style={neu.raised} className="rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center">
          <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={20} style={{ color: neu.accentText }} />
          </div>
          <h1 className="text-[26px] tracking-tight leading-tight" style={SERIF}>Lien indisponible</h1>
          <p className="text-[13px] text-stone-500 mt-3 leading-relaxed">{msg}</p>
        </div>
      </div>
    );
  }

  const d = state.data;
  const items = Array.isArray(d.items) ? d.items : [];

  // Regroupe par section, dans l'ordre choisi (sinon ordre d'apparition).
  const order = (Array.isArray(d.sections) && d.sections.length)
    ? d.sections
    : [...new Set(items.map(i => i.category))];
  const groups = order
    .map(cat => ({ cat, list: items.filter(i => i.category === cat) }))
    .filter(g => g.list.length);

  const isAmbassador = d.kind === 'ambassador';
  const eyebrow = isAmbassador
    ? `${d.referrer_name || d.recipient_name || 'Un proche'} vous recommande`
    : (d.recipient_name ? `Sélection préparée pour ${d.recipient_name}` : 'Sélection de réalisations');
  const heroTitle = d.title || (isAmbassador ? 'TimelessHouse' : 'Mon travail en images');
  const ctaUrl = d.cta_url || 'mailto:service@timelesshouse.org';
  const ctaLabel = d.cta_label || 'Demander un devis';

  return (
    <div className="min-h-[100dvh] w-full" style={{ ...neu.base, fontFamily: '"Manrope", system-ui, sans-serif' }}>
      <style>{`
        @media (hover: hover) and (pointer: fine) {
          .portfolio-card:hover .portfolio-preview { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .portfolio-preview { display: none; }
        }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Bandeau marque */}
        <div className="flex items-center justify-between mb-8 sm:mb-12 gap-4">
          <div className="text-[22px] sm:text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
            {d.agency_name || 'TimelessHouse'}<span className="text-stone-400">.</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">
            {isAmbassador ? 'Recommandation' : 'Portfolio'}
          </div>
        </div>

        {/* Hero */}
        <header className="max-w-2xl mb-10 sm:mb-14">
          <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{eyebrow}</div>
          <h1 className="text-[40px] sm:text-[56px] leading-[0.98] tracking-tight mt-3" style={SERIF}>{heroTitle}</h1>
          {d.intro && <p className="text-[15px] sm:text-[16px] text-stone-500 leading-relaxed mt-5">{d.intro}</p>}
          <a href={ctaUrl} style={neu.dark}
             className="inline-flex items-center gap-2 mt-7 px-6 min-h-[50px] rounded-full font-semibold text-[13.5px] active:scale-[0.99] transition">
            <span style={{ color: neu.accentText }}>{ctaLabel}</span>
            <ArrowRight size={16} style={{ color: neu.accentText }} />
          </a>
        </header>

        {/* Sections */}
        {groups.length === 0 ? (
          <div style={neu.pressedSm} className="rounded-[24px] p-10 text-center text-stone-400 text-[14px]">
            Les réalisations seront ajoutées très bientôt.
          </div>
        ) : groups.map((g, gi) => (
          <section key={g.cat} className={gi > 0 ? 'mt-12 sm:mt-16' : ''}>
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className="text-[24px] sm:text-[28px] tracking-tight" style={SERIF}>{g.cat}</h2>
              <span className="text-[12px] text-stone-400 font-medium">{g.list.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {g.list.map(item => <MediaCard key={item.id} item={item} onOpen={setActive} />)}
            </div>
          </section>
        ))}

        {/* Mise en relation */}
        {d.show_lead_form !== false && (
          <section className="mt-14 sm:mt-20 max-w-xl mx-auto">
            <LeadForm token={d.token} kind={d.kind} />
          </section>
        )}

        {/* Pied */}
        <div className="text-center text-[11px] text-stone-400 mt-14 pt-6">
          {d.agency_name || 'TimelessHouse'}{d.recipient_name && !isAmbassador ? ` — sélection pour ${d.recipient_name}` : ''}.
        </div>
      </div>

      <Lightbox item={active} onClose={() => setActive(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PublicApp />);
