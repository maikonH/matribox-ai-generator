import type { GeneratedPreset, PresetModule } from './types';

// Factory template: the 33-A LE MARSHALL preset as a number array. A valid
// .prst file that loads on the Matribox II Pro. We mutate ONLY the name
// field, the module declaration blocks (algorithm ID + enable flag), and the
// float32-LE parameter slots below — every other byte (header, prefix,
// routing gaps, footer) is preserved verbatim from this pristine template.
const TEMPLATE_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw1NCw1MiwyMjIsNzcsNzYsNjksMzIsNzcsNjUsODIsODMsNzIsNjUsNzYsNzYsMCwwLDgyLDc5LDEzMiwzLDIsNTMsMTY5LDEzNiwxMTMsNTQsMTA4LDAsMSw1NSwxNDQsMTY3LDU0LDEwOCwwLDEsMjQ2LDI0OSwyNTUsNTMsMTA4LDAsMSwxMTYsMTI0LDI1MCw1NCwxMDgsMCwxLDE0NCwyMTgsMjUzLDU0LDEwOCwwLDEsMjU0LDI0OSw5NSw1NCwxMDgsMCwxLDE4OCw3LDE1Miw1NCwxMDgsMCwxLDEyMCwxMTYsOTYsMTgwLDExMCwwLDg4LDUwLDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMSwyLDE1LDEzMiwyLDEwLDMsMSwxLDIsMyw4LDAsMCwwLDcsNSwwLDYsMTIxLDIsNzYsMTUyLDIsNyw0LDEsMSw1LDAsMiw0LDYsMywyNTUsOTYsMCw0LDExLDAsNywxMCwxNSwzLDksMTA0LDEsMCwxMSwyNTUsMiwwLDAsMTUsMjcsMCwwLDAsNTcsMCwwLDEsMywwLDAsMTIsMywwLDAsNiwzMCwwLDAsMywyOSwwLDAsMTEsMTM2LDcsNDUsMTYsMCwxMTAsMTAsMjMwLDIsMTEyLDIsMCw0LDUsMSwwLDAsMTEyLDY2LDAsMCwxNDgsNjYsMCwwLDEyMCw2NiwwLDAsMTYsNjYsMCwwLDIwLDY2LDEwMCwzLDMyLDUsMTIsMCwyLDIyNCw2NSwwLDAsMTYwLDIwNCwwLDcsNzIsNjcsMCwwLDI1MCw2NywwLDAsNzIsNjYsMTcyLDAsMzIsNSw0LDEsOSwwLDAsMTI4LDE5MiwwLDAsODAsMTkzLDAsMCwxNjAsMTkzLDMyLDksMjIwLDAsNyw5Niw2NSwwLDAsMTM4LDY2LDAsMCwxOTIsNjUsNDAsMTQ4LDEsMywyMDAsNjYsMCwwLDEyOCw2Myw0MCw2MCwwLDU0LDM2LDAsMTI0LDQsNTQsMTA4LDAsNjIsOTIsMCwxMSwzMiw2NiwwLDAsMTM2LDY1LDAsMCwzNiw2NiwwLDAsMjQ4LDY1LDMyLDUsMTg4LDEsMjM3LDEwLDE2LDEyNCw1LDQsNjQsMCwwLDIyNCw2NCwwLDAsMjM2LDE2LDEwOCwzNywxMDgsMjIsMTA4LDAsMjUyLDQsMzIsMywyOSwwLDk2LDMyLDEwLDE3Miw0LDEwOCw1MiwxMDksMTAsNTYsMzIsMTAsOTIsNywxMjQsNSwzMiwxNDksMTMsMCwxLDEyOCwwLDE3NSwyMyw3OCwwLDgwLDE5MywxMDcsOTUsMTMxLDIsNywxLDAsMTU2LDEwMSwxMTIsMCwxMjgsMiwzMiw5LDE2LDAsOTYsNTQsNjAsMTIsMCwxMTMsMTA2LDY5LDEyOCwxMCw0LDgsMSwxNDksNTQsMTcwLDE0OCwxNDksMTQwLDEsNDIsMTcsMCwxLDU1LDQ4LDAsNDIsOTYsMCwxNDAsMSwwLDIsMiwwLDAsMTYsMTIsMCwwLDAsMCwwLDksMSwwLDAsMTI4LDYzLDIwMCwwLDAsNDgsMTcsMCwwXQ==';

// Name text occupies offsets [30..44] (15 bytes). The 4-byte prefix at
// [26..29] belongs to the preset header and must stay untouched.
const NAME_START = 30;
const NAME_END = 44;

