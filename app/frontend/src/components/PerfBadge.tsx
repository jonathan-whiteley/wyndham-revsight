import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { apiClient, PerfMetrics } from '../lib/api';

interface Props {
  statementId: string | null;
  elapsedMs?: number;
  tableMs?: number;
}

/** SQL time from Query History for the statement Genie ran, plus table and summary times. Shows n/a rather than guessing. */
export default function PerfBadge({ statementId, elapsedMs, tableMs }: Props) {
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

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-2.5 py-1 bg-green-50 text-green-700">
      <Zap className="w-3.5 h-3.5" />
      {state === 'done' && perf?.execution_ms != null ? `${(perf.execution_ms / 1000).toFixed(1)}s SQL` : state === 'loading' ? 'perf pending' : 'SQL time n/a'}
      {tableMs ? ` · table in ${(tableMs / 1000).toFixed(1)}s` : ''}
      {elapsedMs ? ` · ${(elapsedMs / 1000).toFixed(1)}s with summary` : ''}
    </span>
  );
}
