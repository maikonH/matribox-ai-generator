// Matribox II Pro MIDI commands — SysEx format.
//
// The pedalboard communicates exclusively via SysEx with this header:
//   F0 21 25 4D 50 00 ...
//   ^   ^  ^  ^  ^  ^
//   |   |  |  |  |  Device ID (0x00 = default)
//   |   |  |  |  Family code "P"
//   |   |  |  Family code "M"
//   |   |  Family code 0x25
//   |   Manufacturer ID (1-byte: 0x21)
//   SysEx start
//
// Response format (captured from real pedalboard):
//   F0 21 25 4D 50 00 00 XX 00 22 [80 bytes preset data] F7
//                          ^  ^  ^
//                          |  |  Command type (0x22 = preset dump)
//                          |  Preset number (middle byte of 3-byte field)
//                          Preset number high byte
//
// Standard CC/PC messages (B0 xx yy / C0 xx) are IGNORED by the pedalboard.

export interface MidiCommand {
  id: string;
  label: string;
  description: string;
  bytes: number[];
  category: 'recover' | 'effect' | 'bank' | 'sysex';
}

// ── Matribox SysEx header ────────────────────────────────────────────────────

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const MATRIBOX_MANUFACTURER = 0x21;
export const MATRIBOX_FAMILY = [0x25, 0x4d, 0x50]; // "MP"
export const MATRIBOX_DEVICE_ID = 0x00;

// Known command IDs (from captured responses):
// 0x22 = Preset dump response (pedalboard → host)
// Request command IDs are best-effort guesses — adjust via raw sender if needed.
export const CMD_PRESET_DUMP = 0x22;
export const CMD_REQUEST_PRESET = 0x02; // guessed: request = response - 0x20
export const CMD_REQUEST_PRESET_LIST = 0x03;
export const CMD_RESET_FS = 0x7f; // guessed: universal reset
export const CMD_DELETE_PRESET = 0x04;
export const CMD_JUMP_FIRMWARE = 0x01; // HTJumpFirmwareEvent

// ── SysEx builder ────────────────────────────────────────────────────────────

export function buildSysex(commandId: number, payload: number[] = []): number[] {
  return [
    SYSEX_START,
    MATRIBOX_MANUFACTURER,
    ...MATRIBOX_FAMILY,
    MATRIBOX_DEVICE_ID,
    commandId,
    ...payload,
    SYSEX_END,
  ];
}

export function buildPresetRequest(presetNumber: number): number[] {
  // Format: F0 21 25 4D 50 00 [cmd] [preset_hi] [preset_lo] F7
  // Preset number as 14-bit MIDI value split across two bytes.
  const hi = (presetNumber >> 7) & 0x7f;
  const lo = presetNumber & 0x7f;
  return buildSysex(CMD_REQUEST_PRESET, [hi, lo]);
}

export function buildDeletePreset(presetNumber: number): number[] {
  const hi = (presetNumber >> 7) & 0x7f;
  const lo = presetNumber & 0x7f;
  return buildSysex(CMD_DELETE_PRESET, [hi, lo]);
}

export function buildRawSysex(hexBytes: string): number[] {
  const cleaned = hexBytes.trim().replace(/[^0-9a-fA-F\s]/g, '');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const bytes: number[] = [];
  for (const t of tokens) {
    const n = parseInt(t, 16);
    if (!Number.isNaN(n) && n >= 0 && n <= 0xff) {
      bytes.push(n);
    }
  }
  return bytes;
}

// ── Recovery sequence ────────────────────────────────────────────────────────

export const RECOVERY_SEQUENCE: MidiCommand[] = [
  {
    id: 'request-preset-list',
    label: 'Solicitar lista de presets',
    description: 'Envia SysEx CMD_REQUEST_PRESET_LIST (0x03) — pede à pedaleira a lista completa de presets da Flash',
    bytes: buildSysex(CMD_REQUEST_PRESET_LIST),
    category: 'recover',
  },
  {
    id: 'reset-fs',
    label: 'Reset do FileSystem de presets',
    description: 'Envia SysEx CMD_RESET_FS (0x7F) — reseta toda a estrutura de presets na Flash (resetFS do firmware)',
    bytes: buildSysex(CMD_RESET_FS),
    category: 'recover',
  },
  {
    id: 'jump-firmware',
    label: 'Forçar modo Firmware (bootloader)',
    description: 'Envia SysEx CMD_JUMP_FIRMWARE (0x01) — equivalente ao HTJumpFirmwareEvent, força a pedaleira a entrar no modo bootloader',
    bytes: buildSysex(CMD_JUMP_FIRMWARE),
    category: 'recover',
  },
];

// ── Individual SysEx commands ─────────────────────────────────────────────────

export const INDIVIDUAL_COMMANDS: MidiCommand[] = [
  {
    id: 'delete-preset-0',
    label: 'Deletar Preset 0',
    description: 'SysEx CMD_DELETE_PRESET (0x04) preset 0',
    bytes: buildDeletePreset(0),
    category: 'effect',
  },
  {
    id: 'delete-preset-1',
    label: 'Deletar Preset 1',
    description: 'SysEx CMD_DELETE_PRESET (0x04) preset 1',
    bytes: buildDeletePreset(1),
    category: 'effect',
  },
  {
    id: 'request-preset-0',
    label: 'Solicitar Preset 0',
    description: 'SysEx CMD_REQUEST_PRESET (0x02) preset 0',
    bytes: buildPresetRequest(0),
    category: 'effect',
  },
  {
    id: 'request-preset-1',
    label: 'Solicitar Preset 1',
    description: 'SysEx CMD_REQUEST_PRESET (0x02) preset 1',
    bytes: buildPresetRequest(1),
    category: 'effect',
  },
];

export const ALL_COMMANDS = [...RECOVERY_SEQUENCE, ...INDIVIDUAL_COMMANDS];

// ── Utilities ──────────────────────────────────────────────────────────────────

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function hexToBytes(hex: string): number[] {
  return buildRawSysex(hex);
}
