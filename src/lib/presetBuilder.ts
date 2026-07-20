// Matribox II Pro (QME-200) preset file builder.
//
// The device stores presets as a flat linear byte stream: a fixed header,
// the patch name as ASCII + a PRO signature, the active signal chain as a
// sequence of (status + 4-byte fxid + knob values) blocks, and a fixed
// footer. Inactive blocks are simply omitted — they occupy no space.
//
// The fxid values in alg_data.json are 32-bit integers (e.g. 50331648 for
// the first DRV). They are serialized here as 4 individual bytes in
// little-endian order, which is what the official Matribox editor expects.

import algData from '../data/alg_data.json';

type AlgEntry = {
  fxid: number;
  fxtitle: string;
  name?: string;
  type?: string;
  widget?: { name: string }[];
};

type AlgModule = { name: string; alg: AlgEntry[] };

const MODULES: AlgModule[] = (algData as { Modules: AlgModule[] }).Modules;

// fxTitle → fxid lookup, built once from the local catalog.
const FX_TITLE_TO_ID = new Map<string, number>();
for (const mod of MODULES) {
  for (const alg of mod.alg) {
    FX_TITLE_TO_ID.set(alg.fxtitle.toLowerCase(), alg.fxid);
  }
}

// Fixed header bytes (indices 0–25), discovered via reverse engineering.
const HEADER_BYTES = [
  3, 2, 0, 0, 16, 11, 0, 128, 0, 5, 1, 4, 3, 12, 1, 5, 1, 15, 105, 2, 105, 164,
  2, 0, 2, 1,
];

// PRO model signature, appended right after the null terminator of the name.
const PRO_SIGNATURE = [32, 80, 82, 79];

// Fixed footer bytes that close the hardware buffer.
const FOOTER_BYTES = [
  16, 12, 0, 0, 0, 0, 0, 9, 1, 0, 0, 128, 63, 200, 0, 0, 48, 17, 0, 0,
];

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

export interface BuiltPreset {
  bytes: number[];
  base64: string;
  nomePatch: string;
}

function clampByte(n: number): number {
  const v = Math.round(n);
  if (Number.isNaN(v)) return 0;
  return Math.min(255, Math.max(0, v));
}

function fxidToBytes(fxid: number): [number, number, number, number] {
  const b0 = fxid & 0xff;
  const b1 = (fxid >>> 8) & 0xff;
  const b2 = (fxid >>> 16) & 0xff;
  const b3 = (fxid >>> 24) & 0xff;
  return [b0, b1, b2, b3];
}

function sanitizeName(name: string): string {
  // Máximo de 12 caracteres alfanuméricos. Espaços e símbolos viram nada.
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
}

function bytesToBase64(bytes: number[]): string {
  const bin = String.fromCharCode(...bytes.map((b) => clampByte(b)));
  // btoa lida com chars 0–255; quebramos em chunks para evitar estouro de
  // call stack em presets grandes.
  let base64 = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bin.length; i += chunkSize) {
    base64 += btoa(bin.slice(i, i + chunkSize));
  }
  return base64;
}

/**
 * Resolve the fxid for a given effect name. Returns undefined when the name
 * is not present in alg_data.json — the caller decides how to handle it.
 */
export function resolveFxId(nomeEfeito: string): number | undefined {
  return FX_TITLE_TO_ID.get((nomeEfeito || '').toLowerCase());
}

/**
 * Build the full linear byte stream for a Matribox II Pro preset from the
 * AI's structured JSON response. Inactive/unknown modules are skipped, so
 * only the active chain occupies space in the file.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);
  const bytes: number[] = [];

  // Bloco 1 — cabeçalho fixo.
  bytes.push(...HEADER_BYTES);

  // Bloco 2 — nome do preset em ASCII + terminador nulo + assinatura PRO.
  for (let i = 0; i < nomePatch.length; i++) {
    bytes.push(clampByte(nomePatch.charCodeAt(i)));
  }
  bytes.push(0); // terminador nulo
  bytes.push(...PRO_SIGNATURE);

  // Bloco 3 — cadeia de sinal ativa.
  for (const entry of ai.cadeia || []) {
    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) continue; // efeito desconhecido: não ocupa espaço
    bytes.push(1); // status ON
    bytes.push(...fxidToBytes(fxid));
    for (const knob of entry.knobs || []) {
      bytes.push(clampByte(knob));
    }
  }

  // Bloco 4 — rodapé fixo de encerramento.
  bytes.push(...FOOTER_BYTES);

  return {
    bytes,
    base64: bytesToBase64(bytes),
    nomePatch,
  };
}

/**
 * Trigger a browser download of the built preset as a .prst file. The file
 * contents are the Base64 payload decoded back to binary so the editor
 * receives the exact byte stream the device expects.
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const byteChars = atob(built.base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${built.nomePatch || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
