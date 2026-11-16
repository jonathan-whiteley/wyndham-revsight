/** Deterministic chart selection for a Genie query result (schema + rows), used when someone opens the chart view.
 *
 *  Ported from genie-one-mcp-app (frontend/src/lib/chartPolicy.ts @ accd5a7). Genie's own chart
 *  (enable_visualization) is a rendered PNG, not a spec, so this app draws its own from these rules. They're
 *  framework-free: the decision names columns by role, and any charting library can draw it. Tune the thresholds
 *  in LIMITS; everything else follows from them. defaultView is ignored here: the table is always shown first. */
import { ColumnKind, columnKind, isNumericKind } from './format';

export interface PolicyColumn {
  name: string;
  type?: string;
}

export type ChartType = 'table' | 'kpi' | 'line' | 'bar' | 'hbar' | 'grouped-bar' | 'stacked-bar' | 'combo' | 'scatter' | 'map';
export type Role = 'time' | 'period' | 'category' | 'measure' | 'lat' | 'lon';

export interface ChartDecision {
  type: ChartType;
  /** Show the chart first, or the table first with the chart one click away. */
  defaultView: 'chart' | 'table';
  /** X axis (or category axis for hbar). */
  x?: string;
  /** Role of the X column: time and period axes sort chronologically, category bars by value. */
  xRole?: Role;
  /** Column whose values become separate lines or bar segments. */
  series?: string;
  /** Measures to plot, in order. */
  measures: string[];
  /** Combo only: measures drawn as lines on a second axis. The other measures are bars. */
  lineMeasures?: string[];
  /** Plot only the top N categories by the first measure. */
  topN?: number;
  /** Plain-English reason, worth logging next to the Genie response for tuning. */
  reason: string;
}

export const LIMITS = {
  maxDimensions: 2, // more grouping columns than this: table
  maxMeasures: 4, // more numeric columns than this: table
  maxColumnsForChartFirst: 4, // wider results default to the table view
  maxBars: 20, // more categories than this: table first, chart shows the top N
  topN: 15,
  maxSeries: 6, // more lines or stack segments than this: table
  maxGroupedBars: 12, // categories in a grouped (side-by-side) bar
  hbarAbove: 8, // switch to horizontal bars past this many categories
  hbarLabelChars: 12, // or when the average label is this long
};

const LAT = /^(lat|latitude)$|_(lat|latitude)$/i;
const LON = /^(lon|lng|long|longitude)$|_(lon|lng|long|longitude)$/i;
// Identifiers are labels, never measures: store_number 1619 is not a quantity.
const ID = /(^|_)(id|key|number|num|nbr|no|code|zip|zipcode|postal_code|store|site|location)$/i;
const PERIOD_NAME = /^(fiscal_)?(year|quarter|period|week|week_of_year)(_name|_label|_id)?$/i;
// The period letter is required: a bare 5 or 6 digit number is a measure (net sales of 50000), not a period.
const PERIOD_VALUE = /^\d{4}\s*[-–]?\s*(P|Q|W|M|FP|FW)\d{1,2}$/i; // 2026-P6, 2026 - P10, 2026Q3, 2026-W14

