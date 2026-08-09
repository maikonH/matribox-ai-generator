import { useState, useCallback } from 'react';
import Header from './components/Header';
import SettingsDrawer from './components/SettingsDrawer';
import CaptureDiffModal from './components/CaptureDiffModal';
import PromptBar from './components/PromptBar';
import PresetCard from './components/PresetCard';
import ToastContainer from './components/ToastContainer';
import ManualEditor, { createManualPreset } from './components/ManualEditor';
import { useToasts } from './hooks/useToasts';
import { loadAlgorithms, setDevOverlay } from './lib/algorithmStore';
import { ALGORITHM_COUNT } from './lib/algorithmCatalog';
import { generatePreset, aiResponseToPreset } from './lib/gemini';
import type { Algorithm, GeneratedPreset } from './lib/types';

type Tab = 'ai' | 'manual';

export default function App() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>(() => loadAlgorithms());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<GeneratedPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('ai');
  const [manualPreset, setManualPreset] = useState<GeneratedPreset | null>(null);
  const { toasts, showToast, dismiss } = useToasts();

  const runGeneration = useCallback(
    (promptText: string, merged: Algorithm[]) => {
      setLoading(true);
      generatePreset(promptText, merged)
        .then((ai) => {
          setPreset(aiResponseToPreset(ai, algorithms));
          showToast(`Preset "${ai.nomePatch}" montado pela IA.`, 'success');
        })
        .catch((e: Error) => showToast(e.message, 'error'))
        .finally(() => setLoading(false));
    },
    [showToast, algorithms],
  );

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || loading) return;
    runGeneration(prompt.trim(), algorithms);
  }, [prompt, loading, algorithms, runGeneration]);

  const handleQuickPrompt = useCallback(
    (quick: string) => {
      setPrompt(quick);
      runGeneration(quick, algorithms);
    },
    [algorithms, runGeneration],
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

  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
    if (next === 'manual') {
      setManualPreset((prev) => prev ?? createManualPreset(algorithms));
    }
  }, [algorithms]);

  return (
    <div className="min-h-screen bg-bg-900 text-slate-200">
      <Header algCount={ALGORITHM_COUNT} onOpenSettings={() => setSettingsOpen(true)} onOpenDiff={() => setDiffOpen(true)} />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
            <TabButton active={tab === 'ai'} onClick={() => handleTabChange('ai')}>
              ✨ Gerador por IA
            </TabButton>
            <TabButton active={tab === 'manual'} onClick={() => handleTabChange('manual')}>
              🎛️ Editor Manual
            </TabButton>
          </div>
        </div>

        {tab === 'ai' && (
          <div className="space-y-8 animate-fade-in">
            <div className="space-y-3">
              <div className="text-center">
                <h2 className="text-white font-bold text-2xl sm:text-3xl tracking-tight">
                  Gerar Preset por IA
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Descreva o som e a IA monta a cadeia de sinal ideal com as regulagens de cada knob
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
          </div>
        )}

        {tab === 'manual' && manualPreset && (
          <ManualEditor
            algorithms={algorithms}
            currentPreset={manualPreset}
            onPresetChange={setManualPreset}
            onToast={showToast}
          />
        )}
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        algorithms={algorithms}
        onApplyDevOverlay={(algs) => {
          setDevOverlay(algs);
          setAlgorithms(loadAlgorithms());
        }}
        onToast={showToast}
      />

      <CaptureDiffModal open={diffOpen} onClose={() => setDiffOpen(false)} />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 sm:px-6 h-10 rounded-lg text-sm font-semibold transition-all duration-200 ${
        active
          ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_18px_-6px_rgba(34,211,238,0.9)]'
          : 'text-muted hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
