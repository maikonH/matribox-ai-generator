// Dynamic base tone presets. The full amp + cab catalog is read from
// alg_data.json so every algorithm the device knows about is available — no
// manual curation required. The actual .prst byte assembly (name, module
// declaration blocks, float32 param slots) lives in presetDownload.ts, which
// uses a single factory template for both the base-preset and AI-only paths.

import algData from '../data/alg_data.json';

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
