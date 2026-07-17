import type { GeneratedPreset } from './types';

// ============================================================================
// Matribox II Pro — definitive genetic map (reverse-engineered master buffer)
// ----------------------------------------------------------------------------
// This 423-byte array was captured from real hardware with EVERY block
// (FX, AMP, CAB, EQ, MOD, DLY, RVB) engaged simultaneously. It is the
// authoritative BASE BUFFER: we clone it verbatim and only patch the
// algorithm-ID bytes and the slider-value "drawers" at their exact offsets.
//
// IMPORTANT: the array is plain numbers end-to-end. Never coerce to Uint8Array
// — historical templates carried a float at a drawer offset and integer
// truncation corrupted the round-trip. We keep numbers as-is and re-encode
// via JSON.stringify + btoa, matching the .prst container format.
// ============================================================================
const MASTER_B64 =
  'WzMsMiwwLDAsMTYsMTEsMCwxMjgsMCw1LDEsNCwzLDEyLDEsNSwxLDE1LDEwNSwyLDEwNSwxNjQsMiwwLDIsMSw2MCwxODUsNDEsNjAsNzcsOTcsMTE2LDExNCwxMDUsOTgsMTExLDEyMCwzMiw3Myw3MywzMiw4MCw4Miw3OSwxMzIsMywxLDYwLDgyLDI1LDgxLDE0MCwwLDEsMjksMTMsODgsNjAsMTA4LDAsMSwyMywxNTYsOTQsNjAsMTA4LDAsMSwxMTIsMTA5LDEwMiw2MCwxMDgsMCwxLDE3NCwxMjMsMTA4LDYwLDEwOCwwLDEsMTE4LDUwLDExNiw2MCwxMDgsMCwxLDU1LDI3LDEyMyw2MCwxMDgsMCwxLDEzMyw5MywxMjksNjAsMTEwLDAsNzIsMTc5LDE1Niw4LDE0NCwwLDk3LDE0LDEwLDE2NCwxLDQsMSwyNTUsMjU1LDEzLDAsMCwwLDEwMSwyLDE1LDEzMiwyLDMsMywxLDEsMiwzLDQsMTA3LDEsNywwLDUsMTIxLDIsNzYsMTA4LDEsMSwwLDQsMSwwLDEyNCwyLDQsNSw2LDcsMTEsOSwxMCwyNTUsMTcyLDEsMyw3LDgsMjU1LDEwLDE1LDksMTIwLDMsMCw5LDc4LDAsMCwxLDgsMCwwLDUsMCwwLDAsMywxMDQsMCwwLDcsMzYsMCwwLDEwLDUzLDAsMCwxLDEsMCwwLDEzNiw5LDksMTEsMCwwLDEyLDMsMCwwLDYsMSwwLDAsMTEsMTEwLDEwLDIzMCwyLDExNiw2LDcsNSwxLDAsMCwxNjAsNjUsMCwwLDcyLDY2LDExNiwxLDMyLDE3LDEyLDAsNDMsMjIwLDAsMiw2NSwwLDAsMzIsNjUsMzIsOSwxMiwxLDEwOCw3LDQyLDEyLDAsMzIsOSwyMjgsMCw1LDAsMCwzMiw2NiwwLDAsMTQwLDY2LDMyLDIxLDIyMCwyLDQyLDIwNCwxLDQyLDQ0LDAsMzIsNywyNTIsMSwxMDgsNiw0MiwxNzIsMCwzLDE1Miw2NSwwLDY2LDE1Niw3MCw0Miw2OCwwLDMyLDksNDQsMCw0Niw0NCwxLDU0LDIyOCwwLDE1Nyw0LDYzLDMyLDIxLDE4OCwzLDEyNiw1OSwyNTAsNjcsMzIsMjEsMjM3LDAsMjAwLDIyMCw1NywxMjQsMTUsNDIsMTIsMCw1NCwxNTYsMiw0Miw5MywwLDIwMCwyMjAsNTEsMzIsMTUsMjIwLDAsMTA4LDgsMzIsMjUsMjA1LDIsMSwxOTIsMCw0LDAsMSwxLDEsNTAsMCwxMjAsMTkzLDEwNyw5NSwxMTIsMTAsMiwwLDcsMSwwLDI1NSwyMjQsMCwxMjgsMiwzMiw5LDE2LDAsMTEyLDI1LDYwLDEyLDAsMTEzLDEwNiw2OSwxMzEsMTAsOCwxLDMyLDE1NiwwLDMyLDI2LDE2LDAsMCwyLDIsMCwwLDE2LDEyLDAsMCwwLDAsMCw5LDEsMCwwLDEyOCw2MywyMDAsMCwwLDQ4LDE3LDAsMF0=';

