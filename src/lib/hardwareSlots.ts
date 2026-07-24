// Matribox II Pro hardware slot definitions.
//
// The device has 10 named hardware slots in a fixed signal chain order.
// The firmware identifies active modules via the `chain` array in the preset
// JSON (an array of fxids in signal-chain order), not by positional padding.

export interface HardwareSlot {
  code: string;
  displayName: string;
  uiType: string;
  // All codes (canonical + aliases) the Gemini API may emit in cadeia[].modulo.
  // Matching is case-insensitive and whitespace-trimmed.
  aliases: string[];
}

export const HARDWARE_SLOTS: HardwareSlot[] = [
  { code: 'DYN',   displayName: 'Dynamics',       uiType: 'DYN',    aliases: ['DYN', 'DYNAMICS', 'COMP', 'COMPRESSOR', 'GATE'] },
  { code: 'FREQ',  displayName: 'Filter / Pitch',  uiType: 'FREQ',   aliases: ['FREQ', 'FILTER', 'PITCH'] },
  { code: 'WAH',   displayName: 'Wah',             uiType: 'WAH',    aliases: ['WAH'] },
  { code: 'DRV',   displayName: 'Drive',           uiType: 'DRIVE',  aliases: ['DRV', 'DRIVE', 'OD', 'DIST', 'DISTORTION'] },
  { code: 'AMP',   displayName: 'Amplifier',       uiType: 'AMP',    aliases: ['AMP', 'AMPLIFIER'] },
  { code: 'CAB',   displayName: 'Cabinet',         uiType: 'CAB',    aliases: ['CAB', 'CABINET', 'IR'] },
  { code: 'MOD',   displayName: 'Modulation',      uiType: 'MOD',    aliases: ['MOD', 'MODULATION', 'CHORUS', 'FLANGER', 'PHASER', 'TREMOLO'] },
  { code: 'DELAY', displayName: 'Delay',           uiType: 'DELAY',  aliases: ['DELAY', 'DLY'] },
  { code: 'RVB',   displayName: 'Reverb',          uiType: 'REVERB', aliases: ['RVB', 'REVERB'] },
  { code: 'VOL',   displayName: 'Volume',          uiType: 'VOLUME', aliases: ['VOL', 'VOLUME'] },
];

export const SLOT_COUNT = HARDWARE_SLOTS.length;

function norm(value: string): string {
  return (value || '').toUpperCase().trim();
}

export function findSlotForCode(code: string): HardwareSlot | undefined {
  const c = norm(code);
  return HARDWARE_SLOTS.find((s) => s.aliases.includes(c));
}
