// ════════════════════════════════════════════════════════════════════════════
// MATRIBOX II PRO — .prst ENGINE  (FROZEN)
// ════════════════════════════════════════════════════════════════════════════
// This module is a static black box. It owns the entire 6-stage binary pipeline:
//   1. Input sanitization & DSP preservation (anti-crash layer).
//   2. Linear custom checksum (LFSR verification) over the raw JSON bytes.
//   3. 20-byte little-endian header construction.
//   4. Dynamic LFSR payload encryption (byte 0, cap 512).
//   5. Header + encrypted payload → Base64 → {version,data} wrapper.
//
// The engine has ZERO coupling to the AI layer. It accepts a plain
// GeneratedPreset (a UI-level type from types.ts) and emits the file body.
// It must not import, reference, or depend on gemini.ts or any AI type.
//
// DO NOT modify the hardware magic numbers, LFSR constants, seed values,
// header layout, or the 512-byte encryption cap. They are factory
// specifications reverse-engineered from the official Sonicake editor and
// the Matribox II Pro firmware (see src/docs/). UI changes, prompt changes,
// or refactors must touch this file ONLY if a verified format bug is found
// — never to “simplify” it.
// ════════════════════════════════════════════════════════════════════════════

import type { GeneratedPreset, PresetModule } from './types';
import { HARDWARE_SLOTS } from './hardwareSlots';

// ── Hardware constants (factory-locked) ─────────────────────────────────────

const HEADER_SIZE = 20;
const ENCRYPTED_SIZE = 0x200; // 512 bytes — payload bytes past index 511 pass through.

const MAGIC_HEADER = [0x03, 0x02, 0x00, 0x00];
const FIRMWARE_VERSION = [0x10, 0x0b, 0x00, 0x80];

// Checksum constants (from src/docs/codigo_checksum.txt)
const CHECKSUM_SEED = 0x150898;
const MSB_MASK = 0x80000000;
const MURMUR_C1 = 0x1b873593;

// Encryption LFSR tracking polynomial (CRC-32 standard, per directive A)
const LFSR_POLY = 0x04c11db7;

// Knob value bounds (per directive C: decimal percentage range)
const KNOB_MIN = 0.0;
const KNOB_MAX = 100.0;

// ── Stage 1: Input Sanitization & DSP Preservation ──────────────────────────

const ALLOWED_SLOT_CODES = new Set(HARDWARE_SLOTS.map((s) => s.code));

export interface SanitizationReport {
  disabledModules: string[];
  clampedParams: { module: string; param: string; from: number; to: number }[];
}

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return KNOB_MIN;
  return Math.max(KNOB_MIN, Math.min(KNOB_MAX, value));
}

function sanitizeModule(mod: PresetModule, report: SanitizationReport): PresetModule {
  const slot = HARDWARE_SLOTS.find((s) => s.code === mod.fxId || s.aliases.includes(mod.fxId.toUpperCase()));
  const fxId = slot ? slot.code : mod.fxId;
  const allowed = ALLOWED_SLOT_CODES.has(fxId);

  if (!allowed) {
    report.disabledModules.push(fxId);
    return { ...mod, fxId, enabled: false };
  }

  const params = mod.params.map((p) => {
    const clamped = clampKnob(p.value);
    if (clamped !== p.value) {
      report.clampedParams.push({ module: fxId, param: p.name, from: p.value, to: clamped });
    }
    return { ...p, value: clamped };
  });

  return { ...mod, fxId, params };
}

function sanitizePreset(preset: GeneratedPreset): { preset: GeneratedPreset; report: SanitizationReport } {
  const report: SanitizationReport = { disabledModules: [], clampedParams: [] };
  const modules = preset.modules.map((m) => sanitizeModule(m, report));
  return { preset: { ...preset, modules }, report };
}

// ── Stage 2: Linear Custom Checksum (LFSR Verification) ──────────────────────

