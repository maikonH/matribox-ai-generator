import type { GeneratedPreset } from './types';
import templateRaw from '../lib/57-A_amp_com_botoes.p.prst?raw';

// Fixed template: 57-A_amp_com_botoes.p.prst (311 bytes). This is an amp+cab
// preset saved on the Matribox II Pro with all 6 amp knobs turned to specific
// non-default values, so the real amp param slots are present and active.
//
// We ONLY overwrite bytes in place — name, amp fxId, cab fxId, and the 6 amp
// param float32 LE values. The file size never changes (always 311 bytes).
//
// Template layout (311 bytes):
//   [30..44]    Name (15 bytes, null-padded)
//   [163..166]  Amp fxId (4-byte LE)
//   [167..170]  Cab fxId (4-byte LE)
//   [187..190]  Gain   (float32 LE)
//   [191..194]  Presence (float32 LE)
//   [195..198]  Volume (float32 LE)
//   [199..202]  Bass   (float32 LE)
//   [203..206]  Middle (float32 LE)
//   [207..210]  Treble (float32 LE)

const TEMPLATE_B64 = templateRaw.trim();

const NAME_START = 30;
const NAME_END = 44;
const NAME_LEN = NAME_END - NAME_START + 1;

const AMP_FXID_POS = 163;
const CAB_FXID_POS = 167;

const AMP_MODULE_IDX = 1;
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

function writeU32LE(buffer: number[], pos: number, value: number): void {
  const n = value >>> 0;
  buffer[pos] = n & 0xff;
  buffer[pos + 1] = (n >>> 8) & 0xff;
  buffer[pos + 2] = (n >>> 16) & 0xff;
  buffer[pos + 3] = (n >>> 24) & 0xff;
}

function applyName(buffer: number[], title: string): void {
  const nameBytes = encodeString(title).slice(0, NAME_LEN);
  for (let i = 0; i < NAME_LEN; i++) {
    buffer[NAME_START + i] = nameBytes[i] ?? 0;
  }
}

function applyFxIds(buffer: number[], ampFxId?: string, cabFxId?: string): void {
  if (ampFxId && /^\d+$/.test(ampFxId)) {
    writeU32LE(buffer, AMP_FXID_POS, Number(ampFxId));
  }
  if (cabFxId && /^\d+$/.test(cabFxId)) {
    writeU32LE(buffer, CAB_FXID_POS, Number(cabFxId));
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
