import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, GitBranch, Layers, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react';
import { apiClient, FieldGroup, Model, ModelKey } from '../lib/api';
import { GenieThreads } from '../lib/genie';
import { downloadXlsx } from '../lib/export';
import ResultCard from '../components/ResultCard';
import PivotPanel, { Placement } from '../components/PivotPanel';

const SAMPLES: Record<ModelKey, string[]> = {
  nt: [
    'RevPAR, ADR and occupancy by chain scale for September 2026 vs September 2025',
    'Which hurricane-market sites had the biggest RevPAR decline in September 2026 vs September 2025?',
    'Anything that looks like a data issue in September?',
  ],
  str: [
    'Weekly RGI vs comp set by chain scale, hurricane vs non-hurricane, Aug-Sep 2026',
    'Which sites had the largest RevPAR index drop vs comp set in the last 8 weeks?',
    'RGI by region for September 2026',
  ],
};

/** First question when the thread is empty and a field chip is clicked. */
const STARTER: Record<ModelKey, (label: string, kind: string) => string> = {
  nt: (l, k) => (k === 'measure' ? `${l} by chain scale for September 2026 vs September 2025` : `RevPAR, ADR and occupancy by ${l.toLowerCase()} for September 2026 vs September 2025`),
  str: (l, k) => (k === 'measure' ? `${l} by chain scale, weekly for Aug-Sep 2026` : `RGI, MPI and ARI by ${l.toLowerCase()} for September 2026`),
};

interface Props {
  model: ModelKey;
  models: Model[];
  onModelChange: (m: ModelKey) => void;
  genie: GenieThreads;
  dataAsOf: string;
  pending: { model: ModelKey; question: string; nonce: number } | null;
  onPendingConsumed: () => void;
  onSwitchAndAsk: (target: ModelKey, question: string) => void;
}

