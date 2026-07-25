// Matribox II Pro (.prst) preset file builder — Skeleton Mutator Edition.
//
// FILE FORMAT (verified against src/data/01-B_Love_of_God.prst):
//   The .prst file on disk is a single continuous Base64 line produced by:
//     btoa( JSON.stringify( Array.from( byteArray440 ) ) )
//   i.e. the base64 wraps the TEXT of a JSON number array, not raw bytes.
//   Decoding the reference file yields a 440-element numeric array — the
//   fixed-size binary skeleton the Matribox II Pro firmware expects.
//
// SKELETON MUTATOR APPROACH:
//   Instead of generating JSON text from scratch (which inflates the file
//   beyond the firmware's memory), we load a stable 440-byte factory preset
//   as an immutable base matrix and mutate ONLY the audio-data bytes at
//   verified fixed offsets:
//
//   OFFSET  LAYOUT                                          STATUS
//   30      Preset name (ASCII, null-terminated, max 12ch)  VERIFIED
//   175     8 × fxid (uint32 LE) — the signal chain          VERIFIED
//   222     32 × knob value (uint8, 0-100) — one byte each      VERIFIED
//
//   No textual JSON keys, braces, or strings are injected into the payload.
//   The 440 bytes stay rigid. The output is always exactly 440 elements,
//   producing the same compact Base64 line length as the factory presets.

import referenceBase64 from '../data/01-B_Love_of_God.prst?raw';
import { resolveFxId } from './algorithmCatalog';
import { findSlotForCode, HARDWARE_SLOTS } from './hardwareSlots';

// ── Public types ──────────────────────────────────────────────────────────────

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
  /** Final .prst file content: btoa( JSON.stringify( Array.from( bytes440 ) ) ). */
  base64: string;
  nomePatch: string;
}

// ── Constants (verified offsets) ─────────────────────────────────────────────

const SKELETON_SIZE = 440;
const NAME_OFFSET = 30;
const NAME_MAX_LENGTH = 12;
const FXID_OFFSET = 175;
const FXID_COUNT = 8;
const FXID_SIZE = 4; // uint32 LE
const KNOB_OFFSET = 222;
const KNOB_COUNT = 32;
const KNOB_SIZE = 1; // uint8 — one byte per knob (0-100)

// ── Base skeleton loader ─────────────────────────────────────────────────────

let cachedSkeleton: number[] | null = null;

function loadBaseSkeleton(): number[] {
  if (cachedSkeleton) return cachedSkeleton.slice();
  const text = referenceBase64.trim();
  const decoded = atob(text);
  const arr = JSON.parse(decoded) as number[];
  if (arr.length !== SKELETON_SIZE) {
    throw new Error(
      `Esqueleto base inválido: esperado ${SKELETON_SIZE} bytes, recebido ${arr.length}.`,
    );
  }
  cachedSkeleton = arr;
  return arr.slice();
}

// ── Byte writers ──────────────────────────────────────────────────────────────

