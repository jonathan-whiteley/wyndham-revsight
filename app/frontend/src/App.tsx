import { useCallback, useEffect, useState } from 'react';
import './index.css';
import { apiClient, Features, Model, ModelKey } from './lib/api';
import { readCache, writeCache } from './lib/cache';
import { useGenieThreads } from './lib/genie';
import Header from './components/Header';
import Explorer from './pages/Explorer';

/** ?model= or the last one used; checked against agents.yaml once the models load. */
function initialModel(): ModelKey {
  return (
    new URLSearchParams(window.location.search).get('model') || localStorage.getItem('revsight-model') || readCache<Model[]>('models')?.[0]?.key || ''
  );
}

function App() {
  const [model, setModel] = useState<ModelKey>(initialModel);
  const [models, setModels] = useState<Model[]>(() => readCache<Model[]>('models') || []);
  const [dataAsOf, setDataAsOf] = useState<{ date: string | null; loading: boolean }>({ date: null, loading: true });
  const [features, setFeatures] = useState<Features>(() => readCache<Features>('features') || { data_as_of: false });
  const [pending, setPending] = useState<{ model: ModelKey; question: string; nonce: number } | null>(null);
  const genie = useGenieThreads();

  useEffect(() => {
    apiClient
      .getModels()
      .then(ms => {
        setModels(ms);
        writeCache('models', ms);
        setModel(m => (ms.some(x => x.key === m) ? m : ms[0]?.key || ''));
      })
      .catch(() => undefined);
    apiClient
      .getFeatures()
      .then(f => {
        setFeatures(f);
        writeCache('features', f);
      })
      .catch(() => undefined);
  }, []);

  // "Data as of" follows the selected agent's metric view: last-known date at once, then the fresh one.
  useEffect(() => {
    if (!model || !features.data_as_of) return;
    setDataAsOf({ date: readCache<string>(`asof:${model}`), loading: true });
    apiClient
      .getDataAsOf(model)
      .then(d => {
        if (d.date) writeCache(`asof:${model}`, d.date);
        setDataAsOf(prev => ({ date: d.date || prev.date, loading: false }));
      })
      .catch(() => setDataAsOf(prev => ({ ...prev, loading: false })));
  }, [model, features.data_as_of]);

  const changeModel = useCallback((m: ModelKey) => {
    setModel(m);
    localStorage.setItem('revsight-model', m);
    const params = new URLSearchParams(window.location.search);
    params.set('model', m);
    window.history.replaceState({}, '', `?${params.toString()}${window.location.hash}`);
  }, []);

  // Ask in another data model (the "switch to <model> and ask again" chip).
  const askIn = useCallback(
    (m: ModelKey, question: string) => {
      changeModel(m);
      setPending({ model: m, question, nonce: Date.now() });
    },
    [changeModel],
  );

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Header dataAsOf={features.data_as_of ? dataAsOf : null} />
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <Explorer
          model={model}
          models={models}
          onModelChange={changeModel}
          genie={genie}
          dataAsOf={dataAsOf.date || ''}
          pending={pending}
          onPendingConsumed={() => setPending(null)}
          onSwitchAndAsk={askIn}
        />
      </main>
    </div>
  );
}

export default App;
