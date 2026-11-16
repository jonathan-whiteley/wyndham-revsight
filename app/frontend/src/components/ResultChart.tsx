import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Column } from '../lib/api';
import { ChartDecision, chooseChart, compareX } from '../lib/chartPolicy';
import { ColumnKind, columnKind, formatValue, prettyLabel } from '../lib/format';

const COLORS = ['#016fb7', '#0d2c54', '#2b93d6', '#7fb8e0', '#9CA3AF', '#015a94'];
const TICK = { fontSize: 11, fill: '#6B7280' };
const MAX_POINTS = 2000;

interface Props {
  columns: Column[];
  rows: Array<Array<string | null>>;
}

export interface ChartSpec {
  decision: ChartDecision;
  data: Array<Record<string, string | number | null>>;
  /** Plotted keys: measure names, or the series column's values when the chart is split by series. */
  series: string[];
  kinds: Record<string, ColumnKind>;
  xKind: ColumnKind;
}

function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Chart spec from the chart policy, or null when the result reads best as a table. */
export function buildChartSpec(columns: Column[], rows: Array<Array<string | null>>): ChartSpec | null {
  const decision = chooseChart(columns, rows);
  // No map renderer here (the demo data has no coordinates): those results read best as a table.
  if (decision.type === 'table' || decision.type === 'map') return null;
  const at = (n?: string) => columns.findIndex(c => c.name === n);
  const kinds = Object.fromEntries(columns.map(c => [c.name, columnKind(c.name, c.type)]));
  const xI = at(decision.x);
  const xKind = xI >= 0 ? kinds[columns[xI].name] : 'text';
  const sample = rows.slice(0, MAX_POINTS);

  if (decision.type === 'kpi' || decision.type === 'scatter') {
    const data = sample.map(r => Object.fromEntries(columns.map((c, i) => [c.name, decision.measures.includes(c.name) ? toNumber(r[i]) : r[i]])));
    return { decision, data, series: decision.measures, kinds, xKind };
  }

  // Pivot to one record per X value: keys are the measures, or the series column's values.
  const seriesI = at(decision.series);
  const measureIs = decision.measures.map(at);
  const keys = new Set<string>();
  const byX = new Map<string, Record<string, string | number | null>>();
  for (const r of sample) {
    const x = String(r[xI] ?? '');
    if (!byX.has(x)) byX.set(x, { x });
    const rec = byX.get(x)!;
    if (seriesI >= 0) {
      const s = String(r[seriesI] ?? '');
      keys.add(s);
      rec[s] = toNumber(r[measureIs[0]]);
    } else {
      measureIs.forEach(i => {
        keys.add(columns[i].name);
        rec[columns[i].name] = toNumber(r[i]);
      });
    }
  }
  let data = [...byX.values()];
  const first = [...keys][0];
  if (decision.xRole === 'time' || decision.xRole === 'period') {
    data.sort((a, b) => compareX(String(a.x), String(b.x)));
  } else if (decision.type === 'bar' || decision.type === 'hbar') {
    data.sort((a, b) => Number(b[first] ?? 0) - Number(a[first] ?? 0));
  }
  if (decision.topN) data = data.slice(0, decision.topN);
  return { decision, data, series: [...keys], kinds, xKind };
}

function numberFormat(kind: ColumnKind) {
  return (v: number) => {
    if (kind === 'percent') return formatValue(v, 'percent');
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(kind === 'currency' ? { style: 'currency', currency: 'USD' } : {}),
    }).format(v);
  };
}

function Kpis({ spec }: { spec: ChartSpec }) {
  const row = spec.data[0] ?? {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {spec.series.map(m => (
        <div key={m} className="rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-text-tertiary">{prettyLabel(m)}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{formatValue(row[m], spec.kinds[m])}</p>
        </div>
      ))}
    </div>
  );
}

