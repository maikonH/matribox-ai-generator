import type { GeneratedPreset, PresetModule } from './types';

// Valeton GP-200 / Matribox II Pro .prst binary encoder.
// Faithful TypeScript port of the official prst_encoder.py: assembles a
// 1176-byte file from dynamic module blocks (header 0x0014 / 0x0044, slot,
// enabled flag, u32 effect code, 10 float32 params) plus the fixed
// header / metadata / chain / control tables / checksum trailer.
//
// No fixed-offset template — every byte is written by the encoder logic, so
// any effect chain the AI produces is compiled into a valid binary.

const FILE_SIZE = 0x498; // 1176 bytes

const MAGIC = [0x54, 0x53, 0x52, 0x50]; // 'TSRP' ('PRST' reversed)
const PARM_MARKER = [0x4d, 0x52, 0x41, 0x50]; // 'MRAP' ('PARM' reversed)
const PRODUCT_ID = 'GP-2'; // stored reversed as '2-PG'

const HEADER_VERSION = 3;
const FIRMWARE_HEX = '00010100';
const TIMESTAMP = 0x6b9eef20;
const HEADER_FILE_SIZE = 0x464;

const MODULE_COUNT = 11;
const MODULE_SIZE = 0x40;
const MODULE_BASE = 0xa0;
const MAX_PARAMS = 10;

const CONTROLS_BASE = 0x3b0;
const CHECKSUM_MARKER = 0x00000490;

// --- low-level writers -----------------------------------------------------

function writeU16(buffer: number[], offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(buffer: number[], offset: number, value: number): void {
  const n = value >>> 0;
  buffer[offset] = n & 0xff;
  buffer[offset + 1] = (n >>> 8) & 0xff;
  buffer[offset + 2] = (n >>> 16) & 0xff;
  buffer[offset + 3] = (n >>> 24) & 0xff;
}

function writeFloat32(buffer: number[], offset: number, value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  const view = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) buffer[offset + i] = view[i];
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return (min + max) / 2;
  return Math.max(min, Math.min(max, v));
}

function asciiBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

// --- section encoders ------------------------------------------------------

function encodeHeader(buffer: number[]): void {
  for (let i = 0; i < 4; i++) buffer[i] = MAGIC[i];
  writeU32(buffer, 0x04, 0);
  writeU32(buffer, 0x08, HEADER_VERSION);
  writeU32(buffer, 0x0c, 0);

  // Product ID, stored byte-reversed ('GP-2' -> '2-PG').
  const pid = asciiBytes(PRODUCT_ID).slice(0, 4);
  while (pid.length < 4) pid.push(0);
  for (let i = 0; i < 4; i++) buffer[0x10 + i] = pid[3 - i];

  // Firmware version from hex.
  for (let i = 0; i < 4; i++) {
    buffer[0x14 + i] = parseInt(FIRMWARE_HEX.slice(i * 2, i * 2 + 2), 16);
  }

  writeU32(buffer, 0x18, TIMESTAMP);
  writeU32(buffer, 0x1c, 1);
  writeU32(buffer, 0x20, 0x28);
  writeU32(buffer, 0x24, HEADER_FILE_SIZE);
  for (let i = 0; i < 4; i++) buffer[0x28 + i] = PARM_MARKER[i];
  writeU32(buffer, 0x2c, HEADER_FILE_SIZE);
}

function encodeMetadata(buffer: number[], preset: GeneratedPreset): void {
  writeU16(buffer, 0x30, 2);
  writeU16(buffer, 0x32, preset.bpm || 120);
  writeU16(buffer, 0x34, 0);
  writeU16(buffer, 0x36, preset.volume ?? 120);
  writeU16(buffer, 0x38, 50);
  writeU16(buffer, 0x3a, 0);
  writeU16(buffer, 0x3c, 0);
  writeU16(buffer, 0x3e, 0);
}

function encodeName(buffer: number[], title: string): void {
  const bytes = asciiBytes(title).slice(0, 60);
  for (let i = 0; i < bytes.length; i++) buffer[0x44 + i] = bytes[i];
}

