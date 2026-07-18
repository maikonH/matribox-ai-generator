import type { GeneratedPreset, PresetModule } from './types';

// Factory template: the 33-A LE MARSHALL preset as a number array. A valid
// .prst file that loads on the Matribox II Pro. We mutate ONLY the name
// field, the module declaration blocks (algorithm ID + enable flag), and the
// float32-LE parameter slots below — every other byte (header, prefix,
// routing gaps, footer) is preserved verbatim from this pristine template.
//
// This single template is used for BOTH paths (with and without a base
// preset). When a base preset is selected, the amp + cab fxIds from the
// base preset override the AI's choices in the module declaration blocks,
// and the amp param values are injected into the float32 slots at
// offsets 216–232.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCw1MiwyMjIsNzcsNzYsNjksMzIsNzcsNjUsODIsODMsNzIsNjUsNzYsNzYsMCwwLDgyLDc5LDEzMiwzLDIsNTMsMTY5LDEzNiwxMTMsNTQsMTA4LDAsMSw1NSwxNDQsMTY3LDU0LDEwOCwwLDEsMjQ2LDI0OSwyNTUsNTMsMTA4LDAsMSwxMTYsMTI0LDI1MCw1NCwxMDgsMCwxLDE0NCwyMTgsMjUzLDU0LDEwOCwwLDEsMjU0LDI0OSw5NSw1NCwxMDgsMCwxLDE4OCw3LDE1Miw1NCwxMDgsMCwxLDEyMCwxMTYsOTYsMTgwLDExMCwwLDg4LDUwLDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMSwyLDE1LDEzMiwyLDEwLDMsMSwxLDIsMyw4LDAsMCwwLDcsNSwwLDYsMTIxLDIsNzYsMTUyLDIsNyw0LDEsMSw1LDAsMiw0LDYsMywyNTUsOTYsMCw0LDExLDAsNywxMCwxNSwzLDksMTA0LDEsMCwxMSwyNTUsMiwwLDAsMTUsMjcsMCwwLDAsNTcsMCwwLDEsMywwLDAsMTIsMywwLDAsNiwzMCwwLDAsMywyOSwwLDAsMTEsMTM2LDcsNDUsMTYsMCwxMTAsMTAsMjMwLDIsMTEyLDIsMCw0LDUsMSwwLDAsMTEyLDY2LDAsMCwxNDgsNjYsMCwwLDEyMCw2NiwwLDAsMTYsNjYsMCwwLDIwLDY2LDEwMCwzLDMyLDUsMTIsMCwyLDIyNCw2NSwwLDAsMTYwLDIwNCwwLDcsNzIsNjcsMCwwLDI1MCw2NywwLDAsNzIsNjYsMTcyLDAsMzIsNSw0LDEsOSwwLDAsMTI4LDE5MiwwLDAsODAsMTkzLDAsMCwxNjAsMTkzLDMyLDksMjIwLDAsNyw5Niw2NSwwLDAsMTM4LDY2LDAsMCwxOTIsNjUsNDAsMTQ4LDEsMywyMDAsNjYsMCwwLDEyOCw2Myw0MCw2MCwwLDU0LDM2LDAsMTI0LDQsNTQsMTA4LDAsNjIsOTIsMCwxMSwzMiw2NiwwLDAsMTM2LDY1LDAsMCwzNiw2NiwwLDAsMjQ4LDY1LDMyLDUsMTg4LDEsMjM3LDEwLDE2LDEyNCw1LDQsNjQsMCwwLDIyNCw2NCwwLDAsMjM2LDE2LDEwOCwzNywxMDgsMjIsMTA4LDAsMjUyLDQsMzIsMywyOSwwLDk2LDMyLDEwLDE3Miw0LDEwOCw1MiwxMDksMTAsNTYsMzIsMTAsOTIsNywxMjQsNSwzMiwxNDksMTMsMCwxLDEyOCwwLDE3NSwyMyw3OCwwLDgwLDE5MywxMDcsOTUsMTMxLDIsNywxLDAsMTU2LDEwMSwxMTIsMCwxMjgsMiwzMiw5LDE2LDAsOTYsNTQsNjAsMTIsMCwxMTMsMTA2LDY5LDEyOCwxMCw0LDgsMSwxNDksNTQsMTcwLDE0OCwxNDksMTQwLDEsNDIsMTcsMCwxLDU1LDQ4LDAsNDIsOTYsMCwxNDAsMSwwLDIsMiwwLDAsMTYsMTIsMCwwLDAsMCwwLDksMSwwLDAsMTI4LDYzLDIwMCwwLDAsNDgsMTcsMCwwXQ==';

