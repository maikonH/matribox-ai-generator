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
  widget?: RawParam[];
  _moduleType?: string;
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

  const paramSource = raw.params ?? raw.parameters ?? raw.controls ?? raw.widget ?? [];
  const params = Array.isArray(paramSource) ? paramSource.map(normalizeParam) : [];

  return {
    fxId: fxId || fxTitle.toLowerCase().replace(/\s+/g, '_'),
    fxTitle: fxTitle || `Algorithm ${fxId}`,
    type: raw._moduleType ? asString(raw._moduleType, 'unknown') : asString(raw.type, 'unknown'),
    subType: asString(raw.subType, raw.subtype ?? raw.type ?? ''),
    category: raw.category ? asString(raw.category) : undefined,
    description: raw.description ? asString(raw.description) : undefined,
    params,
  };
}

/**
 * Collect leaf algorithm entries only. A node is a leaf when it carries a
 * concrete identifier (fxId / id / effectId) — the numeric key the device
 * uses to address an algorithm. Group/module wrappers (the JSON's top-level
 * "Modules" entries: DYN, DRV, AMP, …) carry only a `name` and an `alg`
 * array, never a fxId, so they must NOT be counted as algorithms
 * themselves — otherwise the wrapper + its children double-count every
 * module (the historical "283" bug: 16 wrappers + 267 real entries).
 */
function isLeafAlgorithm(obj: Record<string, unknown>): boolean {
  if (
    'widgetType' in obj ||
    'valueRange' in obj ||
    'codeing' in obj ||
    'defaultValue' in obj
  ) {
    return false;
  }
  return 'fxId' in obj || 'id' in obj || 'effectId' in obj;
}

function deepCollectAlgorithms(raw: unknown, depth: number, out: RawAlgorithm[], moduleType?: string): void {
  if (depth > 12) return;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      deepCollectAlgorithms(item, depth + 1, out, moduleType);
    }
    return;
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    // A group/module wrapper carries a `name` + an `alg` array (the
    // alg_data.json top-level "Modules" shape). Its name is the canonical
    // hardware module code (DYN, DRV, AMP, CAB, …) and must be propagated to
    // every leaf algorithm inside it, otherwise the effect's own `type`
    // (e.g. " 4 x 12”", "/", "Comp") leaks into the catalog as the module code
    // the Gemini prompt and the validator both rely on.
    const childModuleType = typeof obj.name === 'string' && Array.isArray(obj.alg)
      ? obj.name
      : moduleType;

    if (isLeafAlgorithm(obj)) {
      out.push({ ...(obj as RawAlgorithm), _moduleType: childModuleType });
      return;
    }

    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        deepCollectAlgorithms(val, depth + 1, out, childModuleType);
      }
    }
  }
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

  const collected: RawAlgorithm[] = [];
  deepCollectAlgorithms(parsed, 0, collected);

  const seen = new Set<string>();
  const algorithms: Algorithm[] = [];
  for (const candidate of collected) {
    const norm = normalizeAlgorithm(candidate);
    if (!norm) continue;
    // Dedupe by fxId so the same effect appearing in multiple groups
    // doesn't produce duplicates in the final list.
    if (seen.has(norm.fxId)) continue;
    seen.add(norm.fxId);
    algorithms.push(norm);
  }

  // Fallback: if nothing looked like an algorithm, try the root itself
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
      error: 'Nenhum algoritmo válido encontrado no arquivo. Verifique se o JSON contém efeitos com os campos fxId/fxTitle (ou name) e params/widget.',
      count: 0,
    };
  }

  return { success: true, algorithms, count: algorithms.length };
}
