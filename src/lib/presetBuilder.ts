// .prst file engine for the Matribox II Pro.
//
// Reconstructs the binary preset format used by the official Sonicake editor:
//   1. A preset JSON (HTModelPreset shape) is serialized compactly to bytes.
//   2. A 20-byte little-endian header is prepended (magic, version, seed,
//      Adler-32 checksum, payload size).
//   3. The payload is XOR-encrypted with a 32-bit LCG, skipping the first 32
//      bytes and capping encryption at 512 bytes (ENCRYPTED_SIZE).
//   4. The resulting byte array is rendered as a compact JSON integer array
//      string, Base64-encoded, and wrapped in `{ "version": 1, "data": ... }`.

import type { GeneratedPreset } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChainEntry {
  modulo: string;
  nomeEfeito: string;
  knobs: number[];
  /**
   * The real numeric FXID resolved from alg_data.json during validation.
   * Set by validateAiResponse (the single place an effect is confirmed to
   * exist in the catalog) and consumed directly here to fill the preset JSON.
   */
  fxid?: number;
}

export interface AiPresetResponse {
  nomePatch: string;
  comentario: string;
  cadeia: ChainEntry[];
}

// ── Cryptography ─────────────────────────────────────────────────────────────

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

function bytesToIntArrayString(bytes: Uint8Array): string {
  let out = '[';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) out += ',';
    out += String(bytes[i]);
  }
  out += ']';
  return out;
}

/**
 * Build a complete .prst file from a generated preset.
 *
 * Returns the file body (a JSON string) ready to be saved with a `.prst`
 * extension and imported directly into the official Sonicake editor.
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
  const base64 = btoa(intArrayString);

  const wrapper = { version: 1, data: base64 };
  return JSON.stringify(wrapper);
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
