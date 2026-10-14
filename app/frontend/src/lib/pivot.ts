/** Client-side pivot over a Genie result set (no re-query). */

export type Agg = 'sum' | 'avg' | 'min' | 'max';

export interface PivotSpec {
  rows: string[];
  cols: string[];
  values: string[];
  agg: Agg;
}

export interface PivotTable {
  header: string[];
  body: Array<Array<string | number | null>>;
  totals: Array<string | number | null> | null;
  colKeys: string[];
  rowFieldCount: number;
}

function aggregate(xs: number[], agg: Agg): number | null {
  if (!xs.length) return null;
  switch (agg) {
    case 'sum':
      return xs.reduce((a, b) => a + b, 0);
    case 'min':
      return Math.min(...xs);
    case 'max':
      return Math.max(...xs);
    default:
      return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
}

export function buildPivot(columns: string[], rows: Array<Array<string | null>>, spec: PivotSpec, withTotals = true): PivotTable | null {
  if (!spec.rows.length || !spec.values.length) return null;
  const idx = (c: string) => columns.indexOf(c);
  const rIdx = spec.rows.map(idx);
  const cIdx = spec.cols.map(idx);
  const vIdx = spec.values.map(idx);
  if ([...rIdx, ...cIdx, ...vIdx].some(i => i < 0)) return null;

  const cells = new Map<string, Map<string, number[]>>();
  const rowKeys: string[] = [];
  const colKeys: string[] = [];
  const seenRow = new Set<string>();
  const seenCol = new Set<string>();

  for (const r of rows) {
    const rk = rIdx.map(i => r[i] ?? '').join('\u0001');
    if (!seenRow.has(rk)) {
      seenRow.add(rk);
      rowKeys.push(rk);
    }
    for (let v = 0; v < vIdx.length; v++) {
      const base = cIdx.length ? cIdx.map(i => r[i] ?? '').join(' / ') : '';
      const ck = vIdx.length > 1 || !cIdx.length ? [base, spec.values[v]].filter(Boolean).join(' · ') : base;
      if (!seenCol.has(ck)) {
        seenCol.add(ck);
        colKeys.push(ck);
      }
      const x = Number(r[vIdx[v]]);
      if (!Number.isFinite(x)) continue;
      if (!cells.has(rk)) cells.set(rk, new Map());
      const m = cells.get(rk)!;
      if (!m.has(ck)) m.set(ck, []);
      m.get(ck)!.push(x);
    }
  }
  colKeys.sort();
  rowKeys.sort();

  const body = rowKeys.map(rk => [
    ...rk.split('\u0001'),
    ...colKeys.map(ck => aggregate(cells.get(rk)?.get(ck) || [], spec.agg)),
  ]);

  let totals: PivotTable['totals'] = null;
  if (withTotals && rowKeys.length > 1) {
    const totAgg: Agg = spec.agg === 'sum' ? 'sum' : spec.agg;
    totals = [
      'Grand total',
      ...Array(Math.max(0, spec.rows.length - 1)).fill(''),
      ...colKeys.map(ck => aggregate(rowKeys.flatMap(rk => cells.get(rk)?.get(ck) || []), totAgg)),
    ];
  }

  return { header: [...spec.rows, ...colKeys], body, totals, colKeys, rowFieldCount: spec.rows.length };
}
