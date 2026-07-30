// Matribox II Pro MIDI builder — bulk-dump (matrix replacement) mode.
//
// The pedalboard replaces its entire effect matrix when it receives a single
// SysEx "bulk dump". This mirrors how the official QME-200 editor writes a
// preset: one message carries the full slot table (every block, including the
// empty ones) plus the knob values, and the firmware commits the whole matrix
// to RAM in one shot. The device-side capture (USBPcap) confirmed the on-wire
// signature:
//
//   F0 21 25 4D 50 00  <parameter matrix>  <XOR checksum>  F7
//
// The bytes 04 / 05 that also appear in the capture are the USB-MIDI Code Index
// Numbers the OS driver adds at the transport layer — they are NOT part of the
// MIDI message and must not be emitted through Web MIDI (the driver does it).
// toUsbMidiBlocks() in midiSender.ts reproduces that framing for verification.
//
// Parameter matrix layout (96 bytes of slot data):
//   12 fixed slots × 8 bytes each.
//   Per slot:  [fxid0..3]  [knob0..3]
//     - fxid : the full 28-bit FXID from alg_data.json, packed as four 7-bit
//              bytes (LSB first) so the high category bits survive.
//     - knobs: the first four knob values (0–100) mapped to 0–127; unused knob
//              positions are 0. Empty slots are fully zeroed.
// The XOR checksum covers the 96-byte matrix; F7 terminates the message.

import { findSlotForCode, HARDWARE_SLOTS } from './hardwareSlots';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';
import { toUsbMidiBlocks, formatBlocksHex } from './midiSender';

// ── Command types ─────────────────────────────────────────────────────────────

export interface MidiCCCommand {
  cc: number;
  value: number;
  label: string;
}

export interface MidiSysExCommand {
  bytes: number[];
  label: string;
  /** Diagnostic: the 4-byte USB-MIDI event packets the OS driver emits. */
  usbMidiBlocks?: number[][];
  /** Diagnostic: hex preview of the first few wire packets. */
  wirePreview?: string;
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

// Delays (ms) between sent messages. A bulk dump is one SysEx, so a single
// DELAY_SYSEX gap after it is enough before the CC activations follow.
const DELAY_SYSEX = 120;
const DELAY_CC = 25;

export { DELAY_SYSEX, DELAY_CC };

// ── Bulk-dump SysEx constants ────────────────────────────────────────────────

// Real on-wire signature confirmed by USBPcap capture (without the USB-MIDI
// CIN bytes the driver adds): F0 = SysEx start, 21 25 = manufacturer id,
// 4D 50 00 = "MP\0" device/model id.
const SYSEX_SIGNATURE = [0xf0, 0x21, 0x25, 0x4d, 0x50, 0x00];
const SYSEX_SIGNATURE_LEN = SYSEX_SIGNATURE.length; // 6
const SYSEX_TERMINATOR = 0xf7;

// 12 slots × 8 bytes (4 fxid + 4 knobs) = 96 bytes of slot data.
const SLOT_COUNT = CC_BLOCK_COUNT; // 12
const SLOT_BYTES = 8;
const MATRIX_BYTES = SLOT_COUNT * SLOT_BYTES; // 96
const FXID_BYTES = 4;
const KNOB_BYTES = 4;

// Total SysEx length = signature(6) + matrix(96) + checksum(1) + F7(1) = 104.
// 104 ≡ 2 (mod 3), so the USB-MIDI tail packet is CIN 0x06 ([b, F7, 00]).
const SYSEX_TOTAL_LEN = SYSEX_SIGNATURE_LEN + MATRIX_BYTES + 1 + 1;

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
 * Split the full fxid from alg_data.json into four 7-bit bytes, LSB first.
 * The catalog's largest fxid is 0x0F000009 (251658249), whose top nibble (0x0F)
 * sits in bits 24–27 — four 7-bit bytes carry 28 bits, enough to hold it.
 */
function fxidTo7BitBytes(fxid: number): number[] {
  const out: number[] = [];
  let v = fxid >>> 0;
  for (let i = 0; i < FXID_BYTES; i++) {
    out.push(to7Bit(v));
    v = v >>> 7;
  }
  return out;
}

/**
 * XOR checksum over the 96-byte parameter matrix, masked to 7 bits. Covers
 * every slot byte (fxid + knobs), so a single flipped bit is caught.
 */
function matrixChecksum(matrix: number[]): number {
  let xor = 0;
  for (let i = 0; i < matrix.length; i++) xor ^= matrix[i];
  return xor & 0x7f;
}

/**
 * Assemble the 96-byte parameter matrix from the validated chain. Active
 * modules fill consecutive slots in signal-chain order; the remaining slots
 * are zeroed so the firmware renders them as empty blocks instead of leaving
 * stale algorithms in RAM.
 */
function buildParameterMatrix(entries: ChainEntry[]): number[] {
  const matrix = new Array<number>(MATRIX_BYTES).fill(0);

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const entry = entries[slot];
    const base = slot * SLOT_BYTES;

    if (entry && entry.fxid !== undefined) {
      const fxidBytes = fxidTo7BitBytes(entry.fxid);
      for (let i = 0; i < FXID_BYTES; i++) {
        matrix[base + i] = fxidBytes[i];
      }
      // Up to four knob values, mapped to 0–127.
      for (let i = 0; i < KNOB_BYTES; i++) {
        const knob = entry.knobs[i];
        matrix[base + FXID_BYTES + i] =
          knob !== undefined ? toMidiRange(knob) : 0;
      }
    }
    // Empty slots stay zeroed — no explicit branch needed.
  }

