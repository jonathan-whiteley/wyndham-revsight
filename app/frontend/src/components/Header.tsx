import { Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { formatDate } from '../lib/format';

interface HeaderProps {
  /** null hides the chip (no warehouse in agents.yaml). A failed check with no last-known date hides it too. */
  dataAsOf: { date: string | null; loading: boolean } | null;
}

export default function Header({ dataAsOf }: HeaderProps) {
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
              <p className="text-xs text-text-secondary">Powered by Genie</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dataAsOf && dataAsOf.date && (
            <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1 bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Data as of {formatDate(dataAsOf.date)}
            </span>
          )}
          {dataAsOf && !dataAsOf.date && dataAsOf.loading && (
            <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1 bg-gray-50 text-text-tertiary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking data date…
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1 bg-gray-100 text-gray-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Unity Catalog governed
          </span>
        </div>
      </div>
    </header>
  );
}
