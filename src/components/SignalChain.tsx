import type { PresetModule } from '../lib/types';
import SignalBlock from './SignalBlock';
import { HARDWARE_SLOTS } from '../lib/hardwareSlots';

interface Props {
  modules: PresetModule[];
  onParamChange: (moduleIndex: number, paramIndex: number, value: number) => void;
}

export default function SignalChain({ modules, onParamChange }: Props) {
  // Always render the 10 hardware slots in fixed order. The modules array is
  // pre-built to match HARDWARE_SLOTS 1:1; the guard handles short arrays.
  const activeCount = modules.filter((m) => m?.enabled && m.fxId).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-white font-semibold text-sm tracking-tight">Cadeia de Sinal</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          ({activeCount} ativos / {HARDWARE_SLOTS.length} slots)
        </span>
      </div>

      <div className="space-y-2">
        {HARDWARE_SLOTS.map((slot, idx) => {
          const mod = modules[idx];
          if (!mod || !mod.fxId || mod.enabled === false) {
            return (
              <div
                key={`bypass-${slot.code}-${idx}`}
                className="bg-surface border border-dashed border-border rounded-xl px-4 py-3 text-xs text-slate-500 flex items-center gap-3"
              >
                <span className="flex items-center justify-center h-7 w-7 rounded-md bg-surface-light border border-border text-slate-600 flex-shrink-0 text-[10px] font-mono">
                  {idx + 1}
                </span>
                <span className="font-medium text-slate-400">{slot.code}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">Desligado (Bypass)</span>
              </div>
            );
          }
          return (
            <SignalBlock
              key={`${mod.fxId}-${idx}`}
              module={mod}
              index={idx}
              onParamChange={(paramIndex, value) => onParamChange(idx, paramIndex, value)}
            />
          );
        })}
      </div>
    </div>
  );
}
