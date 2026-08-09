// ════════════════════════════════════════════════════════════════════════════
// MATRIBOX II PRO — .prst ENGINE (FIXED-SIZE PARAMETER PATCHING)
// ════════════════════════════════════════════════════════════════════════════
//
// This engine replaces the old dynamic-splicing / LCG-encryption approach with
// a fixed-size skeleton patching architecture. The output is ALWAYS a 427-byte
// skeleton (ALL_ACTIVE_SKELETON from codec.ts) with name, routing, and per-block
// parameter bytes patched in place. This eliminates any risk of memory access
// violations on the device's JUCE C++ reader, which expects a fixed layout.

import type { GeneratedPreset } from './types';
import type { MatriboxPreset, EffectBlock, BlockParameter } from '../types/matribox';
import { HARDWARE_SLOTS, findSlotForCode } from './hardwareSlots';
import { encodePreset } from '../utils/codec';

function clampKnob(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Convert the AI-generated GeneratedPreset into the MatriboxPreset shape the
 * codec expects: a blocks map keyed by hardware blockId, with numeric fxIds
 * and clamped parameter values.
 */
function toMatriboxPreset(preset: GeneratedPreset): MatriboxPreset {
  const blocks: { [key: number]: EffectBlock } = {};
  const routing: number[] = [];

  for (const mod of preset.modules) {
    const slot = findSlotForCode(mod.type) ?? HARDWARE_SLOTS.find((s) => s.code === mod.fxId || s.aliases.includes(mod.fxId.toUpperCase()));
    if (!slot) continue;

    const fxIdNum = Number(mod.fxId);
    if (!Number.isFinite(fxIdNum)) continue;

    const parameters: BlockParameter[] = mod.params.map((p, i) => ({
      id: i,
      name: p.name,
      value: clampKnob(p.value),
    }));

    blocks[slot.blockId] = {
      blockId: slot.blockId,
      fxId: fxIdNum,
      enabled: mod.enabled !== false,
      parameters,
    };

    routing.push(slot.blockId);
  }

  return {
    name: preset.title,
    routing,
    blocks,
  };
}

export function buildPresetFile(preset: GeneratedPreset): string {
  const matriboxPreset = toMatriboxPreset(preset);
  const base64Data = encodePreset(matriboxPreset);
  return JSON.stringify({ version: 1, data: base64Data });
}

export function downloadPresetFile(preset: GeneratedPreset): void {
  const fileContent = buildPresetFile(preset);
  const blob = new Blob([fileContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.title.replace(/[^A-Za-z0-9]/g, '') || 'preset'}.prst`;
  a.click();
  URL.revokeObjectURL(url);
}
