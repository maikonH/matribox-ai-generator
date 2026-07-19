import type { PresetModuleParam } from '../lib/types';

interface Props {
  param: PresetModuleParam;
  onChange: (value: number) => void;
}

export default function ToggleSwitch({ param, onChange }: Props) {
  const isOn = param.value >= 0.5;

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-28 sm:w-32 shrink-0">
        <p className="text-xs text-slate-400 truncate font-medium">{param.displayName || param.name}</p>
      </div>

      <div className="flex-1 flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={param.displayName || param.name}
          onClick={() => onChange(isOn ? 0 : 1)}
          className={`relative h-7 w-16 rounded-full border transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
            isOn
              ? 'bg-cyan-400/20 border-cyan-400/70 shadow-[0_0_14px_-2px_rgba(34,211,238,0.7)]'
              : 'bg-slate-800/70 border-slate-700/70'
          }`}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full transition-all duration-300 ease-out ${
              isOn
                ? 'left-[calc(100%-1.5rem)] bg-cyan-300 shadow-[0_0_10px_-1px_rgba(34,211,238,0.9)]'
                : 'left-0.5 bg-slate-500 shadow-inner'
            }`}
          />
        </button>
      </div>

      <div className="w-16 sm:w-20 shrink-0 text-right">
        <span
          className={`text-xs font-mono tabular-nums transition-colors duration-200 ${
            isOn ? 'font-bold text-cyan-300' : 'text-slate-500'
          }`}
        >
          {isOn ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
}