// Module declaration blocks: 8 blocks of 7 bytes starting at offset 48.
// Layout per block: [enable, sig0, sig1, sig2, route0, route1, 0]
//   byte 0     = enable flag (1 = active, 0 = bypassed)
//   bytes 1-3  = 3-byte algorithm signature (module-type, 0, algo-index)
//   bytes 4-5  = routing tokens (preserved from template)
//   byte 6     = reserved (preserved from template)
// The 8 slots map positionally to the AI's module order
// (DRIVE, AMP, CAB, EQ, MOD, DELAY, REVERB, VOLUME).
const MODULE_DECL_START = 48;
const MODULE_DECL_COUNT = 8;
const MODULE_DECL_SIZE = 7;

// The AI emits 8 modules in a fixed order: DRIVE, AMP, CAB, EQ, MOD, DELAY,
// REVERB, VOLUME (see gemini.ts system prompt). The template's hardware
// declaration slots do NOT line up 1:1 with this order: the factory template
// (33-A) runs the amp architecture through its CLONE block at slot 2,
// leaving the standard AMP slot (1) unused. So the AI's AMP module is routed
// to slot 2, and the AI's CAB module reuses the freed slot 1.
//
// AI module index → template declaration slot index.
const SLOT_MAP = [0, 2, 1, 3, 4, 5, 6, 7];

interface ParamSlot {
  pos: number;
  moduleIdx: number;
  paramIdx: number;
  isSwitch?: boolean;
}

// Confirmed float32-LE parameter slots from structural analysis. Only these
// exact byte offsets are mutated; all other template bytes are preserved.
const PARAM_SLOTS: ParamSlot[] = [
  // AMP (module 1)
  { pos: 216, moduleIdx: 1, paramIdx: 0 },
  { pos: 220, moduleIdx: 1, paramIdx: 1 },
  { pos: 224, moduleIdx: 1, paramIdx: 2 },
  { pos: 228, moduleIdx: 1, paramIdx: 3 },
  { pos: 232, moduleIdx: 1, paramIdx: 4 },
  // DELAY (module 5)
  { pos: 253, moduleIdx: 5, paramIdx: 0 },
  { pos: 257, moduleIdx: 5, paramIdx: 1 },
  // EQ (module 3)
  { pos: 268, moduleIdx: 3, paramIdx: 0 },
  { pos: 272, moduleIdx: 3, paramIdx: 1 },
  { pos: 276, moduleIdx: 3, paramIdx: 2 },
  // MOD (module 4): 2 continuous + 1 on/off switch
  { pos: 287, moduleIdx: 4, paramIdx: 0 },
  { pos: 291, moduleIdx: 4, paramIdx: 1 },
  { pos: 301, moduleIdx: 4, paramIdx: 2, isSwitch: true },
  // REVERB (module 6)
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

// Derive the 3-byte hardware algorithm signature from the module's fxId.
//
// The Matribox alg_data.json catalog encodes each algorithm's identity in a
// 32-bit fxid where the high byte is the module type (DRV=3, AMP=7, CAB=10,
// EQ=1, MOD=4, DLY=11, RVB=12, VOL=6...), the middle byte is 0, and the low
// byte is the algorithm index within that module. The hardware stores this
// identity as the 3-byte signature [type, 0, index] in each module
// declaration block.
//
// The app's JSON validator (jsonValidator.ts) stringifies numeric fxId
// fields verbatim, so a catalog algorithm like Brit 800 (fxid 117440565 =
// 0x07000035) reaches us as the string "117440565". We parse it back and
// split into the three signature bytes.
//
// Returns null for non-numeric fxIds (e.g. the mock algorithms
// "drive_tube808"), which signals the caller to fall back to the template's
// existing bytes for that slot.
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

// Rewrite the 8 module declaration blocks (offsets 48..103) with the AI's
// algorithm selections and enable flags. Each AI module is routed to its
// template slot via SLOT_MAP: DRIVE→0, AMP→2 (CLONE block), CAB→1, and the
// rest stay positional. Bytes 4-6 (routing + reserved) are always preserved
// from the template. When an algorithm's 3-byte signature cannot be derived
// from its fxId, the template's bytes 1-3 for that slot are left untouched
// (graceful fallback). Any template slot not assigned to an AI module is
// disabled (byte 0 = 0).
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
    // else: keep template bytes 1-3 for this slot (fallback).
    // Bytes 4-6 are never touched here.

    usedSlots.add(slot);
  }

  // Disable any template slot that no AI module was routed to.
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

function buildPresetBuffer(preset: GeneratedPreset): number[] {
  const buffer = decodeTemplate();
  applyName(buffer, preset.title);
  applyModules(buffer, preset.modules);
  applyParams(buffer, preset);
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

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);
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