function encodeChain(buffer: number[]): void {
  writeU16(buffer, 0x88, 0x0008);
  writeU16(buffer, 0x8a, 0x0010);

  buffer[0x90] = 0; // program_index_repeat

  const moduleCountInfo = [0, 4, 4, 4, 10];
  for (let i = 0; i < 5; i++) buffer[0x91 + i] = moduleCountInfo[i];

  // Signal chain order: modules are already authored in slot order 0..10.
  for (let i = 0; i < 10; i++) buffer[0x96 + i] = i;
}

function encodeModule(
  buffer: number[],
  offset: number,
  slot: number,
  module: PresetModule | null,
): void {
  writeU16(buffer, offset, 0x0014);
  writeU16(buffer, offset + 2, 0x0044);

  if (!module) {
    // Empty / disabled slot: header + constant only, rest stays zero.
    writeU16(buffer, offset + 6, 0x000f);
    return;
  }

  buffer[offset + 4] = slot & 0xff;
  buffer[offset + 5] = 1; // enabled
  writeU16(buffer, offset + 6, 0x000f);

  const effectCode = /^\d+$/.test(module.fxId) ? Number(module.fxId) : 0;
  writeU32(buffer, offset + 8, effectCode);

  for (let i = 0; i < MAX_PARAMS; i++) {
    const p = module.params[i];
    writeFloat32(buffer, offset + 12 + i * 4, p ? clamp(p.value, p.min, p.max) : 0);
  }
}

function encodeModules(buffer: number[], preset: GeneratedPreset): void {
  for (let i = 0; i < MODULE_COUNT; i++) {
    const offset = MODULE_BASE + i * MODULE_SIZE;
    const module = i < preset.modules.length ? preset.modules[i] : null;
    encodeModule(buffer, offset, i, module);
  }
}

function encodeControls(buffer: number[]): void {
  // Nine default control records (12 bytes each).
  for (let i = 0; i < 9; i++) {
    const offset = CONTROLS_BASE + i * 12;
    writeU16(buffer, offset, 0x000c);
    writeU16(buffer, offset + 2, 0x000c);
    writeU16(buffer, offset + 4, i > 0 ? 0x00ff : 0x000a);
    writeU32(buffer, offset + 6, 0);
    writeFloat32(buffer, offset + 8, 100.0);
  }

  // Three assignment records (8 bytes each).
  const assignmentsBase = CONTROLS_BASE + 9 * 12;
  for (let i = 0; i < 3; i++) {
    const offset = assignmentsBase + i * 8;
    writeU16(buffer, offset, 0x0010);
    writeU16(buffer, offset + 2, 0x0004);
    writeU16(buffer, offset + 4, 0);
    writeU16(buffer, offset + 6, 0);
  }

  // Four toggle records (8 bytes each).
  const togglesBase = assignmentsBase + 3 * 8;
  for (let i = 0; i < 4; i++) {
    const offset = togglesBase + i * 8;
    writeU16(buffer, offset, 0x000f);
    writeU16(buffer, offset + 2, 0x0008);
    writeU16(buffer, offset + 4, i);
    writeU32(buffer, offset + 6, 0);
  }
}

function encodeChecksum(buffer: number[]): void {
  const offset = FILE_SIZE - 8;
  writeU32(buffer, offset, CHECKSUM_MARKER);
  // The official encoder writes the checksum value from the input JSON,
  // defaulting to 0 for freshly authored presets (the device does not reject
  // a zero trailer). Matching that proven behavior here.
  writeU32(buffer, offset + 4, 0);
}

// --- build + download ------------------------------------------------------

function buildPresetBuffer(preset: GeneratedPreset): Uint8Array {
  const buffer = new Array<number>(FILE_SIZE).fill(0);
  encodeHeader(buffer);
  encodeMetadata(buffer, preset);
  encodeName(buffer, preset.title);
  encodeChain(buffer);
  encodeModules(buffer, preset);
  encodeControls(buffer);
  encodeChecksum(buffer);
  return new Uint8Array(buffer);
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

export function downloadPreset(preset: GeneratedPreset): void {
  const bytes = buildPresetBuffer(preset);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(preset.title) || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
