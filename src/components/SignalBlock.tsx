import { useState } from 'react';
import type { PresetModule, PresetModuleParam } from '../lib/types';
import PremiumSlider from './PremiumSlider';
import ToggleSwitch from './ToggleSwitch';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TOGGLE_NAMES = new Set(['sync', 'trail', 'switch']);

function isToggleParam(param: PresetModuleParam): boolean {
  if (TOGGLE_NAMES.has(param.name.toLowerCase())) return true;
  return param.min === 0 && param.max === 1;
}

interface Props {
  module: PresetModule;
  index: number;
  onParamChange: (paramIndex: number, value: number) => void;
}

const typeColors: Record<string, string> = {
  COMP: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  DRIVE: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  AMP: 'text-red-400 bg-red-400/10 border-red-400/30',
  CAB: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  EQ: 'text-green-400 bg-green-400/10 border-green-400/30',
  DELAY: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  REVERB: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  MOD: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/30',
};

export default function SignalBlock({ module, index, onParamChange }: Props) {
  const [expanded, setExpanded] = useState(index === 0);
  const colorClass = typeColors[module.type] || 'text-slate-400 bg-slate-400/10 border-slate-400/30';

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden transition-all">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-light/50 transition-colors text-left"
      >
        <span className="text-slate-600 font-mono text-xs tabular-nums w-6 text-right shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${colorClass}`}>
          {module.subType || module.type}
        </span>
        <span className="text-white text-sm font-medium truncate flex-1">{module.fxTitle}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px]' : 'max-h-0'
        }`}
      >
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border">
          {module.params.map((param, pIdx) =>
            isToggleParam(param) ? (
              <ToggleSwitch
                key={param.name}
                param={param}
                onChange={(value) => onParamChange(pIdx, value)}
              />
            ) : (
              <PremiumSlider
                key={param.name}
                param={param}
                onChange={(value) => onParamChange(pIdx, value)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