// ---------------------------------------------------------------------------
// Header / global fields
// ---------------------------------------------------------------------------
const PRESET_NAME_START = 30; // "Matribox II PRO"
const PRESET_NAME_END = 44; // inclusive (15 bytes)
const BPM_BYTE = 122; // tempo byte in the master template (value: 101)
const VOLUME_BYTE = 123; // master volume byte (value: 2 — scaled)

// ---------------------------------------------------------------------------
// Module slots — 7 bytes each, starting at index 51.
//   bytes [0..3] = fixed header (60, 108, 0, 1)  — except AMP uses 110
//   bytes [4..6] = algorithm-ID triplet (the "genetic code" of the effect)
// Patching bytes [4..6] swaps the algorithm without touching the frame.
// ---------------------------------------------------------------------------
const MODULE_SLOT_START = 51;
const MODULE_SLOT_SIZE = 7;
const MODULE_SLOTS: { type: string; slotIndex: number; idOffset: number }[] = [
  { type: 'FX', slotIndex: 0, idOffset: MODULE_SLOT_START + 0 * MODULE_SLOT_SIZE + 4 },
  { type: 'AMP', slotIndex: 1, idOffset: MODULE_SLOT_START + 1 * MODULE_SLOT_SIZE + 4 },
  { type: 'CAB', slotIndex: 2, idOffset: MODULE_SLOT_START + 2 * MODULE_SLOT_SIZE + 4 },
  { type: 'EQ', slotIndex: 3, idOffset: MODULE_SLOT_START + 3 * MODULE_SLOT_SIZE + 4 },
  { type: 'MOD', slotIndex: 4, idOffset: MODULE_SLOT_START + 4 * MODULE_SLOT_SIZE + 4 },
  { type: 'DLY', slotIndex: 5, idOffset: MODULE_SLOT_START + 5 * MODULE_SLOT_SIZE + 4 },
  { type: 'RVB', slotIndex: 6, idOffset: MODULE_SLOT_START + 6 * MODULE_SLOT_SIZE + 4 },
];

// ---------------------------------------------------------------------------
// Parameter drawers — contiguous 3-byte little-endian slots, one per slider.
// Each block's parameter table begins right after its block header marker.
// Values are stored as 24-bit integers; slider 0-100 maps directly to byte[0].
// ---------------------------------------------------------------------------
type DrawerMap = Record<string, { start: number; count: number }>;

const PARAM_DRAWERS: DrawerMap = {
  // FX block: 3 slider drawers (comp/drive style: threshold, ratio, level)
  FX: { start: 172, count: 3 },
  // AMP block: 6 drawers (gain, bass, mid, treble, presence, master)
  AMP: { start: 199, count: 6 },
  // CAB block: 2 drawers (resonance, thump)
  CAB: { start: 225, count: 2 },
  // EQ block: 5 drawers (low, low-mid, mid, high-mid, high)
  EQ: { start: 241, count: 5 },
  // MOD block: 4 drawers (rate, depth, mix, tone)
  MOD: { start: 262, count: 4 },
  // DLY block: 4 drawers (time, feedback, mix, mod)
  DLY: { start: 288, count: 4 },
  // RVB block: 3 drawers (size, dwell, mix)
  RVB: { start: 310, count: 3 },
};

// ---------------------------------------------------------------------------
// Algorithm-ID encoding: maps each known fxId to its 3-byte genetic triplet.
// These are the exact bytes that sit at MODULE_SLOTS[*].idOffset. Patching
// them swaps the effect algorithm while preserving the slot frame.
// ---------------------------------------------------------------------------
const FX_ID_BYTES: Record<string, [number, number, number]> = {
  comp_calif_fast: [23, 156, 94],
  drive_tube808: [112, 109, 102],
  amp_calif_iv_ld3: [174, 123, 108],
  cab_4x12_v30: [118, 50, 116],
  eq_5band: [55, 27, 123],
  delay_analog: [133, 93, 129],
  reverb_spring: [72, 179, 156],
};

// Block-type → fxId lookup for the default algorithm in each slot.
const DEFAULT_FX_BY_TYPE: Record<string, string> = {
  COMP: 'comp_calif_fast',
  DRIVE: 'drive_tube808',
  AMP: 'amp_calif_iv_ld3',
  CAB: 'cab_4x12_v30',
  EQ: 'eq_5band',
  DELAY: 'delay_analog',
  REVERB: 'reverb_spring',
};

