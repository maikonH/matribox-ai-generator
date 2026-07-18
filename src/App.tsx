import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import SettingsDrawer from './components/SettingsDrawer';
import PromptBar from './components/PromptBar';
import PresetCard from './components/PresetCard';
import BasePresetSelector from './components/BasePresetSelector';
import ToastContainer from './components/ToastContainer';
import { useToasts } from './hooks/useToasts';
import { loadAlgorithmsAsync } from './lib/algorithmStore';
import { generatePreset } from './lib/gemini';
import { downloadPreset } from './lib/presetDownload';
import { basePresets, getBasePreset } from './lib/basePresets';
import { getBaseAlgorithms } from './lib/baseAlgorithms';
import type { Algorithm, GeneratedPreset } from './lib/types';

export default function App() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<GeneratedPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const { toasts, showToast, dismiss } = useToasts();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAlgorithmsAsync();
      if (cancelled) return;
      // Merge base amp/cab algorithms so the AI always knows about the
      // base tones even if the user uploaded a partial alg_data.json.
      const baseAlgs = getBaseAlgorithms();
      const existing = new Set(loaded.map((a) => a.fxId));
      const merged = [...loaded, ...baseAlgs.filter((a) => !existing.has(a.fxId))];
      setAlgorithms(merged);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    const base = getBasePreset(selectedBaseId ?? '') ?? null;
    const merged = algorithms.length > 0 ? algorithms : getBaseAlgorithms();
    if (merged.length === 0) {
      showToast('Nenhum algoritmo carregado. Abra Settings e faça upload do JSON.', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await generatePreset(prompt.trim(), merged, base);
      setPreset(result);
      showToast(`Preset "${result.title}" gerado com sucesso!`, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, algorithms, selectedBaseId, showToast]);

  const handleQuickPrompt = useCallback(
    (quick: string) => {
      setPrompt(quick);
      setLoading(true);
      const base = getBasePreset(selectedBaseId ?? '') ?? null;
      const merged = algorithms.length > 0 ? algorithms : getBaseAlgorithms();
      const run = async () => {
        if (merged.length === 0) {
          showToast('Nenhum algoritmo carregado. Abra Settings e faça upload do JSON.', 'error');
          setLoading(false);
          return;
        }
        try {
          const result = await generatePreset(quick, merged, base);
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
    [algorithms, selectedBaseId, showToast],
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

  const handleDownload = useCallback(() => {
    if (preset) {
      const base = getBasePreset(selectedBaseId ?? '');
      // When no base was manually selected, use the amp fxId the AI chose
      // (module index 1 = AMP slot) so buildBasePresetBytes is called and
      // the amp byte injection works exactly as with a manual selection.
      const ampFxId = base?.ampFxId ?? preset.modules[1]?.fxId;
      const cabFxId = base?.cabFxId ?? preset.modules[2]?.fxId;
      downloadPreset(preset, ampFxId, cabFxId);
      showToast('Download do preset iniciado.', 'success');
    }
  }, [preset, selectedBaseId, showToast]);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200">
      <Header algCount={algorithms.length} onOpenSettings={() => setSettingsOpen(true)} />

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
          <BasePresetSelector
            basePresets={basePresets}
            selectedId={selectedBaseId}
            onSelect={setSelectedBaseId}
            disabled={loading}
          />
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
