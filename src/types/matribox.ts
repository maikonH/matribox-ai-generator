export interface BlockParameter {
  id: number;
  name: string;
  value: number;
}

export interface EffectBlock {
  blockId: number;
  fxId: number;
  enabled: boolean;
  parameters: BlockParameter[];
}

export interface MatriboxPreset {
  name: string;
  routing: number[];
  blocks: { [key: number]: EffectBlock };
}
