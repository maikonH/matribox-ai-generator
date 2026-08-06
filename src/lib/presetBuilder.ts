// ════════════════════════════════════════════════════════════════════════════
// MATRIBOX II PRO — .prst ENGINE (PRODUCTION REPAIR)
// ════════════════════════════════════════════════════════════════════════════

import type { GeneratedPreset, PresetModule } from './types';
import { HARDWARE_SLOTS } from './hardwareSlots';

const HEADER_SIZE = 20;
const MAGIC_HEADER = [0x03, 0x02, 0x00, 0x00];
const FIRMWARE_VERSION = [0x10, 0x0b, 0x00, 0x80];

const CHECKSUM_SEED = 0x150898;
const MSB_MASK = 0x80000000;
const MURMUR_C1 = 0x1b873593;
const LFSR_POLY = 0x04c11db7;

const KNOB_MIN = 0.0;
const KNOB_MAX = 100.0;

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
  const remainder = data.length % 4;
  const padded = remainder === 0 ? data : new Uint8Array(data.length + (4 - remainder));
  if (remainder !== 0) padded.set(data);

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let i = 0; i < padded.length; i += 4) {
    const chunk = view.getUint32(i, true);

    if ((checksum & MSB_MASK) !== 0) {
      checksum = ((checksum >> 1) ^ MSB_MASK) >>> 0;
    } else {
      checksum = (checksum >> 1) >>> 0;
    }

    checksum = (checksum + chunk) >>> 0;
    checksum = ((checksum * MURMUR_C1) + CHECKSUM_SEED) >>> 0;
    checksum = ((checksum << 13) | (checksum >>> 19)) >>> 0;
  }
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

// ── Stage 4: Dynamic LCG Payload Encryption (FIXED) ──────────────────────────
class LfsrCipher {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  transform(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const maskKey = this.state & 0xff;
      result[i] = data[i] ^ maskKey;
      
      if ((this.state & MSB_MASK) !== 0) {
        this.state = ((this.state << 1) ^ LFSR_POLY) >>> 0;
      } else {
        this.state = (this.state << 1) >>> 0;
      }
    }
    return result;
  }
}

// ── Preset JSON serialization ────────────────────────────────────────────────
interface PresetModuleJson {
  i: number;
  a: boolean;
  k: number[];
}
interface PresetJson {
  n: string;
  m: PresetModuleJson[];
  c: number[];
}

function buildPresetJson(preset: GeneratedPreset): PresetJson {
  const modules: PresetModuleJson[] = preset.modules.map((mod) => ({
    i: Number(mod.fxId),
    a: mod.enabled !== false,
    k: mod.params.map((p) => p.value),
  }));
  const chain = preset.modules
    .filter((m) => m.enabled !== false)
    .map((mod) => Number(mod.fxId));
  return {
    n: preset.title,
    m: modules,
    c: chain,
  };
}

// ── Stage 5: Raw Binary File Output ─────────────────────────────────────────
export function buildPresetFile(preset: GeneratedPreset): Uint8Array {
  const { preset: sanitized } = sanitizePreset(preset);
  const presetObj = buildPresetJson(sanitized);

  const compactJson = JSON.stringify(presetObj).replace(/\s+/g, '');
  const jsonBytes = new TextEncoder().encode(compactJson);

  const seed = Date.now() & 0xffffffff;
  const checksum = calculateChecksum(jsonBytes);
  const header = buildHeader(seed, checksum, jsonBytes.length);
  const cipher = new LfsrCipher(seed);
  const encryptedPayload = cipher.transform(jsonBytes);

  const finalBytes = new Uint8Array(header.length + encryptedPayload.length);
  finalBytes.set(header, 0);
  finalBytes.set(encryptedPayload, header.length);
  return finalBytes;
}

export function downloadPresetFile(preset: GeneratedPreset): void {
  const finalBytes = buildPresetFile(preset);
  const blob = new Blob([finalBytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.title.replace(/[^A-Za-z0-9]/g, '') || 'preset'}.prst`;
  a.click();
  URL.revokeObjectURL(url);
}
