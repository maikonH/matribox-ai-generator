// Matribox II Pro (.prst) preset file builder — Full JSON Edition (Rota B).
//
// FILE FORMAT:
//   The .prst file on disk contains a single continuous Base64 line.
//   Decoding that Base64 yields the TEXT of a compact JSON object describing
//   the preset: the patch name, the ordered `chain` of active modules, each
//   with its real numeric `fxid` (looked up from the catalog/app.so data) and
//   its `qKnob` array of integer values 0–100.
//
//   Pipeline: file → base64 decode → JSON.parse → preset object
//   Build:     preset object → JSON.stringify (compact) → base64 encode → file
//
// There is NO template skeleton, NO bypass padding, NO name-only mask. Every
// byte of the output is derived from the real effect choices and knob values.
// If any effect cannot be resolved to a real fxid, the build throws — the app
// never emits a capped/empty file.

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
  /** Compact JSON text of the preset object (pre-base64). */
  json: string;
  /** Base64 of the JSON text — the .prst file content. */
  base64: string;
  nomePatch: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
}

/** Clamp a knob value to the 0–100 integer range the device expects. */
function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

interface PresetModuleEntry {
  modulo: string;
  fxid: number;
  nomeEfeito: string;
  qKnob: number[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a valid .prst file from the AI-generated preset (Rota B — Full JSON).
 *
 * Resolves every effect in `ai.cadeia` to its real numeric fxid from the
 * algorithm catalog (the alg_data.json / app.so projection), orders them into
 * the `chain` array in signal-chain order, and emits each knob as an integer
 * 0–100 in `qKnob`. The result is encoded as base64( JSON.stringify(object) )
 * — a single continuous Base64 line of ~1.5–1.7 KB for a full chain, matching
 * the size the Matribox II Pro firmware requires to load a complete effect
 * chain.
 *
 * Throws if any effect cannot be resolved to a real fxid, so the app never
 * produces a capped or empty preset file.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);

  const chain: PresetModuleEntry[] = [];
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

    const fxid = resolveFxId(entry.nomeEfeito);
    if (fxid === undefined) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) não foi encontrado no catálogo — fxid ausente. O preset não pode ser gerado.`,
      );
      continue;
    }

    const qKnob = entry.knobs.map(clampKnob);

    chain.push({
      modulo: slot.code,
      fxid,
      nomeEfeito: entry.nomeEfeito,
      qKnob,
    });
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

  const presetObject = {
    name: nomePatch,
    chain: chain.map((m) => ({
      modulo: m.modulo,
      fxid: m.fxid,
      nomeEfeito: m.nomeEfeito,
      qKnob: m.qKnob,
    })),
  };

  const json = JSON.stringify(presetObject);
  const base64 = btoa(json);

  console.log('===== PRESET FILE (Full JSON — Rota B) =====');
  console.log(`name=${nomePatch} modules=${chain.length} jsonBytes=${json.length} base64Length=${base64.length}`);

  return { json, base64, nomePatch };
}

/**
 * Trigger a browser download of the preset as a .prst file.
 *
 * The file content is a single continuous Base64 line — the exact text the
 * Matribox II Pro desktop manager reads and decodes. Using a Blob (not a
 * `data:...;base64,` URI) ensures the browser writes the Base64 string
 * verbatim instead of decoding it back to plaintext.
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
