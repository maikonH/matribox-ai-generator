// Matribox II Pro real-time MIDI builder.
//
// The pedalboard cannot instantiate an effect into an empty block via CC alone.
// Before any CC parameter automation, we must push a raw SysEx model-load
// packet (LEN=108, DATA8=48) that tells the firmware which algorithm to load
// into the target block slot. Only then do CC parameter changes and the block
// activation (CC43..CC54 = 127) take effect and light up the pedal.
//
// SysEx model-load packet structure (108 bytes total, reverse-engineered
// from app.so):
//
//  Offset  Content
//  ------  -------
//  0–3     [0xF0, 0x00, 0x01, 0x3A]  Sonicake manufacturer signature
//  4       Command opcode  (0x06 = switch/load effect model)
//  5       Block slot index (0–11)
//  6       Flags / reserved (0x01 = apply immediately)
//  7–57    Standard template padding (zeros)
//  58      Effect category ID  (fxid >>> 24)
//  59      Effect model ID — low 7 bits  (fxid & 0x7F)
//  60      Effect model ID — high 7 bits ((fxid >>> 7) & 0x7F)
//  61–105  Padding (zeros)
//  106     Checksum  (XOR of bytes 4–105, masked to 7 bits)
//  107     0xF7  SysEx terminator
//
// CC map (official reverse-engineering of the hardware):
//   CC7  — Volume Geral (master volume)
//   CC11 — Pedal de Expressão (expression pedal)
//   CC43..CC54 — Ativação dos blocos 1..12 (0 = OFF, 127 = ON)
//   CC16, CC18, CC20 — Knobs rápidos 1, 2, 3 (0–127)
//
// Flow per block:
//   1. SysEx model-load (108 bytes) → loads the algorithm into the block slot
//   2. CC parameter changes → sets knob values
//   3. CC activation (127) → lights up the block pedal
//
// Timing: the firmware needs ~80 ms after a SysEx model-load before it will
// accept CC commands for that block. CC commands use a shorter 25 ms gap.

import { findSlotForCode, HARDWARE_SLOTS } from './hardwareSlots';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';

// ── Command types ─────────────────────────────────────────────────────────────

export interface MidiCCCommand {
  cc: number;
  value: number;
  label: string;
}

export interface MidiSysExCommand {
  bytes: number[];
  label: string;
}

export type MidiCommand =
  | ({ type: 'cc' } & MidiCCCommand)
  | ({ type: 'sysex' } & MidiSysExCommand);

export interface BuiltMidiPreset {
  commands: MidiCommand[];
  nomePatch: string;
  comentario: string;
}

// ── CC constants ─────────────────────────────────────────────────────────────

export const CC_VOLUME = 7;
export const CC_EXPRESSION = 11;
export const CC_BLOCK_BASE = 43; // CC43 = bloco 1 … CC54 = bloco 12
export const CC_BLOCK_COUNT = 12;
export const CC_KNOB = [16, 18, 20]; // quick knobs 1, 2, 3

const BLOCK_ON = 127;
const BLOCK_OFF = 0;

// ── SysEx constants ──────────────────────────────────────────────────────────

const SYSEX_HEADER = [0xf0, 0x00, 0x01, 0x3a];
const SYSEX_TERMINATOR = 0xf7;
const SYSEX_PACKET_LEN = 108;
const SYSEX_CMD_SWITCH_EFFECT = 0x06;
const SYSEX_FLAG_IMMEDIATE = 0x01;

// Offsets within the full 108-byte packet.
const OFFSET_CMD = 4;
const OFFSET_SLOT = 5;
const OFFSET_FLAGS = 6;
const OFFSET_CATEGORY = 58;
const OFFSET_MODEL_LO = 59;
const OFFSET_MODEL_HI = 60;
const OFFSET_CHECKSUM = 106;

// Delays (ms) between sent messages.
const DELAY_SYSEX = 80; // firmware needs time to process model load
const DELAY_CC = 25;

