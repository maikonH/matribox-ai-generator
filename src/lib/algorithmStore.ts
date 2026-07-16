import type { Algorithm, AlgorithmCategory } from './types';
import { mockAlgorithms } from '../data/mockAlgorithms';

const STORAGE_KEY = 'matribox_algorithms';

export function loadAlgorithms(): Algorithm[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through to mock
  }
  saveAlgorithms(mockAlgorithms);
  return mockAlgorithms;
}

export function saveAlgorithms(algorithms: Algorithm[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(algorithms));
}

export function clearAlgorithms(): void {
  localStorage.removeItem(STORAGE_KEY);
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
): Algorithm | undefined {
  const byId = algorithms.find((a) => a.fxId === fxId);
  if (byId) return byId;
  if (fallbackType) {
    const byType = algorithms.find(
      (a) => a.type === fallbackType || a.subType === fallbackType,
    );
    if (byType) return byType;
  }
  return undefined;
}
