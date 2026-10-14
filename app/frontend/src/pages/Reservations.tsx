import { FormEvent, useEffect, useState } from 'react';
import { ArrowUp, GitBranch, RotateCcw, Search } from 'lucide-react';
import { apiClient, ReservationStats } from '../lib/api';
import { GenieThreads } from '../lib/genie';
import { downloadXlsx } from '../lib/export';
import { formatBytes } from '../lib/format';
import ResultCard from '../components/ResultCard';

const SAMPLES = [
  'Show reservations driving pickup at S05512 for Sep 1-15 2026 with channel and travel agent',
  'Pickup by channel for that site, booking date by week',
  'Which travel agents (IATA) booked the most Gov rate room nights at S05512 in September 2026?',
];

interface Props {
  genie: GenieThreads;
  agentName: string;
  dataAsOf: string;
}

/** Confirmation-level drill on the full reservation table, always routed to the NT agent. */
export default function Reservations({ genie, agentName, dataAsOf }: Props) {
  const [stats, setStats] = useState<ReservationStats | null>(null);
  const [question, setQuestion] = useState('');
  const turns = genie.threads.res.turns;
  const busy = turns.some(t => t.status === 'pending');

  useEffect(() => {
    apiClient.getReservationStats().then(setStats).catch(() => setStats(null));
  }, []);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    setQuestion('');
    genie.ask('res', 'nt', q.trim());
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(question);
  };

  return (
    <div className="pb-6">
      <div className="rounded-2xl wyndham-gradient text-white p-6 mb-5 flex items-center justify-between shadow-medium">
        <div>
          <p className="text-sm opacity-80">Reservation detail · confirmation level</p>
          <p className="text-3xl font-semibold mt-1">{stats?.row_count ? `${stats.row_count.toLocaleString()} reservations` : 'Loading table size…'}</p>
          <p className="text-sm opacity-80 mt-1">2019 to today · one governed Delta table · liquid clustered on arrival date + site</p>
        </div>
        <div className="grid grid-cols-3 gap-8 text-right">
          <div>
            <p className="text-xs opacity-80">Table size</p>
            <p className="text-xl font-semibold">{formatBytes(stats?.size_in_bytes)}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Files</p>
            <p className="text-xl font-semibold">{stats?.num_files?.toLocaleString() ?? 'n/a'}</p>
          </div>
          <div>
            <p className="text-xs opacity-80">Copies of data</p>
            <p className="text-xl font-semibold">1</p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-medium p-3 flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl wyndham-gradient flex items-center justify-center">
          <Search className="w-4 h-4 text-white" />
        </div>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about reservations, pickup, channels or travel agents…" className="flex-1 text-sm outline-none placeholder:text-text-tertiary" />
        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-wyndham-blue/5 text-wyndham-blue">
          <GitBranch className="w-3.5 h-3.5" />
          Routed to {agentName}
        </span>
        {turns.length > 0 && (
          <button type="button" onClick={() => genie.reset('res')} className="text-xs px-3 py-2 rounded-xl text-text-secondary hover:bg-gray-100 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            New
          </button>
        )}
        <button type="submit" disabled={busy || !question.trim()} className="w-9 h-9 rounded-xl bg-wyndham-blue text-white flex items-center justify-center disabled:opacity-50">
          <ArrowUp className="w-4 h-4" />
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-5">
        {SAMPLES.map(q => (
          <button key={q} disabled={busy} onClick={() => send(q)} className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-text-secondary hover:border-wyndham-blue hover:text-wyndham-blue disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {turns.map((t, i) => (
          <ResultCard
            key={t.id}
            turn={t}
            index={i + 1}
            agentName={agentName}
            active={i === turns.length - 1}
            totalRows={stats?.row_count}
            onFollowUp={send}
            onExport={() => downloadXlsx(t, agentName, dataAsOf)}
          />
        ))}
      </div>
    </div>
  );
}