export default function Explorer({ model, models, onModelChange, genie, dataAsOf, pending, onPendingConsumed, onSwitchAndAsk }: Props) {
  const [fields, setFields] = useState<FieldGroup[]>([]);
  const [question, setQuestion] = useState('');
  const [activeTurnId, setActiveTurnId] = useState<Record<ModelKey, string | null>>({ nt: null, str: null });
  const [placements, setPlacements] = useState<Record<ModelKey, Placement[]>>({ nt: [], str: [] });
  const bottom = useRef<HTMLDivElement>(null);

  const thread = genie.threads[model];
  const turns = thread.turns;
  const current = models.find(m => m.key === model);
  const other = models.find(m => m.key !== model);
  const busy = turns.some(t => t.status === 'pending');
  const activeTurn = turns.find(t => t.id === activeTurnId[model]) || [...turns].reverse().find(t => t.status !== 'error' && t.result?.columns.length) || null;

  useEffect(() => {
    setFields([]);
    apiClient.getFields(model).then(setFields).catch(() => setFields([]));
  }, [model]);

  // If the re-query fails or returns no table, drop the waiting placeholders instead of spinning forever.
  const last = turns[turns.length - 1];
  useEffect(() => {
    if (last && last.status !== 'pending' && !(last.status === 'done' && last.result?.columns.length) && placements[model].length) {
      setPlacements(s => ({ ...s, [model]: [] }));
    }
  }, [last?.id, last?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  // A question handed over from another tab (Anomalies "Investigate", or a model switch chip).
  useEffect(() => {
    if (pending && pending.model === model) {
      send(pending.question);
      onPendingConsumed();
    }
  }, [pending, model]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion('');
    setActiveTurnId(s => ({ ...s, [model]: null }));
    genie.ask(model, model, text);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) send(question);
  };

  const onFieldClick = (label: string, kind: string, followup: string) => {
    if (busy) return;
    send(turns.length ? followup.replace('{label}', label.toLowerCase()) : STARTER[model](label, kind));
  };

  // Dropped into the pivot but not in the answer yet: same question as clicking the chip, remembered for placement.
  const onRequestField = (p: Placement) => {
    setPlacements(s => ({ ...s, [model]: [...s[model].filter(x => x.field.name !== p.field.name), p] }));
    onFieldClick(p.field.label, p.field.kind, p.field.followup);
  };

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Left rail: data model + routing + fields */}
      <aside className="col-span-2">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
          <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">Data model</label>
          <div className="relative mt-1.5 mb-3">
            <select
              value={model}
              onChange={e => onModelChange(e.target.value as ModelKey)}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-8 py-2.5 text-sm font-medium text-text-primary focus:ring-2 focus:ring-wyndham-blue outline-none"
            >
              {models.map(m => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-text-secondary absolute right-2.5 top-3 pointer-events-none" />
          </div>

          {current && (
            <div className="rounded-xl bg-wyndham-blue/5 border border-wyndham-blue/10 p-3 mb-4 text-[11px]">
              <div className="flex items-center gap-1.5 font-medium text-wyndham-blue mb-1">
                <GitBranch className="w-3.5 h-3.5" />
                Routed to Genie agent
              </div>
              <p className="text-text-primary font-medium">{current.agent_name}</p>
              <p className="text-text-secondary font-mono mt-0.5 break-all">{current.metric_view}</p>
              <p className="text-text-tertiary mt-1">Grain: {current.grain}</p>
            </div>
          )}

          <h3 className="font-semibold text-sm mb-1">Fields</h3>
          <p className="text-[11px] text-text-tertiary mb-3">Click to ask Genie for the breakout, or drag into a pivot zone.</p>
          {fields.map(g => (
            <div key={g.label} className="mb-4">
              <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.fields.map(f => (
                  <button
                    key={f.name}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/column', f.name)}
                    onClick={() => onFieldClick(f.label, f.kind, f.followup)}
                    disabled={busy}
                    title={turns.length ? f.followup.replace('{label}', f.label.toLowerCase()) : 'Start an analysis with this field'}
                    className={`chip text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                      f.kind === 'measure' ? 'bg-wyndham-navy text-white hover:bg-wyndham-blue-dark' : 'bg-wyndham-blue/10 text-wyndham-blue hover:bg-wyndham-blue hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-surface-secondary p-3 text-[11px] text-text-secondary">
            <div className="flex items-center gap-1.5 font-medium text-text-primary mb-1">
              <Layers className="w-3.5 h-3.5 text-wyndham-blue" />
              Semantic layer
            </div>
            Measures are defined once in the Unity Catalog metric view, so every answer uses the same RevPAR.
          </div>
        </div>
      </aside>

      {/* Thread */}
      <div className="col-span-7 space-y-4 pb-28">
        <div className="flex items-center gap-2 text-xs text-text-secondary px-1">
          <MessageSquareText className="w-3.5 h-3.5 text-wyndham-blue" />
          Thread with <b className="text-text-primary">{current?.agent_name || 'Genie'}</b>
          <span className="text-text-tertiary">· each data model keeps its own thread; switch back to resume</span>
        </div>

        {!turns.length && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8">
            <div className="w-12 h-12 rounded-2xl wyndham-gradient flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold">Build a report from scratch</h2>
            <p className="text-sm text-text-secondary mt-1 mb-5">
              Ask in plain English, then click any field on the left to add a breakout. Genie writes the SQL against <span className="font-mono text-xs">{current?.metric_view}</span>.
            </p>
            <div className="flex flex-col gap-2">
              {SAMPLES[model].map(q => (
                <button key={q} onClick={() => send(q)} className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 hover:border-wyndham-blue hover:text-wyndham-blue">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={t.id} onClick={() => t.result?.columns.length && setActiveTurnId(s => ({ ...s, [model]: t.id }))}>
            <ResultCard
              turn={t}
              index={i + 1}
              agentName={current?.agent_name || 'Genie'}
              active={activeTurn?.id === t.id}
              otherModelLabel={other?.label}
              onFollowUp={q => !busy && send(q)}
              onSwitchModel={q => {
                if (!other) return;
                // The other agent starts a fresh conversation, so carry the earlier questions as context.
                const context = turns.slice(0, i).map(x => x.question).join('; then ');
                onSwitchAndAsk(other.key, context ? `${q} (context: ${context})` : q);
              }}
              onPivot={() => setActiveTurnId(s => ({ ...s, [model]: t.id }))}
              onExport={() => downloadXlsx(t, current?.agent_name || 'Genie', dataAsOf)}
            />
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* Pivot */}
      <aside className="col-span-3">
        <PivotPanel
          turn={activeTurn}
          fields={fields.flatMap(g => g.fields)}
          busy={busy}
          placements={placements[model]}
          onRequestField={onRequestField}
          onPlacementsApplied={() => setPlacements(s => ({ ...s, [model]: [] }))}
          onExport={pivot => (activeTurn ? downloadXlsx(activeTurn, current?.agent_name || 'Genie', dataAsOf, pivot) : Promise.resolve())} />
      </aside>

      {/* Composer */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(1100px,calc(100vw-3rem))] z-40">
        <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-medium p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl wyndham-gradient flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={turns.length ? `Ask ${current?.agent_name || 'Genie'} a follow-up, or click a field…` : `Ask ${current?.agent_name || 'Genie'} a question…`}
            className="flex-1 text-sm outline-none placeholder:text-text-tertiary"
          />
          {turns.length > 0 && (
            <button type="button" onClick={() => genie.reset(model)} className="text-xs px-3 py-2 rounded-xl text-text-secondary hover:bg-gray-100 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              New analysis
            </button>
          )}
          <button type="submit" disabled={busy || !question.trim()} className="w-9 h-9 rounded-xl bg-wyndham-blue text-white flex items-center justify-center disabled:opacity-50">
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
