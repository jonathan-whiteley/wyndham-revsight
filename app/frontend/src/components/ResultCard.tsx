import { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, BarChart3, Check, Code2, Copy, Download, Grid3x3, Loader2, Sparkles, Table2 } from 'lucide-react';
import { Turn } from '../lib/genie';
import Feedback from './Feedback';
import Markdown from './Markdown';
import PerfBadge from './PerfBadge';
import ResultGrid from './ResultGrid';
import ResultChart from './ResultChart';

interface Props {
  turn: Turn;
  index: number;
  agentName: string;
  active: boolean;
  /** More than one answer has a table, so say which one the pivot panel shows. */
  manyTables?: boolean;
  otherModelLabel?: string;
  onSwitchModel?: (q: string) => void;
  onPivot?: () => void;
  onExport: () => void;
}

const SWITCH_HINT = /(switch the data model|STR Comp Set \(weekly\)|NT Performance \(daily\))/i;

export default function ResultCard({ turn, index, agentName, active, manyTables, otherModelLabel, onSwitchModel, onPivot, onExport }: Props) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [copied, setCopied] = useState(false);
  const r = turn.result;
  const hasRows = !!r && r.columns.length > 0;
  const canRate = turn.status === 'done' && !!turn.conversationId && !!turn.messageId;
  const suggestsSwitch = !!r && !!onSwitchModel && SWITCH_HINT.test(r.text) && !hasRows;

  const copySql = () => {
    if (!r?.sql) return;
    navigator.clipboard.writeText(r.sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-soft p-6 ${active ? 'border-wyndham-blue/30' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-6 h-6 shrink-0 rounded-full bg-wyndham-blue text-white flex items-center justify-center text-[11px] mt-0.5">{index}</span>
        <p className="font-semibold">{turn.question}</p>
      </div>

      {turn.status === 'pending' && !hasRows && (
        <div className="flex items-center gap-3 rounded-xl bg-wyndham-blue/5 border border-wyndham-blue/10 p-4 text-sm text-wyndham-blue">
          <Loader2 className="w-4 h-4 animate-spin" />
          {agentName} is writing SQL against the metric view…
        </div>
      )}

      {turn.status === 'error' && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Genie could not answer this</p>
            <p className="mt-1">{turn.error}</p>
          </div>
        </div>
      )}

      {r && (turn.status === 'done' || hasRows) && (
        <div className="space-y-4">
          {turn.status === 'pending' && (
            <div className="flex items-center gap-3 rounded-xl bg-wyndham-blue/5 border border-wyndham-blue/10 p-4 text-sm text-wyndham-blue">
              <Loader2 className="w-4 h-4 animate-spin" />
              Results are in. {agentName} is writing the summary…
            </div>
          )}
          {r.text && (
            <div className="rounded-xl bg-wyndham-blue/5 border border-wyndham-blue/10 p-4 text-sm leading-relaxed">
              <div className="flex items-center gap-2 text-wyndham-blue font-medium mb-1.5">
                <Sparkles className="w-4 h-4" />
                Genie
              </div>
              <Markdown text={r.text} />
            </div>
          )}

          {suggestsSwitch && otherModelLabel && (
            <button
              onClick={() => onSwitchModel!(turn.question)}
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-wyndham-blue/40 text-wyndham-blue hover:bg-wyndham-blue/5"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Switch to {otherModelLabel} and ask again
            </button>
          )}

          {hasRows && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <PerfBadge statementId={r.statement_id} elapsedMs={turn.elapsedMs} tableMs={turn.tableMs} />
                  <span className="text-xs text-text-tertiary">
                    {r.row_count.toLocaleString()} rows{r.truncated ? ' (truncated)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button title="Table" onClick={() => setView('table')} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <Table2 className={`w-4 h-4 ${view === 'table' ? 'text-wyndham-blue' : 'text-text-secondary'}`} />
                  </button>
                  <button title="Chart" onClick={() => setView('chart')} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <BarChart3 className={`w-4 h-4 ${view === 'chart' ? 'text-wyndham-blue' : 'text-text-secondary'}`} />
                  </button>
                </div>
              </div>
              {view === 'table' ? <ResultGrid columns={r.columns} rows={r.rows} /> : <ResultChart columns={r.columns} rows={r.rows} />}
            </>
          )}

          {r.sql && (
            <details className="rounded-xl border border-gray-100 group">
              <summary className="px-4 py-2.5 text-xs font-medium text-text-secondary cursor-pointer flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5" />
                Generated SQL (governed metric view)
                <button onClick={e => (e.preventDefault(), copySql())} className="ml-auto inline-flex items-center gap-1 text-text-tertiary hover:text-wyndham-blue">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </summary>
              <pre className="px-4 pb-4 text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">{r.sql}</pre>
            </details>
          )}

          {(hasRows || canRate) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>{canRate && <Feedback model={turn.model} conversationId={turn.conversationId!} messageId={turn.messageId!} />}</div>
              {hasRows && (
                <div className="flex items-center gap-1">
                  {/* The pivot panel follows the latest answer; with several tables, say which one it shows. */}
                  {active && manyTables && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1.5 text-wyndham-blue">
                      <Grid3x3 className="w-3.5 h-3.5" />
                      Shown in pivot
                    </span>
                  )}
                  {!active && onPivot && (
                    <button onClick={onPivot} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-surface-secondary text-text-secondary hover:text-wyndham-blue">
                      <Grid3x3 className="w-3.5 h-3.5" />
                      Pivot this answer
                    </button>
                  )}
                  <button onClick={onExport} title="Download as Excel (.xlsx)" aria-label="Download as Excel" className="p-2 rounded-lg text-text-secondary hover:text-wyndham-blue hover:bg-gray-100">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
