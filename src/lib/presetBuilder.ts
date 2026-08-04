// ════════════════════════════════════════════════════════════════════════════
// MATRIBOX II PRO — .prst ENGINE  (FROZEN)
// ════════════════════════════════════════════════════════════════════════════
// This module is a static black box. It owns the entire binary pipeline:
//   1. Preset JSON (HTModelPreset shape) → compact string → UTF-8 bytes.
//   2. 20-byte little-endian header (magic, firmware, seed, Adler-32, size).
//   3. Selective XOR cipher (LCG, skip 32 bytes, cap 512 bytes).
//   4. Byte array → JSON integer-array string → Base64 → {version,data}.
//
// The engine has ZERO coupling to the AI layer. It accepts a plain
// GeneratedPreset (a UI-level type from types.ts) and emits the file body.
// It must not import, reference, or depend on gemini.ts or any AI type.
//
// DO NOT modify the hardware magic numbers, LCG constants, Adler-32 modulus,
// skip/limit offsets, or header layout. They are factory specifications
// reverse-engineered from the official Sonicake editor and the Matribox II
// firmware. UI changes, prompt changes, or refactors must touch this file
// ONLY if a verified format bug is found — never to “simplify” it.
// ════════════════════════════════════════════════════════════════════════════

import type { GeneratedPreset } from './types';

// ── Cryptography ─────────────────────────────────────────────────────────────

// ── Hardware constants (factory-locked) ─────────────────────────────────────
const ENCRYPTED_SIZE = 512;
const HEADER_SIZE = 20;
const SKIP_BYTES = 32;

export class MatriboxCrypto {
  private state: number;
  private readonly MULTIPLIER = 1103515245; // 0x41C64E6D
  private readonly INCREMENT = 12345;       // 0x3039
  private readonly MODULUS = 0x80000000;     // 2^31

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  private nextKey(): number {
    const nextState =
      (BigInt(this.MULTIPLIER) * BigInt(this.state) + BigInt(this.INCREMENT)) %
      BigInt(this.MODULUS);
    this.state = Number(nextState);
    return (this.state >> 16) & 0xff;
  }

  public transform(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    const encryptLimit = Math.min(data.length, SKIP_BYTES + ENCRYPTED_SIZE);

    for (let i = 0; i < data.length; i++) {
      if (i >= SKIP_BYTES && i < encryptLimit) {
        result[i] = data[i] ^ this.nextKey();
      } else {
        result[i] = data[i];
      }
    }
    return result;
  }

  public static calculateChecksum(data: Uint8Array): number {
    let sum1 = 1;
    let sum2 = 0;
    const MOD_ADLER = 65521;

    for (let i = 0; i < data.length; i++) {
      sum1 = (sum1 + data[i]) % MOD_ADLER;
      sum2 = (sum2 + sum1) % MOD_ADLER;
    }
    return ((sum2 << 16) | sum1) >>> 0;
  }
}

// ── Preset JSON serialization ────────────────────────────────────────────────

const clamp = (val: number): number => Math.max(0, Math.min(127, Math.round(val)));

interface QKnob {
  knobID: number;
  value: number;
}

interface PresetModuleJson {
  fxid: number;
  active: boolean;
  qKnob: QKnob[];
}

interface PresetJson {
  presetName: string;
  Modules: PresetModuleJson[];
  chain: number[];
}

function buildPresetJson(preset: GeneratedPreset): PresetJson {
  const modules: PresetModuleJson[] = preset.modules.map((mod) => {
    const fxid = Number(mod.fxId);
    const qKnob: QKnob[] = mod.params.map((p, i) => ({
      knobID: i,
      value: clamp(p.value),
    }));
    return { fxid, active: true, qKnob };
  });

  const chain = preset.modules.map((mod) => Number(mod.fxId));

  return {
    presetName: preset.title,
    Modules: modules,
    chain,
  };
}

// ── Binary header ────────────────────────────────────────────────────────────

const MAGIC_HEADER = [3, 2, 0, 0];
const FIRMWARE_VERSION = [16, 11, 0, 128];

function buildHeader(seed: number, checksum: number, payloadSize: number): Uint8Array {
  const header = new Uint8Array(HEADER_SIZE);
  const view = new DataView(header.buffer);

  header[0] = MAGIC_HEADER[0];
  header[1] = MAGIC_HEADER[1];
  header[2] = MAGIC_HEADER[2];
  header[3] = MAGIC_HEADER[3];

  header[4] = FIRMWARE_VERSION[0];
  header[5] = FIRMWARE_VERSION[1];
  header[6] = FIRMWARE_VERSION[2];
  header[7] = FIRMWARE_VERSION[3];

  view.setUint32(8, seed >>> 0, true);
  view.setUint32(12, checksum >>> 0, true);
  view.setUint32(16, payloadSize >>> 0, true);

  return header;
}

// ── Encapsulation ────────────────────────────────────────────────────────────

/**
 * Render a byte array as a JSON integer-array string, e.g. "[3,2,0,0,16,...]".
 * Uses Array.join(",") so numbers can never concatenate into invalid tokens
 * like "0916". This is the exact text shape the Sonicake editor Base64-decodes.
 */
function bytesToIntArrayString(bytes: Uint8Array): string {
  return '[' + Array.from(bytes).join(',') + ']';
}

/**
 * Build a complete .prst file from a generated preset.
 *
 * Returns the file body — a Base64 string of the JSON integer-array text —
 * ready to be saved with a `.prst` extension and imported directly into the
 * official Sonicake editor. The output is byte-for-byte compatible with the
 * factory preset format (see src/data/01-B_Love_of_God.prst).
 */
export function buildPresetFile(preset: GeneratedPreset): string {
  const presetObj = buildPresetJson(preset);
  const compactJson = JSON.stringify(presetObj);
  const jsonBytes = new TextEncoder().encode(compactJson);

  const seed = Date.now() & 0xffffffff;
  const checksum = MatriboxCrypto.calculateChecksum(jsonBytes);
  const header = buildHeader(seed, checksum, jsonBytes.length);

  const crypto = new MatriboxCrypto(seed);
  const encryptedPayload = crypto.transform(jsonBytes);

  const combined = new Uint8Array(header.length + encryptedPayload.length);
  combined.set(header, 0);
  combined.set(encryptedPayload, header.length);

  const intArrayString = bytesToIntArrayString(combined);
  return btoa(intArrayString);
}

/**
 * Trigger a browser download of the .prst file for the given preset.
 */
export function downloadPresetFile(preset: GeneratedPreset): void {
  const body = buildPresetFile(preset);
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.title.replace(/[^A-Za-z0-9]/g, '') || 'preset'}.prst`;
  a.click();
  URL.revokeObjectURL(url);
}
