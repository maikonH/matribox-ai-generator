import type { GeneratedPreset, PresetModule } from './types';

const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCwxOTcsMjI3LDQ5LDU2LDQ4LDM5LDExNSwzMiw3NiwxMDEsOTcsMTAwLDAsNzMsMzIsODAsODIsNzksMTMyLDMsMiw1NCw2NiwyMjIsMTkzLDE4MCwxMDgsMCwxLDEyNyw5MiwxMzcsMTgyLDEwOCwwLDEsNDQsMjM4LDIwNywxODEsMTA4LDAsMSwyMzEsMTEzLDE5NCwxODIsMTA4LDAsMSw2MSwxNjYsODgsMTgyLDEwOCwwLDEsMTU5LDIzOSwyMTIsNTQsMTA4LDAsMSwyMTQsMTUwLDE0NCw1NCwxMDgsMCwxLDEyNywxOTUsMjA0LDU0LDEwOCwwLDMsMTk0LDIxMiw4MiwxMTEsOTksMTA3LDE0MSw5LDAsOTcsMTQsMTAsMTM2LDEsNCwyLDEsMCwyLDEzLDAsMCwxMzMsMiwxNSwxMzIsMiwzLDMsMSwxLDIsMyw0LDEwNywxLDcsMCw1LDk3LDUsNzYsMTEwLDEsMCw0LDEyMCwyLDAsNDQsMCw0LDksNSw2LDcsOCwyNTUsMjU1LDAsMiwzLDQsNSwxNCw4LDksMTAsNywyNTUsMjU1LDI5LDAsMCwwLDgsMCwwLDUsMSwwLDAsMyw1MywwLDAsNywzNCwwLDAsMTAsMywwLDAsNiwxNSwwLDAsNCwyOSwwLDAsMTEsMywwLDAsMTIsNTMsMCwwLDEsMCwxNTYsOCwxNzAsMTMsMjMwLDIsMTEyLDEsMTA0LDYsNywzMiw2NiwwLDAsMjAwLDY1LDAsMCwxMTIsNjYsMTAwLDIsMzIsMTMsMTIsMCw2LDE2MCw2NiwwLDAsMTQwLDY2LDAsMCw3MiwxMDgsOCwzMiwxNCwyNTIsMCwxMjUsMTQsMTIsMjA0LDcsMzIsMTMsMjEyLDEsMTg4LDEzLDEwOCwxNCw0NiwxMiwwLDMyLDcsMjgsMSwxMjQsNiw0MiwxNzIsMCwzLDE1Miw2NSwwLDY2LDE1Niw3MCw0Miw2OCwwLDUyLDQ1LDAsNCwzMiwxNCwxNDAsMyw0MiwyMCwxLDEwOCw0NCwxLDAsNjMsMCwwLDIzNiwzMCwxMDgsMTYsMTA4LDAsNDIsMTQwLDAsNTQsNDQsMCwxMCwxNjAsNjUsMCwwLDIyNCw2NCwwLDAsMTEyLDE5MywxNTMsMTUzLDc3LDIwNCw0NSwxMTAsNywxMjgsNjMsNTQsMTk2LDAsNDAsOTIsMCwxMDgsNywxMDgsNSwxMDgsMCwxMTYsMiwxMjQsMCwxMDgsMCwxMDgsMSwzMiwxNSwxNCwwLDMyLDE5MywxNzIsNDcsMzIsMTUsMjIwLDAsMzIsNzMsMTkxLDAsMSwwLDEsMTkyLDAsMiwwLDAsNDAsMCwxMjAsMTkzLDEwNyw5NSwxMjgsMTYsNSw3LDEsMCw1LDI1NSwyNTUsMSwyNTUsOTYsMCwxLDAsMCwwLDMsMTQ0LDIsMzIsNSwxNywwLDIwMCwyMDgsNDYsNTYsMjgsMCw5NywxMTcsNjksMTQ0LDksNCw4LDEsMTQ2LDE4OCw2MiwwLDE0Niw0MSwxOTMsMTMsMCwzOSwyMzIsMTMsMTI4LDQsMTEyLDAsNDMsNjgsMCw0Myw0OCwwLDExNiwzLDAsMiwyLDAsMCwxNiwxMiwwLDAsMCwwLDAsOSwxLDAsMCwxMjgsNjMsMjAwLDAsMCw0OCwxNywwLDBd';

const PRESET_NAME_START = 0x1d;
const PRESET_NAME_END = 0x27;

const PARAM_TABLE_START = 0xb0;
const PARAM_TABLE_END = 0xd3;
const PARAM_ENTRY_SIZE = 4;

const CHECKSUM_BYTE_INDEX = 0x1e1;
const CHECKSUM_COVERAGE_END = 0x1e0;

function decodeTemplate(): number[] {
  const decoded = atob(TEMPLATE_B64);
  return JSON.parse(decoded);
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

function buildPresetBytes(preset: GeneratedPreset): Uint8Array {
  const factoryTemplateBytes = decodeTemplate();
  const targetBuffer = new Uint8Array(factoryTemplateBytes);

  const nameBytes = encodeString(preset.title).slice(
    0,
    PRESET_NAME_END - PRESET_NAME_START + 1,
  );
  for (let i = 0; i < nameBytes.length; i++) {
    targetBuffer[PRESET_NAME_START + i] = nameBytes[i];
  }

  const paramValues = collectParamEntries(preset.modules);
  const tableLen = PARAM_TABLE_END - PARAM_TABLE_START + 1;
  const numEntries = Math.min(paramValues.length, Math.floor(tableLen / PARAM_ENTRY_SIZE));

  for (let i = 0; i < numEntries; i++) {
    const offset = PARAM_TABLE_START + i * PARAM_ENTRY_SIZE;
    targetBuffer[offset] = paramValues[i];
  }

  let sum = 0;
  for (let i = 0; i <= CHECKSUM_COVERAGE_END; i++) {
    sum = (sum + targetBuffer[i]) & 0xff;
  }
  targetBuffer[CHECKSUM_BYTE_INDEX] = sum;

  return targetBuffer;
}

export function downloadPreset(preset: GeneratedPreset): void {
  const targetBuffer = buildPresetBytes(preset);
  const intArray = Array.from(targetBuffer);
  const arrayLiteral = JSON.stringify(intArray);
  const base64 = btoa(arrayLiteral);

  const blob = new Blob([base64], { type: 'text/plain' });
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
