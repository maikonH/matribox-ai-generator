// Dynamic base tone presets. The full amp + cab catalog is read from
// alg_data.json so every algorithm the device knows about is available — no
// manual curation required. buildBasePresetBytes below uses the fixed
// 57-A_amp_com_botoes.p.prst template (311 bytes) that has real amp param
// slots and loads cleanly on the Matribox II Pro.

import algData from '../data/alg_data.json';
import templateRaw from '../lib/57-A_amp_com_botoes.p.prst?raw';

export interface BasePreset {
  id: string;
  name: string;
  ampFxId: string;
  ampName: string;
  cabFxId: string;
  cabName: string;
  description: string;
}

interface AlgEntry {
  fxid: number;
  fxtitle?: string;
  name?: string;
  type?: string;
  descriptionEN?: string;
  associationId?: string;
  origin?: string;
}

interface AlgModule {
  name: string;
  index: number;
  alg: AlgEntry[];
}

function getModules(): AlgModule[] {
  return (algData as { Modules: AlgModule[] }).Modules;
}

function parseAssociationCabId(assocRaw: string): string | null {
  const parts = assocRaw?.trim().split(/\s+/).map((s) => parseInt(s, 16));
  if (!parts || parts.length < 4 || parts.some((p) => Number.isNaN(p))) return null;
  const be = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  return String(be >>> 0);
}

function findCabName(cabFxId: string): string | null {
  const cabModule = getModules().find((m) => m.name === 'CAB');
  if (!cabModule) return null;
  const entry = cabModule.alg.find((a) => String(a.fxid) === cabFxId);
  return entry?.name ?? entry?.fxtitle ?? null;
}

function buildBasePresets(): BasePreset[] {
  const ampModule = getModules().find((m) => m.name === 'AMP');
  if (!ampModule) return [];

  const presets: BasePreset[] = [];
  for (const alg of ampModule.alg) {
    const ampFxId = String(alg.fxid);
    const ampName = alg.name || alg.fxtitle || `Amp ${alg.fxid}`;
    const cabFxId = parseAssociationCabId(alg.associationId ?? '') ?? '';
    const cabName = cabFxId ? findCabName(cabFxId) ?? '' : '';

    presets.push({
      id: `amp_${ampFxId}`,
      name: ampName,
      ampFxId,
      ampName,
      cabFxId,
      cabName,
      description: alg.descriptionEN || '',
    });
  }
  return presets;
}

export const basePresets: BasePreset[] = buildBasePresets();

export function getBasePreset(id: string): BasePreset | undefined {
  return basePresets.find((p) => p.id === id);
}

// --- Compact template byte assembly ---------------------------------------

const TEMPLATE_B64 = templateRaw.trim();

const NAME_START = 30;
const NAME_END = 44;
const AMP_FXID_POS = 163;
const CAB_FXID_LOW_POS = 167;

function decodeTemplate(): number[] {
  return JSON.parse(atob(TEMPLATE_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/**
 * Build the base preset bytes from the fixed 57-A_amp_com_botoes.p.prst
 * template. Overwrites the preset name (offset 30), amp fxId (4-byte LE at
 * offset 163) and cab fxId low byte (offset 167) in place. The file size
 * never changes.
 */
export function buildBasePresetBytes(
  title: string,
  ampFxId: string,
  cabFxId: string,
): number[] {
  const buffer = decodeTemplate();

  const fieldLen = NAME_END - NAME_START + 1;
  const nameBytes = encodeString(title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[NAME_START + i] = nameBytes[i] ?? 0;
  }

  if (ampFxId && /^\d+$/.test(ampFxId)) {
    const n = Number(ampFxId) >>> 0;
    buffer[AMP_FXID_POS] = n & 0xff;
    buffer[AMP_FXID_POS + 1] = (n >>> 8) & 0xff;
    buffer[AMP_FXID_POS + 2] = (n >>> 16) & 0xff;
    buffer[AMP_FXID_POS + 3] = (n >>> 24) & 0xff;
  }

  if (cabFxId && /^\d+$/.test(cabFxId)) {
    const n = Number(cabFxId) >>> 0;
    buffer[CAB_FXID_LOW_POS] = n & 0xff;
  }

  return buffer;
}