export { DELAY_SYSEX, DELAY_CC };

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Map a 0–100 knob value to the 0–127 MIDI range. */
function toMidiRange(value: number): number {
  return Math.round((clampKnob(value) / 100) * 127);
}

/** Clamp a value to the 7-bit MIDI data-byte range (0–127). */
function to7Bit(value: number): number {
  return Math.min(127, Math.max(0, value & 0x7f));
}

/**
 * Compute the SysEx checksum: XOR of all bytes from OFFSET_CMD through
 * OFFSET_CHECKSUM - 1, masked to 7 bits.
 */
function sysexChecksum(packet: number[]): number {
  let xor = 0;
  for (let i = OFFSET_CMD; i < OFFSET_CHECKSUM; i++) {
    xor ^= packet[i];
  }
  return xor & 0x7f;
}

/**
 * Build a 108-byte SysEx model-load packet for a given effect.
 *
 * Layout:
 *   [0–3]   F0 00 01 3A          Sonicake header
 *   [4]     0x06                  Command: switch/load effect
 *   [5]     blockIndex            Target block slot (0–11)
 *   [6]     0x01                  Flag: apply immediately
 *   [7–57]  zeros                 Template padding
 *   [58]    category              fxid >>> 24
 *   [59]    modelLo               fxid & 0x7F  (7-bit)
 *   [60]    modelHi               (fxid >>> 7) & 0x7F  (7-bit)
 *   [61–105] zeros                Padding
 *   [106]   checksum              XOR of bytes 4–105
 *   [107]   F7                    Terminator
 */
function buildModelLoadSysEx(
  blockIndex: number,
  fxid: number,
  effectName: string,
): MidiSysExCommand {
  const category = (fxid >>> 24) & 0xff;
  const modelLo = to7Bit(fxid);
  const modelHi = to7Bit(fxid >>> 7);

  // Start with a zero-filled 108-byte buffer.
  const packet = new Array<number>(SYSEX_PACKET_LEN).fill(0);

  // Header
  packet[0] = SYSEX_HEADER[0];
  packet[1] = SYSEX_HEADER[1];
  packet[2] = SYSEX_HEADER[2];
  packet[3] = SYSEX_HEADER[3];

  // Command structure
  packet[OFFSET_CMD] = SYSEX_CMD_SWITCH_EFFECT;
  packet[OFFSET_SLOT] = to7Bit(blockIndex);
  packet[OFFSET_FLAGS] = SYSEX_FLAG_IMMEDIATE;

  // Category and model IDs at the protocol-defined offsets
  packet[OFFSET_CATEGORY] = to7Bit(category);
  packet[OFFSET_MODEL_LO] = modelLo;
  packet[OFFSET_MODEL_HI] = modelHi;

  // Checksum + terminator
  packet[OFFSET_CHECKSUM] = sysexChecksum(packet);
  packet[SYSEX_PACKET_LEN - 1] = SYSEX_TERMINATOR;

  return {
    bytes: packet,
    label: `SysEx modelo: bloco ${blockIndex + 1} ← ${effectName} (cat=${category}, model=0x${modelHi.toString(16).padStart(2, '0')}${modelLo.toString(16).padStart(2, '0')})`,
  };
}

/**
 * Build the full MIDI command sequence for the pedalboard from the validated
 * AI response. The FXID for every effect is stamped onto each chain entry by
 * validateAiResponse (the single point where alg_data.json confirms an effect
 * exists), so this builder consumes entry.fxid directly and injects it into
 * SysEx bytes 59–60 without re-resolving by name.
 *
 * Per-block sequence (strictly enforced — the sender applies DELAY_SYSEX after
 * every SysEx and DELAY_CC after every CC):
 *   1. SysEx model-load (108 bytes) — injects the real FXID into the block slot
 *   2. 80 ms delay (firmware processes the model load)
 *   3. CC parameter changes — sets knob values
 *   4. CC activation (127) — lights up the block pedal
 * Throws if any entry is missing its resolved FXID or references an unknown module.
 */
