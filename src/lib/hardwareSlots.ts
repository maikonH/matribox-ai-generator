// Matribox II Pro hardware slot definitions.
//
// The device has 16 named hardware slots in a fixed signal chain order.
// Each slot maps to a blockId (the module index from alg_data.json) that the
// firmware uses to locate the block's region in the 427-byte preset skeleton.

export interface HardwareSlot {
  code: string;
  blockId: number;
  displayName: string;
  uiType: string;
  aliases: string[];
}

export const HARDWARE_SLOTS: HardwareSlot[] = [
  { code: 'DYN',    blockId: 0,  displayName: 'Dynamics',       uiType: 'DYN',    aliases: ['DYN', 'DYNAMICS', 'COMP', 'COMPRESSOR', 'GATE'] },
  { code: 'FREQ',   blockId: 1,  displayName: 'Filter / Pitch',  uiType: 'FREQ',   aliases: ['FREQ', 'FILTER', 'PITCH'] },
  { code: 'WAH',    blockId: 2,  displayName: 'Wah',             uiType: 'WAH',    aliases: ['WAH'] },
  { code: 'DRV',    blockId: 3,  displayName: 'Drive',          uiType: 'DRIVE',  aliases: ['DRV', 'DRIVE', 'OD', 'DIST', 'DISTORTION'] },
  { code: 'AMP',    blockId: 4,  displayName: 'Amplifier',      uiType: 'AMP',    aliases: ['AMP', 'AMPLIFIER'] },
  { code: 'CAB',    blockId: 5,  displayName: 'Cabinet',         uiType: 'CAB',    aliases: ['CAB', 'CABINET'] },
  { code: 'IR',     blockId: 6,  displayName: 'Impulse Response', uiType: 'IR',    aliases: ['IR', 'IMPULSE', 'IMPULSE_RESPONSE'] },
  { code: 'EQ',     blockId: 7,  displayName: 'Equalizer',       uiType: 'EQ',     aliases: ['EQ', 'EQUALIZER'] },
  { code: 'MOD',    blockId: 8,  displayName: 'Modulation',      uiType: 'MOD',    aliases: ['MOD', 'MODULATION', 'CHORUS', 'FLANGER', 'PHASER', 'TREMOLO'] },
  { code: 'DLY',    blockId: 9,  displayName: 'Delay',           uiType: 'DELAY',  aliases: ['DLY', 'DELAY'] },
  { code: 'RVB',    blockId: 10, displayName: 'Reverb',          uiType: 'REVERB', aliases: ['RVB', 'REVERB'] },
  { code: 'CLONE',  blockId: 11, displayName: 'Clone',           uiType: 'CLONE',  aliases: ['CLONE'] },
  { code: 'FXLOOP', blockId: 12, displayName: 'FX Loop',         uiType: 'FXLOOP', aliases: ['FXLOOP', 'FX_LOOP'] },
  { code: 'FXSND',  blockId: 13, displayName: 'FX Send',         uiType: 'FXSND',  aliases: ['FXSND', 'FX_SEND', 'SND'] },
  { code: 'FXRTN',  blockId: 14, displayName: 'FX Return',       uiType: 'FXRTN',  aliases: ['FXRTN', 'FX_RETURN', 'RTN'] },
  { code: 'VOL',    blockId: 15, displayName: 'Volume',          uiType: 'VOLUME', aliases: ['VOL', 'VOLUME'] },
];

export const SLOT_COUNT = HARDWARE_SLOTS.length;

function norm(value: string): string {
  return (value || '').toUpperCase().trim();
}

export function findSlotForCode(code: string): HardwareSlot | undefined {
  const c = norm(code);
  return HARDWARE_SLOTS.find((s) => s.aliases.includes(c));
}
