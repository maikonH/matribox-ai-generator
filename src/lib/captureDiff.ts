// Capture-diff helper for reverse-engineering the Matribox II Pro SysEx protocol.
//
// Workflow:
//   1. User captures two SysEx messages in Wireshark/USBPcap — the "baseline"
//      (known preset) and the "changed" (one knob moved / one effect swapped).
//   2. User pastes the raw hex from each capture into the Diff Tool.
//   3. This module parses the hex, strips the USB-MIDI Code Index Number bytes
//      the OS driver adds (04/05/06/07 first byte of every 4-byte packet), and
//      reconstructs the real F0…F7 SysEx.
//   4. It then byte-aligns the two SysExs and emits a per-byte diff so the user
//      can see exactly which bytes moved — and therefore which knob/effect each
//      position encodes.
//
// Keeping the hex parsing + diff logic out of the React component makes it
// testable and lets the UI stay a thin presentation layer.

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface ParsedSysEx {
  /** The clean F0…F7 SysEx bytes with CIN framing removed. */
  bytes: number[];
  /** Total byte count read from input (before whitespace/cin stripping). */
  rawCount: number;
  /** Number of USB-MIDI 4-byte packets detected (0 if input was already bare). */
  packetCount: number;
  /** Non-fatal notes about how the input was interpreted. */
  notes: string[];
  /** Fatal problem that prevented producing bytes (empty string when OK). */
  error: string;
}

const HEX_RE = /[0-9a-fA-F]{1,2}/g;
const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const CIN_SYSEX = new Set([0x04, 0x05, 0x06, 0x07]);

/**
 * Parse arbitrary pasted hex into a clean SysEx byte array.
 *
 * Accepts either form a user is likely to paste from Wireshark:
 *   - Raw SysEx:        "F0 21 25 4D 50 00 … F7"
 *   - USB-MIDI packets: "04 F0 21 25 04 4D 50 00 … 05 F7 00 00"
 *
 * When USB-MIDI framing is detected (every 4th byte is a CIN and the first
 * data byte is F0), the CIN bytes are dropped so the diff compares only the
 * real MIDI payload — which is what actually changed between captures.
 */
export function parseSysExHex(input: string): ParsedSysEx {
  const notes: string[] = [];
  const error = '';

  const matches = (input.match(HEX_RE) ?? []).map((h) => parseInt(h, 16));
  if (matches.length === 0) {
    return { bytes: [], rawCount: 0, packetCount: 0, notes, error: 'Nenhum byte hexadecimal encontrado.' };
  }

  // Heuristic: is this 4-byte USB-MIDI framing? Check the first packet:
  // [CIN, b0, b1, b2] where CIN ∈ {04,05,06,07} and b0 == F0.
  const looksFramed =
    matches.length >= 2 &&
    CIN_SYSEX.has(matches[0]) &&
    matches[1] === SYSEX_START;

  let bytes: number[];
  let packetCount = 0;

  if (looksFramed) {
    packetCount = Math.ceil(matches.length / 4);
    bytes = [];
    for (let i = 0; i < matches.length; i += 4) {
      // Drop the CIN byte (index i); keep the next three data bytes.
      for (let j = 1; j <= 3 && i + j < matches.length; j++) {
        bytes.push(matches[i + j]);
      }
    }
    notes.push(`Detectado enquadramento USB-MIDI (${packetCount} pacotes de 4 bytes) — bytes CIN removidos.`);
  } else {
    bytes = matches.slice();
    notes.push('Interpretado como SysEx bruto (sem enquadramento USB-MIDI).');
  }

  // Trim padding zeros that follow F7 in 0x05/0x06 tail packets.
  const endIdx = bytes.indexOf(SYSEX_END);
  if (endIdx !== -1 && endIdx < bytes.length - 1) {
    const trimmed = endIdx + 1;
    if (trimmed < bytes.length) {
      notes.push(`Removidos ${bytes.length - trimmed} bytes de preenchimento após F7.`);
      bytes = bytes.slice(0, trimmed);
    }
  }

  if (bytes.length === 0) {
    return { bytes, rawCount: matches.length, packetCount, notes, error: 'Nenhum byte de dado após limpeza.' };
  }
  if (bytes[0] !== SYSEX_START) {
    return { bytes, rawCount: matches.length, packetCount, notes, error: 'Mensagem não começa com F0 (SysEx).' };
  }
  if (bytes[bytes.length - 1] !== SYSEX_END) {
    notes.push('Aviso: a mensagem não termina com F7 — pode estar truncada.');
  }

  return { bytes, rawCount: matches.length, packetCount, notes, error };
}

// ── Diffing ───────────────────────────────────────────────────────────────────

export type ByteKind = 'signature' | 'matrix' | 'fxid' | 'knob' | 'checksum' | 'terminator' | 'unknown';

