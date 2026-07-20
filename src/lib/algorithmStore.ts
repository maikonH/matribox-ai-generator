import type { Algorithm, AlgorithmCategory } from './types';
import { ALGORITHM_CATALOG, getCatalog } from './algorithmCatalog';
import { dbGetAlgorithms, dbSetAlgorithms, dbClearAlgorithms } from './algorithmDb';

// The 267-entry catalog is the permanent baseline. A user-uploaded
// alg_data.json (via Settings) may override it in IndexedDB, but the catalog
// is always the fallback and is the set the AI draws from by default.

/**
 * Load the effective algorithm set.
 *
 * Resolution order:
 *   1. A user-uploaded alg_data.json previously persisted to IndexedDB.
 *   2. The locked 267-entry catalog compiled from src/data/alg_data.json.
 *
 * The catalog fallback is computed at module load and is immune to any
 * localStorage / IndexedDB reset — the header counter therefore cannot
 * drop below 267 unless the user explicitly uploads a smaller JSON.
 */
export async function loadAlgorithmsAsync(): Promise<Algorithm[]> {
  const fromDb = await dbGetAlgorithms<Algorithm[]>();
  if (fromDb && Array.isArray(fromDb) && fromDb.length > 0) return fromDb;
  return getCatalog();
}

export async function saveAlgorithmsAsync(algorithms: Algorithm[]): Promise<void> {
  await dbSetAlgorithms(algorithms);
}

export async function clearAlgorithmsAsync(): Promise<void> {
  await dbClearAlgorithms();
}

export function getCatalogAlgorithms(): Algorithm[] {
  return ALGORITHM_CATALOG;
}

export function getCategorized(algorithms: Algorithm[]): AlgorithmCategory[] {
  const map = new Map<string, Algorithm[]>();
  for (const alg of algorithms) {
    const type = alg.type || 'unknown';
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(alg);
  }
  const displayNames: Record<string, string> = {
    COMP: 'Compressor',
    DRIVE: 'Drive',
    AMP: 'Amplifier',
    CAB: 'Cabinet',
    EQ: 'Equalizer',
    DELAY: 'Delay',
    REVERB: 'Reverb',
    MOD: 'Modulation',
    unknown: 'Outros',
  };
  return Array.from(map.entries()).map(([type, algs]) => ({
    type,
    displayName: displayNames[type] ?? type,
    algorithms: algs,
  }));
}

export function findAlgorithm(
  algorithms: Algorithm[],
  fxId: string,
  fallbackType?: string,
  fxTitle?: string,
): Algorithm | undefined {
  const byId = algorithms.find((a) => a.fxId === fxId);
  if (byId) return byId;
  if (fallbackType) {
    const lower = fallbackType.toLowerCase();
    const byType = algorithms.find(
      (a) =>
        a.type.toLowerCase() === lower ||
        (a.subType ?? '').toLowerCase() === lower,
    );
    if (byType) return byType;
  }
  if (fxTitle) {
    const lowerTitle = fxTitle.toLowerCase();
    const byTitle = algorithms.find(
      (a) => a.fxTitle.toLowerCase() === lowerTitle,
    );
    if (byTitle) return byTitle;
  }
  return undefined;
}
