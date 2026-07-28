import { useState, useCallback, useEffect, useRef } from 'react';
import { Usb, Activity, Zap, RotateCcw, ChevronDown, ChevronUp, Radio, Trash2, Pause, Play } from 'lucide-react';
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
  direction: 'out' | 'in';
}

interface MonitorEntry {
  time: string;
  raw: string;
  decoded: string;
  type: string;
}

function decodeMidiMessage(data: Uint8Array): { type: string; decoded: string } {
  if (data.length === 0) return { type: 'empty', decoded: '(mensagem vazia)' };

  const status = data[0];

  // System Exclusive
  if (status === 0xf0) {
    const end = data.indexOf(0xf7);
    const body = end > 0 ? data.slice(1, end) : data.slice(1);
    const hex = bytesToHex(Array.from(body));
    if (body.length >= 4 && body[0] === 0x00) {
      const manufacturer = `${body[0].toString(16).padStart(2, '0')} ${body[1].toString(16).padStart(2, '0')} ${body[2].toString(16).padStart(2, '0')}`;
      const cmdId = body[3];
      return {
        type: 'SysEx',
        decoded: `SysEx — Fabricante: ${manufacturer.toUpperCase()}, Comando: 0x${cmdId.toString(16).padStart(2, '0').toUpperCase()}, Payload: ${body.length - 4} byte(s)`,
      };
    }
    return {
      type: 'SysEx',
      decoded: `SysEx — ${body.length} byte(s) de dados: ${hex}`,
    };
  }

  // Channel messages
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  if (data.length >= 3) {
    const d1 = data[1];
    const d2 = data[2];

    if (command === 0xb0) {
      const ccNames: Record<number, string> = {
        0: 'Bank Select (CC0)',
        29: 'Mode (CC29)',
        43: 'Bypass Comp (CC43)',
        44: 'Bypass Drive (CC44)',
        45: 'Bypass Amp (CC45)',
        46: 'Bypass Cab (CC46)',
        47: 'Bypass EQ (CC47)',
        48: 'Bypass Mod (CC48)',
        49: 'Bypass Delay (CC49)',
        50: 'Bypass Reverb (CC50)',
        51: 'Bypass Wah (CC51)',
        52: 'Bypass Freq (CC52)',
        53: 'Bypass Volume (CC53)',
        54: 'Bypass Dynamics (CC54)',
      };
      const name = ccNames[d1] ?? `CC${d1}`;
      const stateStr = d2 === 0 ? 'OFF / Bypass' : d2 === 64 ? 'ON / Engage' : `valor ${d2}`;
      return { type: 'CC', decoded: `${name} = ${d2} (${stateStr}) — Canal ${channel}` };
    }

    if (command === 0xc0) {
      return { type: 'PC', decoded: `Program Change ${d1} — Canal ${channel}` };
    }

    if (command === 0x80) {
      return { type: 'Note Off', decoded: `Note Off ${d1} vel ${d2} — Canal ${channel}` };
    }
    if (command === 0x90) {
      const vel = d2 === 0 ? 'OFF' : `vel ${d2}`;
      return { type: 'Note On', decoded: `Note On ${d1} ${vel} — Canal ${channel}` };
    }
    if (command === 0xe0) {
      const bend = ((d2 << 7) | d1) - 8192;
      return { type: 'Pitch Bend', decoded: `Pitch Bend ${bend} — Canal ${channel}` };
    }
    if (command === 0xa0) {
      return { type: 'Poly Pressure', decoded: `Poly Pressure ${d1} = ${d2} — Canal ${channel}` };
    }
    if (command === 0xd0) {
      return { type: 'Channel Pressure', decoded: `Channel Pressure ${d1} — Canal ${channel}` };
    }
  }

  if (command === 0xc0 && data.length >= 2) {
    return { type: 'PC', decoded: `Program Change ${data[1]} — Canal ${channel}` };
  }

  // System common/realtime
  if (status === 0xf8) return { type: 'Clock', decoded: 'MIDI Clock tick' };
  if (status === 0xfa) return { type: 'Start', decoded: 'MIDI Start' };
  if (status === 0xfb) return { type: 'Continue', decoded: 'MIDI Continue' };
  if (status === 0xfc) return { type: 'Stop', decoded: 'MIDI Stop' };
  if (status === 0xfe) return { type: 'Active Sense', decoded: 'Active Sensing' };
  if (status === 0xff) return { type: 'Reset', decoded: 'MIDI System Reset' };

  return { type: 'Unknown', decoded: `Desconhecido: ${bytesToHex(Array.from(data))}` };
}

