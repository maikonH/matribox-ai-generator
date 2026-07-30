import type { GeneratedPreset } from '../lib/types';
import type { MidiCCCommand } from '../lib/midiBuilder';
import SignalChain from './SignalChain';
import { Music2, Volume2, Layers, Loader2, Usb, CheckCircle2, Radio } from 'lucide-react';

interface Props {
  preset: GeneratedPreset | null;
  loading: boolean;
  injecting: boolean;
  injected: boolean;
  onParamChange: (moduleIndex: number, paramIndex: number, value: number) => void;
  onReinject: () => void;
  midiCommands: MidiCCCommand[];
}

export default function PresetCard({
  preset,
  loading,
  injecting,
  injected,
  onParamChange,
  onReinject,
  midiCommands,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-500/15 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary-500/10 blur-2xl animate-pulse" />
        </div>
        <p className="text-white font-semibold text-sm">Gerando preset com IA...</p>
        <p className="text-slate-500 text-xs mt-1">Analisando algoritmos e montando a cadeia de sinal</p>
      </div>
    );
  }

  if (!preset) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
          <Music2 className="w-8 h-8 text-slate-600" />
        </div>
        <p className="text-slate-400 text-sm font-medium">Nenhum preset gerado ainda</p>
        <p className="text-slate-600 text-xs mt-1 max-w-xs">
          Descreva um timbre na barra acima e a IA enviará os comandos MIDI via USB
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-bold text-lg sm:text-xl tracking-tight leading-tight">
              {preset.title}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mt-2">
              {preset.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light border border-border">
            <Volume2 className="w-4 h-4 text-primary-400" />
            <span className="text-xs text-muted">Vol:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">{preset.volume}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light border border-border">
            <Music2 className="w-4 h-4 text-primary-400" />
            <span className="text-xs text-muted">BPM:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">{preset.bpm}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light border border-border">
            <Layers className="w-4 h-4 text-primary-400" />
            <span className="text-xs text-muted">Módulos:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">
              {preset.modules.length}
            </span>
          </div>

          {/* Injection status / re-inject */}
          <div className="ml-auto flex items-center gap-2">
            {injecting ? (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500/10 border border-primary-500/30 text-primary-300 text-xs font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                Injetando...
              </span>
            ) : injected ? (
              <button
                onClick={onReinject}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 text-bg-900 font-bold text-xs hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                <Usb className="w-4 h-4" />
                Reenviar USB
              </button>
            ) : (
              <button
                onClick={onReinject}
                disabled={midiCommands.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary-500 text-bg-900 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-400 transition-all"
              >
                <Usb className="w-4 h-4" />
                Enviar USB
              </button>
            )}
          </div>
        </div>

        {/* SAVE warning */}
        {injected && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-success-500/30 bg-success-500/5 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-success-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300 leading-relaxed">
              Timbre injetado via USB em tempo real. Se gostar do som, pressione o botão físico{' '}
              <span className="font-bold text-white">SAVE</span> na pedaleira para gravar permanentemente.
            </p>
          </div>
        )}
      </div>

      {/* MIDI CC activity log */}
      {midiCommands.length > 0 && (
        <div className="rounded-2xl bg-bg-900 border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-primary-400" />
            <h3 className="text-muted text-xs font-bold uppercase tracking-wide">
              Comandos MIDI CC enviados ({midiCommands.length})
            </h3>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
            {midiCommands.map((cmd, i) => (
              <div key={i} className="flex items-center gap-3 py-0.5">
                <span className="text-primary-400 w-20 shrink-0">CC{cmd.cc}</span>
                <span className="text-slate-300 w-10 shrink-0 tabular-nums">{cmd.value}</span>
                <span className="text-muted truncate">{cmd.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SignalChain modules={preset.modules} onParamChange={onParamChange} />
    </div>
  );
}
