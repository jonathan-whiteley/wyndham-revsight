import { useCallback, useEffect, useState } from 'react';
import './index.css';
import { apiClient, Model, ModelKey } from './lib/api';
import { useGenieThreads } from './lib/genie';
import Header from './components/Header';
import Explorer from './pages/Explorer';
import Anomalies from './pages/Anomalies';
import Reservations from './pages/Reservations';

type TabType = 'explorer' | 'anomalies' | 'reservations';

function initialTab(): TabType {
  const h = window.location.hash.slice(1);
  return h === 'anomalies' || h === 'reservations' ? h : 'explorer';
}

function initialModel(): ModelKey {
  const p = new URLSearchParams(window.location.search).get('model');
  if (p === 'nt' || p === 'str') return p;
  return (localStorage.getItem('revsight-model') as ModelKey) === 'str' ? 'str' : 'nt';
}

function App() {
  const [tab, setTab] = useState<TabType>(initialTab);
  const [model, setModel] = useState<ModelKey>(initialModel);
  const [models, setModels] = useState<Model[]>([]);
  const [dataAsOf, setDataAsOf] = useState('');
  const [anomalyCount, setAnomalyCount] = useState<number | null>(null);
  const [pending, setPending] = useState<{ model: ModelKey; question: string; nonce: number } | null>(null);
  const genie = useGenieThreads();

  useEffect(() => {
    apiClient.getModels().then(setModels).catch(() => setModels([]));
    apiClient.getDataAsOf().then(d => setDataAsOf(d.date || '')).catch(() => setDataAsOf(''));
    apiClient.getAnomalies().then(a => setAnomalyCount(a.length)).catch(() => undefined);
  }, []);

  const changeTab = (t: TabType) => {
    setTab(t);
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#${t}`);
  };

  const changeModel = useCallback((m: ModelKey) => {
    setModel(m);
    localStorage.setItem('revsight-model', m);
    const params = new URLSearchParams(window.location.search);
    params.set('model', m);
    window.history.replaceState({}, '', `?${params.toString()}${window.location.hash}`);
  }, []);

  const askIn = useCallback(
    (m: ModelKey, question: string) => {
      changeModel(m);
      setTab('explorer');
      window.history.replaceState({}, '', `?model=${m}#explorer`);
      setPending({ model: m, question, nonce: Date.now() });
    },
    [changeModel],
  );

  const ntAgent = models.find(m => m.key === 'nt')?.agent_name || 'Wyndham NT Performance';

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Header activeTab={tab} onTabChange={changeTab} dataAsOf={dataAsOf} anomalyCount={anomalyCount} />
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Explorer stays mounted so threads and pivots survive tab switches */}
        <div className={tab === 'explorer' ? '' : 'hidden'}>
          <Explorer
            model={model}
            models={models}
            onModelChange={changeModel}
            genie={genie}
            dataAsOf={dataAsOf}
            pending={pending}
            onPendingConsumed={() => setPending(null)}
            onSwitchAndAsk={askIn}
          />
        </div>
        {tab === 'anomalies' && <Anomalies models={models} onInvestigate={askIn} onCount={setAnomalyCount} />}
        <div className={tab === 'reservations' ? '' : 'hidden'}>
          <Reservations genie={genie} agentName={ntAgent} dataAsOf={dataAsOf} />
        </div>
      </main>
    </div>
  );
}

export default App;
