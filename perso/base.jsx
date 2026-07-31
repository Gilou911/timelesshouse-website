/* ════════════════════════════════════════════════════════════
   🗃  BASE DE DONNÉES — le bloc « base » de l'espace perso
   ════════════════════════════════════════════════════════════
   Réplique des bases Notion, à l'échelle d'un espace personnel.
   Le modèle (vidéo Notion « databases », super.so) :

   · des PROPRIÉTÉS typées — texte, nombre, case, sélection,
     ÉTIQUETTES (multi-sélection), date, image ;
   · des LIGNES qui s'OUVRENT : la fiche porte les propriétés ET
     une vraie zone de blocs (texte, listes, images, vidéos…) —
     propre dehors, riche dedans ;
   · CINQ VUES sur les mêmes lignes — Table, Tableau (kanban par
     sélection/étiquette), Liste, Galerie, Calendrier (par date) ;
   · des FILTRES et un TRI enregistrés sur la base, appliqués à
     toutes les vues.

   Tout vit DANS le jsonb du bloc : aucune migration, la RLS de la
   page protège, l'autosave existant enregistre. Les jetons (neu,
   SERIF), les atomes et l'éditeur de blocs viennent de perso.jsx
   en liaisons vivantes ESM (pas de base imbriquée dans une fiche).
   ════════════════════════════════════════════════════════════ */
import React, { useState, useRef } from 'react';
import {
  Table, List, LayoutGrid, Plus, Trash2, Square, CheckSquare,
  Loader2, Settings2, Image as ImageIcon, Columns3, CalendarDays,
  SlidersHorizontal, ChevronLeft, ChevronRight, NotebookPen,
} from 'lucide-react';
import {
  neu, SERIF, genId, Modal, Btn, Field, Input, Select,
  televerserImage, ListeBlocsEditeur, RenduBloc,
} from './perso.jsx';

export const nouvelleBase = () => ({
  nom: '',
  vue: 'table',
  filtres: [],
  tri: null,
  proprietes: [{ id: genId(), nom: 'Nom', type: 'texte' }],
  lignes: [{ id: genId(), valeurs: {}, blocs: [] }],
});

const TYPES_PROP = [
  { type: 'texte',      label: 'Texte' },
  { type: 'nombre',     label: 'Nombre' },
  { type: 'case',       label: 'Case à cocher' },
  { type: 'selection',  label: 'Sélection (une pastille)' },
  { type: 'etiquettes', label: 'Étiquettes (plusieurs pastilles)' },
  { type: 'date',       label: 'Date' },
  { type: 'image',      label: 'Image' },
];

const VUES = [
  { id: 'table',      label: 'Table',      icon: Table },
  { id: 'tableau',    label: 'Tableau',    icon: Columns3 },
  { id: 'liste',      label: 'Liste',      icon: List },
  { id: 'galerie',    label: 'Galerie',    icon: LayoutGrid },
  { id: 'calendrier', label: 'Calendrier', icon: CalendarDays },
];

/* ── Helpers de modèle ── */
const dateCourteFR = (iso) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).split('-');
  return a && m && j ? `${j}/${m}/${a}` : String(iso);
};

const titreDeLigne = (base, ligne) => {
  const prem = base.proprietes[0];
  return (prem && String(ligne.valeurs?.[prem.id] ?? '').trim()) || 'Sans titre';
};

const propsSecondaires = (base) => base.proprietes.slice(1).filter((p) => p.type !== 'image');
const propImage = (base) => base.proprietes.find((p) => p.type === 'image');
const propParTypes = (base, ...types) => base.proprietes.find((p) => types.includes(p.type));

// Étiquettes : rangées en tableau, saisies « séparées par des virgules ».
const lireEtiquettes = (val) => Array.isArray(val)
  ? val
  : String(val || '').split(',').map((s) => s.trim()).filter(Boolean);

/* Filtres + tri de la base, appliqués à toutes les vues (Notion :
   « when a property changes, it updates across all views »). */
