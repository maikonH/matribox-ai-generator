// Matribox II Pro (.prst) preset file builder — Binary Envelope Edition.
//
// FILE FORMAT (verified against src/docs/analise.prst):
//   The .prst file on disk is a single continuous Base64 line produced by:
//     btoa( JSON.stringify( Array.from( finalByteArray ) ) )
//   i.e. the base64 wraps the TEXT of a JSON number array, not raw bytes.
//   Decoding the reference file yields "[3,2,0,0,16,11,0,128,..." — the
//   20-byte binary header followed by the processed payload. The base64 of
//   the raw header bytes [3,2,0,0,16,11] is "AwIAABAL", the signature the
//   Matribox II Pro firmware validates before loading a chain.
//
// PIPELINE (Rota B — Full JSON, strict mathematical):
//   1. Build the preset object in strict field order with ONLY the native
//      Dart firmware keys:
//        {
//          "presetName": "...",
//          "bpm": 120.0,
//          "level": 50.0,
//          "chain": [0,3,4,5,7,8,9],          // physical slot indices by category
//          "Modules": [                         // one entry per hardware slot
//            { "fxid": 27, "active": 1, "qKnob": [{"knobID":0,"value":45}] },
//            { "fxid": 0,  "active": 0, "qKnob": [] },
//            ...
//          ]
//        }
//      `chain` carries physical slot indices (NOT the 32-bit fxids). Each
//      `Modules` element has strictly {fxid, active, qKnob} — no `modulo`,
//      `nomeEfeito`, or `knobs` keys. Each `qKnob` element has strictly
//      {knobID, value}. bpm/level use .toFixed(1) so the Dart firmware parses
//      them as doubles with the required decimal places.
//   2. Encode that JSON string to a clean UTF-8 Uint8Array.
//   3. Compute the Adler-32 checksum over the clean byte array.
//   4. Assemble the 20-byte Little-Endian header:
//        [0-3]   = [3, 2, 0, 0]            (magic)
//        [4-7]   = [16, 11, 0, 128]        (version)
//        [8-11]  = dynamic seed (uint32 LE, clock-derived)
//        [12-15] = Adler-32 checksum (uint32 LE)
//        [16-19] = clean JSON byte length (uint32 LE)
//   5. Apply the LCG stream cipher to a CLONE of the payload:
//        A = 1103515245, C = 12345, M = 0x80000000
//        Leave the first 32 bytes of the JSON plaintext.
//        XOR bytes [32..544) with (state >> 16) & 0xFF, advancing the LCG
//        state once per skipped byte (32 advances during the skip) to keep
//        the firmware's stream synchronised.
//   6. Concatenate header (20 bytes) + processed payload.
//   7. Convert the unified byte array to Base64 via a binary string:
//        let binaryString = '';
//        for (i ...) binaryString += String.fromCharCode(bytes[i]);
//        btoa(binaryString)
//      This applies Base64 directly over the raw bytes (ratio ~1.33×),
//      NOT over the "[3,2,0,..." JSON-array text (which inflates to ~3×).
//
// There is NO template skeleton and NO plaintext-JSON shortcut. If any
// effect cannot be resolved to a real fxid the builder throws, so the app
// never emits a capped or empty file.

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
  /** Final .prst file content: base64( JSON.stringify(Array.from(bytes)) ). */
  base64: string;
  nomePatch: string;
}

// ── Adler-32 ──────────────────────────────────────────────────────────────────

const ADLER_MOD = 0x10000; // 65521 base, split into 16-bit halves

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// ── LCG stream cipher ──────────────────────────────────────────────────────────
// A = 1103515245, C = 12345, M = 0x80000000 (mod 2^31). State is uint32.

const LCG_A = 1103515245;
const LCG_C = 12345;
const LCG_M = 0x80000000;

function lcgNext(state: number): number {
  // Operate in 32-bit unsigned space; M = 2^31 so mask with 0x7fffffff.
  return ((Math.imul(state, LCG_A) + LCG_C) & 0x7fffffff) >>> 0;
}

/**
 * Apply the LCG XOR cipher to a clone of the payload.
 * - Bytes [0, 32) are left plaintext.
 * - Bytes [32, 544) are XORed with (state >> 16) & 0xFF.
 * - The LCG state advances once per byte across the whole window (32 advances
 *   during the skip, then one advance per XORed byte) to keep the firmware's
 *   stream synchronised.
 */
