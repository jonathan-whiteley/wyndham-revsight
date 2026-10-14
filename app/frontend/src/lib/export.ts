import { apiClient } from './api';
import { Turn } from './genie';
import { PivotSpec, PivotTable } from './pivot';

export async function downloadXlsx(turn: Turn, agentName: string, dataAsOf: string, pivot?: { spec: PivotSpec; table: PivotTable } | null) {
  const r = turn.result;
  if (!r) return;
  const blob = await apiClient.exportXlsx({
    question: turn.question,
    sql: r.sql,
    agent_name: agentName,
    columns: r.columns.map(c => c.name),
    rows: r.rows,
    data_as_of: dataAsOf,
    truncated: r.truncated,
    pivot: pivot
      ? { ...pivot.spec, header: pivot.table.header, body: pivot.table.body, totals: pivot.table.totals, value_label: pivot.spec.values.join(',') }
      : undefined,
  });
  const slug = turn.question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'revsight';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `revsight-${slug}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
