// Matribox II Pro real-time MIDI CC builder.
//
// Instead of compiling a physical .prst byte file, this module translates the
// AI-generated signal chain into a sequence of Control Change (CC) messages
// that are pushed live to the pedalboard over Web MIDI. The pedalboard applies
// every CC to its live RAM instantly; the musician then presses the physical
// SAVE button on the unit to persist the timbre.
//
// CC map (official reverse-engineering of the hardware):
//   CC7  — Volume Geral (master volume)
//   CC11 — Pedal de Expressão (expression pedal)
//   CC43..CC54 — Ativação dos blocos 1..12 (0 = OFF, 127 = ON)
//   CC16, CC18, CC20 — Knobs rápidos 1, 2, 3 (0–127)
//
// The AI returns a chain of modules, each with knob values 0–100. We map the
// active modules onto the 12 hardware block slots (in signal-chain order) and
// derive the three quick knobs from the first three active modules' primary
// knob. Master volume comes from the VOL module when present.

import { findSlotForCode, HARDWARE_SLOTS } from './hardwareSlots';
import { resolveFxId } from './algorithmCatalog';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';

export interface MidiCCCommand {
  cc: number;
  value: number;
  label: string;
}

export interface BuiltMidiPreset {
  commands: MidiCCCommand[];
  nomePatch: string;
  comentario: string;
}

// ── CC constants ─────────────────────────────────────────────────────────────

export const CC_VOLUME = 7;
export const CC_EXPRESSION = 11;
export const CC_BLOCK_BASE = 43; // CC43 = bloco 1 … CC54 = bloco 12
export const CC_BLOCK_COUNT = 12;
export const CC_KNOB = [16, 18, 20]; // quick knobs 1, 2, 3

const BLOCK_ON = 127;
const BLOCK_OFF = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Map a 0–100 knob value to the 0–127 MIDI range. */
function toMidiRange(value: number): number {
  return Math.round((clampKnob(value) / 100) * 127);
}

/**
 * Build the CC command sequence for the pedalboard from the AI response.
 * Throws if any module/effect cannot be resolved.
 */
export function buildMidiPreset(ai: AiPresetResponse): BuiltMidiPreset {
  const errors: string[] = [];

  // Validate every chain entry against the catalog before emitting anything.
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
        `Efeito "${entry.nomeEfeito}" (posição ${i + 1}) não foi encontrado no catálogo.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Falha ao construir os comandos MIDI:\n${errors.join('\n')}`);
  }

  const commands: MidiCCCommand[] = [];

  // Active modules are assigned to consecutive block slots (1..12) in the
  // order the AI returned them.
  const activeEntries: ChainEntry[] = [];
  for (let i = 0; i < ai.cadeia.length && i < CC_BLOCK_COUNT; i++) {
    activeEntries.push(ai.cadeia[i]);
  }

  // 1. Per-block: send the quick-knob parameter FIRST, then immediately the
  //    block activation command (127 = ON). This guarantees the pedalboard
  //    receives the parameter change and then lights up the block — no active
  //    block is ever left in bypass (value 0).
  for (let i = 0; i < CC_BLOCK_COUNT; i++) {
    const cc = CC_BLOCK_BASE + i;
    const entry = activeEntries[i];

    if (entry) {
      // Quick knob parameter for this block (only the first 3 blocks expose a
      // quick knob on CC16/CC18/CC20).
      if (i < CC_KNOB.length && entry.knobs.length > 0) {
        const midi = toMidiRange(entry.knobs[0]);
        commands.push({
          cc: CC_KNOB[i],
          value: midi,
          label: `Knob ${i + 1} = ${entry.knobs[0]}% (bloco ${i + 1})`,
        });
      }
      // Force activation ON immediately after the parameter.
      commands.push({
        cc,
        value: BLOCK_ON,
        label: `Ativar bloco ${i + 1} (${entry.nomeEfeito}) → CC${cc} = 127`,
      });
    } else {
      // Unused block: explicitly turn it OFF.
      commands.push({
        cc,
        value: BLOCK_OFF,
        label: `Desativar bloco ${i + 1} → CC${cc} = 0`,
      });
    }
  }

  // 2. Master volume (CC7). Use the VOL module's primary knob when present;
  //    otherwise default to a safe 90%.
  const volEntry = ai.cadeia.find(
    (e) => findSlotForCode(e.modulo)?.uiType === 'VOLUME',
  );
  const masterVol = volEntry && volEntry.knobs.length > 0
    ? toMidiRange(volEntry.knobs[0])
    : Math.round(0.9 * 127);
  commands.push({ cc: CC_VOLUME, value: masterVol, label: 'Volume Geral (CC7)' });

  // 3. Expression pedal (CC11) — neutral heel-down by default.
  commands.push({ cc: CC_EXPRESSION, value: 0, label: 'Pedal de Expressão (CC11)' });

  return {
    commands,
    nomePatch: ai.nomePatch,
    comentario: ai.comentario,
  };
}
