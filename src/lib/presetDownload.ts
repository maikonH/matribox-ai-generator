import type { GeneratedPreset, PresetModule } from './types';
import templateRaw from '../data/amp+cab/60-A_twd_deluxe.prst?raw';

// Factory template: the compact 295-byte 60-A_twd_deluxe.prst — an amp+cab-only
// preset that loads on the Matribox II Pro. We mutate ONLY the name field, the
// amp + cab fxIds, and inject a 42-byte AMP parameter section (6 Float32 LE
// values + separators) right before the existing CAB parameter section. Every
// other byte (header, module declarations, routing, footer) is preserved
// verbatim from this pristine template.
//
// Compact template layout (295 bytes):
//   [0-47]    Header (identical across all compact templates)
//   [48-103]  Module declaration blocks (8 blocks of 7 bytes)
//   [104-159] Routing data
//   [160]     0xFF marker
//   [161-164] Amp fxId (4-byte LE)
//   [165]     Cab fxId low byte (high bytes are always 0x0A0000xx)
//   [168-176] Constant data (ends with 6e 0a)
//   [177-183] CAB section header: e6 02 6c 04 03 05 01
//   [184-187] CAB Volume (float32 LE = 50.0)
//   [201-204] CAB Low Cut (float32 LE ≈ 19.0)
//   [205-208] CAB High Cut (float32 LE = 20001.0)
//   [279-294] Footer (identical across all compact templates)
//
// The compact template has NO amp param section — only CAB params. We INSERT
// a 42-byte AMP param block at offset 177 (before the CAB e6 02 header),
// shifting all subsequent bytes. The header has no length fields, so the
// insertion is safe. The injected AMP block structure (derived from the
// user-created 40-C_teste_bolt.prst which works on the device):
//   e6 02 64 01 07 05 01       (7-byte AMP section header + routing)
//   [Gain f32 LE]              (4 bytes)
//   [Presence f32 LE]          (4 bytes)
//   74 01 20 11 0c             (5-byte separator)
//   [Volume f32 LE]            (4 bytes)
//   [Bass f32 LE]              (4 bytes)
//   [Middle f32 LE]            (4 bytes)
//   [Treble f32 LE]            (4 bytes)
//   00 00                      (2 bytes)
//   7c 01 20 07                (4-byte separator before CAB section)
//   = 42 bytes total

const TEMPLATE_B64 = templateRaw.trim();

const NAME_START = 30;
const NAME_END = 44;

const MODULE_DECL_START = 48;
const MODULE_DECL_COUNT = 8;
const MODULE_DECL_SIZE = 7;

// AI module index → template declaration slot index.
// AI modules: 0=DRIVE, 1=AMP, 2=CAB, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
// Template slots: 0=DRIVE, 1=CAB, 2=AMP, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
const SLOT_MAP = [0, 2, 1, 3, 4, 5, 6, 7];

const AMP_MODULE_IDX = 1;
const CAB_MODULE_IDX = 2;

// Position in the pristine (pre-insertion) template where the amp fxId begins
// (right after the 0xFF marker at offset 160).
const AMP_FXID_POS = 161;
const CAB_FXID_LOW_POS = 165;

// Offset where we insert the 42-byte AMP param block (just before the CAB
// section's e6 02 header at offset 177).
const AMP_INSERT_POS = 177;

// Size of the AMP param block we insert.
const AMP_BLOCK_SIZE = 42;

// After insertion, the amp param float32 slots sit at these offsets:
const AMP_GAIN_POS = AMP_INSERT_POS + 7; // 184
const AMP_PRESENCE_POS = AMP_GAIN_POS + 4; // 188
const AMP_SEPARATOR = [0x74, 0x01, 0x20, 0x11, 0x0c]; // 5 bytes at 192
const AMP_VOLUME_POS = AMP_GAIN_POS + 4 + 5; // 197
const AMP_BASS_POS = AMP_VOLUME_POS + 4; // 201
const AMP_MIDDLE_POS = AMP_BASS_POS + 4; // 205
const AMP_TREBLE_POS = AMP_MIDDLE_POS + 4; // 209

// The AMP section header (7 bytes) + trailing separator (6 bytes) that
// bracket the amp params. These are fixed bytes copied from the working
// 40-C_teste_bolt.prst preset.
const AMP_SECTION_HEADER = [0xe6, 0x02, 0x64, 0x01, 0x07, 0x05, 0x01];
const AMP_TRAILING_SEPARATOR = [0x00, 0x00, 0x7c, 0x01, 0x20, 0x07];

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function writeFloatLE(buffer: number[], pos: number, value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  const view = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) {
    buffer[pos + i] = view[i];
  }
}

function signatureFromFxId(fxId: string): [number, number, number] | null {
  if (!/^\d+$/.test(fxId)) return null;
  const n = Number(fxId);
  if (!Number.isFinite(n) || n <= 0 || n > 0xffffffff) return null;
  const n32 = n >>> 0;
  return [(n32 >>> 24) & 0xff, (n32 >>> 16) & 0xff, n32 & 0xff];
}

