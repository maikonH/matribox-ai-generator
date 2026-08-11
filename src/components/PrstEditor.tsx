import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, RotateCcw, Upload } from 'lucide-react';
import {
  bytesToBase64,
  decodePrst,
  encodePrst,
  findEffectByFxid,
  getAmpListGrouped,
  getCabList,
  normalizeWidgetValue,
  reconcileFloats,
  updateFloat,
  updateFxid,
  type PrstBlock,
  type PrstDecoded,
  type PrstEffect,
  type PrstWidget,
} from '../lib/prstEditor';

export default function PrstEditor() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [decoded, setDecoded] = useState<PrstDecoded | null>(null);
  const [bytes, setBytes] = useState<number[]>([]);
  const [originalBytes, setOriginalBytes] = useState<number[]>([]);
  const [updateTimestamp, setUpdateTimestamp] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'amp' | 'cab'>('amp');

  useEffect(() => {
    if (!decoded) return;
    const kinds = new Set(decoded.blocks.map((block) => block.kind));
    if (!kinds.has(activeTab)) setActiveTab(decoded.blocks[0]?.kind ?? 'amp');
  }, [decoded, activeTab]);

  const changedOffsets = useMemo(
    () => bytes.flatMap((byte, index) => (byte !== originalBytes[index] ? [index] : [])),
    [bytes, originalBytes],
  );

  const refreshFromBytes = useCallback((nextBytes: number[]) => {
    setBytes(nextBytes);
    try {
      setDecoded(decodePrst(bytesToBase64(nextBytes)));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o preset.');
    }
  }, []);

  const loadPreset = useCallback((content: string) => {
    try {
      const next = decodePrst(content);
      setInput(content.trim());
      setOutput('');
      setBytes([...next.bytes]);
      setOriginalBytes([...next.bytes]);
      setDecoded(next);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o preset.');
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    loadPreset(await file.text());
  }, [loadPreset]);

  const handleDecode = useCallback(() => {
    loadPreset(input);
  }, [input, loadPreset]);

  const handleReset = useCallback(() => {
    setBytes([...originalBytes]);
    if (originalBytes.length > 0) setDecoded(decodePrst(bytesToBase64(originalBytes)));
    setOutput('');
    setError('');
  }, [originalBytes]);

  const handleFloatChange = useCallback((offset: number, value: number, widget?: PrstWidget) => {
    const normalized = widget ? normalizeWidgetValue(widget, value) : value;
    if (!Number.isFinite(normalized)) return;
    const next = [...bytes];
    updateFloat(next, offset, normalized);
    refreshFromBytes(next);
  }, [bytes, refreshFromBytes]);

  const handleEffectChange = useCallback((block: PrstBlock, effect: PrstEffect) => {
    const next = [...bytes];
    updateFxid(next, block, effect.fxid);
    reconcileFloats(next, block, effect);
    refreshFromBytes(next);
  }, [bytes, refreshFromBytes]);

  const handleExport = useCallback(() => {
    if (!decoded || bytes.length === 0) return;
    const next = [...bytes];
    if (updateTimestamp) {
      const timestamp = Math.floor(Date.now() / 1000) >>> 0;
      next[26] = timestamp & 0xff;
      next[27] = (timestamp >>> 8) & 0xff;
      next[28] = (timestamp >>> 16) & 0xff;
      next[29] = (timestamp >>> 24) & 0xff;
      refreshFromBytes(next);
    }
    const base64 = encodePrst(next);
    setOutput(base64);
    const blob = new Blob([base64], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${decoded.name.replace(/[^a-z0-9]+/gi, '-') || 'preset'}.prst`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [bytes, decoded, refreshFromBytes, updateTimestamp]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer hover:bg-cyan-300 transition-colors">
          <Upload className="w-4 h-4" />
          Importar .prst
          <input type="file" accept=".prst,.txt,text/plain" className="sr-only" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
            event.target.value = '';
          }} />
        </label>
        <button onClick={handleDecode} disabled={!input.trim()} className="h-10 px-4 rounded-xl border border-slate-700 bg-[#0b0f19] text-slate-200 text-xs font-semibold hover:border-cyan-500/60 disabled:opacity-40 transition-colors">
          Decodificar conteúdo colado
        </button>
        <button onClick={handleReset} disabled={changedOffsets.length === 0} className="h-10 px-4 rounded-xl border border-slate-700 bg-[#0b0f19] text-slate-300 text-xs font-semibold hover:border-slate-500 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> Restaurar original
        </button>
      </div>

      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Cole aqui a string Base64 do arquivo .prst"
        spellCheck={false}
        className="w-full h-24 rounded-xl bg-[#05080f] border border-slate-800/80 px-3 py-2 text-[11px] font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-cyan-500/60 resize-y"
      />

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {decoded && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Meta label="Preset" value={decoded.name} />
            <Meta label="Timestamp" value={decoded.timestamp || '—'} />
            <Meta label="Tamanho" value={`${bytes.length} bytes`} />
            <Meta label="Alterações" value={`${changedOffsets.length} bytes`} accent={changedOffsets.length > 0} />
          </div>

          {decoded.blocks.length === 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Nenhum bloco conhecido foi detectado. O preset está em modo avançado e apenas os floats encontrados podem ser visualizados/editados.
            </div>
          )}

          {decoded.blocks.length > 0 && (
            <>
              <div className="inline-flex rounded-lg border border-slate-800/60 bg-[#0b0f19] p-1">
                {(['amp', 'cab'] as const).filter((kind) => decoded.blocks.some((block) => block.kind === kind)).map((kind) => (
                  <button key={kind} onClick={() => setActiveTab(kind)} className={`px-4 h-8 rounded-md text-xs font-semibold transition-colors ${activeTab === kind ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {decoded.blocks.filter((block) => block.kind === activeTab).map((block) => (
                  <BlockEditor key={`${block.start}-${block.encodedFxid}`} block={block} bytes={bytes} onFloatChange={handleFloatChange} onEffectChange={handleEffectChange} />
                ))}
              </div>
            </>
          )}

          {changedOffsets.length > 0 && (
            <div className="rounded-xl border border-slate-800/60 bg-[#0b0f19] overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800/60 text-xs font-semibold text-slate-300">Resumo de bytes alterados</div>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/40">
                {changedOffsets.map((offset) => <div key={offset} className="px-3 py-1.5 text-[11px] font-mono text-slate-400">#{offset}: {hex(originalBytes[offset])} → <span className="text-amber-300">{hex(bytes[offset])}</span></div>)}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={updateTimestamp} onChange={(event) => setUpdateTimestamp(event.target.checked)} className="accent-cyan-400" />
              atualizar timestamp ao exportar
            </label>
            <button onClick={handleExport} className="sm:ml-auto h-10 px-4 rounded-xl bg-cyan-400 text-slate-950 text-xs font-bold hover:bg-cyan-300 transition-colors flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Exportar .prst
            </button>
          </div>

          {output && <textarea readOnly value={output} className="w-full h-24 rounded-xl bg-[#05080f] border border-emerald-500/30 px-3 py-2 text-[11px] font-mono text-emerald-200 resize-y" aria-label="Base64 exportado" />}
        </>
      )}
    </div>
  );
}

function BlockEditor({ block, bytes, onFloatChange, onEffectChange }: { block: PrstBlock; bytes: number[]; onFloatChange: (offset: number, value: number, widget?: PrstWidget) => void; onEffectChange: (block: PrstBlock, effect: PrstEffect) => void }) {
  const ampGroups = useMemo(getAmpListGrouped, []);
  const cabList = useMemo(getCabList, []);
  const isCab = block.kind === 'cab';
  const widgets = block.effect.widgets;
  const floats = block.floats;
  const floatCount = floats.length;
  const mode = block.mode;

  return (
    <section className="rounded-xl border border-slate-800/60 bg-[#0b0f19] p-3 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{block.effect.name}</div>
          <div className="text-[10px] font-mono text-slate-500">offset {block.start} · FXID {block.effect.fxid} · 0x{block.encodedFxid.toString(16).toUpperCase().padStart(8, '0')} · {mode}</div>
        </div>
        <div className="lg:ml-auto w-full lg:w-80">
          <select value={block.effect.fxid} onChange={(event) => {
            const selected = findEffectByFxid(Number(event.target.value));
            if (selected) onEffectChange(block, selected);
          }} className="w-full h-9 rounded-lg bg-[#05080f] border border-slate-700 px-2 text-xs text-slate-200">
            {isCab ? cabList.map((cab) => <option key={cab.fxid} value={cab.fxid}>{cab.label}</option>) : ampGroups.map((group) => (
              <optgroup key={group.type} label={group.type}>
                {group.amps.map((amp) => <option key={amp.fxid} value={amp.fxid}>{amp.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      {block.warning && <div className="text-[11px] text-amber-200 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-2">{block.warning}</div>}

      {mode === 'matched' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {widgets.map((widget, index) => (
            <FloatEditor key={widget.id ?? index} floatOffset={floats[index].offset} value={readFloat(bytes, floats[index].offset)} widget={widget} onChange={onFloatChange} />
          ))}
        </div>
      )}

      {mode === 'compressed' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {widgets.map((widget, index) => (
            <ReadOnlyFloat key={widget.id ?? index} label={widget.name} value={widget.defaultValue} unit="" />
          ))}
        </div>
      )}

      {mode === 'extra' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {widgets.map((widget, index) => (
              <FloatEditor key={widget.id ?? index} floatOffset={floats[index].offset} value={readFloat(bytes, floats[index].offset)} widget={widget} onChange={onFloatChange} />
            ))}
          </div>
          <div className="rounded-lg border border-slate-800/40 bg-[#05080f] px-3 py-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Floats extra (não mapeados)</div>
            {block.extraFloats.map((f) => (
              <div key={f.offset} className="text-[11px] font-mono text-slate-500">offset {f.offset}: {f.value.toFixed(3)}</div>
            ))}
          </div>
        </>
      )}

      {mode === 'none' && floatCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {widgets.length > 0 ? widgets.map((widget, index) => {
            const float = floats[index];
            return float ? (
              <FloatEditor
                key={widget.id ?? index}
                floatOffset={float.offset}
                value={readFloat(bytes, float.offset)}
                widget={widget}
                onChange={onFloatChange}
              />
            ) : (
              <ReadOnlyFloat
                key={widget.id ?? index}
                label={widget.name}
                value={widget.defaultValue}
                unit=""
                reason="não encontrado no arquivo"
              />
            );
          }) : floats.map((f) => (
            <FloatEditor key={f.offset} floatOffset={f.offset} value={readFloat(bytes, f.offset)} onChange={onFloatChange} />
          ))}
        </div>
      )}

      {mode === 'none' && floatCount === 0 && (
        <p className="text-xs text-slate-500 py-2">Nenhum float editável encontrado para este bloco.</p>
      )}
    </section>
  );
}

function ReadOnlyFloat({ label, value, unit, reason = 'modo comprimido' }: { label: string; value: number; unit?: string; reason?: string }) {
  return (
    <div className="rounded-lg border border-slate-800/60 px-3 py-2 text-xs text-slate-400 opacity-70">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-slate-500">{value.toFixed(3)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="text-[10px] text-slate-600 mt-0.5">somente leitura ({reason})</div>
    </div>
  );
}

function FloatEditor({ floatOffset, value, widget, onChange }: { floatOffset: number; value: number; widget?: PrstWidget; onChange: (offset: number, value: number, widget?: PrstWidget) => void }) {
  const label = widget?.name ?? `float #${floatOffset}`;
  const min = widget?.min ?? -20001;
  const max = widget?.max ?? 20001;
  const step = widget?.step ?? 0.01;
  if (widget?.widgetType === 1) {
    return <label className="flex items-center gap-3 rounded-lg border border-slate-800/60 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={value >= 0.5} onChange={(event) => onChange(floatOffset, event.target.checked ? 1 : 0, widget)} className="accent-cyan-400" />{label}<span className="ml-auto font-mono text-slate-500">{value.toFixed(3)}</span></label>;
  }
  if (widget?.widgetType === 2 && widget.options.length > 0) {
    return <label className="space-y-1 text-xs text-slate-300"><span>{label}</span><select value={String(Math.round(value))} onChange={(event) => onChange(floatOffset, Number(event.target.value), widget)} className="w-full h-9 rounded-lg bg-[#05080f] border border-slate-700 px-2 text-xs text-slate-200">{widget.options.map((option, index) => <option key={option} value={index}>{option}</option>)}</select></label>;
  }
  const displayValue = widget?.id === '5' && value === 19 || widget?.id === '6' && value === 20001 ? 'Off' : value.toFixed(3);
  return <label className="space-y-1 text-xs text-slate-300"><span className="flex justify-between"><span>{label}</span><span className="font-mono text-slate-500">{displayValue} · offset {floatOffset}</span></span><div className="flex items-center gap-2"><input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(floatOffset, Number(event.target.value), widget)} className="flex-1 accent-cyan-400" /><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(floatOffset, Number(event.target.value), widget)} className="w-24 h-8 rounded-lg bg-[#05080f] border border-slate-700 px-2 text-xs font-mono text-white" /></div></label>;
}

function Meta({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-lg border border-slate-800/60 bg-[#0b0f19] px-3 py-2 min-w-0"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className={`text-xs font-mono truncate ${accent ? 'text-amber-300' : 'text-slate-200'}`}>{value}</div></div>;
}

function readFloat(bytes: number[], offset: number): number {
  const buffer = new ArrayBuffer(4);
  new Uint8Array(buffer).set(bytes.slice(offset, offset + 4));
  return new DataView(buffer).getFloat32(0, true);
}

function hex(value: number | undefined): string {
  return value === undefined ? '--' : `0x${value.toString(16).padStart(2, '0').toUpperCase()}`;
}
