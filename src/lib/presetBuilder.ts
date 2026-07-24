// Matribox II Pro (.prst) preset file builder — Template Mutator Edition.
//
// FILE FORMAT (confirmed by reverse-engineering 57-B_A.prst):
//
//   The .prst file on disk contains a single continuous Base64 line.
//   Decoding that Base64 yields the TEXT of a JSON array: "[3,2,0,0,...]"
//   Parsing that JSON array gives the raw byte array of the binary struct.
//
//   Pipeline: file → base64 decode → JSON.parse → Uint8Array → binary C-struct
//
// BINARY STRUCT LAYOUT (274 bytes for the reference preset):
//
//   [0-3]   Magic:    03 02 00 00
//   [4-7]   Version:  10 0b 00 80  (= [16, 11, 0, 128])
//   [8-19]  Metadata: 12 bytes of firmware-managed fields (checksums, counters)
//   [20-47] Name block: 28 bytes. The preset name is a null-terminated ASCII
//           string written at offset NAME_OFFSET (30). Bytes after the null
//           terminator up to offset 47 are zero-padded.
//   [48-N]  Module data: binary records for each hardware slot. Preserved
//           verbatim from the template skeleton.
//
// TEMPLATE SKELETON (57-B_A.prst):
//   A known-good preset accepted by the Matribox II Pro firmware, used as the
//   binary skeleton. Presets are built by mutating a copy of this template:
//   writing the new preset name at NAME_OFFSET and re-encoding the result
//   as base64( JSON.stringify( Array.from(bytes) ) ).
//
//   The 274-byte template produces a ~1 KB base64 file — matching the size
//   of legitimate Matribox II Pro presets. No JSON-string-to-bytes-to-JSON
//   double-encoding is performed; the binary struct bytes are encoded
//   directly as a JSON integer array, then base64-wrapped.

// ── Template skeleton ─────────────────────────────────────────────────────────
//
// The 274-byte binary struct from the known-good 57-B_A.prst reference preset.
// Source: src/docs/57-B_A.prst  (base64 → JSON.parse → byte array)

const TEMPLATE_BYTES: readonly number[] = [
  3,2,0,0,16,11,0,128,0,5,1,4,3,12,1,5,1,15,105,2,
  105,164,2,0,2,1,182,173,224,3,65,0,114,97,109,101,116,114,111,95,
  53,49,0,82,79,132,3,2,183,79,106,156,182,108,0,1,199,240,81,182,
  108,0,1,80,227,230,182,108,0,1,72,26,46,183,108,0,1,62,0,43,
  183,108,0,1,200,90,242,182,108,0,1,88,0,205,182,108,0,1,62,69,
  75,183,110,0,169,31,156,8,144,0,97,14,10,164,1,4,1,255,255,13,
  0,0,0,101,2,15,132,2,3,3,1,1,2,3,4,107,1,7,0,5,
  121,2,76,108,1,1,0,4,1,255,53,0,0,152,3,32,10,16,0,110,
  10,230,2,96,6,3,5,1,0,0,76,66,52,12,0,124,3,32,3,14,
  0,72,66,44,148,0,3,160,66,0,0,250,69,44,76,0,32,0,0,87,
  55,0,50,0,120,193,107,95,131,80,7,1,0,39,4,13,128,2,32,9,
  16,0,1,200,66,0,0,60,12,0,112,106,180,94,4,8,1,45,188,243,
  144,45,32,9,112,1,48,164,0,0,2,2,0,0,16,12,0,0,0,0,
  0,9,1,0,0,128,63,200,0,0,48,17,0,0,
];

// ── Struct offsets ────────────────────────────────────────────────────────────

/** First byte of the preset name field (ASCII, null-terminated). */
const NAME_OFFSET = 30;

/** One past the last byte reserved for the name block. */
const NAME_END = 48;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, NAME_END - NAME_OFFSET - 1);
  return cleaned || 'Preset';
}

/**
 * Encode a byte array as the .prst file format:
 *   Base64( JSON.stringify( Array.from(bytes) ) )
 *
 * This produces a single continuous Base64 line with no line breaks,
 * matching the format the Matribox II Pro desktop manager expects.
 */
function encodePresetFile(bytes: Uint8Array): string {
  const jsonArrayText = JSON.stringify(Array.from(bytes));
  return btoa(jsonArrayText);
}

// ── Public API ────────────────────────────────────────────────────────────────

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
  bytes: Uint8Array;
  base64: string;
  nomePatch: string;
}

/**
 * Build a valid .prst file from the AI-generated preset.
 *
 * Uses the known-good 57-B_A template skeleton (274 bytes) as the binary
 * struct. The preset name is patched at offset 30; all module data bytes
 * (offset 48+) are preserved from the template. The result is encoded as
 * base64( JSON.stringify( Array.from(bytes) ) ) — a single continuous
 * Base64 line of approximately 1 KB, matching the size of legitimate
 * Matribox II Pro presets.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);

  const templateBytes = new Uint8Array(TEMPLATE_BYTES);

  // Zero-fill the name block [NAME_OFFSET .. NAME_END)
  for (let i = NAME_OFFSET; i < NAME_END; i++) templateBytes[i] = 0;

  // Write the new name as null-terminated ASCII
  for (let i = 0; i < nomePatch.length; i++) {
    templateBytes[NAME_OFFSET + i] = nomePatch.charCodeAt(i);
  }

  const base64 = encodePresetFile(templateBytes);

  console.log('===== PRESET FILE (template skeleton) =====');
  console.log(`name=${nomePatch} structBytes=${templateBytes.length} base64Length=${base64.length}`);

  return { bytes: templateBytes, base64, nomePatch };
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
