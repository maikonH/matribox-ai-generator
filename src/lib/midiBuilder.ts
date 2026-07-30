// Matribox II Pro real-time MIDI builder.
//
// The pedalboard cannot instantiate an effect into an empty block via CC alone.
// Before any CC parameter automation, we must push a raw SysEx data-write
// packet (LEN=108) that tells the QME-200 firmware which algorithm to load
// into the target block slot. Only then do CC parameter changes and the block
// activation (CC43..CC54 = 127) take effect and light up the pedal.
//
// SysEx data-write packet structure (108 bytes total):
//
//  Offset  Content
//  ------  -------
//  0–7     [0xF0, 0x00, 0x01, 0x3A, 0x01, 0x10, 0x02, 0x40]
//          Sonicake manufacturer id + QME-200 hardware family + data-write op.
//          The first 4 bytes are the manufacturer signature; bytes 4–7 are the
//          device-family and write-operation selectors the firmware gates on —
//          a bare 4-byte header is rejected, which is why the previous model
//          loads were silently ignored.
//  8       Block slot index (0–11)
//  9       Flags (0x01 = apply immediately)
//  10–13   Effect model ID as four 7-bit bytes (LSB first). The FULL fxid from
//          alg_data.json is split into 7-bit chunks so the high category bits
//          (fxid >>> 21) survive — the old 2-byte split only carried bits 0–13
//          and emitted model=0x0000 for every AMP/CAB (fxid ≥ 0x01000000).
//  14–105  Template padding (zeros)
//  106     Checksum (XOR of bytes 8–105, masked to 7 bits)
//  107     0xF7  SysEx terminator
//
// CC map (official reverse-engineering of the hardware):
//   CC7  — Volume Geral (master volume)
//   CC11 — Pedal de Expressão (expression pedal)
//   CC43..CC54 — Ativação dos blocos 1..12 (0 = OFF, 127 = ON)
//   CC16, CC18, CC20 — Knobs rápidos 1, 2, 3 (0–127)
//
// Flow per block (active AND empty):
//   1. SysEx data-write (108 bytes) → commits the model id into the block slot
//   2. 80 ms delay (firmware processes the write)
//   3. CC parameter changes → sets knob values (active blocks only)
//   4. CC activation (127) → lights up the block pedal
//
// Empty blocks are NOT skipped: they receive the same write handshake with a
// null model id followed by CC 127, which forces the chip to render the slot
// instead of leaving it in the uninitialized state that hangs "Loading data…".
//
// Timing: the firmware needs ~80 ms after a SysEx write before it will accept
// CC commands for that block. CC commands use a shorter 25 ms gap.

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

// ── SysEx constants ──────────────────────────────────────────────────────────

// 8-byte QME-200 write header: manufacturer id (F0 00 01 3A) + hardware family
// (01 10) + data-write operation (02 40). The firmware rejects any packet whose
// header is shorter than this — the root cause of the ignored model loads.
const SYSEX_HEADER = [0xf0, 0x00, 0x01, 0x3a, 0x01, 0x10, 0x02, 0x40];
const SYSEX_HEADER_LEN = SYSEX_HEADER.length; // 8
const SYSEX_TERMINATOR = 0xf7;
const SYSEX_PACKET_LEN = 108;
const SYSEX_FLAG_IMMEDIATE = 0x01;

// Offsets within the 108-byte packet (payload starts right after the 8-byte header).
const OFFSET_SLOT = SYSEX_HEADER_LEN;           // 8
const OFFSET_FLAGS = SYSEX_HEADER_LEN + 1;      // 9
const OFFSET_MODEL_BASE = SYSEX_HEADER_LEN + 2; // 10
const SYSEX_MODEL_BYTES = 4;                    // 4 × 7 bits = 28 bits (covers fxid up to 0x0FFFFFFF)
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
 * Compute the SysEx checksum: XOR of every payload byte from the end of the
 * 8-byte header through OFFSET_CHECKSUM - 1, masked to 7 bits.
 */
