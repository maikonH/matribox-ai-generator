// Algorithm definitions for the 10 amp + cab base tones, extracted from
// alg_data.json. These are always available to the AI even before the user
// uploads alg_data.json, so a base tone can drive generation on first boot.

import type { Algorithm, AlgorithmParam } from './types';
import { basePresets } from './basePresets';
import algData from '../data/alg_data.json';

type Widget = {
  name: string;
  ID?: string;
  defaultValue?: string | number;
  min?: string | number;
  max?: string | number;
  unit?: string;
};

type AlgEntry = {
  fxid: number;
  fxtitle?: string;
  name?: string;
  type?: string;
  descriptionEN?: string;
  widget?: Widget[];
};

function num(v: string | number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

function widgetToParams(widget: Widget[] | undefined): AlgorithmParam[] {
  if (!widget) return [];
  return widget.map((w) => ({
    name: w.name,
    displayName: w.name,
    min: num(w.min, 0),
    max: num(w.max, 100),
    value: num(w.defaultValue, 50),
    unit: w.unit,
  }));
}

function findAlgEntry(fxId: string): AlgEntry | undefined {
  const target = Number(fxId);
  for (const mod of (algData as { Modules: { alg: AlgEntry[] }[] }).Modules) {
    const found = mod.alg?.find((a) => a.fxid === target);
    if (found) return found;
  }
  return undefined;
}

function buildAlgorithm(fxId: string, kind: 'AMP' | 'CAB'): Algorithm | null {
  const entry = findAlgEntry(fxId);
  if (!entry) return null;
  return {
    fxId: String(entry.fxid),
    fxTitle: entry.fxtitle || entry.name || `Algorithm ${fxId}`,
    type: kind,
    subType: kind,
    category: kind === 'AMP' ? 'Amplifier' : 'Cabinet',
    description: entry.descriptionEN || '',
    params: widgetToParams(entry.widget),
  };
}

const baseAlgorithmCache = new Map<string, Algorithm>();

export function getBaseAlgorithms(): Algorithm[] {
  const out: Algorithm[] = [];
  for (const bp of basePresets) {
    const amp = baseAlgorithmCache.get(bp.ampFxId) ?? buildAlgorithm(bp.ampFxId, 'AMP');
    const cab = baseAlgorithmCache.get(bp.cabFxId) ?? buildAlgorithm(bp.cabFxId, 'CAB');
    if (amp) {
      baseAlgorithmCache.set(bp.ampFxId, amp);
      out.push(amp);
    }
    if (cab) {
      baseAlgorithmCache.set(bp.cabFxId, cab);
      out.push(cab);
    }
  }
  // Dedupe by fxId
  const seen = new Set<string>();
  return out.filter((a) => {
    if (seen.has(a.fxId)) return false;
    seen.add(a.fxId);
    return true;
  });
}
