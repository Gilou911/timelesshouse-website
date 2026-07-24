/* ════════════════════════════════════════════════════════════
   📈  COMMUNICATION-CHARTS.JSX — GRAPHIQUES (chargés à la demande)
   ════════════════════════════════════════════════════════════
   Recharts pèse ~150 Ko. Il n'est utile QUE pour les clients dont
   l'option « Analyses réseaux sociaux » est active. Or l'immense
   majorité des clients (mariage, portrait…) ne voient jamais un
   graphique. Avant, Recharts était importé statiquement en haut de
   communication-app.jsx : tout le monde le téléchargeait au chargement.

   Ces trois composants isolent chaque graphique dans CE fichier. Côté
   app, ils sont chargés via React.lazy() → Rollup en fait un chunk
   séparé (communication-charts-[hash].js) qui n'est téléchargé que
   lorsqu'un graphique doit réellement s'afficher (donc jamais pour un
   client sans analyses). Le tableau de bord reste identique à l'écran.
   ════════════════════════════════════════════════════════════ */

import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ComposedChart, Bar, Line, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';

/** Dashboard — « Évolution de votre audience » (aire dégradée). */
export function AudienceAreaChart({ data, stroke }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.2} fill="url(#cgrad)" />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Analytics → Vue d'ensemble — « Reach & engagement par jour ». */
export function TimelineComposedChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d6cfc0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="r" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="e" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }} />
        <Bar yAxisId="r" dataKey="reach" fill="#2a2620" radius={[6, 6, 0, 0]} />
        <Line yAxisId="e" type="monotone" dataKey="engagements" stroke="#9ca3af" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** BudgetRing — anneau de consommation du budget publicitaire. */
export function BudgetPie({ data, tone }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} innerRadius={38} outerRadius={50} startAngle={90} endAngle={-270} dataKey="v" stroke="none">
          <Cell fill={tone} />
          <Cell fill="rgba(0,0,0,0.06)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
