import type { GeneratedPreset, PresetModule } from './types';
import templateRaw from '../lib/57-A_amp_com_botoes.p.prst?raw';

// Fixed template: 57-A_amp_com_botoes.p.prst (311 bytes). This is an amp+cab
// preset saved on the Matribox II Pro with all 6 amp knobs turned to specific
// non-default values, so the real amp param slots are present and active.
//
// We ONLY overwrite bytes in place — name, amp fxId, cab fxId, and the 6 amp
// param float32 LE values. The file size never changes.
//
// Template layout (311 bytes):
//   [30..44]    Name (15 bytes, null-padded)
//   [162]       0xFF marker
//   [163..166]  Amp fxId (4-byte LE)
//   [167]       Cab fxId low byte (high bytes always 0x0A0000xx)
//   [179..186]  AMP param section header: e6 02 6c 04 00 08 05 01
//   [187..190]  Gain   (float32 LE)
//   [191..194]  Presence (float32 LE)
//   [195..198]  Volume (float32 LE)
//   [199..202]  Bass   (float32 LE)
//   [203..206]  Middle (float32 LE)
//   [207..210]  Treble (float32 LE)
//   [211..215]  5-byte separator: 74 03 20 05 0d
//   [220..223]  CAB Low Cut (float32 LE = 19.0)
//   [224..227]  CAB High Cut (float32 LE = 20001.0)
//   [303..310]  Footer

const TEMPLATE_B64 = templateRaw.trim();

const NAME_START = 30;
const NAME_END = 44;

const MODULE_DECL_START = 48;
const MODULE_DECL_COUNT = 8;
const MODULE_DECL_SIZE = 7;

// AI module index → template declaration slot index.
// AI modules: 0=DRIVE, 1=AMP, 2=CAB, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
// Template slots: 0=DRIVE, 1=CAB, 2=AMP, 3=EQ, 4=MOD, 5=DELAY, 6=REVERB, 7=VOLUME
const SLOT_MAP = [0, 2, 1, 3, 4, 5, 6, 7];

const AMP_MODULE_IDX = 1;
const CAB_MODULE_IDX = 2;

const AMP_FXID_POS = 163;
const CAB_FXID_LOW_POS = 167;

const AMP_PARAM_OFFSETS = [187, 191, 195, 199, 203, 207];

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

function applyFxIds(buffer: number[], ampFxId?: string, cabFxId?: string): void {
  if (ampFxId && /^\d+$/.test(ampFxId)) {
    const n = (Number(ampFxId) >>> 0);
    buffer[AMP_FXID_POS] = n & 0xff;
    buffer[AMP_FXID_POS + 1] = (n >>> 8) & 0xff;
    buffer[AMP_FXID_POS + 2] = (n >>> 16) & 0xff;
    buffer[AMP_FXID_POS + 3] = (n >>> 24) & 0xff;
  }
  if (cabFxId && /^\d+$/.test(cabFxId)) {
    const n = (Number(cabFxId) >>> 0);
    buffer[CAB_FXID_LOW_POS] = n & 0xff;
  }
}

function applyAmpParams(buffer: number[], preset: GeneratedPreset): void {
  const ampModule = preset.modules[AMP_MODULE_IDX];
  if (!ampModule) return;

  const params = ampModule.params;
  for (let i = 0; i < 6 && i < params.length; i++) {
    const p = params[i];
    if (!p) continue;
    writeFloatLE(buffer, AMP_PARAM_OFFSETS[i], clamp(p.value, p.min, p.max));
  }
}

function buildPresetBuffer(
  preset: GeneratedPreset,
  baseAmpFxId?: string,
  baseCabFxId?: string,
): number[] {
  const buffer = decodeTemplate();
  applyName(buffer, preset.title);
  applyModules(buffer, preset.modules);
  applyFxIds(buffer, baseAmpFxId, baseCabFxId);
  applyAmpParams(buffer, preset);
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
