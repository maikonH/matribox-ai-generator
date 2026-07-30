// Shared types for the AI preset pipeline.
//
// The app no longer compiles physical .prst byte files. Instead, the AI
// response is translated into real-time MIDI Control Change messages (see
// midiBuilder.ts) and pushed live to the pedalboard over Web MIDI.

export interface ChainEntry {
  modulo: string;
  nomeEfeito: string;
  knobs: number[];
}

export interface AiPresetResponse {
  nomePatch: string;
  comentario: string;
  cadeia: ChainEntry[];
}