export default function ResultChart({ columns, rows }: Props) {
  const spec = useMemo(() => buildChartSpec(columns, rows), [columns, rows]);

  if (!spec) {
    const why = chooseChart(columns, rows);
    return <p className="text-xs text-text-tertiary p-4">This result reads best as a table{why.type === 'map' ? ' (it has coordinates; no map view here)' : `: ${why.reason.charAt(0).toLowerCase()}${why.reason.slice(1)}`}.</p>;
  }
  const { decision, data, series, kinds, xKind } = spec;
  if (decision.type === 'kpi') return <Kpis spec={spec} />;

  // Series named after a category value take the measure's unit.
  const unitOf = (key: string) => kinds[key] ?? kinds[decision.measures[0]];
  const fmtX = (v: string) => formatValue(v, xKind);
  const tooltip = <Tooltip formatter={(v: number, key: string) => (v === null || v === undefined ? '' : formatValue(v, unitOf(key)))} labelFormatter={fmtX} />;
  const legend = series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (kinds[v] ? prettyLabel(v) : v)} />;
  const grid = <CartesianGrid stroke="#F0F1F2" vertical={decision.type === 'scatter'} horizontal={decision.type !== 'hbar'} />;
  const height = decision.type === 'hbar' ? Math.max(288, data.length * 26 + 40) : 288;

  let chart: JSX.Element;
  switch (decision.type) {
    case 'scatter': {
      const [xKey, yKey] = decision.measures;
      chart = (
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 16 }}>
          {grid}
          <XAxis type="number" dataKey={xKey} name={prettyLabel(xKey)} domain={['auto', 'auto']} tickFormatter={numberFormat(unitOf(xKey))} tick={TICK} tickLine={false} axisLine={false} label={{ value: prettyLabel(xKey), position: 'insideBottom', offset: -4, fontSize: 11, fill: '#6B7280' }} />
          <YAxis type="number" dataKey={yKey} name={prettyLabel(yKey)} domain={['auto', 'auto']} tickFormatter={numberFormat(unitOf(yKey))} tick={TICK} tickLine={false} axisLine={false} width={64} label={{ value: prettyLabel(yKey), angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }} />
          <ZAxis range={[40, 40]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={COLORS[0]} />
        </ScatterChart>
      );
      break;
    }
    case 'hbar':
      chart = (
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          {grid}
          <XAxis type="number" tickFormatter={numberFormat(unitOf(series[0]))} tick={TICK} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="x" tickFormatter={fmtX} tick={TICK} tickLine={false} axisLine={false} width={120} interval={0} />
          {tooltip}
          {series.map((s, i) => (
            <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
          ))}
        </BarChart>
      );
      break;
    case 'combo': {
      // Bars on the left axis, lines (usually a percent) on the right.
      const lineKeys = decision.lineMeasures ?? series.slice(-1);
      const barKeys = series.filter(s => !lineKeys.includes(s));
      const BAR_COLORS = [COLORS[0], COLORS[4], COLORS[3], COLORS[5]];
      const LINE_COLORS = [COLORS[1], COLORS[2]];
      const dot = data.length <= 12 ? { r: 3 } : false;
      chart = (
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          {grid}
          <XAxis dataKey="x" tickFormatter={fmtX} tick={TICK} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickFormatter={numberFormat(unitOf(barKeys[0]))} tick={TICK} tickLine={false} axisLine={false} width={64} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={numberFormat(unitOf(lineKeys[0]))} tick={TICK} tickLine={false} axisLine={false} width={56} />
          {tooltip}
          {legend}
          {barKeys.map((k, i) => (
            <Bar key={k} yAxisId="left" dataKey={k} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
          {lineKeys.map((k, i) => (
            <Line key={k} yAxisId="right" type="monotone" dataKey={k} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={dot} />
          ))}
        </ComposedChart>
      );
      break;
    }
    case 'line':
      chart = (
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          {grid}
          <XAxis dataKey="x" tickFormatter={fmtX} tick={TICK} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={numberFormat(unitOf(series[0]))} tick={TICK} tickLine={false} axisLine={false} width={64} />
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      );
      break;
    default: // bar, grouped-bar, stacked-bar
      chart = (
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          {grid}
          <XAxis dataKey="x" tickFormatter={fmtX} tick={TICK} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={numberFormat(unitOf(series[0]))} tick={TICK} tickLine={false} axisLine={false} width={64} />
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} stackId={decision.type === 'stacked-bar' ? 'stack' : undefined} radius={decision.type === 'stacked-bar' ? 0 : [4, 4, 0, 0]} />
          ))}
        </BarChart>
      );
  }

  return (
    <div className="space-y-1">
      <div className="rounded-xl border border-gray-100 p-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {decision.topN && <p className="text-[11px] text-text-tertiary">Top {decision.topN} by {prettyLabel(decision.measures[0])}. Switch to the table for every row.</p>}
    </div>
  );
}
