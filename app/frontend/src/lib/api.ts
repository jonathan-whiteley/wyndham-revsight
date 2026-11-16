/**
 * API client for the RevSight IQ backend
 */

const API_BASE = '/api';

/** An agent key from agents.yaml (nt, str in the demo). */
export type ModelKey = string;

export type FeedbackRating = 'POSITIVE' | 'NEGATIVE' | 'NONE';

export interface Model {
  key: ModelKey;
  label: string;
  agent_name: string;
  description?: string | null;
  metric_view?: string | null;
  grain?: string | null;
  /** First question when a field is clicked on an empty thread; {label} is the field. */
  starter_measure?: string | null;
  starter_dimension?: string | null;
  /** Set when the viewer can't read the Genie agent. */
  error?: string | null;
  /** The viewer's sign-in predates the app's current scopes: send them to /reauth. */
  reauth?: boolean;
}

/** Error details the metadata endpoints return alongside their (empty) value. */
export interface Failure {
  error?: string;
  reauth?: boolean;
}

export interface Features {
  data_as_of: boolean;
}

export interface Field {
  name: string;
  label: string;
  kind: 'dimension' | 'measure';
  followup: string;
  description?: string | null;
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

  getFeatures: (): Promise<Features> => fetch(`${API_BASE}/features`).then(r => json<Features>(r)),

  getFields: (model: ModelKey) => fetch(`${API_BASE}/models/${model}/fields`).then(r => json<{ groups: FieldGroup[] } & Failure>(r)),

  getSamples: (model: ModelKey): Promise<string[]> =>
    fetch(`${API_BASE}/models/${model}/samples`).then(r => json<{ questions: string[] }>(r)).then(d => d.questions),

  getDataAsOf: (model: ModelKey) => fetch(`${API_BASE}/models/${model}/data-as-of`).then(r => json<{ date: string | null } & Failure>(r)),

  askGenie: (model: ModelKey, question: string, conversation_id?: string) =>
    fetch(`${API_BASE}/genie/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, question, conversation_id }),
    }).then(r => json<{ model: ModelKey; conversation_id: string; message_id: string }>(r)),

  getGenieMessage: (model: ModelKey, conversation_id: string, message_id: string) =>
    fetch(`${API_BASE}/genie/message/${model}/${conversation_id}/${message_id}`).then(r => json<GenieMessage>(r)),

  sendFeedback: (body: { model: ModelKey; conversation_id: string; message_id: string; rating: FeedbackRating; comment?: string }) =>
    fetch(`${API_BASE}/genie/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => json<{ ok: boolean }>(r)),

  getPerf: (statement_id: string) => fetch(`${API_BASE}/genie/perf/${statement_id}`).then(r => json<PerfMetrics>(r)),



  async exportXlsx(body: {
    question: string;
    sql: string;
    agent_name: string;
    columns: string[];
    rows: Array<Array<string | null>>;
    data_as_of: string;
    truncated: boolean;
    metric_view?: string | null;
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
