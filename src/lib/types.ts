export interface AlgorithmParam {
  name: string;
  displayName?: string;
  min: number;
  max: number;
  value: number;
  unit?: string;
}

export interface Algorithm {
  fxId: string;
  /** Commercial/AI-facing name from alg_data.json `fxtitle`. Used internally by Gemini only, never shown in the UI. */
  fxTitle: string;
  /** Official name shown by the Matribox II Pro and its editor, from alg_data.json `name`. This is what the UI displays. */
  name: string;
  type: string;
  subType?: string;
  category?: string;
  description?: string;
  params: AlgorithmParam[];
}

export interface AlgorithmCategory {
  type: string;
  displayName: string;
  algorithms: Algorithm[];
}

export interface PresetModule {
  fxId: string;
  /** Internal AI-facing name (alg_data.json `fxtitle`). Kept for reference only; the UI renders `name`. */
  fxTitle: string;
  /** Official name shown by the Matribox II Pro and its editor. This is what the UI displays. */
  name: string;
  type: string;
  subType: string;
  enabled?: boolean;
  params: PresetModuleParam[];
}

export interface PresetModuleParam {
  name: string;
  displayName?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
}

export interface GeneratedPreset {
  title: string;
  description: string;
  bpm: number;
  volume: number;
  modules: PresetModule[];
}

export interface ValidationResult {
  success: boolean;
  algorithms: Algorithm[];
  error?: string;
  count: number;
}

// ── AI ↔ Engine contract ─────────────────────────────────────────────────────
// These types form the ONLY bridge between the AI generator (gemini.ts) and
// the .prst engine (presetBuilder.ts). They live here, on neutral ground, so
// neither layer has to import the other: the AI produces an AiPresetResponse,
// the UI projects it to GeneratedPreset, and the engine consumes the
// GeneratedPreset. The engine never reads these types directly.

export interface ChainEntry {
  modulo: string;
  nomeEfeito: string;
  knobs: number[];
  /**
   * The real numeric FXID resolved from alg_data.json during validation.
   * Stamped by validateAiResponse and consumed downstream by the engine.
   */
  fxid?: number;
}

export interface AiPresetResponse {
  nomePatch: string;
  comentario: string;
  cadeia: ChainEntry[];
}