export function buildMidiPreset(ai: AiPresetResponse): BuiltMidiPreset {
  const errors: string[] = [];

  // Guard: every chain entry must carry a resolved FXID. By the time this runs
  // the response has already passed validateAiResponse, which stamps fxid from
  // alg_data.json and throws on any unknown effect — so a missing fxid here
  // means the caller bypassed validation.
  for (let i = 0; i < ai.cadeia.length; i++) {
    const entry = ai.cadeia[i];
    const slot = findSlotForCode(entry.modulo);
    if (!slot) {
      errors.push(
        `Módulo "${entry.modulo}" (posição ${i + 1}) não existe na Matribox II Pro. Códigos permitidos: ${HARDWARE_SLOTS.map((s) => s.code).join(', ')}.`,
      );
      continue;
    }
    if (entry.fxid === undefined || Number.isNaN(entry.fxid)) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) sem FXID resolvido — o preset não passou pela validação do catálogo.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Falha ao construir os comandos MIDI:\n${errors.join('\n')}`);
  }

  const commands: MidiCommand[] = [];

  // Active modules are assigned to consecutive block slots (1..12) in the
  // order the AI returned them.
  const activeEntries: ChainEntry[] = [];
  for (let i = 0; i < ai.cadeia.length && i < CC_BLOCK_COUNT; i++) {
    activeEntries.push(ai.cadeia[i]);
  }

  // Per-block flow: SysEx model-load (FXID) → 80ms → CC parameters → CC activation (127).
  for (let i = 0; i < CC_BLOCK_COUNT; i++) {
    const cc = CC_BLOCK_BASE + i;
    const entry = activeEntries[i];

    if (entry) {
      // The real FXID resolved from alg_data.json during validation — injected
      // directly into SysEx bytes 59 (low 7 bits) and 60 (high 7 bits).
      const fxid = entry.fxid!;

      // 1. SysEx model-load — injects the FXID into the block slot so the
      //    firmware loads the right algorithm before any CC takes effect.
      const sysex = buildModelLoadSysEx(i, fxid, entry.nomeEfeito);
      commands.push({ type: 'sysex', ...sysex });
      // ↑ sender applies DELAY_SYSEX (80 ms) here, giving the firmware time to
      //   process the model load before the CC commands below arrive.

      // 2. CC parameter changes (only the first 3 blocks expose a quick knob
      //    on CC16/CC18/CC20). Sender applies DELAY_CC (25 ms) after each.
      if (i < CC_KNOB.length && entry.knobs.length > 0) {
        const midi = toMidiRange(entry.knobs[0]);
        commands.push({
          type: 'cc',
          cc: CC_KNOB[i],
          value: midi,
          label: `Knob ${i + 1} = ${entry.knobs[0]}% (bloco ${i + 1})`,
        });
      }

      // 3. CC activation (127) — lights up the block pedal. Sender applies
      //    DELAY_CC (25 ms) after.
      commands.push({
        type: 'cc',
        cc,
        value: BLOCK_ON,
        label: `Ativar bloco ${i + 1} (${entry.nomeEfeito}) → CC${cc} = 127`,
      });
    } else {
      // Unused block: explicitly turn it OFF.
      commands.push({
        type: 'cc',
        cc,
        value: BLOCK_OFF,
        label: `Desativar bloco ${i + 1} → CC${cc} = 0`,
      });
    }
  }

  // Master volume (CC7). Use the VOL module's primary knob when present;
  // otherwise default to a safe 90%.
  const volEntry = ai.cadeia.find(
    (e) => findSlotForCode(e.modulo)?.uiType === 'VOLUME',
  );
  const masterVol = volEntry && volEntry.knobs.length > 0
    ? toMidiRange(volEntry.knobs[0])
    : Math.round(0.9 * 127);
  commands.push({ type: 'cc', cc: CC_VOLUME, value: masterVol, label: 'Volume Geral (CC7)' });

  // Expression pedal (CC11) — neutral heel-down by default.
  commands.push({ type: 'cc', cc: CC_EXPRESSION, value: 0, label: 'Pedal de Expressão (CC11)' });

  return {
    commands,
    nomePatch: ai.nomePatch,
    comentario: ai.comentario,
  };
}
