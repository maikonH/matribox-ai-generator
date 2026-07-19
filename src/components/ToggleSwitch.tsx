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
            ? 'bg-success-500 text-white border border-success-400 shadow-glow'
            : 'bg-surface-light text-muted border border-border'
        }`}
      >
        {isOn ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}