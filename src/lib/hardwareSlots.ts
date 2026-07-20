// The Matribox II Pro (QME-200) exposes a fixed signal chain of exactly 10
// hardware slots, in this order. Every preset file must contain one block per
// slot — omitting an inactive slot shifts every following block out of
// position and the editor rejects the file. The UI mirrors the same order so
// what the user sees matches what gets written to disk.

export interface HardwareSlot {
  // Canonical hardware slot code, used as the on-wire slot identifier.
  code: string;
  // Human-readable label shown in the UI header for the slot.
  displayName: string;
  // Type string assigned to the resolved PresetModule so the icon resolver
  // in SignalBlock picks the correct module artwork.
  uiType: string;
  // Every module code that maps to this slot: the canonical code, the codes
  // the Gemini API may return in `cadeia[].modulo`, and the type labels the
  // rest of the UI already uses. Matching is case-insensitive.
  aliases: string[];
}

export const HARDWARE_SLOTS: HardwareSlot[] = [
  { code: 'DYN', displayName: 'Dynamics', uiType: 'DYN', aliases: ['DYN', 'DYNAMICS', 'COMP', 'COMPRESSOR', 'GATE'] },
  { code: 'FREQ', displayName: 'Filter / Pitch', uiType: 'FREQ', aliases: ['FREQ', 'FILTER', 'PITCH'] },
  { code: 'WAH', displayName: 'Wah', uiType: 'WAH', aliases: ['WAH'] },
  { code: 'DRV', displayName: 'Drive', uiType: 'DRIVE', aliases: ['DRV', 'DRIVE', 'OD', 'DIST', 'DISTORTION'] },
  { code: 'AMP', displayName: 'Amplifier', uiType: 'AMP', aliases: ['AMP', 'AMPLIFIER'] },
  { code: 'CAB', displayName: 'Cabinet', uiType: 'CAB', aliases: ['CAB', 'CABINET', 'IR'] },
  { code: 'MOD', displayName: 'Modulation', uiType: 'MOD', aliases: ['MOD', 'MODULATION', 'CHORUS', 'FLANGER', 'PHASER', 'TREMOLO'] },
  { code: 'DELAY', displayName: 'Delay', uiType: 'DELAY', aliases: ['DELAY', 'DLY'] },
  { code: 'RVB', displayName: 'Reverb', uiType: 'REVERB', aliases: ['RVB', 'REVERB'] },
  { code: 'VOL', displayName: 'Volume', uiType: 'VOLUME', aliases: ['VOL', 'VOLUME'] },
];

export const SLOT_COUNT = HARDWARE_SLOTS.length;

function norm(value: string): string {
  return (value || '').toUpperCase().trim();
}

// Locate the hardware slot a given module code belongs to. Returns undefined
// when the code does not map to any slot (e.g. a global EQ the AI emitted but
// the hardware has no dedicated slot for).
export function findSlotForCode(code: string): HardwareSlot | undefined {
  const c = norm(code);
  return HARDWARE_SLOTS.find((s) => s.aliases.includes(c));
}

// Find the index within `cadeia` of the entry that belongs to the hardware
// slot at `slotIndex`. Returns -1 when the AI did not activate that slot.
export function findCadeiaIndexForSlot(
  cadeia: { modulo?: string }[],
  slotIndex: number,
): number {
  const slot = HARDWARE_SLOTS[slotIndex];
  if (!slot) return -1;
  return cadeia.findIndex((e) => slot.aliases.includes(norm(e.modulo || '')));
}
