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
  fxTitle: string;
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
  fxTitle: string;
  type: string;
  subType: string;
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
