/* ════════════════════════════════════════════════════════════
   🗃  BASE DE DONNÉES — le bloc « base » de l'espace perso
   ════════════════════════════════════════════════════════════
   Réplique des bases Notion, à l'échelle d'un espace personnel :
   des PROPRIÉTÉS typées (texte, nombre, case, sélection, date,
   image) et des LIGNES, regardées à travers trois VUES — Table
   (dense, édition en ligne), Liste (linéaire, titre d'abord),
   Galerie (cartes visuelles, aperçu = première propriété image).

   Tout vit DANS le jsonb du bloc : aucune migration, la RLS de la
   page protège déjà les données, l'autosave existant enregistre.
   Différence assumée avec Notion : une ligne est une fiche à
   propriétés, pas une page.

   Les jetons (neu, SERIF) et les atomes viennent de perso.jsx en
   liaisons vivantes ESM — la palette suit le thème sans Context.
   ════════════════════════════════════════════════════════════ */
import React, { useState, useRef } from 'react';
import {
  Table, List, LayoutGrid, Plus, Trash2, Square, CheckSquare,
  Loader2, Settings2, Image as ImageIcon,
} from 'lucide-react';
import {
  neu, SERIF, genId, Modal, Btn, Field, Input, Select,
  televerserImage,
} from './perso.jsx';

export const nouvelleBase = () => ({
  nom: '',
  vue: 'table',
  proprietes: [{ id: genId(), nom: 'Nom', type: 'texte' }],
  lignes: [{ id: genId(), valeurs: {} }],
});

const TYPES_PROP = [
  { type: 'texte',     label: 'Texte' },
  { type: 'nombre',    label: 'Nombre' },
  { type: 'case',      label: 'Case à cocher' },
  { type: 'selection', label: 'Sélection (pastille)' },
  { type: 'date',      label: 'Date' },
  { type: 'image',     label: 'Image' },
];

const VUES = [
  { id: 'table',   label: 'Table',   icon: Table },
  { id: 'liste',   label: 'Liste',   icon: List },
  { id: 'galerie', label: 'Galerie', icon: LayoutGrid },
];

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

