import type { BasePreset } from '../lib/basePresets';
import { Check, ChevronDown, Guitar } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Props {
  basePresets: BasePreset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
}

export default function BasePresetSelector({
  basePresets,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = basePresets.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Guitar className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold uppercase tracking-wider">Tom Base (Amp + Cab)</span>
      </div>

      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="w-full h-12 rounded-xl bg-[#0b0f19] border border-slate-800/80 px-4 text-left text-sm text-white flex items-center justify-between gap-3 hover:border-cyan-500/40 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all disabled:opacity-50"
        >
          <span className="truncate">
            {selected ? (
              <span className="flex flex-col min-w-0">
                <span className="text-white font-semibold truncate">{selected.name}</span>
                <span className="text-slate-500 text-xs truncate">
                  {selected.ampName} + {selected.cabName}
                </span>
              </span>
            ) : (
              <span className="text-slate-500">Selecione um tom base…</span>
            )}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-full max-h-72 overflow-y-auto rounded-xl bg-[#0b0f19] border border-slate-800/80 shadow-2xl shadow-black/60 py-1">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between gap-2 hover:bg-slate-800/40 transition-colors ${
                !selected ? 'text-cyan-300' : 'text-slate-400'
              }`}
            >
              <span>Nenhum (IA escolhe o amp)</span>
              {!selected && <Check className="w-4 h-4 shrink-0" />}
            </button>
            <div className="h-px bg-slate-800/60 my-1" />
            {basePresets.map((bp) => (
              <button
                key={bp.id}
                type="button"
                onClick={() => {
                  onSelect(bp.id);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-start justify-between gap-2 hover:bg-slate-800/40 transition-colors ${
                  selectedId === bp.id ? 'text-cyan-300' : 'text-slate-300'
                }`}
              >
                <span className="flex flex-col min-w-0">
                  <span className="font-semibold truncate">{bp.name}</span>
                  <span className="text-slate-500 text-xs truncate">
                    {bp.ampName} + {bp.cabName}
                  </span>
                  <span className="text-slate-600 text-[11px] mt-0.5 line-clamp-2">
                    {bp.description}
                  </span>
                </span>
                {selectedId === bp.id && <Check className="w-4 h-4 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