function decodeMaster(): number[] {
  return JSON.parse(atob(MASTER_B64));
}

function encodeString(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Map a 0-100 slider value into the 3-byte little-endian drawer at `offset`.
 * byte[0] = value (0-255), byte[1] = 0, byte[2] = 0.
 */
function writeDrawer(buffer: number[], offset: number, value100: number): void {
  const v = clampInt(value100, 0, 100);
  buffer[offset] = v;
  buffer[offset + 1] = 0;
  buffer[offset + 2] = 0;
}

/**
 * Resolve which block-type bucket a preset module belongs to.
 * COMP/DRIVE → FX slot; AMP→AMP; CAB→CAB; EQ→EQ; MOD→MOD; DELAY→DLY; REVERB→RVB.
 */
function resolveBlockType(modType: string): string | null {
  const t = modType.toUpperCase();
  if (t === 'COMP' || t === 'DRIVE') return 'FX';
  if (t === 'AMP') return 'AMP';
  if (t === 'CAB') return 'CAB';
  if (t === 'EQ') return 'EQ';
  if (t === 'MOD') return 'MOD';
  if (t === 'DELAY') return 'DLY';
  if (t === 'REVERB') return 'RVB';
  return null;
}

function buildPresetBuffer(preset: GeneratedPreset): number[] {
  const buffer = decodeMaster().slice();

  // --- Preset name -------------------------------------------------------
  const fieldLen = PRESET_NAME_END - PRESET_NAME_START + 1;
  const nameBytes = encodeString(preset.title).slice(0, fieldLen);
  for (let i = 0; i < fieldLen; i++) {
    buffer[PRESET_NAME_START + i] = nameBytes[i] ?? 0;
  }

  // --- BPM + master volume ----------------------------------------------
  if (typeof preset.bpm === 'number') {
    buffer[BPM_BYTE] = clampInt(preset.bpm, 0, 255);
  }
  if (typeof preset.volume === 'number') {
    // volume 0-100 → store as-is in the drawer's first byte
    buffer[VOLUME_BYTE] = clampInt(preset.volume, 0, 100);
  }

  // --- Algorithm IDs + slider drawers ------------------------------------
  // Walk every module the AI returned, route it to its block, patch the
  // algorithm-ID triplet in the module slot, and write each param value
  // into its 3-byte drawer.
  const usedBlocks = new Set<string>();
  for (const mod of preset.modules) {
    const blockType = resolveBlockType(mod.type);
    if (!blockType) continue;
    usedBlocks.add(blockType);

    // Patch the algorithm-ID triplet in the module slot.
    const slot = MODULE_SLOTS.find((s) => s.type === blockType);
    if (slot) {
      const idTriplet = FX_ID_BYTES[mod.fxId];
      if (idTriplet) {
        buffer[slot.idOffset] = idTriplet[0];
        buffer[slot.idOffset + 1] = idTriplet[1];
        buffer[slot.idOffset + 2] = idTriplet[2];
      }
    }

    // Write slider values into the parameter drawers.
    const drawer = PARAM_DRAWERS[blockType];
    if (drawer) {
      const params = mod.params ?? [];
      for (let i = 0; i < drawer.count && i < params.length; i++) {
        const p = params[i];
        // Normalise any param range to a 0-100 slider value.
        const span = (p.max ?? 100) - (p.min ?? 0);
        const norm = span > 0 ? ((p.value - (p.min ?? 0)) / span) * 100 : p.value;
        writeDrawer(buffer, drawer.start + i * 3, norm);
      }
    }
  }

  // For any block the AI did not populate, keep the master's default
  // algorithm-ID and zero the drawers so the block loads cleanly.
  for (const blockType of Object.keys(PARAM_DRAWERS)) {
    if (usedBlocks.has(blockType)) continue;
    const drawer = PARAM_DRAWERS[blockType];
    for (let i = 0; i < drawer.count; i++) {
      writeDrawer(buffer, drawer.start + i * 3, 0);
    }
  }

  return buffer;
}

export function downloadPreset(preset: GeneratedPreset): void {
  const buffer = buildPresetBuffer(preset);

  const jsonStr = JSON.stringify(Array.from(buffer));
  const b64 = btoa(jsonStr);

  const blob = new Blob([b64], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = preset.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  a.href = url;
  a.download = `${safeName || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
