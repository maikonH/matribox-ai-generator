import { useState, useCallback, useEffect, useRef } from 'react';
import { Usb, Activity, Zap, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  RECOVERY_SEQUENCE,
  INDIVIDUAL_COMMANDS,
  buildBankChange,
  bytesToHex,
  type MidiCommand,
} from '../lib/midiCommands';

type ConnectionState = 'unsupported' | 'disconnected' | 'connecting' | 'connected';

interface LogEntry {
  time: string;
  text: string;
  ok: boolean;
}

export default function MidiRecovery() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [devices, setDevices] = useState<{ name: string; id: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState(0);
  const [preset, setPreset] = useState(0);
  const [showEffects, setShowEffects] = useState(false);
  const outputRef = useRef<MIDIOutput | null>(null);

  const addLog = useCallback((text: string, ok = true) => {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLog((prev) => [{ time, text, ok }, ...prev].slice(0, 50));
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setState('unsupported');
      return;
    }
    setState('connecting');
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true });
      const outputs: { name: string; id: string }[] = [];
      access.outputs.forEach((out) => {
        outputs.push({ name: out.name ?? 'Dispositivo desconhecido', id: out.id });
      });
      setDevices(outputs);
      if (outputs.length > 0 && !selectedId) {
        setSelectedId(outputs[0].id);
      }
      setState('connected');
      addLog(`${outputs.length} dispositivo(s) MIDI encontrado(s)`);
      access.onstatechange = () => {
        const updated: { name: string; id: string }[] = [];
        access.outputs.forEach((out) => updated.push({ name: out.name ?? 'Desconhecido', id: out.id }));
        setDevices(updated);
      };
    } catch (e) {
      setState('disconnected');
      addLog(`Erro ao acessar MIDI: ${(e as Error).message}`, false);
    }
  }, [selectedId, addLog]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const getOutput = useCallback((): MIDIOutput | null => {
    if (selectedId) {
      return outputRef.current;
    }
    return null;
  }, [selectedId]);

  const sendCommand = useCallback(
    (cmd: MidiCommand | { label: string; description: string; bytes: number[] }) => {
      const out = getOutput();
      if (!out) {
        addLog('Nenhum dispositivo selecionado', false);
        return;
      }
      try {
        out.send(cmd.bytes);
        addLog(`${cmd.label} → [${bytesToHex(cmd.bytes)}]`);
      } catch (e) {
        addLog(`Falha: ${cmd.label} — ${(e as Error).message}`, false);
      }
    },
    [getOutput, addLog],
  );

  const runRecoverySequence = useCallback(async () => {
    const out = getOutput();
    if (!out) {
      addLog('Conecte um dispositivo primeiro', false);
      return;
    }
    setBusy(true);
    for (const cmd of RECOVERY_SEQUENCE) {
      try {
        out.send(cmd.bytes);
        addLog(`${cmd.label} → enviado`);
        await sleep(200);
      } catch (e) {
        addLog(`Falha: ${cmd.label} — ${(e as Error).message}`, false);
      }
    }
    addLog('Sequência de recuperação concluída — aguarde 3s');
    setBusy(false);
  }, [getOutput, addLog]);

  const sendCustomBank = useCallback(() => {
    const out = getOutput();
    if (!out) {
      addLog('Conecte um dispositivo primeiro', false);
      return;
    }
    const bytes = buildBankChange(bank, preset);
    try {
      out.send(bytes);
      addLog(`Banco ${bank + 1} / Preset ${String.fromCharCode(65 + preset)} → [${bytesToHex(bytes)}]`);
    } catch (e) {
      addLog(`Falha: ${(e as Error).message}`, false);
    }
  }, [getOutput, addLog, bank, preset]);

  useEffect(() => {
    if (!selectedId || state !== 'connected') {
      outputRef.current = null;
      return;
    }
    navigator.requestMIDIAccess({ sysex: true }).then((access) => {
      outputRef.current = access.outputs.get(selectedId) ?? null;
    });
  }, [selectedId, state]);

  if (state === 'unsupported') {
    return (
      <div className="rounded-2xl bg-surface border border-error-500/30 p-6">
        <div className="flex items-center gap-3 mb-2">
          <Usb className="w-5 h-5 text-error-400" />
          <h3 className="text-white font-bold text-lg">Navegador não suporta Web MIDI</h3>
        </div>
        <p className="text-muted text-sm">
          Use Google Chrome ou Microsoft Edge no desktop (Windows/Mac/Linux). Firefox e Safari não suportam a Web MIDI API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Device selector */}
      <div className="rounded-2xl bg-surface border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
              <Usb className="w-5 h-5 text-bg-900" strokeWidth={2.5} />
            </div>
            <div className="absolute inset-0 rounded-xl bg-primary-500/20 blur-lg -z-10" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Recovery MIDI</h2>
            <p className="text-muted text-xs">Injetar comandos MIDI via USB para destravar a pedaleira</p>
          </div>
        </div>

        <div className="flex gap-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 bg-bg-800 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500/50 transition-colors"
          >
            {devices.length === 0 && <option value="">Nenhum dispositivo encontrado</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={refreshDevices}
            className="px-4 py-2.5 rounded-lg bg-bg-800 border border-border text-muted hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm font-semibold"
          >
            Atualizar
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${state === 'connected' ? 'bg-success-500' : state === 'connecting' ? 'bg-warning-500' : 'bg-error-500'}`}
          />
          <span className="text-xs text-muted">
            {state === 'connected' ? 'Conectado' : state === 'connecting' ? 'Conectando...' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Recovery sequence */}
      <div className="rounded-2xl bg-surface border border-warning-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-warning-400" />
          <h3 className="text-white font-bold">Sequência de Destravamento</h3>
        </div>
        <p className="text-muted text-sm mb-4">
          Executa 3 passos em sequência: (1) desliga todos os efeitos para aliviar o DSP, (2) força modo Preset, (3) carrega o Banco 01 / Preset A de fábrica.
        </p>

        <div className="space-y-2 mb-4">
          {RECOVERY_SEQUENCE.map((cmd) => (
            <div key={cmd.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-800/50 border border-border/50">
              <div className="w-6 h-6 rounded-md bg-primary-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-primary-400 text-xs font-bold">{RECOVERY_SEQUENCE.indexOf(cmd) + 1}</span>
              </div>
              <div className="min-w-0">
                <p className="text-slate-200 text-sm font-semibold">{cmd.label}</p>
                <p className="text-muted text-xs mt-0.5">{cmd.description}</p>
                <p className="text-primary-400/60 text-[10px] font-mono mt-1">{bytesToHex(cmd.bytes)}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={runRecoverySequence}
          disabled={busy || state !== 'connected' || !selectedId}
          className="w-full py-3 rounded-xl bg-warning-500 text-bg-900 font-bold hover:bg-warning-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_-4px_rgba(251,191,36,0.5)]"
        >
          <Zap className="w-5 h-5" />
          {busy ? 'Enviando...' : 'Executar Destravamento'}
        </button>
      </div>

      {/* Custom bank change */}
      <div className="rounded-2xl bg-surface border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-5 h-5 text-primary-400" />
          <h3 className="text-white font-bold">Trocar Banco/Preset Manual</h3>
        </div>
        <p className="text-muted text-sm mb-4">
          Se a sequência acima não funcionar, tente trocar para diferentes bancos/presets até encontrar um que não trave.
        </p>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs text-muted font-semibold uppercase tracking-wide block mb-1.5">Banco (1–64)</label>
            <input
              type="range"
              min={0}
              max={63}
              value={bank}
              onChange={(e) => setBank(Number(e.target.value))}
              className="w-full accent-primary-500"
            />
            <span className="text-primary-400 text-sm font-mono">Banco {bank + 1}</span>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted font-semibold uppercase tracking-wide block mb-1.5">Preset</label>
            <div className="flex gap-1">
              {['A', 'B', 'C', 'D'].map((p, i) => (
                <button
                  key={p}
                  onClick={() => setPreset(i)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    preset === i
                      ? 'bg-primary-500 text-bg-900'
                      : 'bg-bg-800 text-muted hover:text-primary-400 border border-border'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={sendCustomBank}
          disabled={state !== 'connected' || !selectedId}
          className="w-full py-2.5 rounded-xl bg-primary-500 text-bg-900 font-bold hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Enviar CC0={bank} + PC={preset} ({bytesToHex(buildBankChange(bank, preset))})
        </button>
      </div>

      {/* Individual effect bypass */}
      <div className="rounded-2xl bg-surface border border-border p-5">
        <button
          onClick={() => setShowEffects((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-400" />
            <h3 className="text-white font-bold">Desligar Efeitos Individualmente</h3>
          </div>
          {showEffects ? <ChevronUp className="w-5 h-5 text-muted" /> : <ChevronDown className="w-5 h-5 text-muted" />}
        </button>
        {showEffects && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INDIVIDUAL_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => sendCommand(cmd)}
                disabled={state !== 'connected' || !selectedId}
                className="px-3 py-2.5 rounded-lg bg-bg-800 border border-border text-slate-300 text-sm font-medium hover:text-primary-400 hover:border-primary-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-left"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded-2xl bg-bg-900 border border-border p-4">
          <h3 className="text-muted text-xs font-bold uppercase tracking-wide mb-3">Log de comandos</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-xs">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-subtext shrink-0">{entry.time}</span>
                <span className={entry.ok ? 'text-success-400' : 'text-error-400'}>{entry.ok ? '✓' : '✗'}</span>
                <span className={entry.ok ? 'text-slate-300' : 'text-error-400'}>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
