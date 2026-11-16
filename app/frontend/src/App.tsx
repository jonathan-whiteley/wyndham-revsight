import { useCallback, useEffect, useState } from 'react';
import './index.css';
import { apiClient, Features, Model, ModelKey } from './lib/api';
import { useGenieThreads } from './lib/genie';
import Header from './components/Header';
import Explorer from './pages/Explorer';
import Anomalies from './pages/Anomalies';

type TabType = 'explorer' | 'anomalies';

function initialTab(): TabType {
  const h = window.location.hash.slice(1);
  return h === 'anomalies' ? h : 'explorer';
}

/** ?model= or the last one used; checked against agents.yaml once the models load. */
function initialModel(): ModelKey {
  return new URLSearchParams(window.location.search).get('model') || localStorage.getItem('revsight-model') || '';
}

function App() {
  const [tab, setTab] = useState<TabType>(initialTab);
  const [model, setModel] = useState<ModelKey>(initialModel);
  const [models, setModels] = useState<Model[]>([]);
  const [dataAsOf, setDataAsOf] = useState('');
  const [features, setFeatures] = useState<Features>({ anomalies: false, data_as_of: false });
  const [anomalyCount, setAnomalyCount] = useState<number | null>(null);
  const [pending, setPending] = useState<{ model: ModelKey; question: string; nonce: number } | null>(null);
  const genie = useGenieThreads();

  useEffect(() => {
    apiClient
      .getModels()
      .then(ms => {
        setModels(ms);
        setModel(m => (ms.some(x => x.key === m) ? m : ms[0]?.key || ''));
      })
      .catch(() => setModels([]));
    apiClient
      .getFeatures()
      .then(f => {
        setFeatures(f);
        if (f.anomalies) apiClient.getAnomalies().then(a => setAnomalyCount(a.length)).catch(() => undefined);
        else if (initialTab() === 'anomalies') setTab('explorer');
      })
      .catch(() => undefined);
  }, []);

  // "Data as of" follows the selected agent's metric view.
  useEffect(() => {
    if (!model || !features.data_as_of) return setDataAsOf('');
    apiClient.getDataAsOf(model).then(d => setDataAsOf(d.date || '')).catch(() => setDataAsOf(''));
  }, [model, features.data_as_of]);

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

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Header activeTab={tab} onTabChange={changeTab} dataAsOf={features.data_as_of ? dataAsOf : null} anomalyCount={features.anomalies ? anomalyCount : null} showAnomalies={features.anomalies} />
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
        {tab === 'anomalies' && features.anomalies && <Anomalies models={models} onInvestigate={askIn} onCount={setAnomalyCount} />}
      </main>
    </div>
  );
}

export default App;