// Name text occupies offsets [30..44] (15 bytes). The 4-byte prefix at
// [26..29] belongs to the preset header and must stay untouched.
const NAME_START = 30;
const NAME_END = 44;

// Module declaration blocks: 8 blocks of 7 bytes starting at offset 48.
const MODULE_DECL_START = 48;
const MODULE_DECL_COUNT = 8;
const MODULE_DECL_SIZE = 7;

// AI module index → template declaration slot index.
// AI modules: 0=DRIVE, 1=AMP, 2=CAB, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
// Template slots: 0=DRIVE, 1=CAB, 2=AMP, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
const SLOT_MAP = [0, 2, 1, 3, 4, 5, 6, 7];

// AI module indices for AMP and CAB — used to override with base preset fxIds.
const AMP_MODULE_IDX = 1;
const CAB_MODULE_IDX = 2;

interface ParamSlot {
  pos: number;
  moduleIdx: number;
  paramIdx: number;
  isSwitch?: boolean;
}

// Amp param slots (moduleIdx=1, the AMP module). These are Float32 LE values
// at 4-byte-aligned offsets in the template. The standard knob order on the
// device screen is: Gain, Presence, Volume, Bass, Middle, Treble.
// The template stores 5 of the 6 amp params as float32; the 6th (Treble) is
// not present in this template and uses the device default.
const AMP_PARAM_SLOTS: ParamSlot[] = [
  { pos: 216, moduleIdx: 1, paramIdx: 0 }, // Gain
  { pos: 220, moduleIdx: 1, paramIdx: 1 }, // Presence
  { pos: 224, moduleIdx: 1, paramIdx: 2 }, // Volume
  { pos: 228, moduleIdx: 1, paramIdx: 3 }, // Bass
  { pos: 232, moduleIdx: 1, paramIdx: 4 }, // Middle
];

const PARAM_SLOTS: ParamSlot[] = [
  ...AMP_PARAM_SLOTS,
  { pos: 253, moduleIdx: 5, paramIdx: 0 },
  { pos: 257, moduleIdx: 5, paramIdx: 1 },
  { pos: 268, moduleIdx: 3, paramIdx: 0 },
  { pos: 272, moduleIdx: 3, paramIdx: 1 },
  { pos: 276, moduleIdx: 3, paramIdx: 2 },
  { pos: 287, moduleIdx: 4, paramIdx: 0 },
  { pos: 291, moduleIdx: 4, paramIdx: 1 },
  { pos: 301, moduleIdx: 4, paramIdx: 2, isSwitch: true },
  { pos: 322, moduleIdx: 6, paramIdx: 0 },
  { pos: 326, moduleIdx: 6, paramIdx: 1 },
  { pos: 330, moduleIdx: 6, paramIdx: 2 },
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

function applyParams(buffer: number[], preset: GeneratedPreset): void {
  for (const slot of PARAM_SLOTS) {
    const mod = preset.modules[slot.moduleIdx];
    if (!mod) continue;
    const param = mod.params[slot.paramIdx];
    if (!param) continue;

    const value = clamp(param.value, param.min, param.max);
    const out = slot.isSwitch
      ? value > (param.min + param.max) / 2 ? 1.0 : 0.0
      : value;
    writeFloatLE(buffer, slot.pos, out);
  }
}

function buildPresetBuffer(
  preset: GeneratedPreset,
  baseAmpFxId?: string,
  baseCabFxId?: string,
): number[] {
  const buffer = decodeTemplate();
  applyName(buffer, preset.title);

  // When a base preset is selected, override the AMP and CAB module fxIds
  // with the base preset's algorithms so the downloaded .prst preserves the
  // exact amp + cab the user picked, regardless of what the AI returned.
  let modules = preset.modules;
  if (baseAmpFxId) {
    modules = modules.map((mod, i) => {
      if (i === AMP_MODULE_IDX) return { ...mod, fxId: baseAmpFxId };
      if (i === CAB_MODULE_IDX && baseCabFxId) return { ...mod, fxId: baseCabFxId };
      return mod;
    });
  }

  applyModules(buffer, modules);
  applyParams(buffer, { ...preset, modules });
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