const passeFiltre = (base, ligne, f) => {
  const prop = base.proprietes.find((p) => p.id === f.propId);
  if (!prop) return true;
  const val = ligne.valeurs?.[prop.id];
  const attendu = String(f.valeur || '').trim().toLowerCase();
  if (!attendu) return true;
  if (prop.type === 'case') return (attendu === 'oui') === !!val;
  if (prop.type === 'etiquettes') return lireEtiquettes(val).some((t) => t.toLowerCase().includes(attendu));
  return String(val ?? '').toLowerCase().includes(attendu);
};

const filtrerEtTrier = (base) => {
  let lignes = (base.lignes || []).filter((l) => (base.filtres || []).every((f) => passeFiltre(base, l, f)));
  const tri = base.tri;
  if (tri?.propId) {
    const prop = base.proprietes.find((p) => p.id === tri.propId);
    if (prop) {
      const cle = (l) => {
        const v = l.valeurs?.[prop.id];
        if (prop.type === 'nombre') return Number(v) || 0;
        if (prop.type === 'case') return v ? 1 : 0;
        if (prop.type === 'etiquettes') return lireEtiquettes(v).join(',').toLowerCase();
        return String(v ?? '').toLowerCase();
      };
      lignes = [...lignes].sort((a, b) => {
        const ka = cle(a), kb = cle(b);
        const cmp = typeof ka === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'fr');
        return tri.sens === 'desc' ? -cmp : cmp;
      });
    }
  }
  return lignes;
};

/* ── Rail de vues — règle maison : conteneur en CREUX, actif sombre.
   Cibles ≥ 44 px (audit HIG 30/07). ── */