export default function MidiRecovery() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [devices, setDevices] = useState<{ name: string; id: string }[]>([]);
  const [inputDevices, setInputDevices] = useState<{ name: string; id: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [monitor, setMonitor] = useState<MonitorEntry[]>([]);
  const [monitoring, setMonitoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState(0);
  const [preset, setPreset] = useState(0);
  const [showEffects, setShowEffects] = useState(false);
  const outputRef = useRef<MIDIOutput | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);
  const monitoringRef = useRef(false);

  const addLog = useCallback((text: string, ok = true, direction: 'out' | 'in' = 'out') => {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLog((prev) => [{ time, text, ok, direction }, ...prev].slice(0, 80));
  }, []);

  const addMonitor = useCallback((entry: Omit<MonitorEntry, 'time'>) => {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setMonitor((prev) => [{ time, ...entry }, ...prev].slice(0, 200));
  }, []);

  const handleMidiInput = useCallback(
    (event: MIDIMessageEvent) => {
      if (!monitoringRef.current) return;
      const data = event.data;
      if (!data || data.length === 0) return;
      const { type, decoded } = decodeMidiMessage(data);
      addMonitor({ raw: bytesToHex(Array.from(data)), decoded, type });
    },
    [addMonitor],
  );

  const refreshDevices = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setState('unsupported');
      return;
    }
    setState('connecting');
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true });
      midiAccessRef.current = access;
      const outputs: { name: string; id: string }[] = [];
      const inputs: { name: string; id: string }[] = [];
      access.outputs.forEach((out) => {
        outputs.push({ name: out.name ?? 'Saída desconhecida', id: out.id });
      });
      access.inputs.forEach((inp) => {
        inputs.push({ name: inp.name ?? 'Entrada desconhecida', id: inp.id });
      });
      setDevices(outputs);
      setInputDevices(inputs);
      if (outputs.length > 0 && !selectedId) {
        setSelectedId(outputs[0].id);
      }
      if (inputs.length > 0 && !selectedInputId) {
        setSelectedInputId(inputs[0].id);
      }
      setState('connected');
      addLog(`${outputs.length} saída(s) e ${inputs.length} entrada(s) MIDI encontradas`);
      access.onstatechange = () => {
        const updatedOut: { name: string; id: string }[] = [];
        const updatedIn: { name: string; id: string }[] = [];
        access.outputs.forEach((out) => updatedOut.push({ name: out.name ?? 'Desconhecida', id: out.id }));
        access.inputs.forEach((inp) => updatedIn.push({ name: inp.name ?? 'Desconhecida', id: inp.id }));
        setDevices(updatedOut);
        setInputDevices(updatedIn);
      };
    } catch (e) {
      setState('disconnected');
      addLog(`Erro ao acessar MIDI: ${(e as Error).message}`, false);
    }
  }, [selectedId, selectedInputId, addLog]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Subscribe to selected input for monitoring
  useEffect(() => {
    // Clean up previous input
    if (activeInputRef.current) {
      activeInputRef.current.onmidimessage = null;
      activeInputRef.current.close().catch(() => {});
      activeInputRef.current = null;
    }
    if (!selectedInputId || !midiAccessRef.current || !monitoring) return;
    const input = midiAccessRef.current.inputs.get(selectedInputId);
    if (!input) return;
    activeInputRef.current = input;
    input.onmidimessage = handleMidiInput;
    input.open().then(() => {
      addLog(`Monitorando entrada: ${input.name ?? selectedInputId}`, true, 'in');
    }).catch((e) => {
      addLog(`Erro ao abrir entrada: ${(e as Error).message}`, false);
    });
    return () => {
      input.onmidimessage = null;
    };
  }, [selectedInputId, monitoring, handleMidiInput, addLog]);

  useEffect(() => {
    monitoringRef.current = monitoring;
  }, [monitoring]);

  // Update output reference when selected device changes
  useEffect(() => {
    if (!selectedId || state !== 'connected') {
      outputRef.current = null;
      return;
    }
    const access = midiAccessRef.current;
    if (!access) return;
    outputRef.current = access.outputs.get(selectedId) ?? null;
  }, [selectedId, state]);

  const getOutput = useCallback((): MIDIOutput | null => {
    return outputRef.current;
  }, []);

  const sendCommand = useCallback(
    (cmd: MidiCommand | { label: string; description: string; bytes: number[] }) => {
      const out = getOutput();
      if (!out) {
        addLog('Nenhum dispositivo de saída selecionado', false);
        return;
      }
      try {
        out.send(cmd.bytes);
        addLog(`${cmd.label} → [${bytesToHex(cmd.bytes)}]`, true, 'out');
      } catch (e) {
        addLog(`Falha: ${cmd.label} — ${(e as Error).message}`, false);
      }
    },
    [getOutput, addLog],
  );

  const runRecoverySequence = useCallback(async () => {
    const out = getOutput();
    if (!out) {
      addLog('Conecte um dispositivo de saída primeiro', false);
      return;
    }
    setBusy(true);
    addLog('Iniciando sequência de destravamento...', true, 'out');
    for (const cmd of RECOVERY_SEQUENCE) {
      try {
        out.send(cmd.bytes);
        addLog(`${cmd.label} → enviado`, true, 'out');
        await sleep(300);
      } catch (e) {
        addLog(`Falha: ${cmd.label} — ${(e as Error).message}`, false);
      }
    }
    addLog('Sequência concluída — observe o monitor abaixo para respostas', true, 'out');
    setBusy(false);
  }, [getOutput, addLog]);

  const sendCustomBank = useCallback(() => {
    const out = getOutput();
    if (!out) {
      addLog('Conecte um dispositivo de saída primeiro', false);
      return;
    }
    const bytes = buildBankChange(bank, preset);
    try {
      out.send(bytes);
      addLog(`Banco ${bank + 1} / Preset ${String.fromCharCode(65 + preset)} → [${bytesToHex(bytes)}]`, true, 'out');
    } catch (e) {
      addLog(`Falha: ${(e as Error).message}`, false);
    }
  }, [getOutput, addLog, bank, preset]);

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
            <p className="text-muted text-xs">Enviar e monitorar comandos MIDI via USB</p>
          </div>
        </div>

        {/* Output device */}
        <label className="text-xs text-muted font-semibold uppercase tracking-wide block mb-1.5">Saída (enviar para a pedaleira)</label>
        <div className="flex gap-3 mb-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 bg-bg-800 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500/50 transition-colors"
          >
            {devices.length === 0 && <option value="">Nenhuma saída encontrada</option>}
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

        {/* Input device */}
        <label className="text-xs text-muted font-semibold uppercase tracking-wide block mb-1.5">Entrada (receber da pedaleira)</label>
        <div className="flex gap-3">
          <select
            value={selectedInputId}
            onChange={(e) => setSelectedInputId(e.target.value)}
            className="flex-1 bg-bg-800 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500/50 transition-colors"
          >
            {inputDevices.length === 0 && <option value="">Nenhuma entrada encontrada</option>}
            {inputDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMonitoring((v) => !v)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-bold transition-all flex items-center gap-2 ${
              monitoring
                ? 'bg-error-500/20 border-error-500/40 text-error-400'
                : 'bg-success-500/20 border-success-500/40 text-success-400 hover:bg-success-500/30'
            }`}
          >
            {monitoring ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {monitoring ? 'Parar' : 'Monitorar'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${state === 'connected' ? 'bg-success-500' : state === 'connecting' ? 'bg-warning-500' : 'bg-error-500'}`} />
            <span className="text-xs text-muted">
              {state === 'connected' ? 'Conectado' : state === 'connecting' ? 'Conectando...' : 'Desconectado'}
            </span>
          </div>
          {monitoring && (
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-success-400 animate-pulse" />
              <span className="text-xs text-success-400 font-semibold">Monitor ativo</span>
            </div>
          )}
        </div>
      </div>

      {/* Live MIDI Monitor */}
      {monitoring && (
        <div className="rounded-2xl bg-bg-900 border border-success-500/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-success-400 animate-pulse" />
              <h3 className="text-white font-bold text-sm">Monitor MIDI — Respostas da Pedaleira</h3>
            </div>
            <button
              onClick={() => setMonitor([])}
              className="text-muted hover:text-error-400 transition-colors"
              title="Limpar monitor"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {monitor.length === 0 ? (
            <div className="py-8 text-center">
              <Radio className="w-8 h-8 text-muted/30 mx-auto mb-2" />
              <p className="text-muted text-sm">Aguardando resposta da pedaleira...</p>
              <p className="text-muted/60 text-xs mt-1">Se nada aparecer após enviar comandos, a pedaleira pode estar completamente travada</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto font-mono text-xs">
              {monitor.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 p-1.5 rounded hover:bg-bg-800/50 transition-colors">
                  <span className="text-subtext shrink-0">{entry.time}</span>
                  <span className="text-primary-400 shrink-0 w-16">{entry.type}</span>
                  <div className="min-w-0">
                    <span className="text-slate-300 break-all">{entry.decoded}</span>
                    <span className="text-muted/60 block break-all text-[10px] mt-0.5">{entry.raw}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          {RECOVERY_SEQUENCE.map((cmd, idx) => (
            <div key={cmd.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-800/50 border border-border/50">
              <div className="w-6 h-6 rounded-md bg-primary-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-primary-400 text-xs font-bold">{idx + 1}</span>
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

      {/* Command Log */}
      {log.length > 0 && (
        <div className="rounded-2xl bg-bg-900 border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-muted text-xs font-bold uppercase tracking-wide">Log de comandos enviados</h3>
            <button
              onClick={() => setLog([])}
              className="text-muted hover:text-error-400 transition-colors"
              title="Limpar log"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-xs">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-subtext shrink-0">{entry.time}</span>
                <span className={`shrink-0 ${entry.direction === 'in' ? 'text-primary-400' : 'text-warning-400'}`}>
                  {entry.direction === 'in' ? '←' : '→'}
                </span>
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