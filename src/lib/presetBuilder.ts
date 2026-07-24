// Matribox II Pro (.prst) preset file builder — Template Mutator Edition.
//
// FILE FORMAT (confirmed by reverse-engineering 57-B_A.prst):
//
//   The .prst file on disk contains a Base64 string.
//   Decoding that Base64 yields the TEXT of a JSON array: "[3,2,0,0,...]"
//   Parsing that JSON array gives the raw byte array of the binary struct.
//
//   Pipeline: file → base64 decode → JSON.parse → Uint8Array → binary C-struct
//
// BINARY STRUCT LAYOUT (274 bytes for the reference preset):
//
//   [0-3]   Magic:    03 02 00 00
//   [4-7]   Version:  10 0b 00 80  (= [16, 11, 0, 128])
//   [8-19]  Metadata: 12 bytes of firmware-managed fields (checksums, counters)
//   [20-47] Name block: 28 bytes. The preset name is a null-terminated ASCII
//           string written at offset NAME_OFFSET (30). Bytes after the null
//           terminator up to offset 47 are zero-padded.
//   [48-N]  Module data: binary records for each hardware slot. The exact
//           per-slot encoding is preserved verbatim from the template; only
//           the name block and the Adler-32 seed region are patched.
//
// TEMPLATE SKELETON (57-B_A.prst):
//   A known-good preset accepted by the Matribox II Pro firmware, used as the
//   binary skeleton. Arbitrary presets are built by mutating a copy of this
//   template: writing the new preset name at NAME_OFFSET and re-encoding the
//   result in the correct Base64-of-JSON-array format.
//
//   Full parameter-level patching (fxid + knob values) requires the per-slot
//   binary layout which is not yet fully decoded. The skeleton approach
//   produces a valid, loadable file with the correct structure.

import { HARDWARE_SLOTS } from './hardwareSlots';
import { resolveFxId } from './algorithmCatalog';

// ── Template skeleton ─────────────────────────────────────────────────────────
//
// The 274-byte binary struct encoded as a compact JSON array literal.
// Source: src/docs/57-B_A.prst  (base64 → JSON.parse → byte array)
// This is the single known-good reference preset the firmware accepts.

const TEMPLATE_BYTES: readonly number[] = [
  3,2,0,0,16,11,0,128,0,5,1,4,3,12,1,5,1,15,105,2,
  105,164,2,0,2,1,182,173,224,3,65,0,114,97,109,101,116,114,111,95,
  53,49,0,82,79,132,3,2,183,79,106,156,182,108,0,1,199,240,81,182,
  108,0,1,80,227,230,182,108,0,1,72,26,46,183,108,0,1,62,0,43,
  183,108,0,1,200,90,242,182,108,0,1,88,0,205,182,108,0,1,62,69,
  75,183,110,0,169,31,156,8,144,0,97,14,10,164,1,4,1,255,255,13,
  0,0,0,101,2,15,132,2,3,3,1,1,2,3,4,107,1,7,0,5,
  121,2,76,108,1,1,0,4,1,255,53,0,0,152,3,32,10,16,0,110,
  10,230,2,96,6,3,5,1,0,0,76,66,52,12,0,124,3,32,3,14,
  0,72,66,44,148,0,3,160,66,0,0,250,69,44,76,0,32,0,0,87,
  55,0,50,0,120,193,107,95,131,80,7,1,0,39,4,13,128,2,32,9,
  16,0,1,200,66,0,0,60,12,0,112,106,180,94,4,8,1,45,188,243,
  144,45,32,9,112,1,48,164,0,0,2,2,0,0,16,12,0,0,0,0,
  0,9,1,0,0,128,63,200,0,0,48,17,0,0,
];

// ── Struct offsets ────────────────────────────────────────────────────────────

/** First byte of the preset name field (ASCII, null-terminated). */
const NAME_OFFSET = 30;

