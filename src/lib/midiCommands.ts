export interface MidiCommand {
  id: string;
  label: string;
  description: string;
  bytes: number[];
  category: 'recover' | 'effect' | 'bank';
}

export const RECOVERY_SEQUENCE: MidiCommand[] = [
  {
    id: 'bypass-all',
    label: 'Desligar todos os efeitos',
    description: 'Envia CC43–CC54 = 0 para desligar os 12 blocos e aliviar o DSP imediatamente',
    bytes: buildBypassAll(),
    category: 'recover',
  },
  {
    id: 'preset-mode',
    label: 'Forçar modo Preset',
    description: 'CC29 = 64 — garante que a pedaleira saia do modo Tuner/Looper e volte para Preset',
    bytes: [0xb0, 29, 64],
    category: 'recover',
  },
  {
    id: 'bank-01-preset-a',
    label: 'Trocar para Banco 01 / Preset A',
    description: 'CC0 = 0 (banco) + Program Change 0 — carrega o primeiro preset de fábrica',
    bytes: [0xb0, 0, 0, 0xc0, 0],
    category: 'bank',
  },
];

export const INDIVIDUAL_COMMANDS: MidiCommand[] = [
  {
    id: 'bypass-comp',
    label: 'Desligar Compressor',
    description: 'CC43 = 0',
    bytes: [0xb0, 43, 0],
    category: 'effect',
  },
  {
    id: 'bypass-drive',
    label: 'Desligar Drive',
    description: 'CC44 = 0',
    bytes: [0xb0, 44, 0],
    category: 'effect',
  },
  {
    id: 'bypass-amp',
    label: 'Desligar Amp',
    description: 'CC45 = 0',
    bytes: [0xb0, 45, 0],
    category: 'effect',
  },
  {
    id: 'bypass-cab',
    label: 'Desligar Cab',
    description: 'CC46 = 0',
    bytes: [0xb0, 46, 0],
    category: 'effect',
  },
  {
    id: 'bypass-eq',
    label: 'Desligar EQ',
    description: 'CC47 = 0',
    bytes: [0xb0, 47, 0],
    category: 'effect',
  },
  {
    id: 'bypass-mod',
    label: 'Desligar Mod',
    description: 'CC48 = 0',
    bytes: [0xb0, 48, 0],
    category: 'effect',
  },
  {
    id: 'bypass-delay',
    label: 'Desligar Delay',
    description: 'CC49 = 0',
    bytes: [0xb0, 49, 0],
    category: 'effect',
  },
  {
    id: 'bypass-reverb',
    label: 'Desligar Reverb',
    description: 'CC50 = 0',
    bytes: [0xb0, 50, 0],
    category: 'effect',
  },
  {
    id: 'bypass-wah',
    label: 'Desligar Wah',
    description: 'CC51 = 0',
    bytes: [0xb0, 51, 0],
    category: 'effect',
  },
  {
    id: 'bypass-freq',
    label: 'Desligar Freq',
    description: 'CC52 = 0',
    bytes: [0xb0, 52, 0],
    category: 'effect',
  },
  {
    id: 'bypass-vol',
    label: 'Desligar Volume',
    description: 'CC53 = 0',
    bytes: [0xb0, 53, 0],
    category: 'effect',
  },
  {
    id: 'bypass-dyn',
    label: 'Desligar Dynamics',
    description: 'CC54 = 0',
    bytes: [0xb0, 54, 0],
    category: 'effect',
  },
];

export const ALL_COMMANDS = [...RECOVERY_SEQUENCE, ...INDIVIDUAL_COMMANDS];

function buildBypassAll(): number[] {
  const bytes: number[] = [];
  for (let cc = 43; cc <= 54; cc++) {
    bytes.push(0xb0, cc, 0);
  }
  return bytes;
}

export function buildBankChange(bank: number, preset: number): number[] {
  return [0xb0, 0, bank & 0x7f, 0xc0, preset & 0x7f];
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
