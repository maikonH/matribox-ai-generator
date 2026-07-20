import type { Algorithm, AlgorithmCategory } from './types';
import { ALGORITHM_CATALOG, getCatalog } from './algorithmCatalog';

// Single source of truth: src/data/alg_data.json, projected at module load via
// ALGORITHM_CATALOG. A developer may override the catalog IN MEMORY ONLY from
// the "Ferramentas do Desenvolvedor" section of Settings; the override never
// touches disk and is lost on reload. There is no IndexedDB persistence — the
// official catalog is always re-read from the bundled JSON on boot.

let overlay: Algorithm[] | null = null;

/**
 * The effective algorithm set: the official catalog from
 * src/data/alg_data.json, or an in-memory developer overlay when one is
 * active. The overlay is temporary (debugging only) and never persisted.
 */
export function loadAlgorithms(): Algorithm[] {
  return overlay ?? getCatalog();
}

export function setDevOverlay(algorithms: Algorithm[] | null): void {
  overlay = algorithms && algorithms.length > 0 ? algorithms : null;
}

export function isOverlayActive(): boolean {
  return overlay !== null;
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