function writeU32LE(target: number[], offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, NAME_MAX_LENGTH);
  return cleaned || 'Preset';
}

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a valid .prst file from the AI-generated preset (Skeleton Mutator).
 *
 * Loads the 440-byte factory skeleton, patches the preset name at offset 30,
 * the 8 chain fxids (uint32 LE) at offset 175, and the 32 knob values
 * (uint8, 0–100, one byte each) at offset 222. The 440 bytes stay rigid —
 * no textual JSON is injected — and the result is encoded as
 * btoa(JSON.stringify(Array.from(bytes440))), producing the same compact
 * single-line Base64 as factory presets.
 *
 * Throws if any effect cannot be resolved to a real fxid.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);

  // Start from the immutable factory skeleton.
  const bytes = loadBaseSkeleton();

  // Resolve each cadeia entry to its fxid + knob values.
  const errors: string[] = [];
  const fxids: number[] = [];
  const knobs: number[] = [];

  for (let i = 0; i < ai.cadeia.length && i < FXID_COUNT; i++) {
    const entry = ai.cadeia[i];

    const slot = findSlotForCode(entry.modulo);
    if (!slot) {
      errors.push(
        `Módulo "${entry.modulo}" (posição ${i + 1}) não existe na Matribox II Pro. Códigos permitidos: ${HARDWARE_SLOTS.map((s) => s.code).join(', ')}.`,
      );
      continue;
    }

    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) não foi encontrado no catálogo — fxid ausente. O preset não pode ser gerado.`,
      );
      continue;
    }

    fxids.push(fxid);

    // Collect knob values, clamped to 0–100. Each module contributes its
    // params in order; the 32-slot knob table is filled sequentially.
    for (const raw of entry.knobs) {
      if (knobs.length < KNOB_COUNT) {
        knobs.push(clampKnob(raw));
      }
    }
  }

  if (fxids.length === 0) {
    errors.push('A cadeia de sinal está vazia — nenhum módulo ativo para gerar o preset.');
  }

  if (errors.length > 0) {
    const msg = `Falha ao construir o preset (Skeleton Mutator):\n${errors.join('\n')}`;
    console.error('===== PRESET BUILD FAILURE =====');
    console.error(msg);
    console.error('Input:', JSON.stringify(ai, null, 2));
    throw new Error(msg);
  }

  // 1. Patch the preset name at offset 30 (ASCII, null-terminated).
  for (let i = 0; i < NAME_MAX_LENGTH; i++) {
    bytes[NAME_OFFSET + i] = i < nomePatch.length ? nomePatch.charCodeAt(i) : 0;
  }

  // 2. Patch the 8 fxids (uint32 LE) at offset 175.
  for (let i = 0; i < FXID_COUNT; i++) {
    if (i < fxids.length) {
      writeU32LE(bytes, FXID_OFFSET + i * FXID_SIZE, fxids[i]);
    } else {
      // Zero out unused fxid slots.
      writeU32LE(bytes, FXID_OFFSET + i * FXID_SIZE, 0);
    }
  }

  // 3. Patch the 32 knob values (uint8, 0–100) at offset 222. Each knob is a
  //    single byte, so the 32 values occupy bytes 222–253; the footer bytes
  //    254–439 of the original skeleton remain untouched and aligned.
  for (let i = 0; i < KNOB_COUNT; i++) {
    bytes[KNOB_OFFSET + i * KNOB_SIZE] = i < knobs.length ? knobs[i] : 0;
  }

  // 4. Lock the rigid 440-element limit. The audio block (offsets 175–253)
  //    contains ONLY pure numbers: uint32 fxids and uint8 knob values. No
  //    textual strings, keys, or substructures are ever injected. The footer
  //    bytes 254–439 of the original skeleton stay 100% untouched.
  if (bytes.length !== SKELETON_SIZE) {
    throw new Error(
      `Violação de limite físico: array tem ${bytes.length} elementos, esperado exatamente ${SKELETON_SIZE}.`,
    );
  }
  for (let i = 0; i < bytes.length; i++) {
    if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) {
      throw new Error(
        `Byte inválido na posição ${i}: valor=${bytes[i]} — apenas inteiros 0–255 são permitidos no payload.`,
      );
    }
  }

  // 5. Encode as btoa( JSON.stringify( Array.from( bytes440 ) ) ).
  const jsonText = JSON.stringify(bytes);
  const base64 = btoa(jsonText);

  console.log('===== PRESET FILE (Skeleton Mutator) =====');
  console.log(
    `name="${nomePatch}" modules=${fxids.length} knobs=${knobs.length} bytes=${bytes.length} base64Length=${base64.length}`,
  );

  return { base64, nomePatch };
}

/**
 * Trigger a browser download of the preset as a .prst file.
 *
 * The file content is a single continuous Base64 line — the exact text the
 * Matribox II Pro desktop manager reads and decodes. The Blob carries the
 * Base64 string verbatim (no `data:` URI decoding in between).
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const blob = new Blob([built.base64], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(built.nomePatch || 'preset').replace(/\s+/g, '_')}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
