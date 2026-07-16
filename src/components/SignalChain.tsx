import type { PresetModule } from '../lib/types';
import SignalBlock from './SignalBlock';

interface Props {
  modules: PresetModule[];
  onParamChange: (moduleIndex: number, paramIndex: number, value: number) => void;
}

export default function SignalChain({ modules, onParamChange }: Props) {
  if (modules.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-white font-semibold text-sm tracking-tight">Cadeia de Sinal</h3>
        <span className="text-xs text-slate-500 tabular-nums">({modules.length} módulos)</span>
      </div>

      <div className="space-y-2">
        {modules.map((mod, idx) => (
          <SignalBlock
            key={`${mod.fxId}-${idx}`}
            module={mod}
            index={idx}
            onParamChange={(paramIndex, value) => onParamChange(idx, paramIndex, value)}
          />
        ))}
      </div>
    </div>
  );
}
