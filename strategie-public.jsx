/* ════════════════════════════════════════════════════════════
   📑  STRATEGIE-PUBLIC.JSX — Page de partage publique (lecture seule)
   ════════════════════════════════════════════════════════════
   Chargée par strategie.html. AUCUNE authentification :
   lit ?s=TOKEN dans l'URL, appelle la RPC get_strategy_by_token,
   et affiche la stratégie en lecture seule via <StrategyView>.

   Embarque son propre jeu de tokens neu + SERIF (autonome).
   ════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { ChevronDown, ChevronUp, Loader2, AlertCircle, Lock } from 'lucide-react';

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
  raisedXs:  { backgroundColor: '#22262d', boxShadow: '3px 3px 7px rgba(0,0,0,0.42), -2px -2px 5px rgba(54,60,72,0.18)' },
  pressed:   { backgroundColor: '#14171c', boxShadow: 'inset 5px 5px 10px rgba(0,0,0,0.55), inset -3px -3px 8px rgba(54,60,72,0.2)' },
  pressedSm: { backgroundColor: '#14171c', boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.48), inset -2px -2px 5px rgba(54,60,72,0.15)' },
  dark:      { backgroundColor: '#e8d8be', boxShadow: '8px 8px 18px rgba(0,0,0,0.62), -3px -3px 8px rgba(54,60,72,0.22), inset 1px 1px 2px rgba(255,255,255,0.18), 0 0 0 1px rgba(232,216,190,0.35), 0 0 24px rgba(232,216,190,0.25)' },
  darkSm:    { backgroundColor: '#e8d8be', boxShadow: '4px 4px 10px rgba(0,0,0,0.55), -2px -2px 6px rgba(54,60,72,0.18), 0 0 0 1px rgba(232,216,190,0.3), 0 0 16px rgba(232,216,190,0.2)' },
  accent:    '#e8d8be', accentText: '#1a1410',
};
let neu = NEU_LIGHT;
const SERIF = { fontFamily: 'Instrument Serif, serif', fontWeight: 400 };

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
function StrategyView({ strategy, neu, SERIF, ChevronDownIcon, ChevronUpIcon }) {
  const [openId, setOpenId] = React.useState(null);

  const concepts = Array.isArray(strategy?.concepts) ? strategy.concepts : [];
  const kpis     = Array.isArray(strategy?.kpis)     ? strategy.kpis     : [];
  const stats    = Array.isArray(strategy?.stats)    ? strategy.stats    : [];

  const selected = concepts.find((c) => String(c.id) === String(openId));

  // Scroll fluide vers le storyboard à l'ouverture d'une carte (mobile :
  // le panneau s'ouvre sous la grille, hors viewport sinon).
  const storyboardRef = React.useRef(null);
  React.useEffect(() => {
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
   🌳 ROOT — page publique
   ════════════════════════════════════════════════════════════ */
function PublicApp() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  // La page publique force le thème clair par défaut (lien envoyé à des tiers),
  // mais respecte un éventuel choix sombre déjà stocké.
  const isDark = (() => { try { return localStorage.getItem('th-dark-mode') === 'dark'; } catch (e) { return false; } })();
  neu = isDark ? NEU_DARK : NEU_LIGHT;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('s');
    if (!token) { setState({ loading: false, error: 'missing', data: null }); return; }
    (async () => {
      const { data, error } = await sb.rpc('get_strategy_by_token', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState({ loading: false, error: 'notfound', data: null }); return; }
      document.title = (row.subtitle || row.title || 'Stratégie') + ' — ' + (row.agency_name || 'TimelessHouse');
      setState({ loading: false, error: null, data: row });
    })();
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={neu.base}>
        <Loader2 className="animate-spin text-stone-400" size={28} />
      </div>
    );
  }

  if (state.error) {
    const msg = state.error === 'missing'
      ? "Ce lien est incomplet. Demandez à votre contact de vous renvoyer le lien de partage."
      : "Cette stratégie n'est pas disponible. Le lien a peut-être été désactivé ou a expiré.";
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={neu.base}>
        <div style={neu.raised} className="rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center">
          <div style={neu.dark} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <Lock size={20} />
          </div>
          <h1 className="text-[26px] tracking-tight leading-tight" style={SERIF}>Lien indisponible</h1>
          <p className="text-[13px] text-stone-500 mt-3 leading-relaxed">{msg}</p>
        </div>
      </div>
    );
  }

  const d = state.data;
  return (
    <div className="min-h-screen w-full" style={{ ...neu.base, fontFamily: '"Manrope", system-ui, sans-serif' }}>
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Bandeau marque */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="text-[22px] sm:text-[26px] tracking-tight leading-none" style={{ ...SERIF, fontStyle: 'italic' }}>
            {d.agency_name || 'TimelessHouse'}<span className="text-stone-400">.</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Stratégie partagée</div>
        </div>

        <StrategyView strategy={d} neu={neu} SERIF={SERIF} ChevronDownIcon={ChevronDown} ChevronUpIcon={ChevronUp} />

        <div className="text-center text-[11px] text-stone-400 mt-10 pt-6">
          Document préparé par {d.agency_name || 'TimelessHouse'}{d.client_name ? ' pour ' + d.client_name : ''}.
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PublicApp />);
