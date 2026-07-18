// Dynamic base tone presets. Instead of shipping one physical .prst file per
// amp+cab combination, we ship a SINGLE binary template (twd_deluxe) and inject
// the amp fxId (4-byte LE at offset 161), the cab fxId low byte (offset 165),
// and the preset name at runtime. The device does NOT auto-pair the cabinet,
// so both the amp and cab fxIds must be written explicitly.
//
// The full amp + cab catalog is read from alg_data.json so every algorithm
// the device knows about is available — no manual curation required.

import algData from '../data/alg_data.json';
import templateRaw from '../data/amp+cab/60-A_twd_deluxe.prst?raw';

// Name text occupies offsets [30..44] (15 bytes) in the template.
const NAME_START = 30;
const NAME_END = 44;

// The amp fxId is stored as a 4-byte little-endian integer at offset 161,
// preceded by a 0xFF marker byte at offset 160.
const AMP_FXID_POS = 161;

// The cab fxId is stored immediately after the amp fxId. All cab fxIds share
// the 0x0A0000XX pattern, so only the low byte varies — it lives at offset 165.
const CAB_FXID_POS = 165;

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

function decodeTemplate(): number[] {
  return JSON.parse(atob(templateRaw.trim()));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/**
 * Build a .prst byte array from the single template, injecting the preset
 * name, the amp fxId (4-byte LE at offset 161), and the cab fxId low byte
 * (offset 165). Both amp and cab must be injected — the device does not
 * auto-pair the cabinet from the amp's associationId.
 */
export function buildBasePresetBytes(title: string, ampFxId: string, cabFxId: string): number[] {
  const buffer = decodeTemplate();

  // Inject name at [30..44]
  const fieldLen = NAME_END - NAME_START + 1;
  const nameBytes = encodeString(title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[NAME_START + i] = nameBytes[i] ?? 0;
  }

  // Inject amp fxId as 4-byte LE at offset 161
  const ampNum = Number(ampFxId);
  if (Number.isFinite(ampNum)) {
    const n32 = ampNum >>> 0;
    buffer[AMP_FXID_POS] = n32 & 0xff;
    buffer[AMP_FXID_POS + 1] = (n32 >>> 8) & 0xff;
    buffer[AMP_FXID_POS + 2] = (n32 >>> 16) & 0xff;
    buffer[AMP_FXID_POS + 3] = (n32 >>> 24) & 0xff;
  }

  // Inject cab fxId low byte at offset 165 (all cabs are 0x0A0000XX)
  const cabNum = Number(cabFxId);
  if (Number.isFinite(cabNum)) {
    buffer[CAB_FXID_POS] = cabNum & 0xff;
  }

  return buffer;
}
