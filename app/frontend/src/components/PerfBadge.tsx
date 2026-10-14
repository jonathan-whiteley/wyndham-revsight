import { useEffect, useState } from 'react';
import { Zap, ScanLine, Filter, Server, Database } from 'lucide-react';
import { apiClient, PerfMetrics } from '../lib/api';
import { compactNumber, formatBytes } from '../lib/format';

interface Props {
  statementId: string | null;
  elapsedMs?: number;
  tableMs?: number;
  totalRows?: number | null;
}

/** Real Query History metrics for the statement Genie ran. Shows n/a rather than guessing. */
export default function PerfBadge({ statementId, elapsedMs, tableMs, totalRows }: Props) {
  const [perf, setPerf] = useState<PerfMetrics | null>(null);
  const [state, setState] = useState<'loading' | 'done' | 'na'>('loading');

  useEffect(() => {
    if (!statementId) {
      setState('na');
      return;
    }
    let live = true;
    // Asked while Genie is still summarizing, query history may not have the metrics yet; re-ask once the answer lands.
    if (state === 'done' && perf?.found) return;
    apiClient
      .getPerf(statementId)
      .then(p => live && (setPerf(p), setState(p.found ? 'done' : 'na')))
      .catch(() => live && setState('na'));
    return () => {
      live = false;
    };
  }, [statementId, elapsedMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const pill = 'inline-flex items-center gap-1.5 rounded-full text-xs px-2.5 py-1';
  const files = perf && perf.files_read !== null && perf.files_pruned !== null ? perf.files_read + perf.files_pruned : null;
  const prunedPct = files ? Math.round((100 * (perf!.files_pruned || 0)) / files) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${pill} bg-green-50 text-green-700`}>
        <Zap className="w-3.5 h-3.5" />
        {state === 'done' && perf?.execution_ms != null ? `${(perf.execution_ms / 1000).toFixed(1)}s SQL` : state === 'loading' ? 'perf pending' : 'SQL time n/a'}
        {tableMs ? ` · table in ${(tableMs / 1000).toFixed(1)}s` : ''}
        {elapsedMs ? ` · ${(elapsedMs / 1000).toFixed(1)}s with summary` : ''}
      </span>
      {state === 'done' && perf?.rows_scanned != null && (
        <span className={`${pill} bg-blue-50 text-blue-700`}>
          <ScanLine className="w-3.5 h-3.5" />
          {compactNumber(perf.rows_scanned)} rows scanned{totalRows ? ` of ${compactNumber(totalRows)}` : ''}
        </span>
      )}
      {state === 'done' && prunedPct !== null && (
        <span className={`${pill} bg-blue-50 text-blue-700`}>
          <Filter className="w-3.5 h-3.5" />
          {perf!.files_pruned} of {files} files skipped ({prunedPct}%)
        </span>
      )}
      {state === 'done' && perf?.bytes_pruned ? (
        <span className={`${pill} bg-blue-50 text-blue-700`}>
          <Database className="w-3.5 h-3.5" />
          {formatBytes(perf.bytes_pruned)} skipped
        </span>
      ) : null}
      {state === 'done' && perf?.cache_hit && <span className={`${pill} bg-gray-100 text-gray-700`}>result cache</span>}
      <span className={`${pill} bg-gray-100 text-gray-700`}>
        <Server className="w-3.5 h-3.5" />
        Serverless SQL
      </span>
    </div>
  );
}
