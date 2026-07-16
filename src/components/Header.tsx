import { Settings, Zap, Cpu } from 'lucide-react';

interface Props {
  algCount: number;
  onOpenSettings: () => void;
}

export default function Header({ algCount, onOpenSettings }: Props) {
  return (
    <header className="sticky top-0 z-50 bg-[#030712]/80 backdrop-blur-xl border-b border-slate-800/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap className="w-5 h-5 text-slate-950" strokeWidth={2.5} />
            </div>
            <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-lg -z-10" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-base sm:text-lg leading-tight tracking-tight truncate">
              Matribox II Pro
            </h1>
            <p className="text-slate-400 text-xs leading-tight hidden sm:block">
              Gerador Inteligente de Presets por IA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-slate-800/80">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-300 tabular-nums">
              <span className="text-cyan-300">{algCount}</span>
              <span className="text-slate-500"> algs</span>
            </span>
          </div>

          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            className="w-10 h-10 rounded-lg bg-[#0b0f19] border border-slate-800/80 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all duration-200 group"
          >
            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
      </div>
    </header>
  );
}
