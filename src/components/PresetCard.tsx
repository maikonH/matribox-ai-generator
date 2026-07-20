import type { GeneratedPreset } from '../lib/types';
import SignalChain from './SignalChain';
import { Music2, Volume2, Layers, Loader2, Download } from 'lucide-react';

interface Props {
  preset: GeneratedPreset | null;
  loading: boolean;
  onParamChange: (moduleIndex: number, paramIndex: number, value: number) => void;
  onDownload: () => void;
  canDownload: boolean;
}

export default function PresetCard({ preset, loading, onParamChange, onDownload, canDownload }: Props) {
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
          Descreva um timbre na barra acima e deixe a IA montar sua cadeia de sinal
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
          <button
            onClick={onDownload}
            disabled={!canDownload}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 text-bg-900 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            <Download className="w-4 h-4" />
            Baixar .prst
          </button>
        </div>
      </div>

      <SignalChain modules={preset.modules} onParamChange={onParamChange} />
    </div>
  );
}
