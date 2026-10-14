/** Conversation store: one Genie thread per key (nt, str, reservations), kept across tab switches. */
import { useCallback, useRef, useState } from 'react';
import { apiClient, GenieMessage, ModelKey } from './api';

export type ThreadKey = 'nt' | 'str' | 'res';

export interface Turn {
  id: string;
  question: string;
  model: ModelKey;
  status: 'pending' | 'done' | 'error';
  startedAt: number;
  elapsedMs?: number;
  /** When the table arrived (Genie keeps writing its summary after the SQL finishes). */
  tableMs?: number;
  result?: GenieMessage;
  error?: string;
}

interface ThreadState {
  turns: Turn[];
  conversationId?: string;
}

const POLL_MS = 1500;
const TIMEOUT_MS = 180_000;

export function useGenieThreads() {
  const [threads, setThreads] = useState<Record<ThreadKey, ThreadState>>({ nt: { turns: [] }, str: { turns: [] }, res: { turns: [] } });
  const ref = useRef(threads);
  ref.current = threads;

  const update = useCallback((key: ThreadKey, id: string, patch: Partial<Turn>) => {
    setThreads(prev => ({
      ...prev,
      [key]: { ...prev[key], turns: prev[key].turns.map(t => (t.id === id ? { ...t, ...patch } : t)) },
    }));
  }, []);

  const ask = useCallback(
    async (key: ThreadKey, model: ModelKey, question: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startedAt = Date.now();
      setThreads(prev => ({ ...prev, [key]: { ...prev[key], turns: [...prev[key].turns, { id, question, model, status: 'pending', startedAt }] } }));
      try {
        const { conversation_id, message_id } = await apiClient.askGenie(model, question, ref.current[key].conversationId);
        setThreads(prev => ({ ...prev, [key]: { ...prev[key], conversationId: conversation_id } }));
        let tableShown = false;
        while (Date.now() - startedAt < TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, POLL_MS));
          const m = await apiClient.getGenieMessage(model, conversation_id, message_id);
          if (m.partial && m.columns.length && !tableShown) {
            tableShown = true;
            update(key, id, { result: m, tableMs: Date.now() - startedAt });
          }
          if (['COMPLETED', 'FAILED', 'CANCELLED', 'QUERY_RESULT_EXPIRED'].includes(m.status)) {
            const failed = m.status !== 'COMPLETED';
            update(key, id, {
              status: failed ? 'error' : 'done',
              result: m,
              elapsedMs: Date.now() - startedAt,
              error: failed ? m.error || `Genie returned ${m.status}` : undefined,
            });
            return;
          }
        }
        update(key, id, { status: 'error', error: 'Genie did not answer within 3 minutes', elapsedMs: Date.now() - startedAt });
      } catch (e) {
        update(key, id, { status: 'error', error: e instanceof Error ? e.message : String(e), elapsedMs: Date.now() - startedAt });
      }
    },
    [update],
  );

  const reset = useCallback((key: ThreadKey) => {
    setThreads(prev => ({ ...prev, [key]: { turns: [] } }));
  }, []);

  return { threads, ask, reset };
}

export type GenieThreads = ReturnType<typeof useGenieThreads>;