/** FiscalPeriodName and NetSales match the same rules as fiscal_period_name and net_sales. */
function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Sort key that orders fiscal periods correctly (2026-P2 before 2026-P11), falling back to the raw string. */
export function periodSortKey(v: string | null | undefined): number | string {
  const s = String(v ?? '');
  const m = s.match(/^(\d{4})\D*(\d{1,2})$/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : s;
}

export function compareX(a: string | null | undefined, b: string | null | undefined): number {
  const ka = periodSortKey(a);
  const kb = periodSortKey(b);
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export function columnRole(col: PolicyColumn, values: Array<string | null>): Role {
  const name = snake(col.name);
  const kind = columnKind(name, col.type);
  const present = values.filter((v): v is string => v !== null && v !== '');
  const numeric = isNumericKind(kind) || (present.length > 0 && present.every(v => Number.isFinite(Number(v))));
  if (numeric && LAT.test(name)) return 'lat';
  if (numeric && LON.test(name)) return 'lon';
  if (kind === 'date') return 'time';
  if (PERIOD_NAME.test(name) || (!numeric && present.length > 0 && present.every(v => PERIOD_VALUE.test(v)))) return 'period';
  if (numeric && !ID.test(name)) return 'measure';
  return 'category';
}

/** Coarse unit for deciding whether two measures can share an axis. */
function unit(col: PolicyColumn): ColumnKind {
  const k = columnKind(snake(col.name), col.type);
  return k === 'integer' || k === 'decimal' ? 'decimal' : k;
}

function distinct(rows: Array<Array<string | null>>, i: number): number {
  return new Set(rows.map(r => r[i])).size;
}

/** Bars and lines for measures in exactly two units: a percent goes on the line, otherwise the smaller group does.
 *  Null when the measures share one unit or span more than two. */
function splitUnits(columns: PolicyColumn[], measures: number[]): { bars: string[]; lines: string[] } | null {
  const groups = new Map<ColumnKind, string[]>();
  for (const i of measures) groups.set(unit(columns[i]), [...(groups.get(unit(columns[i])) ?? []), columns[i].name]);
  if (groups.size !== 2) return null;
  const [[ka, a], [kb, b]] = [...groups.entries()];
  const aIsLine = ka === 'percent' || (kb !== 'percent' && a.length < b.length);
  return aIsLine ? { bars: b, lines: a } : { bars: a, lines: b };
}

export function chooseChart(columns: PolicyColumn[], rows: Array<Array<string | null>>): ChartDecision {
  const table = (reason: string): ChartDecision => ({ type: 'table', defaultView: 'table', measures: [], reason });
  if (!rows.length || !columns.length) return table('No rows');

  const roles = columns.map((c, i) => columnRole(c, rows.map(r => r[i])));
  const idx = (r: Role) => roles.map((x, i) => (x === r ? i : -1)).filter(i => i >= 0);
  const name = (i: number) => columns[i].name;
  const measures = idx('measure');
  // A label next to its key (FiscalPeriodName + PeriodID, store_name + store_number) is one dimension, not two.
  const sameDimension = (a: number, b: number) => distinct(rows, a) === distinct(rows, b) && new Set(rows.map(r => `${r[a]}\u0000${r[b]}`)).size === distinct(rows, a);
  const isNumeric = (i: number) => rows.every(r => r[i] === null || Number.isFinite(Number(r[i])));
  const dedupe = (is: number[]) =>
    is
      .slice()
      .sort((a, b) => Number(isNumeric(a)) - Number(isNumeric(b))) // keep readable labels over numeric keys
      .filter((i, k, all) => !all.slice(0, k).some(j => sameDimension(i, j)));
  // A column with one value in every row is a filter (Store 1619 on each row), not something to group by.
  const varies = (i: number) => rows.length === 1 || distinct(rows, i) > 1;
  const times = dedupe([...idx('time'), ...idx('period')]).filter(varies);
  const cats = dedupe(idx('category')).filter(varies);
  // Wide results open on the table. Count only what would be charted, not filters or duplicate keys.
  const chartFirst = times.length + cats.length + measures.length <= LIMITS.maxColumnsForChartFirst ? 'chart' : 'table';
  const decide = (d: Omit<ChartDecision, 'defaultView'>, view: 'chart' | 'table' = chartFirst): ChartDecision => ({
    ...d,
    xRole: d.x ? roles[columns.findIndex(c => c.name === d.x)] : undefined,
    defaultView: view,
  });

  const lat = idx('lat')[0];
  const lon = idx('lon')[0];
  if (lat !== undefined && lon !== undefined) {
    return decide({ type: 'map', x: cats[0] !== undefined ? name(cats[0]) : undefined, measures: [name(lat), name(lon), ...measures.slice(0, 1).map(name)], reason: 'Latitude and longitude columns' }, 'chart');
  }
  if (!measures.length) return table('No numeric measure to plot');
  if (rows.length === 1 && measures.length <= LIMITS.maxMeasures) {
    return decide({ type: 'kpi', measures: measures.map(name), reason: 'Single row: show the numbers as tiles' }, 'chart');
  }
  const dims = times.length + cats.length;
  if (dims > LIMITS.maxDimensions) return table(`${dims} grouping columns; too many to chart clearly`);
  if (measures.length > LIMITS.maxMeasures) return table(`${measures.length} numeric columns; too many to chart clearly`);

  const split = splitUnits(columns, measures);
  const sameUnit = new Set(measures.map(i => unit(columns[i]))).size === 1;
  const combo = (x: string, reason: string) => decide({ type: 'combo', x, measures: [...split!.bars, ...split!.lines], lineMeasures: split!.lines, reason });

  // Time on the X axis
  if (times.length === 1) {
    const x = name(times[0]);
    if (cats.length === 0) {
      if (split) return combo(x, 'Trend of measures in two units (bars + line on a second axis)');
      if (sameUnit) return decide({ type: 'line', x, measures: measures.map(name), reason: 'Trend over time' });
      return table('Trend with measures in more than two units');
    }
    if (measures.length === 1 && distinct(rows, cats[0]) <= LIMITS.maxSeries) {
      return decide({ type: 'line', x, series: name(cats[0]), measures: [name(measures[0])], reason: 'Trend over time, one line per category' });
    }
    return table('Trend split by too many categories or measures');
  }
  if (times.length === 2) return table('Two time columns');

  // One category
  if (cats.length === 1) {
    const x = name(cats[0]);
    const n = distinct(rows, cats[0]);
    const avgLabel = rows.reduce((s, r) => s + String(r[cats[0]] ?? '').length, 0) / rows.length;
    const horizontal = n > LIMITS.hbarAbove || avgLabel > LIMITS.hbarLabelChars;
    if (measures.length === 1) {
      if (n > LIMITS.maxBars) return decide({ type: 'hbar', x, measures: [name(measures[0])], topN: LIMITS.topN, reason: `${n} categories: table first, chart shows the top ${LIMITS.topN}` }, 'table');
      return decide({ type: horizontal ? 'hbar' : 'bar', x, measures: [name(measures[0])], reason: 'Compare one measure across categories' });
    }
    if (split && n <= LIMITS.maxGroupedBars) return combo(x, 'Measures in two units per category (bars + line on a second axis)');
    if (sameUnit && n <= LIMITS.maxGroupedBars) return decide({ type: 'grouped-bar', x, measures: measures.map(name), reason: 'Compare a few same-unit measures across categories' });
    return table(`${measures.length} measures across ${n} categories`);
  }

  // Two categories: stack the smaller one inside the larger one
  if (cats.length === 2 && measures.length === 1) {
    const [a, b] = cats.map(i => ({ i, n: distinct(rows, i) })).sort((p, q) => q.n - p.n);
    if (a.n <= LIMITS.maxBars && b.n <= LIMITS.maxSeries) {
      return decide({ type: 'stacked-bar', x: name(a.i), series: name(b.i), measures: [name(measures[0])], reason: 'One measure split by two categories' });
    }
    return table('Two categories with too many combinations');
  }

  // Measures only
  if (dims === 0 && measures.length >= 2) {
    return decide({ type: 'scatter', measures: measures.slice(0, 2).map(name), reason: 'Relationship between two measures' });
  }
  return table('No chart rule matched');
}
