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
  // Clone the frozen factory template as plain numbers (NOT Uint8Array —
  // that would truncate the float at index 65 and break the device).
  const buffer = decodeTemplate().slice();

  // --- ISOLATION TEST: name left exactly as factory ("Matribox II PRO") ---
  // const fieldLen = PRESET_NAME_END - PRESET_NAME_START + 1;
  // const nameBytes = encodeString(preset.title).slice(0, fieldLen);
  // for (let i = 0; i < fieldLen; i++) {
  //   buffer[PRESET_NAME_START + i] = nameBytes[i] ?? 0;
  // }

  // Only the gain byte is changed, using a fixed safe value for this test.
  buffer[GAIN_BYTE] = 80;

  return buffer;
}

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);

  const jsonStr = JSON.stringify(Array.from(buffer));
  const b64 = btoa(jsonStr);

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
