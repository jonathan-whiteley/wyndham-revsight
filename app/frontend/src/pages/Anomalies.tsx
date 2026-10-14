import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Anomaly, AnomalySeries, apiClient, ModelKey } from '../lib/api';
import { formatDate, formatValue } from '../lib/format';

interface Props {
  models: { key: ModelKey; agent_name: string }[];
  onInvestigate: (model: ModelKey, question: string) => void;
  onCount: (n: number) => void;
}

const SEV_STYLE: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-gray-100 text-gray-700',
};
const CAT_STYLE: Record<string, string> = { performance: 'bg-blue-50 text-blue-700', data_quality: 'bg-amber-50 text-amber-700' };
const CAT_LABEL: Record<string, string> = { performance: 'Performance', data_quality: 'Data quality' };
const TYPE_LABEL: Record<string, string> = {
  rgi_drop: 'RGI drop vs comp set',
  baseline_deviation: 'RevPAR vs market baseline',
  implausible_value: 'Implausible value',
  capacity_violation: 'Capacity violation',
  missing_data: 'Missing NT data',
};

/** Observed/expected rendered in the anomaly's own unit. */
function metricValue(a: Anomaly, v: number | null): string {
  if (v === null || v === undefined) return 'n/a';
  switch (a.metric) {
    case 'room_revenue':
      return formatValue(v, 'currency');
    case 'rgi':
      return formatValue(v, 'index');
    case 'revpar_vs_market':
      return `${v.toFixed(2)}x market`;
    case 'nt_rows':
      return `${Math.round(v).toLocaleString()} rows`;
    default:
      return Math.round(v).toLocaleString();
  }
}

function windowLabel(a: Anomaly) {
  return a.start_date === a.end_date ? formatDate(a.start_date, false) : `${formatDate(a.start_date, false)} to ${formatDate(a.end_date, false)}`;
}

