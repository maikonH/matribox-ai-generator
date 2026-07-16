import type { Algorithm, AlgorithmParam, ValidationResult } from './types';

type RawParam = {
  name?: string;
  displayName?: string;
  min?: number;
  max?: number;
  value?: number;
  default?: number;
  unit?: string;
};

type RawAlgorithm = Record<string, unknown> & {
  fxId?: string | number;
  fxTitle?: string;
  name?: string;
  title?: string;
  label?: string;
  id?: string | number;
  effectId?: string | number;
  type?: string;
  subType?: string;
  subtype?: string;
  category?: string;
  description?: string;
  params?: RawParam[];
  parameters?: RawParam[];
  controls?: RawParam[];
};

function asString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return fallback;
}

function asNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

function normalizeParam(raw: RawParam): AlgorithmParam {
  const min = asNumber(raw.min, 0);
  const max = asNumber(raw.max, 100);
  const value = raw.value !== undefined
    ? asNumber(raw.value, min)
    : raw.default !== undefined
      ? asNumber(raw.default, min)
      : (min + max) / 2;
  return {
    name: asString(raw.name, 'param'),
    displayName: asString(raw.displayName, asString(raw.name, 'param')),
    min,
    max,
    value,
    unit: raw.unit ? asString(raw.unit) : undefined,
  };
}

function normalizeAlgorithm(raw: RawAlgorithm): Algorithm | null {
  const fxId = asString(
    raw.fxId ?? raw.id ?? raw.effectId ?? '',
    '',
  );
  const fxTitle = asString(raw.fxTitle, raw.name ?? raw.title ?? raw.label ?? '');

  if (!fxId && !fxTitle) return null;

  const paramSource = raw.params ?? raw.parameters ?? raw.controls ?? [];
  const params = Array.isArray(paramSource) ? paramSource.map(normalizeParam) : [];

  return {
    fxId: fxId || fxTitle.toLowerCase().replace(/\s+/g, '_'),
    fxTitle: fxTitle || `Algorithm ${fxId}`,
    type: asString(raw.type, 'unknown'),
    subType: asString(raw.subType, raw.subtype ?? ''),
    category: raw.category ? asString(raw.category) : undefined,
    description: raw.description ? asString(raw.description) : undefined,
    params,
  };
}

/**
 * Recursively scans any JSON structure to find the first array of objects
 * that can be normalized into algorithms. Handles arbitrary nesting and
 * unknown wrapper key names (e.g. data.effects, presetList, fxData, etc).
 */
function findAlgorithmArray(raw: unknown, depth = 0): RawAlgorithm[] {
  if (depth > 5) return [];

  if (Array.isArray(raw)) {
    return raw as RawAlgorithm[];
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const values = Object.values(obj);

    // First pass: find the first direct child that is an array
    for (const val of values) {
      if (Array.isArray(val) && val.length > 0) {
        return val as RawAlgorithm[];
      }
    }

    // Second pass: recurse into nested objects to find deeper arrays
    for (const val of values) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const found = findAlgorithmArray(val, depth + 1);
        if (found.length > 0) return found;
      }
    }
  }

  return [];
}

export function validateAlgData(rawJson: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return {
      success: false,
      algorithms: [],
      error: `JSON inválido: ${(e as Error).message}`,
      count: 0,
    };
  }

  const candidates = findAlgorithmArray(parsed);

  const algorithms: Algorithm[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const norm = normalizeAlgorithm(candidate as RawAlgorithm);
    if (norm) algorithms.push(norm);
  }

  // Fallback: if no array was found, try treating the root as a single algorithm
  if (algorithms.length === 0 && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const single = normalizeAlgorithm(parsed as RawAlgorithm);
    if (single) {
      return { success: true, algorithms: [single], count: 1 };
    }
  }

  if (algorithms.length === 0) {
    return {
      success: false,
      algorithms: [],
      error: 'Nenhum algoritmo válido encontrado no arquivo. Verifique se o JSON contém uma lista de efeitos com os campos fxId/fxTitle (ou name).',
      count: 0,
    };
  }

  return { success: true, algorithms, count: algorithms.length };
}