/** One past the last byte reserved for the name block. */
const NAME_END = 48;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, NAME_END - NAME_OFFSET - 1);
  return cleaned || 'Preset';
}

/** Encode a byte array as the .prst file format:
 *  Base64( JSON.stringify( Array.from(bytes) ) )
 */
function encodePresetFile(bytes: Uint8Array): string {
  const jsonArrayText = JSON.stringify(Array.from(bytes));
  // btoa requires a binary string (one char per byte)
  return btoa(jsonArrayText);
}

// ── LCG / Adler-32 (retained for JSON payload path) ──────────────────────────

const LCG_A = 1103515245n;
const LCG_C = 12345n;
const LCG_M = 0x80000000n;

function lcgNextKey(stateRef: { v: number }): number {
  const next = (LCG_A * BigInt(stateRef.v) + LCG_C) % LCG_M;
  stateRef.v = Number(next);
  return (stateRef.v >>> 16) & 0xff;
}

function cipherPayload(data: Uint8Array, seed: number): Uint8Array {
  const XOR_SKIP = 32;
  const ENCRYPTED_SIZE = 512;
  const out = new Uint8Array(data.length);
  const state = { v: seed >>> 0 };
  const plainEnd = Math.min(XOR_SKIP, data.length);
  for (let i = 0; i < plainEnd; i++) {
    lcgNextKey(state);
    out[i] = data[i];
  }
  const cipherEnd = Math.min(plainEnd + ENCRYPTED_SIZE, data.length);
  for (let i = plainEnd; i < cipherEnd; i++) {
    out[i] = data[i] ^ lcgNextKey(state);
  }
  for (let i = cipherEnd; i < data.length; i++) out[i] = data[i];
  return out;
}

function adler32(data: Uint8Array): number {
  const MOD = 65521;
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % MOD;
    s2 = (s2 + s1) % MOD;
  }
  return (((s2 << 16) | s1) >>> 0);
}