/* ── Rail de vues — règle maison : conteneur en CREUX, actif sombre ── */
function SwitchVues({ vue, onVue }) {
  return (
    <div style={neu.pressed} className="rounded-full p-1 inline-flex items-center gap-1" role="tablist" aria-label="Vue de la base">
      {VUES.map(({ id, label, icon: Icon }) => {
        const actif = vue === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={actif} onClick={() => onVue(id)}
            style={actif ? neu.dark : undefined}
            className={`th-onglet min-h-[36px] px-3.5 rounded-full flex items-center gap-1.5 text-[12px] font-semibold ${actif ? 'text-white' : 'text-stone-500'}`}>
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Valeur en lecture (partagé par les trois vues) ── */
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
  if (prop.type === 'image') {
    return val ? <img src={val} alt="" loading="lazy" className="w-9 h-9 rounded-lg object-cover" /> : null;
  }
  return <span className={prop.type === 'nombre' ? 'tabular-nums' : ''}>{String(val ?? '')}</span>;
}

/* ── Cellule éditable (vue Table + fiche de ligne) ── */
function CelluleEdition({ prop, val, onVal, racineId, compact }) {
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
        className="bg-transparent text-[16px] sm:text-[13.5px] text-stone-800 w-full" style={{ minHeight: compact ? '36px' : undefined }} />
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
      } catch (_) { /* silencieux en cellule ; la fiche affiche mieux */ }
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
  return (
    <input
      value={val ?? ''}
      onChange={(e) => onVal(e.target.value)}
      inputMode={prop.type === 'nombre' ? 'decimal' : undefined}
      aria-label={prop.nom}
      placeholder=""
      className={`bg-transparent w-full text-[16px] sm:text-[13.5px] text-stone-800 ${prop.type === 'nombre' ? 'text-right tabular-nums' : ''}`}
    />
  );
}

/* ── Fiche d'une ligne — formulaire en COLONNE UNIQUE (règle maison) ── */
function ModaleLigne({ base, ligne, onValeurs, onRetirer, onClose, racineId }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title={titreDeLigne(base, ligne)} kicker={base.nom || 'Base'} onClose={onClose}>
      <div className="space-y-4">
        {base.proprietes.map((p) => (
          <Field key={p.id} label={p.nom}>
            {p.type === 'texte' && base.proprietes[0]?.id === p.id ? (
              <Input value={ligne.valeurs?.[p.id] ?? ''} onChange={(e) => onValeurs({ [p.id]: e.target.value })} />
            ) : (
              <div style={p.type === 'case' || p.type === 'image' ? undefined : neu.pressedSm}
                className={p.type === 'case' || p.type === 'image' ? '' : 'rounded-xl px-4 py-3'}>
                <CelluleEdition prop={p} val={ligne.valeurs?.[p.id]} racineId={racineId}
                  onVal={(v) => onValeurs({ [p.id]: v })} />
              </div>
            )}
          </Field>
        ))}
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

/* ── Réglage d'une propriété (nom, type, suppression) ── */
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

/* ════════════════════════════════════════════════════════════
   LES TROIS VUES
   ════════════════════════════════════════════════════════════ */
function VueTable({ base, edition, majLigne, ouvrirProp, ouvrirLigne, ajouterProp, racineId }) {
  return (
    <div style={neu.pressedSm} className="rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-left">
              {base.proprietes.map((p, i) => (
                <th key={p.id} className="px-3 py-2.5 font-semibold text-[11.5px] uppercase tracking-[0.08em] text-stone-500 whitespace-nowrap border-b border-stone-300/50"
                  style={{ minWidth: i === 0 ? '190px' : '140px' }}>
                  {edition ? (
                    <button type="button" onClick={() => ouvrirProp(p.id)}
                      className="min-h-[32px] inline-flex items-center gap-1.5 hover:text-stone-800 transition">
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
            {base.lignes.map((l) => (
              <tr key={l.id} className="group border-b border-stone-300/30 last:border-b-0">
                {base.proprietes.map((p) => (
                  <td key={p.id} className="px-3 py-2 align-middle">
                    {edition
                      ? <CelluleEdition prop={p} val={l.valeurs?.[p.id]} racineId={racineId}
                          onVal={(v) => majLigne(l.id, { [p.id]: v })} />
                      : <ValeurLecture prop={p} val={l.valeurs?.[p.id]} />}
                  </td>
                ))}
                {edition && (
                  <td className="px-2 py-2 w-12">
                    <button type="button" onClick={() => ouvrirLigne(l.id)} aria-label="Ouvrir la fiche"
                      className="w-8 h-8 tap-ext rounded-full flex items-center justify-center bg-white text-stone-500 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition active:scale-95">
                      <Settings2 size={13} />
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

function VueListe({ base, edition, ouvrirLigne }) {
  return (
    <div style={neu.pressedSm} className="rounded-2xl px-4 py-1">
      {base.lignes.map((l) => {
        const Contenu = (
          <>
            <span className="flex-1 min-w-0 text-[14.5px] font-medium text-stone-800 truncate">{titreDeLigne(base, l)}</span>
            <span className="flex items-center gap-3 flex-wrap justify-end">
              {propsSecondaires(base).slice(0, 4).map((p) => {
                const v = l.valeurs?.[p.id];
                if (v == null || v === '' || (p.type === 'case' && !v)) return null;
                return <span key={p.id} className="text-[12px] text-stone-500"><ValeurLecture prop={p} val={v} /></span>;
              })}
            </span>
          </>
        );
        return edition ? (
          <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)}
            className="w-full min-h-[44px] py-2 flex items-center gap-3 text-left border-b border-stone-300/30 last:border-b-0">
            {Contenu}
          </button>
        ) : (
          <div key={l.id} className="min-h-[44px] py-2 flex items-center gap-3 border-b border-stone-300/30 last:border-b-0">
            {Contenu}
          </div>
        );
      })}
    </div>
  );
}

function VueGalerie({ base, edition, ouvrirLigne }) {
  const pImage = propImage(base);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {base.lignes.map((l) => {
        const img = pImage ? l.valeurs?.[pImage.id] : null;
        const Carte = (
          <>
            {img ? (
              <img src={img} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-t-2xl" />
            ) : (
              <div className="w-full aspect-[4/3] rounded-t-2xl flex items-center justify-center text-stone-400" style={neu.pressedSm}>
                <ImageIcon size={18} />
              </div>
            )}
            <span className="block px-3.5 pt-2.5 pb-3.5 min-w-0">
              <span className="block text-[13.5px] font-medium text-stone-900 truncate">{titreDeLigne(base, l)}</span>
              {propsSecondaires(base).slice(0, 3).map((p) => {
                const v = l.valeurs?.[p.id];
                if (v == null || v === '' || (p.type === 'case' && !v)) return null;
                return (
                  <span key={p.id} className="block text-[11.5px] text-stone-500 mt-1 truncate">
                    <ValeurLecture prop={p} val={v} />
                  </span>
                );
              })}
            </span>
          </>
        );
        return edition ? (
          <button key={l.id} type="button" onClick={() => ouvrirLigne(l.id)} style={neu.raisedSm}
            className="th-press rounded-2xl text-left overflow-hidden">
            {Carte}
          </button>
        ) : (
          <div key={l.id} style={neu.raisedSm} className="rounded-2xl overflow-hidden">
            {Carte}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ÉDITION & LECTURE
   ════════════════════════════════════════════════════════════ */
export function BaseEditeur({ bloc, onChange, racineId }) {
  const maj = (patch) => onChange({ ...bloc, ...patch });
  const [propOuverte, setPropOuverte] = useState(null);   // id de propriété
  const [ligneOuverte, setLigneOuverte] = useState(null); // id de ligne

  const majLigne = (id, valeurs) => maj({
    lignes: bloc.lignes.map((l) => (l.id === id ? { ...l, valeurs: { ...l.valeurs, ...valeurs } } : l)),
  });
  const ajouterLigne = () => {
    const l = { id: genId(), valeurs: {} };
    maj({ lignes: [...bloc.lignes, l] });
    if (bloc.vue !== 'table') setLigneOuverte(l.id);
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
  const Vue = bloc.vue === 'liste' ? VueListe : bloc.vue === 'galerie' ? VueGalerie : VueTable;

  return (
    <div className="space-y-3 my-1">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input value={bloc.nom || ''} onChange={(e) => maj({ nom: e.target.value })}
          placeholder="Nom de la base" aria-label="Nom de la base"
          className="bg-transparent text-[19px] text-stone-900 min-w-0 flex-1" style={SERIF} />
        <SwitchVues vue={bloc.vue} onVue={(vue) => maj({ vue })} />
      </div>

      <Vue base={bloc} edition majLigne={majLigne} racineId={racineId}
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
        <ModaleLigne base={bloc} ligne={ligne} racineId={racineId}
          onValeurs={(valeurs) => majLigne(ligne.id, valeurs)}
          onRetirer={() => retirerLigne(ligne.id)}
          onClose={() => setLigneOuverte(null)} />
      )}
    </div>
  );
}

export function BaseLecture({ bloc }) {
  // La vue enregistrée par l'éditeur, basculable localement par le
  // lecteur — son choix ne s'enregistre pas.
  const [vue, setVue] = useState(bloc.vue || 'table');
  const Vue = vue === 'liste' ? VueListe : vue === 'galerie' ? VueGalerie : VueTable;
  return (
    <div className="space-y-3 my-1">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {bloc.nom ? <span className="text-[19px] text-stone-900" style={SERIF}>{bloc.nom}</span> : <span />}
        <SwitchVues vue={vue} onVue={setVue} />
      </div>
      <Vue base={bloc} edition={false} />
    </div>
  );
}