function Sparkline({ s }: { s?: AnomalySeries }) {
  if (!s) return <div className="w-[110px] h-8 rounded bg-surface-secondary animate-pulse" />;
  return (
    <div className="w-[110px] h-8">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={s.series}>
          <YAxis hide domain={['auto', 'auto']} scale={s.series.some(p => (p.value || 0) > 50 * (p.expected || Infinity)) ? 'log' : 'auto'} />
          <Line type="monotone" dataKey="value" stroke="#016fb7" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Anomalies({ models, onInvestigate, onCount }: Props) {
  const [items, setItems] = useState<Anomaly[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, AnomalySeries>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [cat, setCat] = useState<'all' | 'performance' | 'data_quality'>('all');
  const [sev, setSev] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [region, setRegion] = useState('all');

  useEffect(() => {
    apiClient
      .getAnomalies()
      .then(a => {
        setItems(a);
        onCount(a.length);
        setSelected(a[0]?.anomaly_id || null);
        a.forEach(x => apiClient.getAnomalySeries(x.anomaly_id).then(s => setSeries(prev => ({ ...prev, [x.anomaly_id]: s }))).catch(() => undefined));
      })
      .catch(e => setError(String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const regions = useMemo(() => [...new Set((items || []).map(a => a.region).filter(Boolean))] as string[], [items]);
  const shown = (items || []).filter(a => (cat === 'all' || a.category === cat) && (sev === 'all' || a.severity === sev) && (region === 'all' || a.region === region));
  const sel = (items || []).find(a => a.anomaly_id === selected) || null;
  const selSeries = sel ? series[sel.anomaly_id] : undefined;
  const count = (f: (a: Anomaly) => boolean) => (items || []).filter(f).length;
  const agentName = (m: ModelKey) => models.find(x => x.key === m)?.agent_name || 'Genie';

  if (error) return <div className="bg-red-50 text-red-700 rounded-2xl p-6 text-sm">Could not load anomalies: {error}</div>;
  if (!items)
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading anomalies…
      </div>
    );

  const kpi = (label: string, value: number, sub: string, cls = '') => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`text-3xl font-semibold mt-1 ${cls}`}>{value}</p>
      <p className="text-xs text-text-tertiary mt-1">{sub}</p>
    </div>
  );
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl ${on ? 'bg-wyndham-blue text-white' : 'bg-surface-secondary text-text-secondary hover:text-text-primary'}`;
  const logScale = !!selSeries && selSeries.series.some(p => (p.value || 0) > 50 * (p.expected || Infinity));
  const fmtY = (v: number) => (selSeries?.metric === 'RevPAR' ? formatValue(v, 'currency') : Math.round(v).toLocaleString());

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {kpi('Open anomalies', items.length, 'Last 120 days · 9,000 sites')}
        {kpi('High severity', count(a => a.severity === 'high'), `${count(a => a.severity === 'high' && a.category === 'performance')} performance · ${count(a => a.severity === 'high' && a.category === 'data_quality')} data quality`, 'text-red-600')}
        {kpi('Performance', count(a => a.category === 'performance'), 'RGI drops, baseline deviations')}
        {kpi('Data quality', count(a => a.category === 'data_quality'), 'Implausible values, gaps, capacity', 'text-amber-600')}
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-7 bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="font-semibold">Anomaly inbox</h3>
            <div className="flex gap-2 text-xs flex-wrap">
              {(['all', 'performance', 'data_quality'] as const).map(c => (
                <button key={c} className={chip(cat === c)} onClick={() => setCat(c)}>
                  {c === 'all' ? 'All' : CAT_LABEL[c]}
                </button>
              ))}
              <select value={sev} onChange={e => setSev(e.target.value as typeof sev)} className="px-3 py-1.5 rounded-xl bg-surface-secondary text-text-secondary outline-none">
                <option value="all">Severity: all</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={region} onChange={e => setRegion(e.target.value)} className="px-3 py-1.5 rounded-xl bg-surface-secondary text-text-secondary outline-none">
                <option value="all">Region: all</option>
                {regions.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {shown.map(a => (
              <button
                key={a.anomaly_id}
                onClick={() => setSelected(a.anomaly_id)}
                className={`w-full text-left py-3 flex items-center gap-4 -mx-5 px-5 transition-colors ${selected === a.anomaly_id ? 'bg-wyndham-blue/5' : 'hover:bg-surface-secondary/60'}`}
              >
                <span className={`text-xs px-2 py-0.5 rounded-full w-16 text-center capitalize ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.description}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {a.site_id ? `${a.site_id} · ${a.property_name} · ${a.market}` : `Market: ${a.market} · ${a.site_count} sites`} · {windowLabel(a)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${CAT_STYLE[a.category]}`}>{CAT_LABEL[a.category]}</span>
                <Sparkline s={series[a.anomaly_id]} />
              </button>
            ))}
            {!shown.length && <p className="text-sm text-text-tertiary py-6 text-center">No anomalies match these filters.</p>}
          </div>
        </div>

        <div className="col-span-5">
          {sel && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 sticky top-24">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${SEV_STYLE[sel.severity]}`}>
                    {sel.severity} · {CAT_LABEL[sel.category]}
                  </span>
                  <h3 className="font-semibold mt-2">{TYPE_LABEL[sel.anomaly_type] || sel.anomaly_type}</h3>
                  <p className="text-sm text-text-secondary">
                    {sel.site_id ? `${sel.site_id} · ${sel.property_name}${sel.chain_scale ? ` · ${sel.chain_scale}` : ''}` : `${sel.market} · ${sel.site_count} sites`}
                  </p>
                </div>
                {sel.category === 'data_quality' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                ) : (sel.zscore || 0) > 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="text-[11px] text-text-secondary">Observed</p>
                  <p className="font-semibold">{metricValue(sel, sel.observed)}</p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="text-[11px] text-text-secondary">{sel.metric === 'room_revenue' ? 'Site p99 night' : 'Expected'}</p>
                  <p className="font-semibold">{metricValue(sel, sel.expected)}</p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="text-[11px] text-text-secondary">Window</p>
                  <p className="font-semibold text-sm">{windowLabel(sel)}</p>
                </div>
              </div>

              <p className="text-xs text-text-secondary mb-2">
                Daily {selSeries?.metric || 'series'} with expected band (trailing 28-day median ±20%){logScale ? ', log scale' : ''}
              </p>
              <div className="h-44">
                {selSeries ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={selSeries.series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tickFormatter={d => formatDate(d, false)} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} minTickGap={40} />
                      <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={58} scale={logScale ? 'log' : 'auto'} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v: number) => fmtY(v)} labelFormatter={d => formatDate(String(d))} />
                      <ReferenceArea x1={sel.start_date} x2={sel.end_date} fill="#f59e0b" fillOpacity={0.12} />
                      <Area dataKey="upper" stroke="none" fill="#016fb7" fillOpacity={0.08} isAnimationActive={false} />
                      <Area dataKey="lower" stroke="none" fill="#ffffff" fillOpacity={1} isAnimationActive={false} />
                      <Line dataKey="expected" stroke="#9CA3AF" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      <Line dataKey="value" stroke="#016fb7" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full rounded-xl bg-surface-secondary animate-pulse" />
                )}
              </div>

              <div className="rounded-xl border border-gray-100 p-3 mt-4">
                <p className="text-[11px] text-text-tertiary mb-1">{agentName(sel.model)} will ask</p>
                <p className="text-sm">"{sel.suggested_question}"</p>
              </div>
              <button
                onClick={() => onInvestigate(sel.model, sel.suggested_question)}
                className="w-full mt-4 py-3 rounded-xl wyndham-gradient text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Investigate in Explorer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