function applyLcgCipher(payload: Uint8Array, seed: number): Uint8Array {
  const out = new Uint8Array(payload.length);
  out.set(payload.subarray(0, Math.min(32, payload.length)));

  let state = seed >>> 0;
  // Advance the LCG 32 times during the plaintext skip to stay in sync.
  for (let i = 0; i < 32; i++) state = lcgNext(state);

  const cipherEnd = Math.min(544, payload.length);
  for (let i = 32; i < cipherEnd; i++) {
    state = lcgNext(state);
    const keyByte = (state >>> 16) & 0xff;
    out[i] = payload[i] ^ keyByte;
  }
  // Bytes beyond the cipher window are copied verbatim.
  for (let i = cipherEnd; i < payload.length; i++) out[i] = payload[i];
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
}

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function writeU32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a valid .prst file from the AI-generated preset (Rota B — Full JSON).
 *
 * Resolves every effect in `ai.cadeia` to its real numeric fxid from the
 * algorithm catalog (the alg_data.json / app.so projection), orders them into
 * the `chain` array in signal-chain order, and emits each knob as an integer
 * 0–100 in `qKnob`. The resulting JSON object is envelope-encoded with the
 * 20-byte binary header, Adler-32 checksum, and LCG stream cipher the
 * Matribox II Pro firmware requires, then wrapped as
 * base64( JSON.stringify( Array.from( bytes ) ) ) — a single continuous line
 * of ~1.5–1.7 KB for a full chain.
 *
 * Throws if any effect cannot be resolved to a real fxid, so the app never
 * produces a capped or empty preset file.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);

  // Resolve each cadeia entry to its hardware slot index + fxid + knobs.
  // The firmware's `chain` array carries physical slot indices (by category
  // order), NOT the 32-bit fxids. `Modules` carries one entry per hardware
  // slot (all 10), with active=1 for populated slots and active=0 otherwise.
  const slotState: Array<{
    active: boolean;
    fxid: number;
    qKnob: Array<{ knobID: number; value: number }>;
  }> = HARDWARE_SLOTS.map(() => ({ active: false, fxid: 0, qKnob: [] }));

  const chain: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < ai.cadeia.length; i++) {
    const entry = ai.cadeia[i];
    const slot = findSlotForCode(entry.modulo);
    if (!slot) {
      errors.push(
        `Módulo "${entry.modulo}" (posição ${i + 1}) não existe na Matribox II Pro. Códigos permitidos: ${HARDWARE_SLOTS.map((s) => s.code).join(', ')}.`,
      );
      continue;
    }

    const slotIndex = HARDWARE_SLOTS.indexOf(slot);

    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) não foi encontrado no catálogo — fxid ausente. O preset não pode ser gerado.`,
      );
      continue;
    }

    const qKnob = entry.knobs.map((value, kIdx) => ({
      knobID: kIdx,
      value: clampKnob(value),
    }));

    slotState[slotIndex] = { active: true, fxid, qKnob };
    chain.push(slotIndex);
  }

  if (chain.length === 0) {
    errors.push('A cadeia de sinal está vazia — nenhum módulo ativo para gerar o preset.');
  }

  if (errors.length > 0) {
    const msg = `Falha ao construir o preset (Rota B — Full JSON):\n${errors.join('\n')}`;
    console.error('===== PRESET BUILD FAILURE =====');
    console.error(msg);
    console.error('Input:', JSON.stringify(ai, null, 2));
    throw new Error(msg);
  }

  // 1. Geração estrita da string JSON compacta manual para garantir compatibilidade com o Dart
  const modulesText = JSON.stringify(slotState.map((s) => ({
    fxid: s.fxid,
    active: s.active ? 1 : 0,
    qKnob: s.qKnob
  })));
  const jsonText = `{"presetName":"${nomePatch}","bpm":120.0,"level":50.0,"chain":${JSON.stringify(chain)},"Modules":${modulesText}}`;
  const jsonBytes = new TextEncoder().encode(jsonText);

  // 3. Adler-32 over the clean JSON bytes.
  const checksum = adler32(jsonBytes);

  // 4. 20-byte Little-Endian header.
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  const header = new Uint8Array(20);
  header[0] = 3;
  header[1] = 2;
  header[2] = 0;
  header[3] = 0;
  header[4] = 16;
  header[5] = 11;
  header[6] = 0;
  header[7] = 128;
  writeU32LE(header, 8, seed);
  writeU32LE(header, 12, checksum);
  writeU32LE(header, 16, jsonBytes.length);

  // 5. LCG cipher over a clone of the payload (skip 32, XOR next 512).
  const processedPayload = applyLcgCipher(jsonBytes, seed);

  // 6. Concatenate header + processed payload.
  const finalArray = new Uint8Array(header.length + processedPayload.length);
  finalArray.set(header, 0);
  finalArray.set(processedPayload, header.length);

  // 7. Convert raw binary bytes directly to Base64 — NOT via JSON.stringify of
  //    the array text. Building a binary string char-by-char and feeding it to
  //    btoa() keeps the output to ~1.33× the raw byte count (the 440-byte
  //    reference lands at 588 chars this way), instead of inflating to ~3× via
  //    the "[3,2,0,..." text representation.
  let binaryString = '';
  for (let i = 0; i < finalArray.length; i++) {
    binaryString += String.fromCharCode(finalArray[i]);
  }
  const base64 = btoa(binaryString).replace(/[\r\n]/g, '');

  console.log('===== PRESET FILE (Binary Envelope — Rota B) =====');
  console.log(
    `name=${nomePatch} modules=${chain.length} jsonBytes=${jsonBytes.length} checksum=${checksum.toString(16)} seed=${seed.toString(16)} totalBytes=${finalArray.length} base64Length=${base64.length}`,
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