function calculateChecksum(data: Uint8Array): number {
  let checksum = CHECKSUM_SEED;

  // Pad to 4-byte alignment
  const remainder = data.length % 4;
  const padded = remainder === 0 ? data : new Uint8Array(data.length + (4 - remainder));
  if (remainder !== 0) padded.set(data);

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);

  for (let i = 0; i < padded.length; i += 4) {
    const chunk = view.getUint32(i, true);

    // LFSR bit-sign overflow check
    if ((checksum & MSB_MASK) !== 0) {
      checksum = ((checksum >> 1) ^ MSB_MASK) >>> 0;
    } else {
      checksum = (checksum >> 1) >>> 0;
    }

    // Modular addition
    checksum = (checksum + chunk) >>> 0;

    // MurmurHash3-style mixing feedback
    checksum = ((checksum * MURMUR_C1) + CHECKSUM_SEED) >>> 0;

    // Bitwise rotation left by 13
    checksum = ((checksum << 13) | (checksum >>> 19)) >>> 0;
  }

  // Final sign-bit inversion
  return (checksum ^ MSB_MASK) >>> 0;
}

// ── Stage 3: Header Construction (Strict 20-Byte Layout) ─────────────────────

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

// ── Stage 4: Dynamic LCG Payload Encryption ──────────────────────────────────

class LfsrCipher {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  transform(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    const limit = Math.min(data.length, ENCRYPTED_SIZE);
    for (let i = 0; i < data.length; i++) {
      if (i < limit) {
        // 1. Mask with the CURRENT state before the register shifts.
        const maskKey = this.state & 0xff;
        result[i] = data[i] ^ maskKey;
        // 2. Advance the LFSR AFTER the XOR, for the next index.
        if ((this.state & MSB_MASK) !== 0) {
          this.state = ((this.state << 1) ^ LFSR_POLY) >>> 0;
        } else {
          this.state = (this.state << 1) >>> 0;
        }
      } else {
        result[i] = data[i];
      }
    }
    return result;
  }
}

// ── Preset JSON serialization ────────────────────────────────────────────────

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
      value: p.value,
    }));
    return { fxid, active: mod.enabled !== false, qKnob };
  });

  const chain = preset.modules
    .filter((m) => m.enabled !== false)
    .map((mod) => Number(mod.fxId));

  return {
    presetName: preset.title,
    Modules: modules,
    chain,
  };
}

// ── Stage 5: Base64 Wrap & File Output ───────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Build a complete .prst file from a generated preset.
 *
 * Pipeline: sanitize → preset JSON → compact string → UTF-8 bytes →
 * LFSR checksum → 20-byte header → LFSR XOR cipher (byte 0, cap 512) →
 * header+payload → Base64 → factory envelope `{ "version": 1, "data": base64 }`.
 */
export function buildPresetFile(preset: GeneratedPreset): string {
  const { preset: sanitized } = sanitizePreset(preset);
  const presetObj = buildPresetJson(sanitized);
  const compactJson = JSON.stringify(presetObj);
  const jsonBytes = new TextEncoder().encode(compactJson);

  // Align the UTF-8 payload to a strict 4-byte boundary before checksum and
  // encryption, so the LFSR receives clean uint32 blocks and the Data Size
  // field reflects the finalized aligned array.
  const remainder = jsonBytes.length % 4;
  const alignedBytes = remainder === 0
    ? jsonBytes
    : (() => {
        const padded = new Uint8Array(jsonBytes.length + (4 - remainder));
        padded.set(jsonBytes);
        return padded;
      })();

  const seed = Date.now() & 0xffffffff;
  const checksum = calculateChecksum(alignedBytes);
  const header = buildHeader(seed, checksum, alignedBytes.length);

  const cipher = new LfsrCipher(seed);
  const encryptedPayload = cipher.transform(alignedBytes);

  const finalBytes = new Uint8Array(header.length + encryptedPayload.length);
  finalBytes.set(header, 0);
  finalBytes.set(encryptedPayload, header.length);

  const base64Data = bytesToBase64(finalBytes);
  return JSON.stringify({ version: 1, data: base64Data });
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
