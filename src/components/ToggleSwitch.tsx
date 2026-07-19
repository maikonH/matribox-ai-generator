import type { PresetModuleParam } from '../lib/types';

interface Props {
  param: PresetModuleParam;
  onChange: (value: number) => void;
}

export default function ToggleSwitch({ param, onChange }: Props) {
  const isOn = param.value >= 0.5;

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-xs text-slate-400 truncate font-medium">
        {param.displayName || param.name}
      </p>

      <button
        type="button"
        aria-pressed={isOn}
        aria-label={param.displayName || param.name}
        onClick={() => onChange(isOn ? 0 : 1)}
        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide leading-none transition-all duration-200 focus:outline-none ${
          isOn
            ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/60 shadow-[0_0_8px_-1px_rgba(34,211,238,0.6)]'
            : 'bg-slate-800/80 text-slate-500 border border-slate-700/60'
        }`}
      >
        {isOn ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}


export default ToggleSwitch