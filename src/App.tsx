import { useState, useCallback } from 'react';
import { Usb } from 'lucide-react';
import Header from './components/Header';
import SettingsDrawer from './components/SettingsDrawer';
import PromptBar from './components/PromptBar';
import PresetCard from './components/PresetCard';
import ToastContainer from './components/ToastContainer';
import { useToasts } from './hooks/useToasts';
import { loadAlgorithms, setDevOverlay } from './lib/algorithmStore';
import { ALGORITHM_COUNT } from './lib/algorithmCatalog';
import { generatePreset, aiResponseToPreset } from './lib/gemini';
import { buildMidiPreset, type BuiltMidiPreset, type MidiCommand, DELAY_SYSEX, DELAY_CC } from './lib/midiBuilder';
import { connectMatribox, sendCC, sendSysEx, getOutput } from './lib/midiSender';
import type { Algorithm, GeneratedPreset } from './lib/types';

export default function App() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>(() => loadAlgorithms());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<GeneratedPreset | null>(null);
  const [midiCommands, setMidiCommands] = useState<MidiCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState(false);
  const { toasts, showToast, dismiss } = useToasts();

  const runGeneration = useCallback(
    (promptText: string, merged: Algorithm[]) => {
      setLoading(true);
      setInjected(false);
      generatePreset(promptText, merged)
        .then(async (ai) => {
          setPreset(aiResponseToPreset(ai, algorithms));
          const built = buildMidiPreset(ai);
          setMidiCommands(built.commands);
          showToast(`Preset "${ai.nomePatch}" montado pela IA. Injetando via USB...`, 'info');
          await injectMidi(built);
        })
        .catch((e: Error) => showToast(e.message, 'error'))
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast, algorithms],
  );

  const injectMidi = useCallback(
    async (built: BuiltMidiPreset) => {
      setInjecting(true);
      try {
        let output = getOutput();
        if (!output) {
          output = await connectMatribox();
          showToast('Conectado à Matribox II Pro via USB', 'success');
        }
        for (const cmd of built.commands) {
          if (cmd.type === 'sysex') {
            sendSysEx(output, cmd.bytes);
            await new Promise((r) => setTimeout(r, DELAY_SYSEX));
          } else {
            sendCC(output, cmd.cc, cmd.value);
            await new Promise((r) => setTimeout(r, DELAY_CC));
          }
        }
        setInjected(true);
        showToast(`Timbre "${built.nomePatch}" injetado em tempo real!`, 'success');
      } catch (e) {
        showToast(`Erro MIDI: ${(e as Error).message}`, 'error');
      } finally {
        setInjecting(false);
      }
    },
    [showToast],
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

  const handleReinject = useCallback(() => {
    if (midiCommands.length === 0) return;
    injectMidi({ commands: midiCommands, nomePatch: preset?.title ?? '', comentario: '' });
  }, [midiCommands, preset, injectMidi]);

  return (
    <div className="min-h-screen bg-bg-900 text-slate-200">
      <Header algCount={ALGORITHM_COUNT} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-3">
          <div className="text-center">
            <h2 className="text-white font-bold text-2xl sm:text-3xl tracking-tight">
              Gerar Preset por IA
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Descreva o som e a IA monta a cadeia de sinal, enviada em tempo real via USB
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

        {/* Real-time USB injection banner */}
        <div className="flex items-start gap-3 rounded-xl border border-primary-500/30 bg-primary-500/5 px-4 py-3">
          <Usb className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="font-semibold text-primary-300">Tempo real via USB.</span>{' '}
            Timbre injetado via USB em tempo real. Se gostar do som, pressione o botão físico{' '}
            <span className="font-bold text-white">SAVE</span> na pedaleira para gravar permanentemente.
          </p>
        </div>

        <PresetCard
          preset={preset}
          loading={loading}
          injecting={injecting}
          injected={injected}
          onParamChange={handleParamChange}
          onReinject={handleReinject}
          midiCommands={midiCommands}
        />
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

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
