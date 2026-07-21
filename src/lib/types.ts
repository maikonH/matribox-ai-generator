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