  return matrix;
}

/**
 * Build the single bulk-dump SysEx that replaces the whole effect matrix.
 * Layout:
 *   [0–5]   F0 21 25 4D 50 00   real device signature
 *   [6–101] 96-byte parameter matrix (12 slots × 8 bytes)
 *   [102]   XOR checksum of the matrix (7-bit)
 *   [103]   F7                   terminator
 *
 * Also returns the diagnostic 4-byte USB-MIDI event-packet view (what the OS
 * driver puts on the wire) so the UI can confirm it matches a Wireshark grab.
 */
function buildBulkDumpSysEx(entries: ChainEntry[]): MidiSysExCommand {
  const matrix = buildParameterMatrix(entries);
  const checksum = matrixChecksum(matrix);

  const bytes: number[] = [
    ...SYSEX_SIGNATURE,
    ...matrix,
    checksum,
    SYSEX_TERMINATOR,
  ];

  if (bytes.length !== SYSEX_TOTAL_LEN) {
    throw new Error(
      `Bulk dump length mismatch: expected ${SYSEX_TOTAL_LEN}, got ${bytes.length}`,
    );
  }

  const blocks = toUsbMidiBlocks(bytes);
  const wirePreview = formatBlocksHex(blocks.slice(0, 4));

  return {
    bytes,
    label: `Bulk Dump Matribox II Pro (${bytes.length} bytes, ${blocks.length} pacotes USB-MIDI)`,
    usbMidiBlocks: blocks,
    wirePreview,
  };
}

/**
 * Build the full MIDI command sequence for the pedalboard from the validated
 * AI response. Every FXID is stamped onto each chain entry by validateAiResponse
 * (the single point where alg_data.json confirms an effect exists), so this
 * builder consumes entry.fxid directly.
 *
 * Flow:
 *   1. ONE bulk-dump SysEx (104 bytes) → replaces the whole 12-slot matrix in
 *      RAM, including empty blocks, in a single shot.
 *   2. 120 ms delay (firmware commits the matrix).
 *   3. CC activation (127) for every block → lights up the pedals.
 *   4. CC7 master volume + CC11 expression pedal.
 *
 * Throws if any entry is missing its resolved FXID or references an unknown
 * module.
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

  // 1. Single bulk-dump SysEx — full matrix replacement in one shot.
  const activeEntries: ChainEntry[] = ai.cadeia.slice(0, SLOT_COUNT);
  const bulk = buildBulkDumpSysEx(activeEntries);
  commands.push({ type: 'sysex', ...bulk });

  // 2. CC activation for every block (active AND empty). The bulk dump already
  //    wrote the matrix; these CCs just light up the pedals on screen. Sender
  //    applies DELAY_SYSEX after the SysEx and DELAY_CC after each CC.
  for (let i = 0; i < CC_BLOCK_COUNT; i++) {
    const cc = CC_BLOCK_BASE + i;
    const entry = activeEntries[i];
    const label = entry
      ? `Ativar bloco ${i + 1} (${entry.nomeEfeito}) → CC${cc} = 127`
      : `Forçar render bloco ${i + 1} (slot vazio) → CC${cc} = 127`;
    commands.push({ type: 'cc', cc, value: BLOCK_ON, label });
  }

  // 3. Master volume (CC7). Use the VOL module's primary knob when present;
  //    otherwise default to a safe 90%.
  const volEntry = ai.cadeia.find(
    (e) => findSlotForCode(e.modulo)?.uiType === 'VOLUME',
  );
  const masterVol = volEntry && volEntry.knobs.length > 0
    ? toMidiRange(volEntry.knobs[0])
    : Math.round(0.9 * 127);
  commands.push({ type: 'cc', cc: CC_VOLUME, value: masterVol, label: 'Volume Geral (CC7)' });

  // 4. Expression pedal (CC11) — neutral heel-down by default.
  commands.push({ type: 'cc', cc: CC_EXPRESSION, value: 0, label: 'Pedal de Expressão (CC11)' });

  return {
    commands,
    nomePatch: ai.nomePatch,
    comentario: ai.comentario,
  };
}
