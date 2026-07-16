import type { PresetModuleParam } from '../lib/types';

interface Props {
  param: PresetModuleParam;
  onChange: (value: number) => void;
}

export default function PremiumSlider({ param, onChange }: Props) {
  const { name, displayName, value, min, max, unit } = param;
  const range = max - min;
  const percent = range > 0 ? ((value - min) / range) * 100 : 0;

  return (
    <div className="flex items-center gap-3 group">
      <div className="w-28 sm:w-32 shrink-0">
        <p className="text-xs text-slate-400 truncate font-medium">{displayName || name}</p>
      </div>

      <div className="flex-1 relative">
        <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={range > 100 ? 1 : range > 10 ? 0.1 : 0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
          aria-label={displayName || name}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-md shadow-cyan-500/50 ring-2 ring-cyan-400/30 pointer-events-none transition-all duration-150"
          style={{ left: `calc(${percent}% - 6px)` }}
        />
      </div>

      <div className="w-16 sm:w-20 shrink-0 text-right">
        <span className="text-xs font-mono text-cyan-300 tabular-nums">
          {value.toFixed(range > 100 ? 0 : 1)}
        </span>
        {unit && <span className="text-[10px] text-slate-600 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
