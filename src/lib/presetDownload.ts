import { deflate } from 'pako';
import type { GeneratedPreset, PresetModule } from './types';

// Frozen factory template: a pristine 245-byte .prst payload that loads
// perfectly on the Matribox II Pro DSP. The array is NOT pure bytes — index
// 65 holds the float 178.54. Coercing it to an integer (e.g. via Uint8Array)
// corrupts the roundtrip and crashes the device. Keep it as plain numbers.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCw4NCwyMzYsMjA0LDc3LDk3LDExNiwxMTQsMTA1LDk4LDExMSwxMjAsMzIsNzMsNzMsMzIsODAsODIsNzksMTMyLDMsMiw1NSwzOCw4NywyNDYsNTQsMTA4LDAsMSwyMzIsODEsMjM3LDU0LDEwOCwwLDEsMjE5LDExOSwxNzguNTQsMTA4LDAsMSwyMzksMTgyLDI1Myw1NCwxMDgsMCwxLDkwLDIxMSwxNjEsNTQsMTA4LDAsMSw4Nyw2OSwyMDksNTQsMTA4LDAsMSwyMTEsOTgsMjMyLDUzLDEwOCwwLDEsMjM0LDE1LDgsNTUsMTEwLDAsMjA0LDE1LDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMCwyLDE2MCw0LDMsMywxLDEsMiwzLDQsMTE1LDMsNywwLDUsMTIxLDIsNzYsMTA4LDEsMSwwLDQsMSwyNTUsNTMsMCwwLDE1MiwzLDMyLDEwLDE2LDAsMTEwLDEwLDIzMCwyLDk4LDYsNSwxLDExNiwwLDMyLDAsMCwxODUsMTUsMCw1MCwwLDEyMCwxOTMsMTA3LDk1LDEzOSw5Miw3LDEsMCwzOSw0LDEzLDEyOCwyLDMyLDksMTYsMCwxLDIwMCw2NiwwLDAsNjAsMTIsMCwxMTMsMTA2LDY5LDEyOCwxMCw0LDgsMSw3MSwxODksMTkwLDE2MCw3MSwxNDAsMSwzMiwyMiwxNiwwLDAsMiwyLDAsMCwxNiwxMiwwLDAsMCwwLDAsOSwxLDAsMCwxMjgsNjMsMjAwLDAsMCw0OCwxNywwLDBd';

// Factory offsets reverse-engineered from the pristine file.
const PRESET_NAME_START = 30;
const PRESET_NAME_END = 44; // inclusive: "Matribox II PRO" (15 bytes)
const GAIN_BYTE = 122; // gain/volume byte (original factory value: 100)

// Slider regions: contiguous byte runs holding 0-100 module parameter values.
// Each region maps to one module's params in signal-chain order.
const SLIDER_REGIONS: { start: number; end: number }[] = [
  { start: 46, end: 53 }, // Module 1 params
  { start: 54, end: 61 }, // Module 2 params
  { start: 62, end: 69 }, // Module 3 params
  { start: 70, end: 77 }, // Module 4 params
  { start: 78, end: 85 }, // Module 5 params
  { start: 86, end: 93 }, // Module 6 params
];

// Module ID bytes: one byte per module identifying the algorithm variant.
const MODULE_ID_BYTES = [114, 117, 120, 123, 126, 129];

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function clampSlider(v: number): number {
  return clampInt(v, 0, 100);
}

function applyName(buffer: number[], title: string): void {
  const fieldLen = PRESET_NAME_END - PRESET_NAME_START + 1;
  const nameBytes = encodeString(title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[PRESET_NAME_START + i] = nameBytes[i] ?? 0;
  }
}

function applyModules(buffer: number[], modules: PresetModule[]): void {
  const count = Math.min(modules.length, SLIDER_REGIONS.length);
  for (let i = 0; i < count; i++) {
    const region = SLIDER_REGIONS[i];
    const regionLen = region.end - region.start + 1;
    const params = modules[i].params.slice(0, regionLen);

    for (let p = 0; p < params.length; p++) {
      // Normalize 0-100 param ranges into the 0-100 slider byte region.
      const param = params[p];
      let normalized: number;
      if (param.min >= 0 && param.max <= 100) {
        normalized = clampSlider(param.value);
      } else {
        const span = param.max - param.min || 1;
        normalized = clampSlider(((param.value - param.min) / span) * 100);
      }
      buffer[region.start + p] = normalized;
    }

    // Module ID: stable hash of fxId folded into a single byte, kept within
    // the same byte-width as the factory IDs so it never alters the struct.
    const fxId = modules[i].fxId;
    let id = 0;
    for (let c = 0; c < fxId.length; c++) id = (id * 31 + fxId.charCodeAt(c)) & 0xff;
    buffer[MODULE_ID_BYTES[i]] = id;
  }
}

function applyVolume(buffer: number[], volume: number): void {
  buffer[GAIN_BYTE] = clampSlider(volume);
}

function buildPresetBuffer(preset: GeneratedPreset): number[] {
  const buffer = decodeTemplate().slice();

  applyName(buffer, preset.title);
  applyVolume(buffer, preset.volume);
  applyModules(buffer, preset.modules);

  return buffer;
}

function bytesToBase64(bytes: number[] | Uint8Array): string {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  for (let i = 0; i < arr.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + chunkSize)));
  }
  return btoa(binary).replace(/\s+/g, '');
}

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);

  // Explicit no-space serialization: every value joined by ',' with no
  // whitespace, wrapped in brackets. Guarantees a 100% glued string.
  const jsonStr = '[' + Array.from(buffer).join(',') + ']';
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // Raw Deflate (no 78 9C zlib header) — matches the Flutter RawZLibFilter /
  // ZLibDecoder used by the Sonicake firmware.
  const compressed = deflate(jsonBytes, { raw: true });

  // Linear, glued Base64 with no whitespace or newlines.
  const b64 = bytesToBase64(compressed);

  const blob = new Blob([b64], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = preset.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  a.href = url;
  a.download = `${safeName || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