function SwitchVues({ vue, onVue }) {
  return (
    <div style={neu.pressed} className="rounded-full p-1 inline-flex items-center gap-1 max-w-full overflow-x-auto no-scrollbar rounded-full"
      role="tablist" aria-label="Vue de la base">
      {VUES.map(({ id, label, icon: Icon }) => {
        const actif = vue === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={actif} onClick={() => onVue(id)}
            style={actif ? neu.dark : undefined}
            className={`th-onglet min-h-[44px] px-3 rounded-full flex items-center gap-1.5 text-[12px] font-semibold shrink-0 ${actif ? 'text-white' : 'text-stone-500'}`}
            title={label} aria-label={label}>
            <Icon size={13} />
            <span className="hidden md:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Valeur en lecture (partagée) ── */
function ValeurLecture({ prop, val }) {
  if (prop.type === 'case') {
    return val
      ? <CheckSquare size={15} className="text-stone-900" aria-label="coché" />
      : <Square size={15} className="text-stone-400" aria-label="non coché" />;
  }
  if (prop.type === 'date') return <span>{dateCourteFR(val)}</span>;
  if (prop.type === 'selection') {
    if (!val) return null;
    return (
      <span style={neu.pressedSm} className="inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold text-stone-700">
        {String(val)}
      </span>
    );
  }
  if (prop.type === 'etiquettes') {
    const tags = lireEtiquettes(val);
    if (!tags.length) return null;
    return (
      <span className="inline-flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span key={i} style={neu.pressedSm} className="inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold text-stone-700">
            {t}
          </span>
        ))}
      </span>
    );
  }
  if (prop.type === 'image') {
    return val ? <img src={val} alt="" loading="lazy" className="w-9 h-9 rounded-lg object-cover" /> : null;
  }
  return <span className={prop.type === 'nombre' ? 'tabular-nums' : ''}>{String(val ?? '')}</span>;
}

/* ── Cellule éditable (vue Table + fiche) ── */
function CelluleEdition({ prop, val, onVal, racineId }) {
  const fileRef = useRef(null);
  const [pct, setPct] = useState(null);

  if (prop.type === 'case') {
    return (
      <button type="button" role="checkbox" aria-checked={!!val} onClick={() => onVal(!val)}
        aria-label={prop.nom}
        className={`tap-ext ${val ? 'text-stone-900' : 'text-stone-400'} active:scale-90 transition`}>
        {val ? <CheckSquare size={17} /> : <Square size={17} />}
      </button>
    );
  }
  if (prop.type === 'date') {
    return (
      <input type="date" value={val || ''} onChange={(e) => onVal(e.target.value)} aria-label={prop.nom}
        className="bg-transparent text-[16px] sm:text-[13.5px] text-stone-800 w-full min-h-[40px]" />
    );
  }
  if (prop.type === 'image') {
    const surFichier = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      setPct(0);
      try {
        const url = await televerserImage(f, racineId, (p) => setPct(Math.round(p * 100)));
        onVal(url);
      } catch (_) { /* la fiche affiche mieux les erreurs */ }
      setPct(null);
    };
    return (
      <span className="inline-flex items-center gap-2">
        {val && <img src={val} alt="" className="w-9 h-9 rounded-lg object-cover" />}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={surFichier} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label={`Téléverser ${prop.nom}`}
          className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 active:scale-95 transition">
          {pct !== null ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
        </button>
      </span>
    );
  }
  if (prop.type === 'etiquettes') {
    return (
      <input
        value={Array.isArray(val) ? val.join(', ') : (val ?? '')}
        onChange={(e) => onVal(lireEtiquettes(e.target.value.endsWith(',') ? e.target.value + ' ' : e.target.value).length
          ? e.target.value : e.target.value)}
        onBlur={(e) => onVal(lireEtiquettes(e.target.value))}
        aria-label={prop.nom}
        placeholder="mariage, urgent…"
        className="bg-transparent w-full py-2 text-[16px] sm:text-[13.5px] text-stone-800"
      />
    );
  }
  return (
    <input
      value={val ?? ''}
      onChange={(e) => onVal(e.target.value)}
      inputMode={prop.type === 'nombre' ? 'decimal' : undefined}
      aria-label={prop.nom}
      placeholder=""
      className={`bg-transparent w-full py-2 text-[16px] sm:text-[13.5px] text-stone-800 ${prop.type === 'nombre' ? 'text-right tabular-nums' : ''}`}
    />
  );
}

/* ════════════════════════════════════════════════════════════
   LA FICHE — une ligne s'ouvre comme une page (vidéo Notion :
   « open a row and you'll find a blank page ») : propriétés en
   colonne unique, puis une vraie zone de blocs.
   ════════════════════════════════════════════════════════════ */
function FicheLigne({ base, ligne, onValeurs, onBlocs, onRetirer, onClose, racineId }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title={titreDeLigne(base, ligne)} kicker={base.nom || 'Base'} onClose={onClose} size="lg">
      <div className="space-y-4">
        {base.proprietes.map((p) => (
          <Field key={p.id} label={p.nom}>
            {p.type === 'texte' && base.proprietes[0]?.id === p.id ? (
              <Input value={ligne.valeurs?.[p.id] ?? ''} onChange={(e) => onValeurs({ [p.id]: e.target.value })} />
            ) : (
              <div style={p.type === 'case' || p.type === 'image' ? undefined : neu.pressedSm}
                className={p.type === 'case' || p.type === 'image' ? '' : 'rounded-xl px-4 py-1.5'}>
                <CelluleEdition prop={p} val={ligne.valeurs?.[p.id]} racineId={racineId}
                  onVal={(v) => onValeurs({ [p.id]: v })} />
              </div>
            )}
          </Field>
        ))}

        <div className="pt-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold mb-1 flex items-center gap-1.5">
            <NotebookPen size={11} /> Notes
          </div>
          <ListeBlocsEditeur
            blocs={Array.isArray(ligne.blocs) ? ligne.blocs : []}
            onChange={onBlocs}
            racineId={racineId}
            typesExclus={['base']}
          />
        </div>

        {confirm ? (
          <button type="button" onClick={() => { onRetirer(); onClose(); }}
            className="w-full min-h-[48px] rounded-full bg-rose-600 text-white text-[13px] font-semibold active:scale-[0.99] transition">
            Confirmer la suppression de la ligne
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm(true)}
            className="w-full min-h-[44px] text-[12.5px] text-rose-600 hover:text-rose-700">
            Supprimer cette ligne
          </button>
        )}
      </div>
    </Modal>
  );
}

