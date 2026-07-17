import type { GeneratedPreset } from './types';

// Frozen factory template: a pristine ~245-byte .prst file (within the
// 244-247 byte window) that loads perfectly on the Matribox II Pro DSP.
// IMPORTANT: this array is NOT pure bytes — index 65 holds the float 178.54.
// Coercing it to an integer (e.g. via Uint8Array) corrupts the roundtrip and
// crashes the device. We keep the array as plain numbers end-to-end.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCw4NCwyMzYsMjA0LDc3LDk3LDExNiwxMTQsMTA1LDk4LDExMSwxMjAsMzIsNzMsNzMsMzIsODAsODIsNzksMTMyLDMsMiw1NSwzOCw4NywyNDYsNTQsMTA4LDAsMSwyMzIsODEsMjM3LDU0LDEwOCwwLDEsMjE5LDExOSwxNzguNTQsMTA4LDAsMSwyMzksMTgyLDI1Myw1NCwxMDgsMCwxLDkwLDIxMSwxNjEsNTQsMTA4LDAsMSw4Nyw2OSwyMDksNTQsMTA4LDAsMSwyMTEsOTgsMjMyLDUzLDEwOCwwLDEsMjM0LDE1LDgsNTUsMTEwLDAsMjA0LDE1LDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMCwyLDE2MCw0LDMsMywxLDEsMiwzLDQsMTE1LDMsNywwLDUsMTIxLDIsNzYsMTA4LDEsMSwwLDQsMSwyNTUsNTMsMCwwLDE1MiwzLDMyLDEwLDE2LDAsMTEwLDEwLDIzMCwyLDk4LDYsNSwxLDExNiwwLDMyLDAsMCwxODUsMTUsMCw1MCwwLDEyMCwxOTMsMTA3LDk1LDEzOSw5Miw3LDEsMCwzOSw0LDEzLDEyOCwyLDMyLDksMTYsMCwxLDIwMCw2NiwwLDAsNjAsMTIsMCwxMTMsMTA2LDY5LDEyOCwxMCw0LDgsMSw3MSwxODksMTkwLDE2MCw3MSwxNDAsMSwzMiwyMiwxNiwwLDAsMiwyLDAsMCwxNiwxMiwwLDAsMCwwLDAsOSwxLDAsMCwxMjgsNjMsMjAwLDAsMCw0OCwxNywwLDBd';

// Factory offsets reverse-engineered from the pristine file.
const PRESET_NAME_START = 30;
const PRESET_NAME_END = 44; // inclusive: "Matribox II PRO" (15 bytes)
const GAIN_BYTE = 122; // gain/volume byte (original value: 100)

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function buildPresetBuffer(_preset: GeneratedPreset): number[] {
  // === FROZEN / ISOLATION MODE ===
  // No dynamic modifications: no name change, no volume change, no slider
  // changes, no algorithm ID changes. Returns the pristine factory template
  // byte-for-byte so we can verify the pipeline itself produces an accepted
  // .prst file. Reactivate modifications one-by-one after the device accepts.
  return decodeTemplate();
}

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);

  // Explicit no-space serialization: every value joined by ',' with no
  // whitespace, wrapped in brackets. Guarantees a 100% glued string that
  // Dart's strict base64 + JSON decoders accept without rejection.
  const jsonStr = '[' + Array.from(buffer).join(',') + ']';
  // btoa emits pure ASCII base64. Strip any stray whitespace/newlines as a
  // belt-and-suspenders guarantee for Dart's strict base64 decoder.
  const b64 = btoa(jsonStr).replace(/\s+/g, '');

  const blob = new Blob([b64], { type: 'text/plain' });
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
