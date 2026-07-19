import type { Algorithm, AlgorithmCategory } from './types';
import { mockAlgorithms } from '../data/mockAlgorithms';
import { dbGetAlgorithms, dbSetAlgorithms, dbClearAlgorithms } from './algorithmDb';

const STORAGE_KEY = 'matribox_algorithms';

/**
 * Load algorithms from IndexedDB. Falls back to localStorage (legacy migration)
 * and finally to mockAlgorithms on first boot. Migrates any localStorage data
 * into IndexedDB and removes the legacy entry.
 */
export async function loadAlgorithmsAsync(): Promise<Algorithm[]> {
  const fromDb = await dbGetAlgorithms<Algorithm[]>();
  if (fromDb && Array.isArray(fromDb) && fromDb.length > 0) return fromDb;

  try {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length > 0) {
        await dbSetAlgorithms(parsed);
        localStorage.removeItem(STORAGE_KEY);
        return parsed;
      }
    }
  } catch {
    // ignore malformed legacy data
  }

  await dbSetAlgorithms(mockAlgorithms);
  return mockAlgorithms;
}

export async function saveAlgorithmsAsync(algorithms: Algorithm[]): Promise<void> {
  await dbSetAlgorithms(algorithms);
}

export async function clearAlgorithmsAsync(): Promise<void> {
  await dbClearAlgorithms();
  localStorage.removeItem(STORAGE_KEY);
}

/** @deprecated Use loadAlgorithmsAsync. Kept for backward compatibility. */
export function loadAlgorithms(): Algorithm[] {
  return mockAlgorithms;
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
        a.subType.toLowerCase() === lower,
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
