// Matribox II Pro real-time MIDI builder.
//
// The pedalboard cannot instantiate an effect into an empty block via CC alone.
// Before any CC parameter automation, we must push a raw SysEx model-load
// packet (LEN=108, DATA8=48) that tells the firmware which algorithm to load
// into the target block slot. Only then do CC parameter changes and the block
// activation (CC43..CC54 = 127) take effect and light up the pedal.
//
// SysEx model-load packet structure (reverse-engineered from app.so):
//   [0xF0, 0x00, 0x01, 0x3A]  — Sonicake manufacturer signature
//   Fixed 108-byte frame padded with the standard template
//   data[58] = effect category byte  (fxid >>> 24)
//   data[59] = effect model byte    (fxid & 0xFF)
//   data[60] = effect model high byte (fxid >> 8 & 0xFF)  [if needed]
//   [0xF7]                    — SysEx terminator
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

import { findSlotForCode, HARDWARE_SLOTS } from './hardwareSlots';
import { resolveFxId } from './algorithmCatalog';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Map a 0–100 knob value to the 0–127 MIDI range. */
function toMidiRange(value: number): number {
  return Math.round((clampKnob(value) / 100) * 127);
}

/**
 * Build a 108-byte SysEx model-load packet for a given effect.
 * The category byte goes at data[58], the model low byte at data[59],
 * and the model high byte at data[60].
 */
function buildModelLoadSysEx(
  blockIndex: number,
  fxid: number,
  effectName: string,
): MidiSysExCommand {
  const category = (fxid >>> 24) & 0xff;
  const modelLow = fxid & 0xff;
  const modelHigh = (fxid >>> 8) & 0xff;

  // Build the 108-byte packet: header + payload + terminator.
  // Payload is zero-padded to reach the fixed length, with category and
  // model bytes placed at the protocol-defined offsets.
  const packet: number[] = [];
  packet.push(...SYSEX_HEADER);

  // Reserve space for the payload (everything between header and terminator).
  const payloadLen = SYSEX_PACKET_LEN - SYSEX_HEADER.length - 1; // minus F7
  const payload = new Array<number>(payloadLen).fill(0);

  // Block slot index in the first payload byte.
  payload[0] = blockIndex;

  // Category and model IDs at the protocol-defined offsets (data[58], data[59],
  // data[60] — measured from the start of the full packet, so we subtract the
  // header length to index into the payload array).
  const catOffset = 58 - SYSEX_HEADER.length;
  const modelLowOffset = 59 - SYSEX_HEADER.length;
  const modelHighOffset = 60 - SYSEX_HEADER.length;

  payload[catOffset] = category;
  payload[modelLowOffset] = modelLow;
  payload[modelHighOffset] = modelHigh;

  packet.push(...payload);
  packet.push(SYSEX_TERMINATOR);

  return {
    bytes: packet,
    label: `SysEx modelo: bloco ${blockIndex + 1} ← ${effectName} (cat=${category}, model=0x${modelHigh.toString(16).padStart(2, '0')}${modelLow.toString(16).padStart(2, '0')})`,
  };
}

/**
 * Build the full MIDI command sequence for the pedalboard from the AI
 * response. For each active block the flow is:
 *   1. SysEx model-load (108 bytes)
 *   2. CC quick-knob parameter
 *   3. CC block activation (127 = ON)
 * Throws if any module/effect cannot be resolved.
 */
export function buildMidiPreset(ai: AiPresetResponse): BuiltMidiPreset {
  const errors: string[] = [];

  // Validate every chain entry against the catalog before emitting anything.
  for (let i = 0; i < ai.cadeia.length; i++) {
    const entry = ai.cadeia[i];
    const slot = findSlotForCode(entry.modulo);
    if (!slot) {
      errors.push(
        `Módulo "${entry.modulo}" (posição ${i + 1}) não existe na Matribox II Pro. Códigos permitidos: ${HARDWARE_SLOTS.map((s) => s.code).join(', ')}.`,
      );
      continue;
    }
    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) não foi encontrado no catálogo.`,
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

  // Per-block flow: SysEx model-load → CC parameters → CC activation (127).
  for (let i = 0; i < CC_BLOCK_COUNT; i++) {
    const cc = CC_BLOCK_BASE + i;
    const entry = activeEntries[i];

    if (entry) {
      const fxid = resolveFxId(entry.nomeEfeito)!;

      // 1. SysEx model-load — instantiate the algorithm into the block slot.
      const sysex = buildModelLoadSysEx(i, fxid, entry.nomeEfeito);
      commands.push({ type: 'sysex', ...sysex });

      // 2. CC quick-knob parameter (only the first 3 blocks expose a quick
      //    knob on CC16/CC18/CC20).
      if (i < CC_KNOB.length && entry.knobs.length > 0) {
        const midi = toMidiRange(entry.knobs[0]);
        commands.push({
          type: 'cc',
          cc: CC_KNOB[i],
          value: midi,
          label: `Knob ${i + 1} = ${entry.knobs[0]}% (bloco ${i + 1})`,
        });
      }

      // 3. Force activation ON — lights up the block pedal.
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
