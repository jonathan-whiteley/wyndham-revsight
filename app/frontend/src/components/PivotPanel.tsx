import { DragEvent, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Grid3x3, Loader2, X } from 'lucide-react';
import { Turn } from '../lib/genie';
import { Field } from '../lib/api';
import { Agg, buildPivot, PivotSpec, PivotTable } from '../lib/pivot';
import { columnKind, formatValue, isNumericKind, prettyLabel } from '../lib/format';

export type Zone = 'rows' | 'cols' | 'values';

export interface Placement {
  field: Field;
  zone: Zone;
}

interface Props {
  turn: Turn | null;
  fields: Field[];
  busy: boolean;
  /** Fields dropped that the current result doesn't have yet; placed once Genie's re-query lands. */
  placements: Placement[];
  onRequestField: (p: Placement) => void;
  onPlacementsApplied: () => void;
  onExport: (pivot: { spec: PivotSpec; table: PivotTable } | null) => Promise<void>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Match a metric-view field to a result column; Genie often aliases (avg_rgi, market_name, total_room_revenue). */
export function matchColumn(columns: { name: string }[], name: string, label = ''): string | null {
  const targets = [norm(name), norm(label)].filter(Boolean);
  const exact = columns.find(c => targets.includes(norm(c.name)));
  if (exact) return exact.name;
  const n = norm(name);
  const loose = columns
    .filter(c => {
      const cn = norm(c.name);
      // "revpar" must not grab "comp_revpar" (and vice versa)
      if (cn.includes('comp') !== n.includes('comp')) return false;
      return cn.startsWith(n) || cn.endsWith(n);
    })
    .sort((a, b) => a.name.length - b.name.length);
  return loose[0]?.name || null;
}

/** Guess a sensible starting layout: text dims in rows, a date/week column across, first measure as values. */
function defaultSpec(cols: { name: string; type: string }[]): PivotSpec {
  const kinds = cols.map(c => columnKind(c.name, c.type));
  const dateCol = cols.find((_, i) => kinds[i] === 'date' || cols[i].name === 'year');
  const textCols = cols.filter((c, i) => kinds[i] === 'text' && c !== dateCol);
  const measure = cols.find((c, i) => isNumericKind(kinds[i]) && !/^(year|quarter)$/.test(c.name));
  return {
    rows: textCols.slice(0, 2).map(c => c.name),
    cols: dateCol ? [dateCol.name] : [],
    values: measure ? [measure.name] : [],
    agg: /(rgi|mpi|ari|revpar|adr|occupancy)/.test(measure?.name || '') ? 'avg' : 'sum',
  };
}

export default function PivotPanel({ turn, fields, busy: genieBusy, placements, onRequestField, onPlacementsApplied, onExport }: Props) {
  const r = turn?.result;
  const columns = r?.columns || [];
  const [spec, setSpec] = useState<PivotSpec>({ rows: [], cols: [], values: [], agg: 'avg' });
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<Zone | null>(null);
  const [miss, setMiss] = useState('');

  // New result: keep the fields already placed that still exist, else guess a layout; then place dropped fields.
  useEffect(() => {
    if (!r) return;
    setSpec(prev => {
      const has = (n: string) => r.columns.some(c => c.name === n);
      const kept = { ...prev, rows: prev.rows.filter(has), cols: prev.cols.filter(has), values: prev.values.filter(has) };
      const next = kept.rows.length && kept.values.length ? kept : defaultSpec(r.columns);
      for (const p of placements) {
        const col = matchColumn(r.columns, p.field.name, p.field.label);
        if (!col) continue;
        (['rows', 'cols', 'values'] as Zone[]).forEach(z => (next[z] = next[z].filter(x => x !== col)));
        next[p.zone] = [...next[p.zone], col];
      }
      return { ...next };
    });
    if (placements.length) onPlacementsApplied();
  }, [turn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useMemo(() => (r ? buildPivot(columns.map(c => c.name), r.rows, spec) : null), [r, spec, columns]);
  const used = new Set([...spec.rows, ...spec.cols, ...spec.values]);
  const valueKind = columnKind(spec.values[0] || '');

  const add = (zone: Zone, name: string) => {
    if (!columns.some(c => c.name === name)) return;
    setSpec(s => ({
      ...s,
      rows: s.rows.filter(x => x !== name),
      cols: s.cols.filter(x => x !== name),
      values: s.values.filter(x => x !== name),
      [zone]: [...s[zone].filter(x => x !== name), name],
    }));
  };
  const remove = (zone: Zone, name: string) => setSpec(s => ({ ...s, [zone]: s[zone].filter(x => x !== name) }));
  const onDrop = (zone: Zone) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    setMiss('');
    const name = e.dataTransfer.getData('text/column') || e.dataTransfer.getData('text/plain');
    const field = fields.find(f => f.name === name);
    // Already in this result: re-shape locally, no re-query.
    const col = matchColumn(columns, name, field?.label);
    if (col) return add(zone, col);
    // Not in the result yet: ask Genie to add it, then drop it into this zone when the answer lands.
    if (!field) return;
    if (genieBusy) return setMiss(`Genie is still answering; drop ${field.label} again in a moment.`);
    onRequestField({ field, zone });
  };

  const zoneBox = (zone: Zone, label: string) => (
    <div>
      <p className="font-medium text-text-secondary mb-1.5">{label}</p>
      <div
        onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (over !== zone) setOver(zone);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={onDrop(zone)}
        className={`min-h-[40px] rounded-xl border-2 border-dashed p-2 flex flex-wrap gap-1.5 transition-colors ${
          over === zone ? 'border-wyndham-blue bg-wyndham-blue/10' : zone === 'values' ? 'border-wyndham-blue/40 bg-wyndham-blue/5' : 'border-gray-200'
        }`}
      >
        {spec[zone].map(n => (
          <span key={n} className={`px-2.5 py-1 rounded-lg text-white flex items-center gap-1 ${zone === 'values' ? 'bg-wyndham-navy' : 'bg-wyndham-blue'}`}>
            {prettyLabel(n)}
            <button onClick={() => remove(zone, n)} aria-label={`Remove ${n}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {placements.filter(p => p.zone === zone).map(p => (
          <span key={p.field.name} className="px-2.5 py-1 rounded-lg border border-dashed border-wyndham-blue text-wyndham-blue flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {p.field.label}
          </span>
        ))}
        {!spec[zone].length && !placements.some(p => p.zone === zone) && <span className="text-text-tertiary px-1 py-1">drop a field</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 sticky top-24">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-wyndham-blue/10 flex items-center justify-center text-wyndham-blue">
          <Grid3x3 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold">Pivot</h3>
          <p className="text-xs text-text-secondary">Re-shape instantly, no re-query</p>
        </div>
      </div>

      <div className="space-y-3 text-xs">
        {zoneBox('rows', 'Rows')}
        {zoneBox('cols', 'Columns')}
        {zoneBox('values', 'Values')}
      </div>
      {miss && <p className="text-[11px] text-amber-600 mt-2">{miss}</p>}
      <p className="text-[11px] text-text-tertiary mt-2">
        Drag any field from the left. Fields already in the answer re-shape instantly; new ones are fetched by Genie, then dropped in place.
      </p>

      {r && (
        <>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {columns.filter(c => !used.has(c.name)).map(c => (
              <button
                key={c.name}
                draggable
                onDragStart={e => e.dataTransfer.setData('text/column', c.name)}
                onClick={() => add(isNumericKind(columnKind(c.name, c.type)) && !/^(year|quarter)$/.test(c.name) ? 'values' : 'rows', c.name)}
                className="px-2 py-0.5 rounded-md bg-surface-secondary text-text-secondary hover:text-wyndham-blue"
              >
                + {prettyLabel(c.name)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="text-text-secondary">Aggregate</span>
            <select value={spec.agg} onChange={e => setSpec(s => ({ ...s, agg: e.target.value as Agg }))} className="px-2 py-1 rounded-lg bg-surface-secondary outline-none">
              <option value="avg">Avg</option>
              <option value="sum">Sum</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>

          <p className="text-xs font-medium text-text-secondary mt-4 mb-1.5">Preview</p>
          <div className="overflow-auto max-h-80 rounded-xl border border-gray-100">
            {table ? (
              <table className="w-full text-[11px]">
                <thead className="bg-surface-secondary text-text-secondary sticky top-0">
                  <tr>
                    {table.header.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 font-medium whitespace-nowrap ${i < table.rowFieldCount ? 'text-left' : 'text-right'}`}>
                        {i < table.rowFieldCount ? prettyLabel(h) : formatValue(h, columnKind(spec.cols[0] || '')) || h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {table.body.slice(0, 60).map((row, j) => (
                    <tr key={j}>
                      {row.map((v, k) => (
                        <td key={k} className={`px-2 py-1.5 whitespace-nowrap ${k < table.rowFieldCount ? '' : 'text-right tabular-nums'}`}>
                          {k < table.rowFieldCount ? v : formatValue(v, valueKind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.totals && (
                    <tr className="bg-gray-50 font-medium">
                      {table.totals.map((v, k) => (
                        <td key={k} className={`px-2 py-1.5 whitespace-nowrap ${k < table.rowFieldCount ? '' : 'text-right tabular-nums'}`}>
                          {k < table.rowFieldCount ? v : formatValue(v, valueKind)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <p className="p-3 text-text-tertiary text-xs">Add at least one Row and one Value.</p>
            )}
          </div>
          {table && table.body.length > 60 && <p className="text-[11px] text-text-tertiary mt-1">Preview shows 60 of {table.body.length} rows; export includes all.</p>}

          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport(table ? { spec, table } : null);
              } finally {
                setBusy(false);
              }
            }}
            className="w-full mt-4 py-3 rounded-xl wyndham-gradient text-white text-sm font-medium flex items-center justify-center gap-2 shadow-soft disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Export to Excel
          </button>
          <p className="text-[11px] text-text-tertiary mt-2 text-center">Pivot · Data · Query sheets (question, SQL, data as of)</p>
        </>
      )}
    </div>
  );
}