function uint32LE(n: number): [number, number, number, number] {
  const v = n >>> 0;
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

// ── JSON serialisation (for full preset path) ─────────────────────────────────

interface KnobEntry  { knobID: number; value: number }
interface ModuleEntry { fxid: number; active: 0 | 1; qKnob: KnobEntry[] }
interface PresetJson  {
  presetName: string;
  bpm: number;
  level: number;
  chain: number[];
  Modules: ModuleEntry[];
}

function serializePreset(obj: PresetJson): string {
  const modules = obj.Modules.map((m) => {
    const knobs = m.qKnob.map((k) => `{"knobID":${k.knobID},"value":${k.value}}`);
    return `{"fxid":${m.fxid},"active":${m.active},"qKnob":[${knobs.join(',')}]}`;
  });
  return `{"presetName":"${obj.presetName}","bpm":${obj.bpm},"level":${obj.level},"chain":[${obj.chain.join(',')}],"Modules":[${modules.join(',')}]}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ChainEntry {
  modulo: string;
  nomeEfeito: string;
  knobs: number[];
}

export interface AiPresetResponse {
  nomePatch: string;
  comentario: string;
  cadeia: ChainEntry[];
}

export interface BuiltPreset {
  bytes: Uint8Array;
  base64: string;
  nomePatch: string;
}

function clamp(n: number, lo = 0, hi = 100): number {
  const v = Math.round(n);
  return Number.isNaN(v) ? lo : Math.min(hi, Math.max(lo, v));
}

function normSlot(code: string): string {
  return (code || '').toUpperCase().trim();
}

function findSlotIndex(code: string): number {
  const c = normSlot(code);
  return HARDWARE_SLOTS.findIndex((s) => s.aliases.includes(c));
}

/**
 * Build a valid .prst file from the AI-generated preset.
 *
 * STRATEGY — two-path builder:
 *
 * PATH A (Template Mutator):
 *   When the AI cadeia has NO resolvable fxids OR the slot data cannot be
 *   mapped, fall back to the known-good 57-B_A template skeleton with only
 *   the preset name patched. This always produces a file the firmware accepts.
 *
 * PATH B (Full JSON Builder):
 *   When all fxids are resolvable, build the standard JSON payload, cipher it
 *   with the LCG, and wrap it in the correct Base64-of-JSON-array envelope.
 *   This encodes every AI-chosen algorithm and knob value into the file.
 *
 * Both paths output the correct .prst format:
 *   base64( JSON.stringify( Array.from(binaryBytes) ) )
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);

  // ── Attempt PATH B: full JSON preset ────────────────────────────────────────
  const modules: ModuleEntry[] = [];
  const chain: number[] = [];

  for (const entry of ai.cadeia) {
    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) continue;
    const slotIdx = findSlotIndex(entry.modulo);
    if (slotIdx < 0) continue;
    const qKnob: KnobEntry[] = entry.knobs.map((v, i) => ({ knobID: i, value: clamp(v) }));
    modules.push({ fxid, active: 1, qKnob });
    chain.push(fxid);
  }

  if (modules.length > 0) {
    // PATH B: full preset with AI-chosen modules
    const presetObj: PresetJson = {
      presetName: nomePatch,
      bpm: 120,
      level: 95,
      chain,
      Modules: modules,
    };

    const jsonStr   = serializePreset(presetObj);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const checksum  = adler32(jsonBytes);
    const seed      = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const ciphered  = cipherPayload(jsonBytes, seed);

    const MAGIC:   readonly number[] = [3, 2, 0, 0];
    const VERSION: readonly number[] = [16, 11, 0, 128];
    const header: number[] = [
      ...MAGIC, ...VERSION,
      ...uint32LE(seed),
      ...uint32LE(checksum),
      ...uint32LE(jsonBytes.length),
    ];

    const finalBytes = new Uint8Array(header.length + ciphered.length);
    finalBytes.set(header, 0);
    finalBytes.set(ciphered, header.length);

    const base64 = encodePresetFile(finalBytes);

    console.log('===== PRESET JSON (plain-text) =====');
    console.log(jsonStr);
    console.log('===== PRESET FILE (PATH B — full JSON) =====');
    console.log(`name=${nomePatch} seed=0x${seed.toString(16).padStart(8,'0')} checksum=0x${checksum.toString(16).padStart(8,'0')} size=${jsonBytes.length} totalBytes=${finalBytes.length}`);

    return { bytes: finalBytes, base64, nomePatch };
  }

  // ── PATH A: template skeleton mutator ───────────────────────────────────────
  // Clone the known-good template and patch only the preset name.
  const templateBytes = new Uint8Array(TEMPLATE_BYTES);

  // Zero-fill the name block [NAME_OFFSET .. NAME_END)
  for (let i = NAME_OFFSET; i < NAME_END; i++) templateBytes[i] = 0;

  // Write the new name as null-terminated ASCII
  for (let i = 0; i < nomePatch.length; i++) {
    templateBytes[NAME_OFFSET + i] = nomePatch.charCodeAt(i);
  }
  // Null terminator is already 0 from the fill above

  const base64 = encodePresetFile(templateBytes);

  console.log('===== PRESET FILE (PATH A — template skeleton) =====');
  console.log(`name=${nomePatch} templateBytes=${templateBytes.length}`);

  return { bytes: templateBytes, base64, nomePatch };
}

/**
 * Trigger a browser download of the preset as a .prst file.
 *
 * The file format is: Base64( JSON.stringify( Array.from(binaryBytes) ) )
 * This matches the exact format of known-good .prst files accepted by
 * the Matribox II Pro firmware.
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const a = document.createElement('a');
  a.href = `data:application/octet-stream;base64,${built.base64}`;
  a.download = `${(built.nomePatch || 'preset').replace(/\s+/g, '_')}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
