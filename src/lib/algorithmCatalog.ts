// Single source of truth for the Matribox II Pro algorithm catalog.
// Imports alg_data.json once at module load and projects every entry into
// the Algorithm shape used across the app. The resulting list is frozen at
// 267 entries — the exact contents of src/data/alg_data.json — and is the
// only algorithm set the AI is ever allowed to draw from.
//
// Nothing in this module reads localStorage or IndexedDB, so a browser reset
// cannot change the catalog or the header counter.

import algData from '../data/alg_data.json';
import type { Algorithm, AlgorithmParam } from './types';

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

type AlgModule = {
  name: string;
  index: number;
  alg: AlgEntry[];
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

const MODULE_DISPLAY: Record<string, string> = {
  DYN: 'Dynamics',
  FREQ: 'Filter / Pitch',
  WAH: 'Wah',
  DRV: 'Drive',
  AMP: 'Amplifier',
  CAB: 'Cabinet',
  IR: 'Impulse Response',
  EQ: 'Equalizer',
  MOD: 'Modulation',
  DLY: 'Delay',
  RVB: 'Reverb',
  CLONE: 'Clone',
  FXLOOP: 'FX Loop',
  FXSND: 'FX Send',
  FXRTN: 'FX Return',
  VOL: 'Volume',
};

function buildCatalog(): Algorithm[] {
  const modules = (algData as { Modules: AlgModule[] }).Modules;
  const out: Algorithm[] = [];
  for (const mod of modules) {
    const type = mod.name;
    for (const entry of mod.alg ?? []) {
      out.push({
        fxId: String(entry.fxid),
        // fxTitle: commercial/AI-facing name — Gemini only. name: the official
        // label the Matribox II Pro and its editor display, and what this app
        // shows everywhere in the UI. alg_data.json always carries both.
        fxTitle: entry.fxtitle || entry.name || `Algorithm ${entry.fxid}`,
        name: entry.name || entry.fxtitle || `Algorithm ${entry.fxid}`,
        type,
        subType: type,
        category: MODULE_DISPLAY[type] ?? type,
        description: entry.descriptionEN || '',
        params: widgetToParams(entry.widget),
      });
    }
  }
  return out;
}

export const ALGORITHM_CATALOG: Algorithm[] = buildCatalog();

// Locked count — the only number the header is allowed to render.
export const ALGORITHM_COUNT = ALGORITHM_CATALOG.length;

export function getCatalog(): Algorithm[] {
  return ALGORITHM_CATALOG;
}

// fxTitle → fxid and name → fxid lookups, built once from the same raw
// alg_data.json the catalog projects. The AI is prompted with fxTitles, but
// it sometimes returns the internal `name` instead, so resolving against both
// prevents a silently dropped effect. This is the single resolver every
// consumer (presetBuilder, gemini) must use — no other module builds these
// maps.
const FX_TITLE_TO_ID = new Map<string, number>();
const FX_NAME_TO_ID = new Map<string, number>();
{
  const modules = (algData as { Modules: AlgModule[] }).Modules;
  for (const mod of modules) {
    for (const alg of mod.alg ?? []) {
      if (alg.fxtitle) FX_TITLE_TO_ID.set(alg.fxtitle.toLowerCase(), alg.fxid);
      if (alg.name) FX_NAME_TO_ID.set(alg.name.toLowerCase(), alg.fxid);
    }
  }
}

/** Resolve the numeric fxid for an effect name, matching fxTitle first, then name. */
export function resolveFxId(nomeEfeito: string): number | undefined {
  const key = (nomeEfeito || '').toLowerCase().trim();
  if (!key) return undefined;
  const byTitle = FX_TITLE_TO_ID.get(key);
  if (byTitle !== undefined) return byTitle;
  return FX_NAME_TO_ID.get(key);
}
