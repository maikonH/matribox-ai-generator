import type { GeneratedPreset } from './types';

// Factory template: the 33-A LE MARSHALL preset decoded as a number array.
// This is a valid .prst file that loads on the Matribox II Pro. We modify
// only the name field and the float32-LE parameter values, preserving the
// module chain, fxids, routing tables, and fixed header/footer.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCw1MiwyMjIsNzcsNzYsNjksMzIsNzcsNjUsODIsODMsNzIsNjUsNzYsNzYsMCwwLDgyLDc5LDEzMiwzLDIsNTMsMTY5LDEzNiwxMTMsNTQsMTA4LDAsMSw1NSwxNDQsMTY3LDU0LDEwOCwwLDEsMjQ2LDI0OSwyNTUsNTMsMTA4LDAsMSwxMTYsMTI0LDI1MCw1NCwxMDgsMCwxLDE0NCwyMTgsMjUzLDU0LDEwOCwwLDEsMjU0LDI0OSw5NSw1NCwxMDgsMCwxLDE4OCw3LDE1Miw1NCwxMDgsMCwxLDEyMCwxMTYsOTYsMTgwLDExMCwwLDg4LDUwLDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMSwyLDE1LDEzMiwyLDEwLDMsMSwxLDIsMyw4LDAsMCwwLDcsNSwwLDYsMTIxLDIsNzYsMTUyLDIsNyw0LDEsMSw1LDAsMiw0LDYsMywyNTUsOTYsMCw0LDExLDAsNywxMCwxNSwzLDksMTA0LDEsMCwxMSwyNTUsMiwwLDAsMTUsMjcsMCwwLDAsNTcsMCwwLDEsMywwLDAsMTIsMywwLDAsNiwzMCwwLDAsMywyOSwwLDAsMTEsMTM2LDcsNDUsMTYsMCwxMTAsMTAsMjMwLDIsMTEyLDIsMCw0LDUsMSwwLDAsMTEyLDY2LDAsMCwxNDgsNjYsMCwwLDEyMCw2NiwwLDAsMTYsNjYsMCwwLDIwLDY2LDEwMCwzLDMyLDUsMTIsMCwyLDIyNCw2NSwwLDAsMTYwLDIwNCwwLDcsNzIsNjcsMCwwLDI1MCw2NywwLDAsNzIsNjYsMTcyLDAsMzIsNSw0LDEsOSwwLDAsMTI4LDE5MiwwLDAsODAsMTkzLDAsMCwxNjAsMTkzLDMyLDksMjIwLDAsNyw5Niw2NSwwLDAsMTM4LDY2LDAsMCwxOTIsNjUsNDAsMTQ4LDEsMywyMDAsNjYsMCwwLDEyOCw2Myw0MCw2MCwwLDU0LDM2LDAsMTI0LDQsNTQsMTA4LDAsNjIsOTIsMCwxMSwzMiw2NiwwLDAsMTM2LDY1LDAsMCwzNiw2NiwwLDAsMjQ4LDY1LDMyLDUsMTg4LDEsMjM3LDEwLDE2LDEyNCw1LDQsNjQsMCwwLDIyNCw2NCwwLDAsMjM2LDE2LDEwOCwzNywxMDgsMjIsMTA4LDAsMjUyLDQsMzIsMywyOSwwLDk2LDMyLDEwLDE3Miw0LDEwOCw1MiwxMDksMTAsNTYsMzIsMTAsOTIsNywxMjQsNSwzMiwxNDksMTMsMCwxLDEyOCwwLDE3NSwyMyw3OCwwLDgwLDE5MywxMDcsOTUsMTMxLDIsNywxLDAsMTU2LDEwMSwxMTIsMCwxMjgsMiwzMiw5LDE2LDAsOTYsNTQsNjAsMTIsMCwxMTMsMTA2LDY5LDEyOCwxMCw0LDgsMSwxNDksNTQsMTcwLDE0OCwxNDksMTQwLDEsNDIsMTcsMCwxLDU1LDQ4LDAsNDIsOTYsMCwxNDAsMSwwLDIsMiwwLDAsMTYsMTIsMCwwLDAsMCwwLDksMSwwLDAsMTI4LDYzLDIwMCwwLDAsNDgsMTcsMCwwXQ==';

// Name field: bytes [26-44] (19 bytes). Text goes at [30-44] (15 bytes).
const NAME_START = 30;
const NAME_END = 44;

// Parameter positions: float32 little-endian values at exact byte offsets.
// Each entry maps a byte position to a module and param index in the AI's output.
// The AI generates 8 modules; we map their params to these positions.
interface ParamSlot {
  pos: number;
  moduleIdx: number;
  paramIdx: number;
}

const PARAM_SLOTS: ParamSlot[] = [
  // AMP module (module index 1 in AI output) - 5 params
  { pos: 216, moduleIdx: 1, paramIdx: 0 },
  { pos: 220, moduleIdx: 1, paramIdx: 1 },
  { pos: 224, moduleIdx: 1, paramIdx: 2 },
  { pos: 228, moduleIdx: 1, paramIdx: 3 },
  { pos: 232, moduleIdx: 1, paramIdx: 4 },
  // Delay module (module index 5) - 2 params
  { pos: 253, moduleIdx: 5, paramIdx: 0 },
  { pos: 257, moduleIdx: 5, paramIdx: 1 },
  // EQ module (module index 3) - 3 params
  { pos: 268, moduleIdx: 3, paramIdx: 0 },
  { pos: 272, moduleIdx: 3, paramIdx: 1 },
  { pos: 276, moduleIdx: 3, paramIdx: 2 },
  // Mod module (module index 4) - 2 params
  { pos: 287, moduleIdx: 4, paramIdx: 0 },
  { pos: 291, moduleIdx: 4, paramIdx: 1 },
  // Switch (module 4, param 2 - on/off)
  { pos: 301, moduleIdx: 4, paramIdx: 2 },
  // Reverb module (module index 6) - 3 params
  { pos: 322, moduleIdx: 6, paramIdx: 0 },
  { pos: 326, moduleIdx: 6, paramIdx: 1 },
  { pos: 330, moduleIdx: 6, paramIdx: 2 },
  // Last param (module 6, param 3)
  { pos: 345, moduleIdx: 6, paramIdx: 3 },
];

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function applyName(buffer: number[], title: string): void {
  const fieldLen = NAME_END - NAME_START + 1;
  const nameBytes = encodeString(title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[NAME_START + i] = nameBytes[i] ?? 0;
  }
}

function writeFloatLE(buffer: number[], pos: number, value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  const view = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) {
    buffer[pos + i] = view[i];
  }
}

function applyParams(buffer: number[], preset: GeneratedPreset): void {
  for (const slot of PARAM_SLOTS) {
    const mod = preset.modules[slot.moduleIdx];
    if (!mod || !mod.params[slot.paramIdx]) continue;

    const param = mod.params[slot.paramIdx];
    const value = clamp(param.value, param.min, param.max);
    writeFloatLE(buffer, slot.pos, value);
  }
}

function buildPresetBuffer(preset: GeneratedPreset): number[] {
  const buffer = decodeTemplate();
  applyName(buffer, preset.title);
  applyParams(buffer, preset);
  return buffer;
}

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);
  const jsonStr = '[' + buffer.join(',') + ']';
  const b64 = btoa(jsonStr);

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