function FicheLigneLecture({ base, ligne, onClose }) {
  const blocs = Array.isArray(ligne.blocs) ? ligne.blocs : [];
  return (
    <Modal title={titreDeLigne(base, ligne)} kicker={base.nom || 'Base'} onClose={onClose} size="lg">
      <div className="space-y-4">
        {base.proprietes.slice(1).map((p) => {
          const v = ligne.valeurs?.[p.id];
          if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
          return (
            <div key={p.id} className="flex items-start gap-3">
              <span className="w-28 shrink-0 text-[12px] text-stone-500 pt-0.5">{p.nom}</span>
              <span className="min-w-0 text-[13.5px] text-stone-800"><ValeurLecture prop={p} val={v} /></span>
            </div>
          );
        })}
        {blocs.length > 0 && (
          <div className="pt-3 space-y-4">
            {blocs.map((b, i) => <RenduBloc key={b.id || i} bloc={b} />)}
          </div>
        )}
        {blocs.length === 0 && base.proprietes.length <= 1 && (
          <p className="text-[13px] text-stone-500">Cette fiche est vide.</p>
        )}
      </div>
    </Modal>
  );
}

/* ── Réglage d'une propriété ── */
function ModaleProp({ prop, onMaj, onRetirer, onClose, estTitre }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title={prop.nom || 'Propriété'} kicker="Propriété" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nom">
          <Input value={prop.nom} onChange={(e) => onMaj({ nom: e.target.value })} />
        </Field>
        {!estTitre && (
          <Field label="Type">
            <Select value={prop.type} onChange={(e) => onMaj({ type: e.target.value })}>
              {TYPES_PROP.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </Select>
          </Field>
        )}
        {estTitre ? (
          <p className="text-[12px] text-stone-500 leading-relaxed">
            C'est la propriété-titre : chaque vue l'affiche en premier, elle ne se supprime pas.
          </p>
        ) : confirm ? (
          <button type="button" onClick={() => { onRetirer(); onClose(); }}
            className="w-full min-h-[48px] rounded-full bg-rose-600 text-white text-[13px] font-semibold active:scale-[0.99] transition">
            Confirmer — les valeurs de cette colonne seront perdues
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm(true)}
            className="w-full min-h-[44px] text-[12.5px] text-rose-600 hover:text-rose-700">
            Supprimer cette propriété
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ── Filtres + tri (persistés sur la base, toutes vues) ── */
function ModaleReglages({ base, onMaj, onClose }) {
  const filtres = base.filtres || [];
  const majFiltre = (i, patch) => onMaj({ filtres: filtres.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const retirerFiltre = (i) => onMaj({ filtres: filtres.filter((_, idx) => idx !== i) });
  const ajouterFiltre = () => onMaj({
    filtres: [...filtres, { propId: base.proprietes[0]?.id || '', valeur: '' }],
  });

  return (
    <Modal title="Filtres et tri" kicker={base.nom || 'Base'} onClose={onClose}>
      <div className="space-y-6">
        <section className="space-y-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Trier</div>
          <Field label="Par propriété">
            <Select value={base.tri?.propId || ''} onChange={(e) => onMaj({
              tri: e.target.value ? { propId: e.target.value, sens: base.tri?.sens || 'asc' } : null,
            })}>
              <option value="">— Ordre de saisie —</option>
              {base.proprietes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </Select>
          </Field>
          {base.tri && (
            <Field label="Sens">
              <Select value={base.tri.sens} onChange={(e) => onMaj({ tri: { ...base.tri, sens: e.target.value } })}>
                <option value="asc">Croissant (A → Z, 1 → 9, ancien → récent)</option>
                <option value="desc">Décroissant</option>
              </Select>
            </Field>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold">Filtrer</div>
          {filtres.length === 0 && (
            <p className="text-[12.5px] text-stone-500">Aucun filtre — toutes les lignes s'affichent.</p>
          )}
          {filtres.map((f, i) => {
            const prop = base.proprietes.find((p) => p.id === f.propId);
            return (
              <div key={i} className="space-y-2" style={neu.pressedSm && undefined}>
                <Field label={`Filtre ${i + 1} — propriété`}>
                  <Select value={f.propId} onChange={(e) => majFiltre(i, { propId: e.target.value })}>
                    {base.proprietes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </Select>
                </Field>
                <Field label="Contient">
                  <Input value={f.valeur} onChange={(e) => majFiltre(i, { valeur: e.target.value })}
                    placeholder={prop?.type === 'case' ? 'oui ou non' : 'texte à chercher…'} />
                </Field>
                <button type="button" onClick={() => retirerFiltre(i)}
                  className="min-h-[44px] text-[12.5px] text-rose-600 hover:text-rose-700">
                  Retirer ce filtre
                </button>
              </div>
            );
          })}
          {filtres.length < 3 && (
            <Btn onClick={ajouterFiltre} icon={Plus}>Ajouter un filtre</Btn>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════
   LES CINQ VUES (elles reçoivent les lignes déjà filtrées/triées)
   ════════════════════════════════════════════════════════════ */
function VueTable({ base, lignes, edition, majLigne, ouvrirProp, ouvrirLigne, ajouterProp, racineId }) {
  return (
    <div style={neu.pressedSm} className="rounded-2xl overflow-hidden">
      {/* tabIndex : la table défile — le clavier doit pouvoir la faire
          défiler (HIG §16). */}
      <div className="overflow-x-auto" tabIndex={0} role="region"
        aria-label={`Table ${base.nom || 'de la base'}`}>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-left">
              {base.proprietes.map((p, i) => (
                <th key={p.id} className="px-3 py-2.5 font-semibold text-[11.5px] uppercase tracking-[0.08em] text-stone-500 whitespace-nowrap border-b border-stone-300/50"
                  style={{ minWidth: i === 0 ? '190px' : '140px' }}>
                  {edition ? (
                    <button type="button" onClick={() => ouvrirProp(p.id)}
                      className="min-h-[32px] tap-ext inline-flex items-center gap-1.5 hover:text-stone-800 transition">
                      {p.nom || 'Sans nom'} <Settings2 size={11} className="opacity-60" />
                    </button>
                  ) : (p.nom || 'Sans nom')}
                </th>
              ))}
              {edition && (
                <th className="px-2 py-2 border-b border-stone-300/50 w-12">
                  <button type="button" onClick={ajouterProp} aria-label="Ajouter une propriété"
                    className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 active:scale-95 transition">
                    <Plus size={13} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="group border-b border-stone-300/30 last:border-b-0">
                {base.proprietes.map((p) => (
                  <td key={p.id} className="px-3 py-1 align-middle">
                    {edition
                      ? <CelluleEdition prop={p} val={l.valeurs?.[p.id]} racineId={racineId}
                          onVal={(v) => majLigne(l.id, { [p.id]: v })} />
                      : <ValeurLecture prop={p} val={l.valeurs?.[p.id]} />}
                  </td>
                ))}
                {edition && (
                  <td className="px-2 py-1 w-12">
                    <button type="button" onClick={() => ouvrirLigne(l.id)} aria-label="Ouvrir la fiche"
                      className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition active:scale-95">
                      <NotebookPen size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VueListe({ base, lignes, edition, ouvrirLigne }) {
  return (
    <div style={neu.pressedSm} className="rounded-2xl px-4 py-1">
      {lignes.map((l) => {
        const Contenu = (
          <>
            <span className="flex-1 min-w-0 text-[14.5px] font-medium text-stone-800 truncate">{titreDeLigne(base, l)}</span>
            <span className="flex items-center gap-3 flex-wrap justify-end">
              {propsSecondaires(base).slice(0, 4).map((p) => {
                const v = l.valeurs?.[p.id];
                if (v == null || v === '' || (p.type === 'case' && !v) || (Array.isArray(v) && !v.length)) return null;
                return <span key={p.id} className="text-[12px] text-stone-500"><ValeurLecture prop={p} val={v} /></span>;
              })}
            </span>
          </>
        );
        return (
          <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)}
            className="w-full min-h-[44px] py-2 flex items-center gap-3 text-left border-b border-stone-300/30 last:border-b-0">
            {Contenu}
          </button>
        );
      })}
      {lignes.length === 0 && <p className="py-3 text-[12.5px] text-stone-500">Aucune ligne ne passe les filtres.</p>}
    </div>
  );
}

function VueGalerie({ base, lignes, ouvrirLigne }) {
  const pImage = propImage(base);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {lignes.map((l) => {
        const img = pImage ? l.valeurs?.[pImage.id] : null;
        return (
          <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)} style={neu.raisedSm}
            className="th-press rounded-2xl text-left overflow-hidden">
            {img ? (
              <img src={img} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-t-2xl" />
            ) : (
              <span className="w-full aspect-[4/3] rounded-t-2xl flex items-center justify-center text-stone-400 block" style={neu.pressedSm}>
                <ImageIcon size={18} />
              </span>
            )}
            <span className="block px-3.5 pt-2.5 pb-3.5 min-w-0">
              <span className="block text-[13.5px] font-medium text-stone-900 truncate">{titreDeLigne(base, l)}</span>
              {propsSecondaires(base).slice(0, 3).map((p) => {
                const v = l.valeurs?.[p.id];
                if (v == null || v === '' || (p.type === 'case' && !v) || (Array.isArray(v) && !v.length)) return null;
                return (
                  <span key={p.id} className="block text-[11.5px] text-stone-500 mt-1 truncate">
                    <ValeurLecture prop={p} val={v} />
                  </span>
                );
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Vue Tableau (kanban) : colonnes = valeurs de la première propriété
   Sélection ou Étiquettes. Déplacer une carte = changer sa pastille
   dans la fiche — la colonne suit, comme toutes les vues. */
function VueTableau({ base, lignes, ouvrirLigne }) {
  const pGroupe = propParTypes(base, 'selection', 'etiquettes');
  if (!pGroupe) {
    return (
      <div style={neu.pressedSm} className="rounded-2xl p-5 text-[13px] text-stone-500 leading-relaxed">
        Ajoutez une propriété <strong>Sélection</strong> ou <strong>Étiquettes</strong> pour
        grouper vos lignes en colonnes.
      </div>
    );
  }
  const valeursDe = (l) => pGroupe.type === 'etiquettes'
    ? lireEtiquettes(l.valeurs?.[pGroupe.id])
    : [String(l.valeurs?.[pGroupe.id] || '').trim()].filter(Boolean);
  const colonnes = [...new Set(lignes.flatMap(valeursDe))];
  const sans = lignes.filter((l) => valeursDe(l).length === 0);

  const Colonne = ({ titre, cartes }) => (
    <div className="w-[240px] shrink-0">
      <div className="flex items-center gap-2 px-1 mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-stone-500 truncate">{titre}</span>
        <span className="text-[11px] text-stone-400 tabular-nums">{cartes.length}</span>
      </div>
      <div className="space-y-3">
        {cartes.map((l) => (
          <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)} style={neu.raisedSm}
            className="th-press w-full rounded-2xl px-3.5 py-3 text-left">
            <span className="block text-[13px] font-medium text-stone-900 leading-snug">{titreDeLigne(base, l)}</span>
            {propsSecondaires(base).filter((p) => p.id !== pGroupe.id).slice(0, 2).map((p) => {
              const v = l.valeurs?.[p.id];
              if (v == null || v === '' || (p.type === 'case' && !v) || (Array.isArray(v) && !v.length)) return null;
              return (
                <span key={p.id} className="block text-[11.5px] text-stone-500 mt-1.5 truncate">
                  <ValeurLecture prop={p} val={v} />
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="overflow-x-auto no-scrollbar rounded-2xl" tabIndex={0} role="region"
      aria-label={`Tableau ${base.nom || 'de la base'}`}>
      <div className="flex gap-4 items-start pb-2">
        {colonnes.map((c) => (
          <Colonne key={c} titre={c} cartes={lignes.filter((l) => valeursDe(l).includes(c))} />
        ))}
        {sans.length > 0 && <Colonne titre="Sans pastille" cartes={sans} />}
        {colonnes.length === 0 && sans.length === 0 && (
          <p className="py-3 text-[12.5px] text-stone-500">Aucune ligne ne passe les filtres.</p>
        )}
      </div>
    </div>
  );
}

/* Vue Calendrier : un mois, les lignes posées sur leur première
   propriété Date. Déplacer une échéance = changer la date dans la
   fiche — le calendrier suit. */
const MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function VueCalendrier({ base, lignes, ouvrirLigne }) {
  const pDate = base.proprietes.find((p) => p.type === 'date');
  const aujourdhui = new Date();
  const [annee, setAnnee] = useState(aujourdhui.getFullYear());
  const [mois, setMois] = useState(aujourdhui.getMonth()); // 0-11
  if (!pDate) {
    return (
      <div style={neu.pressedSm} className="rounded-2xl p-5 text-[13px] text-stone-500 leading-relaxed">
        Ajoutez une propriété <strong>Date</strong> pour poser vos lignes sur le calendrier.
      </div>
    );
  }

  const bouger = (delta) => {
    const d = new Date(annee, mois + delta, 1);
    setAnnee(d.getFullYear()); setMois(d.getMonth());
  };
  const cle = (a, m, j) => `${a}-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  const parJour = new Map();
  lignes.forEach((l) => {
    const v = String(l.valeurs?.[pDate.id] || '');
    if (v) parJour.set(v, [...(parJour.get(v) || []), l]);
  });
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7; // lundi = 0
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const cases = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  const estAujourdhui = (j) => j === aujourdhui.getDate() && mois === aujourdhui.getMonth() && annee === aujourdhui.getFullYear();

  return (
    <div style={neu.pressedSm} className="rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => bouger(-1)} aria-label="Mois précédent"
          className="w-9 h-9 tap-ext rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition">
          <ChevronLeft size={15} />
        </button>
        <span className="text-[15px] text-stone-900" style={SERIF}>{MOIS_LONGS[mois]} {annee}</span>
        <button type="button" onClick={() => bouger(1)} aria-label="Mois suivant"
          className="w-9 h-9 tap-ext rounded-full flex items-center justify-center bg-white text-stone-600 active:scale-95 transition">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {JOURS_COURTS.map((j, i) => (
          <div key={i} className="text-center text-[10.5px] font-semibold uppercase text-stone-400 pb-1" aria-hidden="true">{j}</div>
        ))}
        {cases.map((j, i) => (
          <div key={i} className={`min-h-[64px] sm:min-h-[76px] rounded-lg p-1 ${j ? 'bg-white/40' : ''} ${j && estAujourdhui(j) ? 'ring-1 ring-stone-900/40' : ''}`}>
            {j && (
              <>
                <div className={`text-[10.5px] tabular-nums mb-0.5 ${estAujourdhui(j) ? 'font-bold text-stone-900' : 'text-stone-500'}`}>{j}</div>
                {(parJour.get(cle(annee, mois, j)) || []).slice(0, 2).map((l) => (
                  <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)}
                    className="block w-full text-left text-[10.5px] leading-tight font-medium text-stone-800 bg-white rounded-md px-1 py-0.5 mb-0.5 truncate active:scale-95 transition"
                    title={titreDeLigne(base, l)}>
                    {titreDeLigne(base, l)}
                  </button>
                ))}
                {(parJour.get(cle(annee, mois, j)) || []).length > 2 && (
                  <div className="text-[9.5px] text-stone-500 px-1">+{(parJour.get(cle(annee, mois, j)) || []).length - 2}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ÉDITION & LECTURE
   ════════════════════════════════════════════════════════════ */
const COMPOSANT_VUE = {
  table: VueTable, tableau: VueTableau, liste: VueListe,
  galerie: VueGalerie, calendrier: VueCalendrier,
};

export function BaseEditeur({ bloc, onChange, racineId }) {
  const maj = (patch) => onChange({ ...bloc, ...patch });
  const [propOuverte, setPropOuverte] = useState(null);
  const [ligneOuverte, setLigneOuverte] = useState(null);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  const majLigne = (id, valeurs) => maj({
    lignes: bloc.lignes.map((l) => (l.id === id ? { ...l, valeurs: { ...l.valeurs, ...valeurs } } : l)),
  });
  const majBlocsLigne = (id, blocs) => maj({
    lignes: bloc.lignes.map((l) => (l.id === id ? { ...l, blocs } : l)),
  });
  const ajouterLigne = () => {
    const l = { id: genId(), valeurs: {}, blocs: [] };
    maj({ lignes: [...bloc.lignes, l] });
    setLigneOuverte(l.id);
  };
  const retirerLigne = (id) => maj({ lignes: bloc.lignes.filter((l) => l.id !== id) });

  const ajouterProp = () => {
    const p = { id: genId(), nom: `Propriété ${bloc.proprietes.length}`, type: 'texte' };
    maj({ proprietes: [...bloc.proprietes, p] });
    setPropOuverte(p.id);
  };
  const majProp = (id, patch) => maj({
    proprietes: bloc.proprietes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
  const retirerProp = (id) => maj({
    proprietes: bloc.proprietes.filter((p) => p.id !== id),
    lignes: bloc.lignes.map((l) => {
      const v = { ...l.valeurs };
      delete v[id];
      return { ...l, valeurs: v };
    }),
  });

  const prop = bloc.proprietes.find((p) => p.id === propOuverte);
  const ligne = bloc.lignes.find((l) => l.id === ligneOuverte);
  const lignes = filtrerEtTrier(bloc);
  const Vue = COMPOSANT_VUE[bloc.vue] || VueTable;
  const nbReglages = (bloc.filtres || []).length + (bloc.tri ? 1 : 0);

  return (
    <div className="space-y-3 my-1">
      {/* Empilé jusqu'à lg : avec cinq vues + réglages, le rail
          écrasait le nom même à 1280 (audit 30/07, revu 31/07). */}
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <input value={bloc.nom || ''} onChange={(e) => maj({ nom: e.target.value })}
          placeholder="Nom de la base" aria-label="Nom de la base"
          className="bg-transparent text-[19px] text-stone-900 min-w-0 lg:flex-1 min-h-[44px]" style={SERIF} />
        <div className="flex items-center gap-2 self-start lg:self-auto max-w-full">
          <button type="button" onClick={() => setReglagesOuverts(true)}
            aria-label={`Filtres et tri${nbReglages ? ` (${nbReglages} actifs)` : ''}`}
            style={neu.raisedXs}
            className="min-h-[44px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-semibold text-stone-600 active:scale-95 transition shrink-0">
            <SlidersHorizontal size={13} />
            {nbReglages > 0 && <span className="tabular-nums">{nbReglages}</span>}
          </button>
          <SwitchVues vue={bloc.vue} onVue={(vue) => maj({ vue })} />
        </div>
      </div>

      <Vue base={bloc} lignes={lignes} edition majLigne={majLigne} racineId={racineId}
        ouvrirProp={setPropOuverte} ouvrirLigne={setLigneOuverte} ajouterProp={ajouterProp} />

      <div className="flex items-center gap-3 flex-wrap">
        <Btn onClick={ajouterLigne} icon={Plus}>Nouvelle ligne</Btn>
        {bloc.vue !== 'table' && (
          <Btn onClick={ajouterProp} icon={Settings2}>Nouvelle propriété</Btn>
        )}
      </div>

      {prop && (
        <ModaleProp prop={prop} estTitre={bloc.proprietes[0]?.id === prop.id}
          onMaj={(patch) => majProp(prop.id, patch)}
          onRetirer={() => retirerProp(prop.id)}
          onClose={() => setPropOuverte(null)} />
      )}
      {ligne && (
        <FicheLigne base={bloc} ligne={ligne} racineId={racineId}
          onValeurs={(valeurs) => majLigne(ligne.id, valeurs)}
          onBlocs={(blocs) => majBlocsLigne(ligne.id, blocs)}
          onRetirer={() => retirerLigne(ligne.id)}
          onClose={() => setLigneOuverte(null)} />
      )}
      {reglagesOuverts && (
        <ModaleReglages base={bloc} onMaj={maj} onClose={() => setReglagesOuverts(false)} />
      )}
    </div>
  );
}

export function BaseLecture({ bloc }) {
  const [vue, setVue] = useState(bloc.vue || 'table');
  const [ligneOuverte, setLigneOuverte] = useState(null);
  const lignes = filtrerEtTrier(bloc);
  const ligne = (bloc.lignes || []).find((l) => l.id === ligneOuverte);
  const Vue = COMPOSANT_VUE[vue] || VueTable;
  return (
    <div className="space-y-3 my-1">
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        {bloc.nom ? <span className="text-[19px] text-stone-900 min-h-[44px] flex items-center" style={SERIF}>{bloc.nom}</span> : <span />}
        <div className="self-start lg:self-auto max-w-full">
          <SwitchVues vue={vue} onVue={setVue} />
        </div>
      </div>
      <Vue base={bloc} lignes={lignes} edition={false} ouvrirLigne={setLigneOuverte} />
      {ligne && <FicheLigneLecture base={bloc} ligne={ligne} onClose={() => setLigneOuverte(null)} />}
    </div>
  );
}
