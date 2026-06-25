/* ════════════════════════════════════════════════════════════
   🎞️  ADMIN-PORTFOLIO.JSX — Module admin Portfolio (autonome)
   ════════════════════════════════════════════════════════════
   Importé par communication-admin.jsx. Reçoit sb / neu / SERIF en props
   (session admin authentifiée). Deux vues :
     ▸ Bibliothèque — CRUD des réalisations (portfolio_items), par section
     ▸ Espaces      — CRUD des espaces prospect/ambassadeur + leads

   Primitives définies au niveau module (pas re-créées au render) →
   pas de remontage des champs contrôlés.
   ════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useContext, createContext } from 'react';
import {
  Plus, Pencil, Trash2, Copy, Check, RefreshCw, Link2, Eye, EyeOff,
  Image as ImageIcon, Video as VideoIcon, Loader2, Save, X, Users,
  Send, Mail, Phone, ExternalLink, Images, Sparkles, Inbox,
} from 'lucide-react';

// ── Contexte interne (neu / sb / SERIF) ──────────────────────
const Ctx = createContext({});
const useCtx = () => useContext(Ctx);

const genToken = () =>
  (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).replace(/-/g, '');

// Mini-aperçu pour les cartes admin
function adminThumb(item) {
  if (item.thumb_url) return item.thumb_url;
  if (item.type === 'photo' && item.url) return item.url;
  if (item.type === 'video' && item.url) {
    const cl = item.url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.[a-z0-9]+)?$/i);
    if (cl) return `${cl[1]}so_2,w_240/${cl[2]}.jpg`;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// 🧱 PRIMITIVES
// ════════════════════════════════════════════════════════════
function Btn({ kind, icon: Icon, full, disabled, type = 'button', onClick, className = '', children }) {
  const { neu } = useCtx();
  const dark = kind === 'dark';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={dark ? neu.dark : neu.raisedSm}
      className={`px-4 min-h-[44px] rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 ${full ? 'w-full' : ''} ${className}`}>
      {Icon && <Icon size={15} className={disabled && Icon === Loader2 ? 'animate-spin' : ''} style={dark ? { color: neu.accentText } : {}} />}
      <span style={dark ? { color: neu.accentText } : {}} className={dark ? '' : 'text-stone-700'}>{children}</span>
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">{hint}</div>}
    </label>
  );
}

function Input(props) {
  const { neu } = useCtx();
  return (
    <div style={neu.pressedSm} className="rounded-2xl">
      <input {...props}
        className={`w-full min-h-[46px] px-4 rounded-2xl text-[14px] text-stone-700 placeholder:text-stone-400 bg-transparent ${props.className || ''}`} />
    </div>
  );
}

function Textarea(props) {
  const { neu } = useCtx();
  return (
    <div style={neu.pressedSm} className="rounded-2xl">
      <textarea {...props}
        className={`w-full px-4 py-3 rounded-2xl text-[14px] text-stone-700 placeholder:text-stone-400 bg-transparent resize-none ${props.className || ''}`} />
    </div>
  );
}

function Select(props) {
  const { neu } = useCtx();
  return (
    <div style={neu.pressedSm} className="rounded-2xl">
      <select {...props}
        className={`w-full min-h-[46px] px-4 rounded-2xl text-[14px] text-stone-700 bg-transparent appearance-none ${props.className || ''}`}>
        {props.children}
      </select>
    </div>
  );
}

function Toggle({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 active:scale-[0.98] transition">
      <span className={`w-10 h-6 rounded-full p-0.5 transition ${on ? 'bg-emerald-400' : 'bg-stone-300'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
      {label && <span className="text-[13px] text-stone-600 font-medium">{label}</span>}
    </button>
  );
}

function Pill({ tone = 'stone', children }) {
  const map = {
    stone:   'bg-stone-200/70 text-stone-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    violet:  'bg-violet-100 text-violet-700',
  };
  return <span className={`text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${map[tone]}`}>{children}</span>;
}

function Modal({ title, subtitle, onClose, wide, children }) {
  const { neu, SERIF } = useCtx();
  useEffect(() => {
    const y = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
      window.scrollTo(0, y);
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
         style={{ background: 'rgba(20,18,15,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={neu.base}
           className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-[28px] sm:rounded-[28px] max-h-[92dvh] overflow-y-auto`}>
        <div className="sticky top-0 z-10 px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3"
             style={{ ...neu.base }}>
          <div>
            <h3 className="text-[21px] tracking-tight leading-tight" style={SERIF}>{title}</h3>
            {subtitle && <p className="text-[12px] text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer" style={neu.raisedXs}
            className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500 shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-6 pt-1">{children}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 📷 MODALE ÉLÉMENT (portfolio_items)
// ════════════════════════════════════════════════════════════
function ItemModal({ item, categories, onClose, onSaved }) {
  const { sb } = useCtx();
  const editing = !!(item && item.id);
  const [f, setF] = useState(() => ({
    type: item?.type || 'photo',
    title: item?.title || '',
    category: item?.category || (categories[0] || ''),
    url: item?.url || '',
    preview_url: item?.preview_url || '',
    thumb_url: item?.thumb_url || '',
    duration: item?.duration || '',
    caption: item?.caption || '',
    position: item?.position ?? 0,
    active: item?.active !== false,
    preview_focus_x: item?.preview_focus_x ?? 50,
    preview_focus_y: item?.preview_focus_y ?? 50,
    preview_zoom: item?.preview_zoom ?? 1,
  }));
  const [adv, setAdv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF(s => ({ ...s, [k]: v }));

  const save = async () => {
    setErr('');
    if (!f.title.trim()) { setErr('Le titre est requis.'); return; }
    if (!f.category.trim()) { setErr('La section (catégorie) est requise.'); return; }
    setSaving(true);
    const payload = {
      type: f.type,
      title: f.title.trim(),
      category: f.category.trim(),
      url: f.url.trim() || null,
      preview_url: f.type === 'video' ? (f.preview_url.trim() || null) : null,
      thumb_url: f.thumb_url.trim() || null,
      duration: f.type === 'video' ? (f.duration.trim() || null) : null,
      caption: f.caption.trim() || null,
      position: Number(f.position) || 0,
      active: !!f.active,
      preview_focus_x: Number(f.preview_focus_x) || 50,
      preview_focus_y: Number(f.preview_focus_y) || 50,
      preview_zoom: Number(f.preview_zoom) || 1,
    };
    const { error } = editing
      ? await sb.from('portfolio_items').update(payload).eq('id', item.id)
      : await sb.from('portfolio_items').insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <Modal title={editing ? 'Modifier la réalisation' : 'Nouvelle réalisation'}
           subtitle="Photo ou vidéo de ta vitrine" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={f.type} onChange={e => up('type', e.target.value)}>
              <option value="photo">Photo</option>
              <option value="video">Vidéo</option>
            </Select>
          </Field>
          <Field label="Section">
            <Input list="pf-cats" value={f.category} onChange={e => up('category', e.target.value)} placeholder="Mariage, Immobilier…" />
            <datalist id="pf-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>

        <Field label="Titre">
          <Input value={f.title} onChange={e => up('title', e.target.value)} placeholder="Mariage de Léa & Marc" />
        </Field>

        <Field label="URL du média (Cloudinary, B2, Drive…)"
               hint="Photo : lien de l'image. Vidéo : fichier .mp4 ou URL Cloudinary.">
          <Input value={f.url} onChange={e => up('url', e.target.value)} placeholder="https://res.cloudinary.com/…" />
        </Field>

        {f.type === 'video' && (
          <Field label="Vidéo allégée — aperçu au survol"
                 hint="Version légère lue au survol (jamais l'original). Cloudinary : transformation q_auto,w_1280.">
            <Input value={f.preview_url} onChange={e => up('preview_url', e.target.value)} placeholder="https://…/q_auto,w_1280/…" />
          </Field>
        )}

        <Field label="Miniature (optionnel)"
               hint="Laisse vide : pour une vidéo Cloudinary, l'image de couverture est déduite automatiquement.">
          <Input value={f.thumb_url} onChange={e => up('thumb_url', e.target.value)} placeholder="https://…/cover.jpg" />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {f.type === 'video' && (
            <Field label="Durée"><Input value={f.duration} onChange={e => up('duration', e.target.value)} placeholder="0:45" /></Field>
          )}
          <Field label="Légende"><Input value={f.caption} onChange={e => up('caption', e.target.value)} placeholder="Optionnel" /></Field>
          <Field label="Position"><Input type="number" value={f.position} onChange={e => up('position', e.target.value)} /></Field>
        </div>

        {f.type === 'video' && (
          <div>
            <button type="button" onClick={() => setAdv(a => !a)} className="text-[12px] text-stone-500 font-medium underline underline-offset-2">
              {adv ? 'Masquer' : 'Cadrage avancé de l’aperçu'}
            </button>
            {adv && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Field label="Focus X %"><Input type="number" value={f.preview_focus_x} onChange={e => up('preview_focus_x', e.target.value)} /></Field>
                <Field label="Focus Y %"><Input type="number" value={f.preview_focus_y} onChange={e => up('preview_focus_y', e.target.value)} /></Field>
                <Field label="Zoom"><Input type="number" step="0.1" value={f.preview_zoom} onChange={e => up('preview_zoom', e.target.value)} /></Field>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Toggle on={f.active} onClick={() => up('active', !f.active)} label={f.active ? 'Visible' : 'Masqué'} />
        </div>

        {err && <div className="text-[12.5px] text-rose-500">{err}</div>}

        <div className="flex gap-3 pt-1">
          <Btn full onClick={onClose}>Annuler</Btn>
          <Btn kind="dark" full disabled={saving} icon={saving ? Loader2 : Save} onClick={save}>
            {saving ? 'Enregistrement…' : (editing ? 'Mettre à jour' : 'Ajouter')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// 📚 ONGLET BIBLIOTHÈQUE
// ════════════════════════════════════════════════════════════
function LibraryTab() {
  const { sb, neu, SERIF } = useCtx();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | item

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from('portfolio_items').select('*')
      .order('category').order('position').order('created_at', { ascending: false });
    setItems(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const categories = [...new Set(items.map(i => i.category))].sort((a, b) => a.localeCompare(b));
  const groups = categories.map(c => ({ c, list: items.filter(i => i.category === c) }));

  const remove = async (it) => {
    if (!confirm(`Supprimer « ${it.title} » de la vitrine ?`)) return;
    await sb.from('portfolio_items').delete().eq('id', it.id); load();
  };
  const toggleActive = async (it) => {
    await sb.from('portfolio_items').update({ active: !(it.active !== false) }).eq('id', it.id); load();
  };

  return (
    <div className="space-y-5">
      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Vitrine</div>
            <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1 leading-tight" style={SERIF}>
              Bibliothèque <span className="text-stone-400">({items.length})</span>
            </h3>
          </div>
          <Btn kind="dark" icon={Plus} onClick={() => setModal('new')} className="w-full sm:w-auto">Nouvelle réalisation</Btn>
        </div>
        <p className="text-[12.5px] text-stone-500 mt-2 leading-relaxed">
          Tes meilleures réalisations, rangées par section. Chaque espace de prospection choisit les sections à montrer.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-14 text-stone-400">Chargement…</div>
      ) : items.length === 0 ? (
        <div style={neu.pressedSm} className="rounded-[24px] p-10 text-center">
          <div style={neu.raisedXs} className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 text-stone-400"><Images size={20} /></div>
          <p className="text-[13.5px] text-stone-500">Aucune réalisation. Ajoute ta première pour démarrer la vitrine.</p>
        </div>
      ) : groups.map(g => (
        <div key={g.c} style={neu.raised} className="rounded-[24px] p-5 lg:p-6">
          <div className="flex items-baseline gap-2.5 mb-4">
            <h4 className="text-[17px] tracking-tight" style={SERIF}>{g.c}</h4>
            <span className="text-[11.5px] text-stone-400 font-medium">{g.list.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {g.list.map(it => {
              const thumb = adminThumb(it);
              const muted = it.active === false;
              return (
                <div key={it.id} style={neu.pressedSm} className={`rounded-2xl p-3 flex items-center gap-3 ${muted ? 'opacity-55' : ''}`}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 relative" style={{ background: it.thumb_grad || '#2a2620' }}>
                    {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(20,18,15,0.6)' }}>
                      {it.type === 'video' ? <VideoIcon size={10} className="text-white" /> : <ImageIcon size={10} className="text-white" />}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-stone-700 truncate">{it.title}</div>
                    <div className="text-[11px] text-stone-400 truncate">{it.caption || (it.type === 'video' ? 'Vidéo' : 'Photo')}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActive(it)} aria-label={muted ? 'Afficher' : 'Masquer'} style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500">
                      {muted ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => setModal(it)} aria-label="Modifier" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500"><Pencil size={14} /></button>
                    <button onClick={() => remove(it)} aria-label="Supprimer" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {modal && (
        <ItemModal
          item={modal === 'new' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 🧩 MODALE ESPACE (portfolio_spaces)
// ════════════════════════════════════════════════════════════
function SpaceModal({ space, categories, onClose, onSaved }) {
  const { sb, neu } = useCtx();
  const editing = !!(space && space.id);
  const [f, setF] = useState(() => ({
    kind: space?.kind || 'prospect',
    recipient_name: space?.recipient_name || '',
    referrer_name: space?.referrer_name || '',
    title: space?.title || '',
    intro: space?.intro || '',
    cta_label: space?.cta_label || 'Demander un devis',
    cta_url: space?.cta_url || '',
    show_lead_form: space?.show_lead_form !== false,
    status: space?.status || 'draft',
    share_enabled: space?.share_enabled !== false,
  }));
  const [sections, setSections] = useState(() =>
    new Set(Array.isArray(space?.sections) ? space.sections : []));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF(s => ({ ...s, [k]: v }));
  const toggleSection = (c) => setSections(prev => {
    const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n;
  });

  const save = async () => {
    setErr('');
    setSaving(true);
    // Conserve l'ordre de la bibliothèque pour les sections cochées.
    const ordered = categories.filter(c => sections.has(c));
    const payload = {
      kind: f.kind,
      recipient_name: f.recipient_name.trim() || null,
      referrer_name: f.kind === 'ambassador' ? (f.referrer_name.trim() || f.recipient_name.trim() || null) : null,
      title: f.title.trim() || null,
      intro: f.intro.trim() || null,
      sections: ordered,
      cta_label: f.cta_label.trim() || 'Demander un devis',
      cta_url: f.cta_url.trim() || null,
      show_lead_form: !!f.show_lead_form,
      status: f.status,
      share_enabled: !!f.share_enabled,
    };
    const { error } = editing
      ? await sb.from('portfolio_spaces').update(payload).eq('id', space.id)
      : await sb.from('portfolio_spaces').insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <Modal title={editing ? 'Modifier l’espace' : 'Nouvel espace'}
           subtitle="Vue personnalisée + lien partageable" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={f.kind} onChange={e => up('kind', e.target.value)}>
              <option value="prospect">Prospect</option>
              <option value="ambassador">Ambassadeur</option>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={f.status} onChange={e => up('status', e.target.value)}>
              <option value="draft">Brouillon</option>
              <option value="published">Publié</option>
            </Select>
          </Field>
        </div>

        <Field label={f.kind === 'ambassador' ? 'Nom de l’ambassadeur' : 'Nom du prospect'}>
          <Input value={f.recipient_name} onChange={e => up('recipient_name', e.target.value)} placeholder={f.kind === 'ambassador' ? 'Sophie' : 'Hôtel Maison Lumière'} />
        </Field>

        {f.kind === 'ambassador' && (
          <Field label="Qui recommande (affiché : « X vous recommande »)" hint="Vide = reprend le nom de l’ambassadeur.">
            <Input value={f.referrer_name} onChange={e => up('referrer_name', e.target.value)} placeholder="Sophie" />
          </Field>
        )}

        <Field label="Titre d’accueil (optionnel)">
          <Input value={f.title} onChange={e => up('title', e.target.value)} placeholder="Mon travail en images" />
        </Field>

        <Field label="Mot d’intro">
          <Textarea rows={3} value={f.intro} onChange={e => up('intro', e.target.value)}
            placeholder="Quelques mots personnalisés affichés en haut de l’espace…" />
        </Field>

        <Field label="Sections affichées" hint="Aucune cochée = toutes les sections de la vitrine.">
          {categories.length === 0 ? (
            <div className="text-[12.5px] text-stone-400 py-2">Ajoute d’abord des réalisations dans la bibliothèque.</div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {categories.map(c => {
                const on = sections.has(c);
                return (
                  <button key={c} type="button" onClick={() => toggleSection(c)}
                    style={on ? neu.dark : neu.pressedSm}
                    className="px-3.5 min-h-[40px] rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 active:scale-95 transition">
                    {on && <Check size={12} style={{ color: neu.accentText }} />}
                    <span style={on ? { color: neu.accentText } : {}} className={on ? '' : 'text-stone-500'}>{c}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Libellé du bouton"><Input value={f.cta_label} onChange={e => up('cta_label', e.target.value)} placeholder="Demander un devis" /></Field>
          <Field label="Lien du bouton (optionnel)" hint="Vide = mailto vers service@…"><Input value={f.cta_url} onChange={e => up('cta_url', e.target.value)} placeholder="mailto:… ou https://…" /></Field>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Toggle on={f.show_lead_form} onClick={() => up('show_lead_form', !f.show_lead_form)} label="Formulaire de mise en relation" />
        </div>
        <div className="flex items-center justify-between">
          <Toggle on={f.share_enabled} onClick={() => up('share_enabled', !f.share_enabled)} label="Partage public actif" />
        </div>

        {err && <div className="text-[12.5px] text-rose-500">{err}</div>}

        <div className="flex gap-3 pt-1">
          <Btn full onClick={onClose}>Annuler</Btn>
          <Btn kind="dark" full disabled={saving} icon={saving ? Loader2 : Save} onClick={save}>
            {saving ? 'Enregistrement…' : (editing ? 'Mettre à jour' : 'Créer l’espace')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// 📥 MODALE LEADS
// ════════════════════════════════════════════════════════════
function LeadsModal({ space, onClose }) {
  const { sb, neu } = useCtx();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from('portfolio_leads').select('*').eq('space_id', space.id).order('created_at', { ascending: false });
    setLeads(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleHandled = async (l) => {
    await sb.from('portfolio_leads').update({ handled: !l.handled }).eq('id', l.id); load();
  };
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  return (
    <Modal title="Demandes reçues" subtitle={space.recipient_name || 'Espace'} onClose={onClose} wide>
      {loading ? (
        <div className="text-center py-10 text-stone-400">Chargement…</div>
      ) : leads.length === 0 ? (
        <div style={neu.pressedSm} className="rounded-2xl p-8 text-center">
          <div style={neu.raisedXs} className="w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-2.5 text-stone-400"><Inbox size={18} /></div>
          <p className="text-[13px] text-stone-500">Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(l => (
            <div key={l.id} style={neu.pressedSm} className={`rounded-2xl p-4 ${l.handled ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-stone-700">{l.name}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5">{fmt(l.created_at)}</div>
                </div>
                <Toggle on={!!l.handled} onClick={() => toggleHandled(l)} label={l.handled ? 'Traité' : 'À traiter'} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12.5px]">
                {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-stone-600"><Mail size={12} /> {l.email}</a>}
                {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1.5 text-stone-600"><Phone size={12} /> {l.phone}</a>}
              </div>
              {l.message && <div className="text-[13px] text-stone-600 leading-relaxed mt-2.5 whitespace-pre-wrap">{l.message}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// 🔗 ONGLET ESPACES
// ════════════════════════════════════════════════════════════
function SpacesTab() {
  const { sb, neu, SERIF } = useCtx();
  const [spaces, setSpaces] = useState([]);
  const [leadCounts, setLeadCounts] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);   // null | 'new' | space
  const [leadsFor, setLeadsFor] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data: sp }, { data: leads }, { data: items }] = await Promise.all([
      sb.from('portfolio_spaces').select('*').order('created_at', { ascending: false }),
      sb.from('portfolio_leads').select('space_id, handled'),
      sb.from('portfolio_items').select('category'),
    ]);
    setSpaces(sp || []);
    const counts = {};
    (leads || []).forEach(l => {
      if (!l.space_id) return;
      counts[l.space_id] = counts[l.space_id] || { total: 0, open: 0 };
      counts[l.space_id].total++; if (!l.handled) counts[l.space_id].open++;
    });
    setLeadCounts(counts);
    setCategories([...new Set((items || []).map(i => i.category))].sort((a, b) => a.localeCompare(b)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const shareBase = (() => {
    const path = window.location.pathname.replace(/[^/]*$/, '');
    return window.location.origin + path + 'portfolio.html';
  })();
  const shareLink = (s) => shareBase + '?s=' + s.share_token;

  const copyLink = async (s) => {
    try { await navigator.clipboard.writeText(shareLink(s)); }
    catch (e) { window.prompt('Copiez ce lien :', shareLink(s)); }
    setCopiedId(s.id); setTimeout(() => setCopiedId(null), 2200);
  };
  const toggleShare = async (s) => { setBusyId(s.id); await sb.from('portfolio_spaces').update({ share_enabled: !s.share_enabled }).eq('id', s.id); await load(); setBusyId(null); };
  const togglePublish = async (s) => { setBusyId(s.id); await sb.from('portfolio_spaces').update({ status: s.status === 'published' ? 'draft' : 'published' }).eq('id', s.id); await load(); setBusyId(null); };
  const regen = async (s) => {
    if (!confirm('Régénérer le lien ? L’ancien cessera immédiatement de fonctionner.')) return;
    setBusyId(s.id); await sb.from('portfolio_spaces').update({ share_token: genToken() }).eq('id', s.id); await load(); setBusyId(null);
  };
  const remove = async (s) => {
    if (!confirm(`Supprimer l’espace « ${s.recipient_name || 'sans nom'} » ? Le lien cessera de fonctionner.`)) return;
    await sb.from('portfolio_spaces').delete().eq('id', s.id); load();
  };

  const shown = spaces.filter(s => filter === 'all' || s.kind === filter);
  const fmtDate = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); } catch (e) { return null; } };

  return (
    <div className="space-y-5">
      <div style={neu.raised} className="rounded-[24px] lg:rounded-[28px] p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">Prospection</div>
            <h3 className="text-[20px] lg:text-[22px] tracking-tight mt-1 leading-tight" style={SERIF}>
              Espaces <span className="text-stone-400">({spaces.length})</span>
            </h3>
          </div>
          <Btn kind="dark" icon={Plus} onClick={() => setModal('new')} className="w-full sm:w-auto">Nouvel espace</Btn>
        </div>

        <div className="flex gap-1.5 mt-4">
          {[['all', 'Tous'], ['prospect', 'Prospects'], ['ambassador', 'Ambassadeurs']].map(([k, lbl]) => (
            <button key={k} onClick={() => setFilter(k)} style={filter === k ? neu.dark : neu.raisedXs}
              className="px-3.5 min-h-[38px] rounded-full text-[12px] font-semibold transition active:scale-95">
              <span style={filter === k ? { color: neu.accentText } : {}} className={filter === k ? '' : 'text-stone-500'}>{lbl}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-14 text-stone-400">Chargement…</div>
      ) : shown.length === 0 ? (
        <div style={neu.pressedSm} className="rounded-[24px] p-10 text-center">
          <div style={neu.raisedXs} className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 text-stone-400"><Sparkles size={20} /></div>
          <p className="text-[13.5px] text-stone-500">Aucun espace. Crée-en un pour partager ta vitrine à un prospect ou un ambassadeur.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(s => {
            const lc = leadCounts[s.id] || { total: 0, open: 0 };
            const published = s.status === 'published';
            return (
              <div key={s.id} style={neu.raised} className="rounded-[22px] p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-stone-700">{s.recipient_name || 'Sans nom'}</span>
                      <Pill tone={s.kind === 'ambassador' ? 'violet' : 'stone'}>{s.kind === 'ambassador' ? 'Ambassadeur' : 'Prospect'}</Pill>
                      <Pill tone={published ? 'emerald' : 'amber'}>{published ? 'Publié' : 'Brouillon'}</Pill>
                    </div>
                    <div className="text-[12px] text-stone-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{Array.isArray(s.sections) && s.sections.length ? s.sections.join(' · ') : 'Toutes les sections'}</span>
                    </div>
                    <div className="text-[11.5px] text-stone-400 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1"><Eye size={11} /> {s.view_count || 0} ouverture{(s.view_count || 0) > 1 ? 's' : ''}{fmtDate(s.last_viewed_at) ? ` · ${fmtDate(s.last_viewed_at)}` : ''}</span>
                      <button onClick={() => setLeadsFor(s)} className="inline-flex items-center gap-1 text-stone-500 font-medium">
                        <Inbox size={11} /> {lc.total} demande{lc.total > 1 ? 's' : ''}{lc.open ? ` (${lc.open} à traiter)` : ''}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <button onClick={() => copyLink(s)} disabled={!s.share_enabled} style={s.share_enabled ? neu.darkSm : neu.pressedSm}
                      className="px-3.5 min-h-[40px] rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50">
                      {copiedId === s.id
                        ? <><Check size={13} style={{ color: neu.accentText }} /><span style={{ color: neu.accentText }}>Copié</span></>
                        : <><Copy size={13} style={s.share_enabled ? { color: neu.accentText } : {}} className={s.share_enabled ? '' : 'text-stone-400'} /><span style={s.share_enabled ? { color: neu.accentText } : {}} className={s.share_enabled ? '' : 'text-stone-400'}>Lien</span></>}
                    </button>
                    <a href={shareLink(s)} target="_blank" rel="noopener" aria-label="Aperçu" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500"><ExternalLink size={14} /></a>
                    <button onClick={() => regen(s)} disabled={busyId === s.id} aria-label="Régénérer le lien" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500"><RefreshCw size={13} className={busyId === s.id ? 'animate-spin' : ''} /></button>
                    <button onClick={() => setModal(s)} aria-label="Modifier" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500"><Pencil size={14} /></button>
                    <button onClick={() => remove(s)} aria-label="Supprimer" style={neu.raisedXs} className="w-9 h-9 rounded-full flex items-center justify-center text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 pt-3.5 border-t border-stone-200/60">
                  <Toggle on={published} onClick={() => togglePublish(s)} label={published ? 'Publié' : 'Brouillon'} />
                  <Toggle on={!!s.share_enabled} onClick={() => toggleShare(s)} label="Partage" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <SpaceModal
          space={modal === 'new' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
      {leadsFor && <LeadsModal space={leadsFor} onClose={() => setLeadsFor(null)} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 🌳 RACINE DU MODULE
// ════════════════════════════════════════════════════════════
export default function AdminPortfolio({ sb, neu, SERIF, isDark }) {
  const [view, setView] = useState('library'); // library | spaces

  return (
    <Ctx.Provider value={{ sb, neu, SERIF, isDark }}>
      <div className="space-y-5">
        <div style={neu.raisedXs} className="rounded-full p-1 inline-flex items-center gap-1">
          {[['library', 'Bibliothèque', Images], ['spaces', 'Espaces', Users]].map(([k, lbl, Icon]) => (
            <button key={k} onClick={() => setView(k)} style={view === k ? neu.dark : {}}
              className="px-4 py-2.5 min-h-[42px] rounded-full text-[12.5px] font-semibold inline-flex items-center gap-2 transition active:scale-95">
              <Icon size={14} style={view === k ? { color: neu.accentText } : {}} className={view === k ? '' : 'text-stone-500'} />
              <span style={view === k ? { color: neu.accentText } : {}} className={view === k ? '' : 'text-stone-500'}>{lbl}</span>
            </button>
          ))}
        </div>

        {view === 'library' ? <LibraryTab /> : <SpacesTab />}
      </div>
    </Ctx.Provider>
  );
}
