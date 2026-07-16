import type { GeneratedPreset } from '../lib/types';
import SignalChain from './SignalChain';
import { Download, Music2, Volume2, Layers, Loader2 } from 'lucide-react';

interface Props {
  preset: GeneratedPreset | null;
  loading: boolean;
  onParamChange: (moduleIndex: number, paramIndex: number, value: number) => void;
  onDownload: () => void;
}

export default function PresetCard({ preset, loading, onParamChange, onDownload }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400/20 to-sky-500/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-2xl animate-pulse" />
        </div>
        <p className="text-white font-semibold text-sm">Gerando preset com IA...</p>
        <p className="text-slate-500 text-xs mt-1">Analisando algoritmos e montando a cadeia de sinal</p>
      </div>
    );
  }

  if (!preset) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#0b0f19] border border-slate-800/60 flex items-center justify-center mb-4">
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
      <div className="bg-[#0b0f19] border border-slate-800/80 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-bold text-lg sm:text-xl tracking-tight leading-tight">
              {preset.title}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mt-2">
              {preset.description}
            </p>
          </div>
          <button
            onClick={onDownload}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-bold text-sm flex items-center gap-2 hover:shadow-lg hover:shadow-cyan-500/30 transition-all whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Baixar .prst
          </button>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-800/60">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1527] border border-slate-800/60">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">Vol:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">{preset.volume}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1527] border border-slate-800/60">
            <Music2 className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">BPM:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">{preset.bpm}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1527] border border-slate-800/60">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">Módulos:</span>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">
              {preset.modules.length}
            </span>
          </div>
        </div>
      </div>

      <SignalChain modules={preset.modules} onParamChange={onParamChange} />
    </div>
  );
}
