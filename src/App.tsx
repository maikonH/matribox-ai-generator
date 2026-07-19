import { useState, useCallback } from 'react';
import Header from './components/Header';
import SettingsDrawer from './components/SettingsDrawer';
import PromptBar from './components/PromptBar';
import PresetCard from './components/PresetCard';
import ToastContainer from './components/ToastContainer';
import { useToasts } from './hooks/useToasts';
import { loadAlgorithmsAsync } from './lib/algorithmStore';
import { ALGORITHM_COUNT } from './lib/algorithmCatalog';
import { generatePreset } from './lib/gemini';
import type { Algorithm, GeneratedPreset } from './lib/types';

export default function App() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<GeneratedPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const { toasts, showToast, dismiss } = useToasts();

  // The header counter is locked to the static 267-entry catalog and is
  // immune to localStorage / IndexedDB resets. `algorithms` is only used to
  // power the Settings drawer's memory browser; generation always falls back
  // to the catalog when it is empty.
  const loadOnce = useCallback(async () => {
    const loaded = await loadAlgorithmsAsync();
    setAlgorithms(loaded);
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (algorithms.length === 0) await loadOnce();
    return algorithms.length > 0 ? algorithms : (await loadAlgorithmsAsync());
  }, [algorithms, loadOnce]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const merged = await ensureLoaded();
    setLoading(true);
    try {
      const result = await generatePreset(prompt.trim(), merged);
      setPreset(result);
      showToast(`Preset "${result.title}" gerado com sucesso!`, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, ensureLoaded, showToast]);

  const handleQuickPrompt = useCallback(
    (quick: string) => {
      setPrompt(quick);
      setLoading(true);
      const run = async () => {
        const merged = await ensureLoaded();
        try {
          const result = await generatePreset(quick, merged);
          setPreset(result);
          showToast(`Preset "${result.title}" gerado com sucesso!`, 'success');
        } catch (e) {
          showToast((e as Error).message, 'error');
        } finally {
          setLoading(false);
        }
      };
      run();
    },
    [ensureLoaded, showToast],
  );

  const handleParamChange = useCallback(
    (moduleIndex: number, paramIndex: number, value: number) => {
      setPreset((prev) => {
        if (!prev) return prev;
        const modules = prev.modules.map((mod, mIdx) => {
          if (mIdx !== moduleIndex) return mod;
          const params = mod.params.map((p, pIdx) =>
            pIdx === paramIndex ? { ...p, value } : p,
          );
          return { ...mod, params };
        });
        return { ...prev, modules };
      });
    },
    [],
  );

  return (
    <div className="min-h-screen bg-bg-900 text-slate-200">
      <Header algCount={ALGORITHM_COUNT} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-3">
          <div className="text-center">
            <h2 className="text-white font-bold text-2xl sm:text-3xl tracking-tight">
              Gerar Preset por IA
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Descreva o som e a IA monta a cadeia de sinal completa
            </p>
          </div>
          <PromptBar
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            loading={loading}
            onQuickPrompt={handleQuickPrompt}
          />
        </div>

        <PresetCard
          preset={preset}
          loading={loading}
          onParamChange={handleParamChange}
        />
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        algorithms={algorithms}
        onAlgorithmsChanged={setAlgorithms}
        onToast={showToast}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
