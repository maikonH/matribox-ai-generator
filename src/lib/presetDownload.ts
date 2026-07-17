import type { GeneratedPreset, PresetModule } from './types';

// Factory template: a base64-encoded JSON byte array. The raw decode yields a
// larger buffer, but only the first STRICT_BUFFER_SIZE bytes are the real
// factory payload. Everything beyond is padding/garbage that overflows the
// DSP memory and must be discarded.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCwxOTcsMjI3LDQ5LDU2LDQ4LDM5LDExNSwzMiw3NiwxMDEsOTcsMTAwLDAsNzMsMzIsODAsODIsNzksMTMyLDMsMiw1NCw2NiwyMjIsMTkzLDE4MCwxMDgsMCwxLDEyNyw5MiwxMzcsMTgyLDEwOCwwLDEsNDQsMjM4LDIwNywxODEsMTA4LDAsMSwyMzEsMTEzLDE5NCwxODIsMTA4LDAsMSw2MSwxNjYsODgsMTgyLDEwOCwwLDEsMTU5LDIzOSwyMTIsNTQsMTA4LDAsMSwyMTQsMTUwLDE0NCw1NCwxMDgsMCwxLDEyNywxOTUsMjA0LDU0LDEwOCwwLDMsMTk0LDIxMiw4MiwxMTEsOTksMTA3LDE0MSw5LDAsOTcsMTQsMTAsMTM2LDEsNCwyLDEsMCwyLDEzLDAsMCwxMzMsMiwxNSwxMzIsMiwzLDMsMSwxLDIsMyw0LDEwNywxLDcsMCw1LDk3LDUsNzYsMTEwLDEsMCw0LDEyMCwyLDAsNDQsMCw0LDksNSw2LDcsOCwyNTUsMjU1LDAsMiwzLDQsNSwxNCw4LDksMTAsNywyNTUsMjU1LDI5LDAsMCwwLDgsMCwwLDUsMSwwLDAsMyw1MywwLDAsNywzNCwwLDAsMTAsMywwLDAsNiwxNSwwLDAsNCwyOSwwLDAsMTEsMywwLDAsMTIsNTMsMCwwLDEsMCwxNTYsOCwxNzAsMTMsMjMwLDIsMTEyLDEsMTA0LDYsNywzMiw2NiwwLDAsMjAwLDY1LDAsMCwxMTIsNjYsMTAwLDIsMzIsMTMsMTIsMCw2LDE2MCw2NiwwLDAsMTQwLDY2LDAsMCw3MiwxMDgsOCwzMiwxNCwyNTIsMCwxMjUsMTQsMTIsMjA0LDcsMzIsMTMsMjEyLDEsMTg4LDEzLDEwOCwxNCw0NiwxMiwwLDMyLDcsMjgsMSwxMjQsNiw0MiwxNzIsMCwzLDE1Miw2NSwwLDY2LDE1Niw3MCw0Miw2OCwwLDUyLDQ1LDAsNCwzMiwxNCwxNDAsMyw0MiwyMCwxLDEwOCw0NCwxLDAsNjMsMCwwLDIzNiwzMCwxMDgsMTYsMTA4LDAsNDIsMTQwLDAsNTQsNDQsMCwxMCwxNjAsNjUsMCwwLDIyNCw2NCwwLDAsMTEyLDE5MywxNTMsMTUzLDc3LDIwNCw0NSwxMTAsNywxMjgsNjMsNTQsMTk2LDAsNDAsOTIsMCwxMDgsNywxMDgsNSwxMDgsMCwxMTYsMiwxMjQsMCwxMDgsMCwxMDgsMSwzMiwxNSwxNCwwLDMyLDE5MywxNzIsNDcsMzIsMTUsMjIwLDAsMzIsNzMsMTkxLDAsMSwwLDEsMTkyLDAsMiwwLDAsNDAsMCwxMjAsMTkzLDEwNyw5NSwxMjgsMTYsNSw3LDEsMCw1LDI1NSwyNTUsMSwyNTUsOTYsMCwxLDAsMCwwLDMsMTQ0LDIsMzIsNSwxNywwLDIwMCwyMDgsNDYsNTYsMjgsMCw5NywxMTcsNjksMTQ0LDksNCw4LDEsMTQ2LDE4OCw2MiwwLDE0Niw0MSwxOTMsMTMsMCwzOSwyMzIsMTMsMTI4LDQsMTEyLDAsNDMsNjgsMCw0Myw0OCwwLDExNiwzLDAsMiwyLDAsMCwxNiwxMiwwLDAsMCwwLDAsOSwxLDAsMCwxMjgsNjMsMjAwLDAsMCw0OCwxNywwLDBd';

// The factory preset buffer has a strict final size that varies between
// 244 bytes (preset model 35-B) and 247 bytes (preset model 35-A). We target
// the upper bound (35-A) and truncate any padding beyond it.
const STRICT_BUFFER_SIZE = 247;

const PRESET_NAME_START = 0x1d;
const PRESET_NAME_END = 0x27;

const PARAM_TABLE_START = 0xb0;
const PARAM_TABLE_END = 0xd3;
const PARAM_ENTRY_SIZE = 4;

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function normalizeParam(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clampByte(((value - min) / (max - min)) * 100);
}

function collectParamEntries(modules: PresetModule[]): number[] {
  const values: number[] = [];
  for (const mod of modules) {
    for (const param of mod.params) {
      values.push(normalizeParam(param.value, param.min, param.max));
    }
  }
  return values;
}

function buildPresetBuffer(preset: GeneratedPreset): Uint8Array {
  const factoryBytes = decodeTemplate();

  // Force the strict factory size: keep only the first STRICT_BUFFER_SIZE
  // bytes and discard any padding/garbage beyond the window.
  const buffer = new Uint8Array(STRICT_BUFFER_SIZE);
  const copyLen = Math.min(factoryBytes.length, STRICT_BUFFER_SIZE);
  for (let i = 0; i < copyLen; i++) {
    buffer[i] = factoryBytes[i];
  }

  // Inject the preset name at the original name offset.
  const nameBytes = encodeString(preset.title).slice(
    0,
    PRESET_NAME_END - PRESET_NAME_START + 1,
  );
  for (let i = 0; i < nameBytes.length; i++) {
    buffer[PRESET_NAME_START + i] = nameBytes[i];
  }

  // Inject normalized parameter values (0-100) into the original param table,
  // one value per PARAM_ENTRY_SIZE-byte slot.
  const paramValues = collectParamEntries(preset.modules);
  const tableLen = PARAM_TABLE_END - PARAM_TABLE_START + 1;
  const numEntries = Math.min(
    paramValues.length,
    Math.floor(tableLen / PARAM_ENTRY_SIZE),
  );
  for (let i = 0; i < numEntries; i++) {
    const offset = PARAM_TABLE_START + i * PARAM_ENTRY_SIZE;
    buffer[offset] = paramValues[i];
  }

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