function sysexChecksum(packet: number[]): number {
  let xor = 0;
  for (let i = SYSEX_HEADER_LEN; i < OFFSET_CHECKSUM; i++) {
    xor ^= packet[i];
  }
  return xor & 0x7f;
}

/**
 * Split the full fxid from alg_data.json into four 7-bit bytes, LSB first.
 * This carries the high category bits (fxid >>> 21) that the old 2-byte split
 * discarded — AMP/CAB effects with fxid ≥ 0x01000000 previously encoded as
 * model=0x0000 and were ignored by the firmware.
 */
function fxidTo7BitBytes(fxid: number): number[] {
  const out: number[] = [];
  let v = fxid >>> 0;
  for (let i = 0; i < SYSEX_MODEL_BYTES; i++) {
    out.push(to7Bit(v));
    v = v >>> 7;
  }
  return out;
}

/**
 * Build a 108-byte SysEx data-write packet for a given effect (or a null model
 * for an empty slot). The 8-byte QME-200 write header is mandatory; without it
 * the firmware silently drops the packet.
 *
 * Layout:
 *   [0–7]   F0 00 01 3A 01 10 02 40   QME-200 write header
 *   [8]     blockIndex                Target block slot (0–11)
 *   [9]     0x01                      Flag: apply immediately
 *   [10–13] model[0..3]               Full fxid as four 7-bit bytes (LSB first)
 *   [14–105] zeros                    Template padding
 *   [106]   checksum                  XOR of bytes 8–105
 *   [107]   F7                        Terminator
 */
function buildModelLoadSysEx(
  blockIndex: number,
  fxid: number,
  effectName: string,
): MidiSysExCommand {
  const modelBytes = fxidTo7BitBytes(fxid);

  // Start with a zero-filled 108-byte buffer.
  const packet = new Array<number>(SYSEX_PACKET_LEN).fill(0);

  // 8-byte QME-200 write header.
  for (let i = 0; i < SYSEX_HEADER_LEN; i++) {
    packet[i] = SYSEX_HEADER[i];
  }

  // Slot + apply-immediately flag.
  packet[OFFSET_SLOT] = to7Bit(blockIndex);
  packet[OFFSET_FLAGS] = SYSEX_FLAG_IMMEDIATE;

  // Full fxid as 7-bit MSB/LSB (LSB first) — no dummy zeros; the high category
  // bits are carried in modelBytes[3].
  for (let i = 0; i < modelBytes.length; i++) {
    packet[OFFSET_MODEL_BASE + i] = modelBytes[i];
  }

  // Checksum + terminator.
  packet[OFFSET_CHECKSUM] = sysexChecksum(packet);
  packet[SYSEX_PACKET_LEN - 1] = SYSEX_TERMINATOR;

  const modelHex = modelBytes
    .slice()
    .reverse()
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    bytes: packet,
    label: `SysEx escrita QME-200: bloco ${blockIndex + 1} ← ${effectName} (fxid=${fxid}, model=0x${modelHex})`,
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
      // directly into SysEx bytes 10–13 as four 7-bit bytes (full fxid).
      const fxid = entry.fxid!;

      // 1. SysEx data-write — commits the FXID into the block slot so the
      //    firmware loads the right algorithm before any CC takes effect.
      const sysex = buildModelLoadSysEx(i, fxid, entry.nomeEfeito);
      commands.push({ type: 'sysex', ...sysex });
      // ↑ sender applies DELAY_SYSEX (80 ms) here, giving the firmware time to
      //   process the write before the CC commands below arrive.

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
      // Empty slot: push the full QME-200 write handshake with a null model so
      // the chip commits the slot instead of ignoring a bare CC. The 80 ms
      // SysEx delay (applied by the sender) precedes the CC 127 "snap" that
      // forces the pedal to render on screen — this is what unblocks the
      // "preset vazio / Loading data…" hang.
      commands.push({
        type: 'sysex',
        ...buildModelLoadSysEx(i, 0, 'Slot vazio'),
      });
      commands.push({
        type: 'cc',
        cc,
        value: BLOCK_ON,
        label: `Forçar render bloco ${i + 1} (slot vazio) → CC${cc} = 127`,
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
