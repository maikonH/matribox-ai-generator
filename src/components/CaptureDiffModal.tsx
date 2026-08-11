import { useState, useMemo, useCallback } from 'react';
import {
  X,
  GitCompareArrows,
  Eraser,
  Info,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  FileDown,
  Upload,
} from 'lucide-react';
import {
  parseCaptureInput,
  diffSysEx,
  summarizeDiff,
  toHex,
  byteKindLabel,
  byteKindTone,
  type ByteDiff,
  type DiffSummary,
} from '../lib/captureDiff';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SAMPLE_A = 'F0 21 25 4D 50 00 0B 00 00 09 40 50 60 70 0C 00 00 00 10 20 30 40 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2A F7';
const SAMPLE_B = 'F0 21 25 4D 50 00 0B 00 00 09 7F 50 60 70 0C 00 00 00 10 20 30 40 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2A F7';

export default function CaptureDiffModal({ open, onClose }: Props) {
  const [baselineText, setBaselineText] = useState('');
  const [changedText, setChangedText] = useState('');
  const [note, setNote] = useState('');

  const baseline = useMemo(() => parseCaptureInput(baselineText), [baselineText]);
  const changed = useMemo(() => parseCaptureInput(changedText), [changedText]);

  const diff = useMemo(() => {
    if (baseline.error || changed.error) return null;
    return diffSysEx(baseline.bytes, changed.bytes);
  }, [baseline, changed]);

  const summaries = useMemo<DiffSummary[]>(
    () => (diff ? summarizeDiff(diff) : []),
    [diff],
  );

  const canCompare = !baseline.error && !changed.error && baseline.bytes.length > 0 && changed.bytes.length > 0;

  const handleClear = useCallback(() => {
    setBaselineText('');
    setChangedText('');
    setNote('');
  }, []);

  const handleImport = useCallback(async (file: File, side: 'baseline' | 'changed') => {
    const text = await file.text();
    if (side === 'baseline') setBaselineText(text);
    else setChangedText(text);
  }, []);

  const handleLoadSample = useCallback(() => {
    setBaselineText(SAMPLE_A);
    setChangedText(SAMPLE_B);
    setNote('Comparar: knob de mix do Delay mudou de 0x40 para 0x7F (byte 9).');
  }, []);

  const handleExport = useCallback(() => {
    if (!diff) return;
    const lines: string[] = [];
    lines.push('# Diff de captura SysEx — Matribox II Pro');
    lines.push(`# Nota: ${note || '(sem nota)'}`);
    lines.push(`# Baseline: ${baseline.bytes.length} bytes | Alterado: ${changed.bytes.length} bytes`);
    lines.push(`# Bytes alterados: ${diff.changedIndices.length}`);
    lines.push('');
    lines.push('idx  base  alt   papel              decifrado');
    lines.push('---  ----  ----  ----------------  ---------');
    for (const b of diff.bytes) {
      if (!b.moved) continue;
      const base = b.baseline !== null ? toHex(b.baseline) : '----';
      const ch = b.changed !== null ? toHex(b.changed) : '----';
      lines.push(
        `${String(b.index).padStart(3)}  ${base}  ${ch}  ${byteKindLabel(b.kind).padEnd(16)}  ${note || '(sem nota)'}`,
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matribox-diff-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [diff, baseline, changed, note]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-4xl max-h-[92vh] bg-[#030712] border border-slate-800/60 rounded-2xl flex flex-col shadow-2xl animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-5 h-5 text-cyan-400" />
              <h2 className="text-white font-bold text-sm tracking-tight">
                Diff de Captura SysEx
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Intro */}
            <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed">
                Cole duas capturas do Wireshark/USBPcap (uma <span className="text-white font-semibold">base</span> e uma
                <span className="text-white font-semibold"> alterada</span> com um único botão/efeito mudado). A ferramenta
                remove o enquadramento USB-MIDI (<span className="font-mono text-slate-400">04/05/06/07</span>) e mostra
                exatamente quais bytes mudaram — revelando a posição de cada knob e bloco no protocolo.
              </p>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CaptureInput
                label="Preset Base"
                tone="slate"
                value={baselineText}
                onChange={setBaselineText}
                parsed={baseline}
                onImport={(file) => void handleImport(file, 'baseline')}
              />
              <CaptureInput
                label="Preset Alterado"
                tone="cyan"
                value={changedText}
                onChange={setChangedText}
                parsed={changed}
                onImport={(file) => void handleImport(file, 'changed')}
              />
            </div>

            {/* Note + actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anota o que mudou entre as capturas (ex: 'knob de mix do Delay 40→127')"
                className="flex-1 h-10 rounded-xl bg-[#0b0f19] border border-slate-800/80 px-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleLoadSample}
                  className="h-10 px-3 rounded-xl border border-slate-800/60 bg-[#0b0f19] text-slate-300 text-xs font-semibold hover:border-slate-700 transition-colors"
                >
                  Exemplo
                </button>
                <button
                  onClick={handleClear}
                  className="h-10 px-3 rounded-xl border border-slate-800/60 bg-[#0b0f19] text-slate-300 text-xs font-semibold hover:border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Limpar
                </button>
                <button
                  onClick={handleExport}
                  disabled={!diff || diff.changedIndices.length === 0}
                  className="h-10 px-3 rounded-xl border border-slate-800/60 bg-[#0b0f19] text-slate-300 text-xs font-semibold hover:border-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Exportar
                </button>
              </div>
            </div>

            {/* Result */}
            {!canCompare && (
              <div className="text-center py-10 text-slate-500 text-sm">
                <GitCompareArrows className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Cole as duas capturas acima para comparar.
              </div>
            )}

            {canCompare && diff && (
              <DiffResultView diff={diff} summaries={summaries} note={note} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Capture input pane ────────────────────────────────────────────────────────

interface CaptureInputProps {
  label: string;
  tone: 'slate' | 'cyan';
  value: string;
  onChange: (v: string) => void;
  parsed: ReturnType<typeof parseCaptureInput>;
  onImport: (file: File) => void;
}

function CaptureInput({ label, tone, value, onChange, parsed, onImport }: CaptureInputProps) {
  const ring =
    tone === 'cyan'
      ? 'focus:border-cyan-500/60 focus:ring-cyan-500/10'
      : 'focus:border-slate-600 focus:ring-slate-600/10';
  const dot = tone === 'cyan' ? 'bg-cyan-400' : 'bg-slate-500';

  return (
    <div className="rounded-xl border border-slate-800/60 bg-[#0b0f19] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">{label}</span>
        {parsed.bytes.length > 0 && !parsed.error && (
          <span className="ml-auto text-[10px] font-mono text-slate-500 tabular-nums">
            {parsed.bytes.length}B{parsed.packetCount ? ` · ${parsed.packetCount} pkts` : ''}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500">Cole Base64, JSON ou hexadecimal</span>
        <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer transition-colors">
          <Upload className="w-3 h-3" />
          Importar .prst
          <input
            type="file"
            accept=".prst,.json,application/json,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="F0 21 25 4D 50 00 … F7"
        spellCheck={false}
        className={`w-full h-28 rounded-lg bg-[#05080f] border border-slate-800/80 px-3 py-2 text-[11px] font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:ring-2 transition-all resize-none ${ring}`}
      />
      {parsed.error ? (
        <div className="flex items-start gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {parsed.error}
        </div>
      ) : (
        parsed.notes.map((n, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed"
          >
            <Info className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
            {n}
          </div>
        ))
      )}
    </div>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────

interface DiffResultViewProps {
  diff: ReturnType<typeof diffSysEx>;
  summaries: DiffSummary[];
  note: string;
}

function DiffResultView({ diff, summaries, note }: DiffResultViewProps) {
  if (diff.identical) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success-500/30 bg-success-500/5 px-4 py-3">
        <CheckCircle2 className="w-5 h-5 text-success-400 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-300 leading-relaxed">
          As duas capturas são <span className="text-white font-semibold">idênticas</span>. Nenhum byte mudou —
          verifique se você realmente alterou um knob/efeito entre as capturas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">
          <span className="text-white font-bold tabular-nums">{diff.changedIndices.length}</span> bytes mudaram ·
        </span>
        {summaries.map((s) => (
          <span
            key={s.role}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-light border border-border text-[11px]"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotForRole(s.role)}`} />
            <span className={byteKindTone(s.role)}>{s.label}</span>
            <span className="text-slate-500 tabular-nums">×{s.count}</span>
          </span>
        ))}
      </div>

      {/* Byte grid */}
      <div className="rounded-xl border border-slate-800/60 bg-[#05080f] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Mapa de bytes
          </span>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <Legend color="bg-amber-400" label="mudou" />
            <Legend color="bg-slate-700" label="igual" />
          </div>
        </div>
        <ByteGrid diff={diff} />
      </div>

      {/* Changed-byte detail list */}
      <div className="rounded-xl border border-slate-800/60 bg-[#0b0f19] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800/60 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Bytes que mudaram
          </span>
          <span className="text-[10px] text-slate-500 tabular-nums">{diff.changedIndices.length}</span>
        </div>
        <div className="divide-y divide-slate-800/40 max-h-56 overflow-y-auto">
          {diff.changedIndices.map((idx) => {
            const b = diff.bytes[idx];
            return <ChangedByteRow key={idx} byte={b} note={note} />;
          })}
        </div>
      </div>

      {/* Length mismatches */}
      {(diff.addedIndices.length > 0 || diff.removedIndices.length > 0) && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          As capturas têm tamanhos diferentes (base {diff.baselineLen}B · alterada {diff.changedLen}B).
          Diff por posição pode não ser confiável — use capturas do mesmo tipo de mensagem.
        </div>
      )}
    </div>
  );
}

function ChangedByteRow({ byte, note }: { byte: ByteDiff; note: string }) {
  const before = byte.baseline !== null ? toHex(byte.baseline) : '—';
  const after = byte.changed !== null ? toHex(byte.changed) : '—';
  const slotInfo = slotLabel(byte.index);

  return (
    <div className="px-4 py-2 flex items-center gap-3 text-xs">
      <span className="text-slate-500 font-mono tabular-nums w-10 shrink-0">#{byte.index}</span>
      <span className={`font-mono tabular-nums w-12 shrink-0 ${byteKindTone(byte.kind)}`}>{before}</span>
      <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
      <span className="font-mono tabular-nums w-12 shrink-0 text-amber-400 font-bold">{after}</span>
      <span className={`text-[10px] uppercase tracking-wider shrink-0 ${byteKindTone(byte.kind)}`}>
        {byteKindLabel(byte.kind)}
      </span>
      {slotInfo && (
        <span className="text-[10px] text-slate-500 shrink-0">{slotInfo}</span>
      )}
      <span className="text-slate-600 truncate ml-auto text-[11px]">{note || '—'}</span>
    </div>
  );
}

/** Human-readable slot label for a matrix byte index, e.g. "slot 2 · FXID[1]". */
function slotLabel(sysExIndex: number): string | null {
  const SIG_LEN = 6;
  const SLOT_BYTES = 8;
  const FXID_BYTES = 4;
  const offset = sysExIndex - SIG_LEN;
  if (offset < 0 || offset >= 96) return null;
  const slot = Math.floor(offset / SLOT_BYTES) + 1;
  const inSlot = offset % SLOT_BYTES;
  const part = inSlot < FXID_BYTES ? `FXID[${inSlot}]` : `Knob[${inSlot - FXID_BYTES}]`;
  return `slot ${slot} · ${part}`;
}

// ── Byte grid ─────────────────────────────────────────────────────────────────

function ByteGrid({ diff }: { diff: ReturnType<typeof diffSysEx> }) {
  // Show only the matrix region (bytes 6..101) plus signature/checksum/F7 for
  // context; collapsed into 16-byte rows.
  const rows: ByteDiff[][] = [];
  for (let i = 0; i < diff.bytes.length; i += 16) {
    rows.push(diff.bytes.slice(i, i + 16));
  }

  return (
    <div className="font-mono text-[11px] space-y-1 overflow-x-auto">
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-1">
          <span className="text-slate-600 tabular-nums w-10 shrink-0 text-right">
            {String(ri * 16).padStart(3, '0')}
          </span>
          <div className="flex gap-1">
            {row.map((b) => {
              const moved = b.moved;
              const tone = moved
                ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                : b.changed === null || b.baseline === null
                  ? 'bg-slate-900/40 border-slate-800/40 text-slate-700'
                  : 'bg-slate-800/40 border-slate-800/40 text-slate-400';
              const val = b.changed ?? b.baseline ?? 0;
              return (
                <span
                  key={b.index}
                  title={`#${b.index} · ${byteKindLabel(b.kind)}${moved ? ' · mudou' : ''}`}
                  className={`inline-flex items-center justify-center w-8 h-6 rounded border tabular-nums ${tone} ${moved ? 'ring-1 ring-amber-400/30' : ''}`}
                >
                  {toHex(val)}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded ${color}`} />
      {label}
    </span>
  );
}

function dotForRole(role: string): string {
  switch (role) {
    case 'signature': return 'bg-sky-400';
    case 'fxid': return 'bg-violet-400';
    case 'knob': return 'bg-cyan-400';
    case 'checksum': return 'bg-amber-400';
    case 'terminator': return 'bg-emerald-400';
    default: return 'bg-slate-500';
  }
}
