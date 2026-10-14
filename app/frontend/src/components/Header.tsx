import { Sparkles, MessageSquareText, Radar, Database, ShieldCheck } from 'lucide-react';
import { formatDate } from '../lib/format';

type TabType = 'explorer' | 'anomalies' | 'reservations';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  dataAsOf: string;
  anomalyCount?: number | null;
}

export default function Header({ activeTab, onTabChange, dataAsOf, anomalyCount }: HeaderProps) {
  const getTabClass = (tab: TabType) => {
    const base = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all';
    if (tab === activeTab) {
      return `${base} bg-white text-wyndham-blue shadow-soft`;
    }
    return `${base} text-text-secondary hover:text-text-primary`;
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/wyndham-logo.svg" alt="Wyndham" className="h-8 mix-blend-multiply" />
          <div className="h-8 w-px bg-gray-200"></div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wyndham-blue to-wyndham-blue-light flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">RevSight IQ</p>
              <p className="text-xs text-text-secondary">Revenue Explorer · Powered by Genie</p>
            </div>
          </div>
        </div>

        <nav className="flex items-center bg-surface-secondary rounded-2xl p-1.5">
          <button onClick={() => onTabChange('explorer')} className={getTabClass('explorer')}>
            <MessageSquareText className="w-4 h-4" />
            Explorer
          </button>
          <button onClick={() => onTabChange('anomalies')} className={getTabClass('anomalies')}>
            <Radar className="w-4 h-4" />
            Anomalies
            {anomalyCount ? <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">{anomalyCount}</span> : null}
          </button>
          <button onClick={() => onTabChange('reservations')} className={getTabClass('reservations')}>
            <Database className="w-4 h-4" />
            Reservations
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1 bg-green-50 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            {dataAsOf ? `Data as of ${formatDate(dataAsOf)}` : 'Loading data date…'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1 bg-gray-100 text-gray-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Unity Catalog governed
          </span>
        </div>
      </div>
    </header>
  );
}
