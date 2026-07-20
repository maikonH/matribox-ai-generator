// Matribox II Pro (QME-200) preset file builder.
//
// The device stores presets as a flat linear byte stream: a fixed header,
// the patch name as ASCII + a PRO signature, the signal chain as exactly 10
// slot blocks (one per hardware position), and a fixed footer. Each slot is
// always present — an inactive slot is written as a zeroed block so the
// following slots stay aligned to the positions the editor expects.
//
// The fxid values in alg_data.json are 32-bit integers (e.g. 50331648 for
// the first DRV). They are serialized here as 4 individual bytes in
// little-endian order, which is what the official Matribox editor expects.

import algData from '../data/alg_data.json';
import { HARDWARE_SLOTS, findCadeiaIndexForSlot } from './hardwareSlots';

type AlgEntry = {
  fxid: number;
  fxtitle: string;
  name?: string;
  type?: string;
  widget?: { name: string }[];
};

type AlgModule = { name: string; alg: AlgEntry[] };

const MODULES: AlgModule[] = (algData as { Modules: AlgModule[] }).Modules;

// fxTitle → fxid and name → fxid lookups, built once from the local catalog.
// The AI is prompted with fxTitles, but historically it sometimes returns the
// internal `name` field (e.g. "Skreamer" instead of the fxTitle "Green Drive").
// Resolving against both keeps every active effect from being silently
// dropped — which was the root cause of the 76-byte truncated preset bug.
const FX_TITLE_TO_ID = new Map<string, number>();
const FX_NAME_TO_ID = new Map<string, number>();
for (const mod of MODULES) {
  for (const alg of mod.alg) {
    FX_TITLE_TO_ID.set((alg.fxtitle || '').toLowerCase(), alg.fxid);
    if (alg.name) FX_NAME_TO_ID.set(alg.name.toLowerCase(), alg.fxid);
  }
}

// Standard empty block: status byte 0 (OFF) + 4 zeroed fxid bytes. Knobs are
// omitted because the effect is bypassed — the hardware reads the 0 status
// and skips straight to the next slot.
const EMPTY_BLOCK: number[] = [0, 0, 0, 0, 0];

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
 * Resolve the fxid for a given effect name. The AI is instructed to return the
 * fxTitle, but it sometimes returns the internal `name` instead, so we look up
 * both. Returns undefined only when neither matches — the caller decides how
 * to handle it.
 */
export function resolveFxId(nomeEfeito: string): number | undefined {
  const key = (nomeEfeito || '').toLowerCase().trim();
  if (!key) return undefined;
  const byTitle = FX_TITLE_TO_ID.get(key);
  if (byTitle !== undefined) return byTitle;
  return FX_NAME_TO_ID.get(key);
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

  // Bloco 3 — cadeia de sinal em slots de hardware fixos.
  // A pedaleira Matribox II Pro reserva exatamente 10 posições (DYN, FREQ,
  // WAH, DRV, AMP, CAB, MOD, DELAY, RVB, VOL). Iteramos obrigatoriamente nesta
  // sequência para que cada bloco ocupe sua posição correta; slots não usados
  // pela IA são preenchidos com o bloco vazio padrão, mantendo o
  // alinhamento de tamanho que o software oficial exige.
  const cadeia = ai.cadeia || [];
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[presetBuilder] buildPresetFile: ${cadeia.length} módulos na cadeia (${HARDWARE_SLOTS.length} slots fixos)`,
  );
  let resolvedCount = 0;
  let skippedCount = 0;
  for (let slotIndex = 0; slotIndex < HARDWARE_SLOTS.length; slotIndex++) {
    const slot = HARDWARE_SLOTS[slotIndex];
    // Varre a cadeia da IA procurando a entrada cujo `modulo` pertence a
    // este slot de hardware. Aceita qualquer alias definido em hardwareSlots.
    // Pega a PRIMEIRA ocorrência; entradas adicionais do mesmo tipo são
    // ignoradas (a pedaleira só tem um slot de cada).
    const entryIndex = findCadeiaIndexForSlot(cadeia, slotIndex);
    const entry = entryIndex >= 0 ? cadeia[entryIndex] : undefined;

    if (!entry) {
      // Slot vazio: bloco zerado padrão do hardware.
      bytes.push(...EMPTY_BLOCK);
      // eslint-disable-next-line no-console
      console.log(`[presetBuilder] EMPTY: ${slot.code} → ${EMPTY_BLOCK.join(',')}`);
      continue;
    }

    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) {
      // Efeito não resolvido no catálogo: ainda assim o slot precisa existir
      // para manter o alinhamento, então emitimos o bloco vazio.
      skippedCount++;
      bytes.push(...EMPTY_BLOCK);
      // eslint-disable-next-line no-console
      console.warn(
        `[presetBuilder] SKIP: "${entry.nomeEfeito}" (${slot.code}) — fxid não encontrado, slot preenchido com bloco vazio`,
      );
      continue;
    }
    resolvedCount++;
    // eslint-disable-next-line no-console
    console.log(
      `[presetBuilder] OK: ${slot.code} "${entry.nomeEfeito}" → fxid=${fxid} (0x${fxid.toString(16)}) knobs=[${(entry.knobs || []).join(', ')}]`,
    );
    bytes.push(1); // status ON
    bytes.push(...fxidToBytes(fxid));
    for (const knob of entry.knobs || []) {
      bytes.push(clampByte(knob));
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[presetBuilder] Resumo: ${resolvedCount} módulos inseridos, ${skippedCount} ignorados, ${bytes.length} bytes antes do rodapé`,
  );
  // eslint-disable-next-line no-console
  console.groupEnd();

  // Bloco 4 — rodapé fixo de encerramento.
  bytes.push(...FOOTER_BYTES);

  return {
    bytes,
    base64: bytesToBase64(bytes),
    nomePatch,
  };
}

/**
 * Trigger a browser download of the built preset as a .prst file. The pedal
 * editor expects a plain-text file whose sole contents are the Base64-encoded
 * byte stream — raw binary is rejected, so we must NOT decode back to bytes.
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const blob = new Blob([built.base64], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${built.nomePatch || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
