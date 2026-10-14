/**
 * API client for the RevSight IQ backend
 */

const API_BASE = '/api';

export type ModelKey = 'nt' | 'str';

export interface Model {
  key: ModelKey;
  label: string;
  agent_name: string;
  metric_view: string;
  grain: string;
}

export interface Field {
  name: string;
  label: string;
  kind: 'dimension' | 'measure';
  followup: string;
}

export interface FieldGroup {
  label: string;
  kind: string;
  fields: Field[];
}

export interface Column {
  name: string;
  type: string;
}

export interface GenieMessage {
  status: string;
  /** Rows are ready but Genie is still writing its summary. */
  partial?: boolean;
  text: string;
  sql: string;
  description: string;
  columns: Column[];
  rows: Array<Array<string | null>>;
  row_count: number;
  truncated: boolean;
  suggested_questions: string[];
  statement_id: string | null;
  error: string | null;
}

export interface PerfMetrics {
  duration_ms: number | null;
  execution_ms: number | null;
  rows_scanned: number | null;
  rows_read: number | null;
  files_read: number | null;
  files_pruned: number | null;
  bytes_pruned: number | null;
  bytes_read: number | null;
  cache_hit: boolean | null;
  found: boolean;
}

export interface Anomaly {
  anomaly_id: string;
  site_id: string | null;
  property_name: string;
  brand: string | null;
  chain_scale: string | null;
  market: string;
  region: string | null;
  site_count: number;
  anomaly_type: string;
  category: 'performance' | 'data_quality';
  severity: 'high' | 'medium' | 'low';
  start_date: string;
  end_date: string;
  metric: string;
  observed: number | null;
  expected: number | null;
  deviation_pct: number | null;
  zscore: number | null;
  description: string;
  suggested_question: string;
  model: ModelKey;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  expected: number | null;
  lower: number | null;
  upper: number | null;
  in_window: boolean;
}

export interface AnomalySeries {
  series: SeriesPoint[];
  metric: string | null;
  error?: string;
}

export interface ReservationStats {
  row_count: number | null;
  size_in_bytes: number | null;
  num_files: number | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const apiClient = {
  getModels: (): Promise<Model[]> => fetch(`${API_BASE}/models`).then(r => json<Model[]>(r)),

  getFields: (model: ModelKey): Promise<FieldGroup[]> =>
    fetch(`${API_BASE}/fields?model=${model}`).then(r => json<{ groups: FieldGroup[] }>(r)).then(d => d.groups),

  askGenie: (model: ModelKey, question: string, conversation_id?: string) =>
    fetch(`${API_BASE}/genie/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, question, conversation_id }),
    }).then(r => json<{ model: ModelKey; conversation_id: string; message_id: string }>(r)),

  getGenieMessage: (model: ModelKey, conversation_id: string, message_id: string) =>
    fetch(`${API_BASE}/genie/message/${model}/${conversation_id}/${message_id}`).then(r => json<GenieMessage>(r)),

  getPerf: (statement_id: string) => fetch(`${API_BASE}/genie/perf/${statement_id}`).then(r => json<PerfMetrics>(r)),

  getAnomalies: (): Promise<Anomaly[]> => fetch(`${API_BASE}/anomalies`).then(r => json<Anomaly[]>(r)),

  getAnomalySeries: (id: string) => fetch(`${API_BASE}/anomalies/${id}/series`).then(r => json<AnomalySeries>(r)),

  getReservationStats: () => fetch(`${API_BASE}/stats/reservations`).then(r => json<ReservationStats>(r)),

  getDataAsOf: () => fetch(`${API_BASE}/stats/data-as-of`).then(r => json<{ date: string | null }>(r)),

  async exportXlsx(body: {
    question: string;
    sql: string;
    agent_name: string;
    columns: string[];
    rows: Array<Array<string | null>>;
    data_as_of: string;
    truncated: boolean;
    pivot?: unknown;
  }): Promise<Blob> {
    const res = await fetch(`${API_BASE}/export/xlsx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },
};
