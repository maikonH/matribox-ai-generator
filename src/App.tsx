import { useState, useCallback, useRef } from 'react';
import Header from './components/Header';
import SettingsDrawer from './components/SettingsDrawer';
import PromptBar from './components/PromptBar';
import PresetCard from './components/PresetCard';
import ToastContainer from './components/ToastContainer';
import { useToasts } from './hooks/useToasts';
import { loadAlgorithmsAsync } from './lib/algorithmStore';
import { ALGORITHM_COUNT } from './lib/algorithmCatalog';
import { generatePreset, aiResponseToPreset } from './lib/gemini';
import { buildPresetFile, downloadPresetFile, type AiPresetResponse, type BuiltPreset } from './lib/presetBuilder';
import { findCadeiaIndexForSlot } from './lib/hardwareSlots';
import type { Algorithm, GeneratedPreset } from './lib/types';

export default function App() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<GeneratedPreset | null>(null);
  const aiResponseRef = useRef<AiPresetResponse | null>(null);
  const [builtPreset, setBuiltPreset] = useState<BuiltPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const { toasts, showToast, dismiss } = useToasts();

  const loadOnce = useCallback(async () => {
    const loaded = await loadAlgorithmsAsync();
    setAlgorithms(loaded);
    return loaded;
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (algorithms.length > 0) return algorithms;
    return loadOnce();
  }, [algorithms, loadOnce]);

  const runGeneration = useCallback(
    async (promptText: string, merged: Algorithm[]) => {
      setLoading(true);
      try {
        const ai = await generatePreset(promptText, merged);
        aiResponseRef.current = ai;
        setBuiltPreset(buildPresetFile(ai));
        setPreset(aiResponseToPreset(ai));
        showToast(`Preset "${ai.nomePatch}" gerado com sucesso!`, 'success');
      } catch (e) {
        showToast((e as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const merged = await ensureLoaded();
    await runGeneration(prompt.trim(), merged);
  }, [prompt, loading, ensureLoaded, runGeneration]);

  const handleQuickPrompt = useCallback(
    (quick: string) => {
      setPrompt(quick);
      const run = async () => {
        const merged = await ensureLoaded();
        await runGeneration(quick, merged);
      };
      run();
    },
    [ensureLoaded, runGeneration],
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
      // Keep the preset file in sync with slider edits. moduleIndex is the
      // hardware slot index (0–9); translate it to the cadeia index before
      // mutating knobs so the download always matches the UI.
      const prevAi = aiResponseRef.current;
      if (prevAi) {
        const cadeiaIdx = findCadeiaIndexForSlot(prevAi.cadeia || [], moduleIndex);
        if (cadeiaIdx >= 0) {
          const cadeia = prevAi.cadeia.map((entry, i) => {
            if (i !== cadeiaIdx) return entry;
            const knobs = entry.knobs.map((k, kIdx) =>
              kIdx === paramIndex ? Math.round(value) : k,
            );
            return { ...entry, knobs };
          });
          const updated = { ...prevAi, cadeia };
          aiResponseRef.current = updated;
          setBuiltPreset(buildPresetFile(updated));
        }
      }
    },
    [],
  );

  const handleDownload = useCallback(() => {
    if (!builtPreset) return;
    downloadPresetFile(builtPreset);
    showToast(`Arquivo ${builtPreset.nomePatch}.prst baixado!`, 'success');
  }, [builtPreset, showToast]);

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
          onDownload={handleDownload}
          canDownload={!!builtPreset}
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