export interface ByteDiff {
  /** Byte index within the SysEx (0 = F0). */
  index: number;
  baseline: number | null;
  changed: number | null;
  /** True when the byte value differs between the two captures. */
  moved: boolean;
  /** Structural role of this byte, when it can be inferred from the signature. */
  kind: ByteKind;
}

export interface DiffResult {
  /** Per-byte comparison, aligned on SysEx index. */
  bytes: ByteDiff[];
  /** Indices where the value changed. */
  changedIndices: number[];
  /** Indices present in baseline but missing in changed (truncation). */
  removedIndices: number[];
  /** Indices present in changed but missing in baseline (extension). */
  addedIndices: number[];
  /** Whether the two payloads are identical. */
  identical: boolean;
  baselineLen: number;
  changedLen: number;
}

// Signature layout (matches midiBuilder.ts): F0 21 25 4D 50 00 = 6 bytes.
const SIG_LEN = 6;
// Matrix = 12 slots × 8 bytes (4 fxid + 4 knobs) = 96; then 1 checksum + 1 F7.
const MATRIX_BYTES = 96;
const SLOT_BYTES = 8;
const FXID_BYTES = 4;

function classifyByte(index: number, len: number): ByteKind {
  if (index < SIG_LEN) return 'signature';
  if (index === len - 1) return 'terminator';
  if (index === len - 2) return 'checksum';
  const offset = index - SIG_LEN;
  if (offset < MATRIX_BYTES) {
    const inSlot = offset % SLOT_BYTES;
    return inSlot < FXID_BYTES ? 'fxid' : 'knob';
  }
  return 'unknown';
}

/**
 * Compare two SysEx byte arrays index-by-index and flag every byte that moved.
 * Used to pinpoint which wire position encodes a given knob/effect change.
 */
export function diffSysEx(baseline: number[], changed: number[]): DiffResult {
  const maxLen = Math.max(baseline.length, changed.length);
  const bytes: ByteDiff[] = [];
  const changedIndices: number[] = [];
  const removedIndices: number[] = [];
  const addedIndices: number[] = [];
  const len = Math.max(baseline.length, changed.length);

  for (let i = 0; i < maxLen; i++) {
    const b = i < baseline.length ? baseline[i] : null;
    const c = i < changed.length ? changed[i] : null;
    const moved = b !== null && c !== null && b !== c;

    if (b === null && c !== null) addedIndices.push(i);
    else if (b !== null && c === null) removedIndices.push(i);
    else if (moved) changedIndices.push(i);

    bytes.push({
      index: i,
      baseline: b,
      changed: c,
      moved,
      kind: classifyByte(i, len),
    });
  }

  const identical =
    baseline.length === changed.length &&
    baseline.every((v, i) => v === changed[i]);

  return {
    bytes,
    changedIndices,
    removedIndices,
    addedIndices,
    identical,
    baselineLen: baseline.length,
    changedLen: changed.length,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const KIND_LABEL: Record<ByteKind, string> = {
  signature: 'Assinatura',
  matrix: 'Matriz',
  fxid: 'FXID (slot)',
  knob: 'Knob (slot)',
  checksum: 'Checksum',
  terminator: 'Terminador',
  unknown: 'Desconhecido',
};

export function byteKindLabel(kind: ByteKind): string {
  return KIND_LABEL[kind] ?? kind;
}

const KIND_TONE: Record<ByteKind, string> = {
  signature: 'text-sky-400',
  matrix: 'text-slate-400',
  fxid: 'text-violet-400',
  knob: 'text-cyan-400',
  checksum: 'text-amber-400',
  terminator: 'text-emerald-400',
  unknown: 'text-slate-500',
};

export function byteKindTone(kind: ByteKind): string {
  return KIND_TONE[kind] ?? 'text-slate-400';
}

/** Format a single byte as two-digit upper-case hex. */
export function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Summarize the changed bytes grouped by structural role, so the UI can show a
 * human-readable hint like "2 bytes do FXID mudaram, 1 knob mudou".
 */
export interface DiffSummary {
  role: ByteKind;
  count: number;
  indices: number[];
  label: string;
}

export function summarizeDiff(diff: DiffResult): DiffSummary[] {
  const byRole = new Map<ByteKind, number[]>();
  for (const idx of diff.changedIndices) {
    const kind = diff.bytes[idx].kind;
    const arr = byRole.get(kind) ?? [];
    arr.push(idx);
    byRole.set(kind, arr);
  }
  const summaries: DiffSummary[] = [];
  for (const [role, indices] of byRole) {
    summaries.push({
      role,
      count: indices.length,
      indices,
      label: byteKindLabel(role),
    });
  }
  return summaries.sort((a, b) => b.count - a.count);
}
