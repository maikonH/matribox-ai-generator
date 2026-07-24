// Matribox II Pro (.prst) preset file builder.
//
// Binary format (confirmed via reverse engineering of libapp.so):
//
//   Offset  Size  Description
//   0- 3    4     Magic Header  [3, 2, 0, 0]
//   4- 7    4     Version       [16, 11, 0, 128]
//   8-11    4     Seed          (uint32 LE, generated from clock)
//  12-15    4     Checksum      (Adler-32 over the raw JSON bytes, LE)
//  16-19    4     Size          (JSON byte length, uint32 LE)
//  20- N    var   Payload       (JSON bytes, first 32 plain-text, next 512 XOR/LCG)
//
// Pipeline (export):
//   1. Build the JSON object in exact key order (presetName → bpm → level → chain → Modules)
//   2. Minify the JSON string (no spaces after `:` or `,`)
//   3. Encode to UTF-8 bytes
//   4. Calculate Adler-32 checksum over the raw bytes
//   5. Generate a random uint32 Seed
//   6. Apply selective XOR/LCG: skip first 32 bytes, cipher next min(512, remaining) bytes
//   7. Assemble: Magic + Version + Seed(LE) + Checksum(LE) + Size(LE) + CipheredPayload
//   8. Base64-encode the entire byte array → file content

import { HARDWARE_SLOTS } from './hardwareSlots';
import { resolveFxId } from './algorithmCatalog';

// ── Constants ────────────────────────────────────────────────────────────────

const MAGIC:   readonly number[] = [3, 2, 0, 0];
const VERSION: readonly number[] = [16, 11, 0, 128];

/** Bytes at the start of the payload left in plain-text (the `presetName` header). */
const XOR_SKIP_BYTES = 32;

/** Maximum bytes of the payload to cipher. */
const ENCRYPTED_SIZE = 512;

// ── LCG Cipher (MatriboxCrypto) ───────────────────────────────────────────────

const LCG_A = 1103515245; // 0x41C64E6D
const LCG_C = 12345;      // 0x3039
const LCG_M = 0x80000000; // 2^31

function lcgNextKey(stateRef: { v: number }): number {
  const next = (BigInt(LCG_A) * BigInt(stateRef.v) + BigInt(LCG_C)) % BigInt(LCG_M);
  stateRef.v = Number(next);
  return (stateRef.v >>> 16) & 0xff;
}

/**
 * Selective XOR: the first XOR_SKIP_BYTES are left as plain-text, then the
 * next ENCRYPTED_SIZE bytes are XOR-ciphered with the LCG stream.
 *
 * The LCG state is advanced XOR_SKIP_BYTES times before ciphering begins so
 * that the generator stays in sync with the firmware's decodefunc, which runs
 * the full LCG stream from byte 0 but XORs only from byte 32 onward.
 */
function cipherPayload(data: Uint8Array, seed: number): Uint8Array {
  const out = new Uint8Array(data.length);
  const state = { v: seed >>> 0 };

  // Plain-text prefix — advance LCG state to keep stream in sync with firmware
  const plainEnd = Math.min(XOR_SKIP_BYTES, data.length);
  for (let i = 0; i < plainEnd; i++) {
    lcgNextKey(state); // consume key without XOR
    out[i] = data[i];
  }

  // Ciphered section
  const cipherEnd = Math.min(plainEnd + ENCRYPTED_SIZE, data.length);
  for (let i = plainEnd; i < cipherEnd; i++) {
    out[i] = data[i] ^ lcgNextKey(state);
  }

  // Remainder plain-text (if JSON > 32 + 512 bytes)
  for (let i = cipherEnd; i < data.length; i++) out[i] = data[i];

  return out;
}

// ── Adler-32 Checksum ─────────────────────────────────────────────────────────

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

// ── uint32 little-endian helpers ──────────────────────────────────────────────

function uint32LE(n: number): [number, number, number, number] {
  const v = n >>> 0;
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

// ── Base64 ───────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

// ── JSON serialisation (strict key order) ─────────────────────────────────────

interface KnobEntry  { knobID: number; value: number }
interface ModuleEntry { fxid: number; active: 0 | 1; qKnob: KnobEntry[] }
interface PresetJson  {
  presetName: string;
  bpm: number;
  level: number;
  chain: number[];
  Modules: ModuleEntry[];
}

/**
 * Serialise the preset JSON in the exact key order the Dart engine uses.
 * Produces compact JSON (no spaces) with integer active fields (0/1).
 */
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

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
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
 * Slots not present in the AI cadeia are omitted from the JSON (the device
 * identifies active modules via the `chain` array, not positional padding).
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);
  const modules: ModuleEntry[] = [];
  const chain: number[] = [];

  for (const entry of ai.cadeia) {
    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) continue;

    const slotIdx = findSlotIndex(entry.modulo);
    if (slotIdx < 0) continue;

    const qKnob: KnobEntry[] = entry.knobs.map((v, i) => ({
      knobID: i,
      value: clamp(v),
    }));

    modules.push({ fxid, active: 1, qKnob });
    chain.push(fxid);
  }

  const presetObj: PresetJson = {
    presetName: nomePatch,
    bpm: 120,
    level: 95,
    chain,
    Modules: modules,
  };

  const jsonStr  = serializePreset(presetObj);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // Checksum is calculated over the original (un-ciphered) JSON bytes
  const checksum = adler32(jsonBytes);

  // Random seed generated from current clock (matches firmware behaviour)
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const ciphered = cipherPayload(jsonBytes, seed);

  const header: number[] = [
    ...MAGIC,
    ...VERSION,
    ...uint32LE(seed),
    ...uint32LE(checksum),
    ...uint32LE(jsonBytes.length),
  ];

  const finalBytes = new Uint8Array(header.length + ciphered.length);
  finalBytes.set(header, 0);
  finalBytes.set(ciphered, header.length);

  const result: BuiltPreset = {
    bytes: finalBytes,
    base64: toBase64(finalBytes),
    nomePatch,
  };

  console.log('===== PRESET JSON (plain-text) =====');
  console.log(jsonStr);
  console.log('===== PRESET FILE =====');
  console.log(`seed=0x${seed.toString(16).padStart(8,'0')} checksum=0x${checksum.toString(16).padStart(8,'0')} size=${jsonBytes.length} totalBytes=${finalBytes.length}`);

  return result;
}

/**
 * Trigger a browser download of the preset as a .prst file.
 * The pedal editor expects the file to contain the raw Base64 string.
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const blob = new Blob([built.base64], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${built.nomePatch || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
