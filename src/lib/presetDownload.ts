import type { GeneratedPreset, PresetModule } from './types';

const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCwxOTcsMjI3LDQ5LDU2LDQ4LDM5LDExNSwzMiw3NiwxMDEsOTcsMTAwLDAsNzMsMzIsODAsODIsNzksMTMyLDMsMiw1NCw2NiwyMjIsMTkzLDE4MCwxMDgsMCwxLDEyNyw5MiwxMzcsMTgyLDEwOCwwLDEsNDQsMjM4LDIwNywxODEsMTA4LDAsMSwyMzEsMTEzLDE5NCwxODIsMTA4LDAsMSw2MSwxNjYsODgsMTgyLDEwOCwwLDEsMTU5LDIzOSwyMTIsNTQsMTA4LDAsMSwyMTQsMTUwLDE0NCw1NCwxMDgsMCwxLDEyNywxOTUsMjA0LDU0LDEwOCwwLDMsMTk0LDIxMiw4MiwxMTEsOTksMTA3LDE0MSw5LDAsOTcsMTQsMTAsMTM2LDEsNCwyLDEsMCwyLDEzLDAsMCwxMzMsMiwxNSwxMzIsMiwzLDMsMSwxLDIsMyw0LDEwNywxLDcsMCw1LDk3LDUsNzYsMTEwLDEsMCw0LDEyMCwyLDAsNDQsMCw0LDksNSw2LDcsOCwyNTUsMjU1LDAsMiwzLDQsNSwxNCw4LDksMTAsNywyNTUsMjU1LDI5LDAsMCwwLDgsMCwwLDUsMSwwLDAsMyw1MywwLDAsNywzNCwwLDAsMTAsMywwLDAsNiwxNSwwLDAsNCwyOSwwLDAsMTEsMywwLDAsMTIsNTMsMCwwLDEsMCwxNTYsOCwxNzAsMTMsMjMwLDIsMTEyLDEsMTA0LDYsNywzMiw2NiwwLDAsMjAwLDY1LDAsMCwxMTIsNjYsMTAwLDIsMzIsMTMsMTIsMCw2LDE2MCw2NiwwLDAsMTQwLDY2LDAsMCw3MiwxMDgsOCwzMiwxNCwyNTIsMCwxMjUsMTQsMTIsMjA0LDcsMzIsMTMsMjEyLDEsMTg4LDEzLDEwOCwxNCw0NiwxMiwwLDMyLDcsMjgsMSwxMjQsNiw0MiwxNzIsMCwzLDE1Miw2NSwwLDY2LDE1Niw3MCw0Miw2OCwwLDUyLDQ1LDAsNCwzMiwxNCwxNDAsMyw0MiwyMCwxLDEwOCw0NCwxLDAsNjMsMCwwLDIzNiwzMCwxMDgsMTYsMTA4LDAsNDIsMTQwLDAsNTQsNDQsMCwxMCwxNjAsNjUsMCwwLDIyNCw2NCwwLDAsMTEyLDE5MywxNTMsMTUzLDc3LDIwNCw0NSwxMTAsNywxMjgsNjMsNTQsMTk2LDAsNDAsOTIsMCwxMDgsNywxMDgsNSwxMDgsMCwxMTYsMiwxMjQsMCwxMDgsMCwxMDgsMSwzMiwxNSwxNCwwLDMyLDE5MywxNzIsNDcsMzIsMTUsMjIwLDAsMzIsNzMsMTkxLDAsMSwwLDEsMTkyLDAsMiwwLDAsNDAsMCwxMjAsMTkzLDEwNyw5NSwxMjgsMTYsNSw3LDEsMCw1LDI1NSwyNTUsMSwyNTUsOTYsMCwxLDAsMCwwLDMsMTQ0LDIsMzIsNSwxNywwLDIwMCwyMDgsNDYsNTYsMjgsMCw5NywxMTcsNjksMTQ0LDksNCw4LDEsMTQ2LDE4OCw2MiwwLDE0Niw0MSwxOTMsMTMsMCwzOSwyMzIsMTMsMTI4LDQsMTEyLDAsNDMsNjgsMCw0Myw0OCwwLDExNiwzLDAsMiwyLDAsMCwxNiwxMiwwLDAsMCwwLDAsOSwxLDAsMCwxMjgsNjMsMjAwLDAsMCw0OCwxNywwLDBd';

const PRESET_NAME_START = 0x1d;
const PRESET_NAME_END = 0x27;
const AMP_NAME_START = 0x28;
const AMP_NAME_END = 0x2c;
const CATEGORY_START = 0x6b;
const CATEGORY_END = 0x6e;

const PARAM_TABLE_START = 0xb0;
const PARAM_TABLE_END = 0xd3;
const PARAM_ENTRY_SIZE = 4;

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

function collectParamEntries(modules: PresetModule[]): { id: number; value: number }[] {
  const entries: { id: number; value: number }[] = [];
  let paramId = 0;
  for (const mod of modules) {
    for (const param of mod.params) {
      entries.push({
        id: paramId,
        value: normalizeParam(param.value, param.min, param.max),
      });
      paramId++;
    }
  }
  return entries;
}

function injectParams(template: number[], modules: PresetModule[]): number[] {
  const entries = collectParamEntries(modules);
  const result = [...template];

  const tableLen = PARAM_TABLE_END - PARAM_TABLE_START + 1;
  const numEntries = Math.min(entries.length, Math.floor(tableLen / PARAM_ENTRY_SIZE));

  for (let i = 0; i < numEntries; i++) {
    const offset = PARAM_TABLE_START + i * PARAM_ENTRY_SIZE;
    result[offset] = entries[i].value;
  }

  return result;
}

function buildPresetBytes(preset: GeneratedPreset): number[] {
  const template = decodeTemplate();

  const before = template.slice(0, PRESET_NAME_START);
  const presetNameBytes = [...encodeString(preset.title), 0x00];
  const ampName = preset.modules[0]?.fxTitle ?? 'I PRO';
  const ampNameBytes = encodeString(ampName);
  const middle = template.slice(AMP_NAME_END + 1, CATEGORY_START);
  const category = preset.modules[0]?.type ?? 'Rock';
  const categoryBytes = encodeString(category);
  const after = template.slice(CATEGORY_END + 1);

  const assembled = [
    ...before,
    ...presetNameBytes,
    ...ampNameBytes,
    ...middle,
    ...categoryBytes,
    ...after,
  ];

  return injectParams(assembled, preset.modules);
}

function bytesToBase64(bytes: number[]): string {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadPreset(preset: GeneratedPreset): void {
  const bytes = buildPresetBytes(preset);
  const arrayLiteral = JSON.stringify(bytes);
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
