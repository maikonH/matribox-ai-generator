import type { BasePreset } from '../lib/basePresets';
import { Check, ChevronDown, Guitar, Search } from 'lucide-react';
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
  const [query, setQuery] = useState('');
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

  const filtered = query.trim()
    ? basePresets.filter((bp) => {
        const q = query.toLowerCase();
        return (
          bp.name.toLowerCase().includes(q) ||
          bp.ampName.toLowerCase().includes(q) ||
          bp.cabName.toLowerCase().includes(q) ||
          bp.description.toLowerCase().includes(q)
        );
      })
    : basePresets;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Guitar className="w-4 h-4 text-primary-400" />
        <span className="font-semibold uppercase tracking-wider">Tom Base (Amp + Cab)</span>
      </div>

      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="w-full h-12 rounded-xl bg-bg-700 border border-border px-4 text-left text-sm text-white flex items-center justify-between gap-3 hover:border-primary-500/40 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/50 transition-all disabled:opacity-50"
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
          <div className="absolute z-50 mt-2 w-full rounded-xl bg-surface border border-border shadow-2xl shadow-black/60 py-1">
            <div className="px-2 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar amp…"
                  className="w-full h-8 rounded-lg bg-bg-900 border border-border pl-8 pr-3 text-xs text-white placeholder:text-subtext focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between gap-2 hover:bg-surface-light/50 transition-colors ${
                  !selected ? 'text-primary-400' : 'text-muted'
                }`}
              >
                <span>Nenhum (IA escolhe o amp)</span>
                {!selected && <Check className="w-4 h-4 shrink-0" />}
              </button>
              <div className="h-px bg-border my-1" />
              {filtered.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => {
                    onSelect(bp.id);
                    setOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-start justify-between gap-2 hover:bg-surface-light/50 transition-colors ${
                    selectedId === bp.id ? 'text-primary-400' : 'text-slate-300'
                  }`}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="font-semibold truncate">{bp.name}</span>
                    <span className="text-slate-500 text-xs truncate">
                      {bp.ampName} + {bp.cabName}
                    </span>
                  </span>
                  {selectedId === bp.id && <Check className="w-4 h-4 shrink-0 mt-0.5" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-xs text-slate-600">Nenhum amp encontrado.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