function applyName(buffer: number[], title: string): void {
  const fieldLen = NAME_END - NAME_START + 1;
  const nameBytes = encodeString(title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[NAME_START + i] = nameBytes[i] ?? 0;
  }
}

function applyModules(buffer: number[], modules: PresetModule[]): void {
  const usedSlots = new Set<number>();

  for (let i = 0; i < MODULE_DECL_COUNT; i++) {
    const mod = modules[i];
    if (!mod) continue;

    const slot = SLOT_MAP[i] ?? i;
    const base = MODULE_DECL_START + slot * MODULE_DECL_SIZE;

    buffer[base] = mod.enabled === false ? 0 : 1;

    const sig = signatureFromFxId(mod.fxId);
    if (sig) {
      buffer[base + 1] = sig[0];
      buffer[base + 2] = sig[1];
      buffer[base + 3] = sig[2];
    }

    usedSlots.add(slot);
  }

  for (let s = 0; s < MODULE_DECL_COUNT; s++) {
    if (!usedSlots.has(s)) {
      buffer[MODULE_DECL_START + s * MODULE_DECL_SIZE] = 0;
    }
  }
}

function applyFxIds(buffer: number[], ampFxId?: string, cabFxId?: string): void {
  if (ampFxId && /^\d+$/.test(ampFxId)) {
    const n = (Number(ampFxId) >>> 0);
    buffer[AMP_FXID_POS] = n & 0xff;
    buffer[AMP_FXID_POS + 1] = (n >>> 8) & 0xff;
    buffer[AMP_FXID_POS + 2] = (n >>> 16) & 0xff;
    buffer[AMP_FXID_POS + 3] = (n >>> 24) & 0xff;
  }
  if (cabFxId && /^\d+$/.test(cabFxId)) {
    const n = (Number(cabFxId) >>> 0);
    buffer[CAB_FXID_LOW_POS] = n & 0xff;
  }
}

function insertAmpParamBlock(buffer: number[]): number[] {
  const block: number[] = [];
  block.push(...AMP_SECTION_HEADER);
  // 4 bytes for Gain (placeholder, filled later)
  block.push(0, 0, 0, 0);
  // 4 bytes for Presence
  block.push(0, 0, 0, 0);
  // 5-byte separator
  block.push(...AMP_SEPARATOR);
  // 4 bytes for Volume
  block.push(0, 0, 0, 0);
  // 4 bytes for Bass
  block.push(0, 0, 0, 0);
  // 4 bytes for Middle
  block.push(0, 0, 0, 0);
  // 4 bytes for Treble
  block.push(0, 0, 0, 0);
  // Trailing separator
  block.push(...AMP_TRAILING_SEPARATOR);

  return [...buffer.slice(0, AMP_INSERT_POS), ...block, ...buffer.slice(AMP_INSERT_POS)];
}

function applyAmpParams(buffer: number[], preset: GeneratedPreset): void {
  const ampModule = preset.modules[AMP_MODULE_IDX];
  if (!ampModule) return;

  const params = ampModule.params;
  const gain = params[0];
  const presence = params[1];
  const volume = params[2];
  const bass = params[3];
  const middle = params[4];
  const treble = params[5];

  if (gain) writeFloatLE(buffer, AMP_GAIN_POS, clamp(gain.value, gain.min, gain.max));
  if (presence) writeFloatLE(buffer, AMP_PRESENCE_POS, clamp(presence.value, presence.min, presence.max));
  if (volume) writeFloatLE(buffer, AMP_VOLUME_POS, clamp(volume.value, volume.min, volume.max));
  if (bass) writeFloatLE(buffer, AMP_BASS_POS, clamp(bass.value, bass.min, bass.max));
  if (middle) writeFloatLE(buffer, AMP_MIDDLE_POS, clamp(middle.value, middle.min, middle.max));
  if (treble) writeFloatLE(buffer, AMP_TREBLE_POS, clamp(treble.value, treble.min, treble.max));
}

function buildPresetBuffer(
  preset: GeneratedPreset,
  baseAmpFxId?: string,
  baseCabFxId?: string,
): number[] {
  let buffer = decodeTemplate();
  applyName(buffer, preset.title);
  applyModules(buffer, preset.modules);
  applyFxIds(buffer, baseAmpFxId, baseCabFxId);
  buffer = insertAmpParamBlock(buffer);
  applyAmpParams(buffer, preset);
  return buffer;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function downloadPreset(
  preset: GeneratedPreset,
  baseAmpFxId?: string,
  baseCabFxId?: string,
): void {
  const buffer = buildPresetBuffer(preset, baseAmpFxId, baseCabFxId);
  const jsonStr = '[' + buffer.join(',') + ']';
  const b64 = btoa(jsonStr);

  const blob = new Blob([b64], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(preset.title) || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
