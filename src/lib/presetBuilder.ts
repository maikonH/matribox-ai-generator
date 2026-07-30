// Shared types for the AI preset pipeline.
//
// The app no longer compiles physical .prst byte files. Instead, the AI
// response is translated into real-time MIDI Control Change messages (see
// midiBuilder.ts) and pushed live to the pedalboard over Web MIDI.

export interface ChainEntry {
  modulo: string;
  nomeEfeito: string;
  knobs: number[];
  /**
   * The real numeric FXID resolved from alg_data.json during validation.
   * Set by validateAiResponse (the single place an effect is confirmed to
   * exist in the catalog) and consumed directly by the MIDI builder to fill
   * SysEx bytes 59–60. Undefined before validation / for unknown effects.
   */
  fxid?: number;
}

export interface AiPresetResponse {
  nomePatch: string;
  comentario: string;
  cadeia: ChainEntry[];
}
