// Matribox II Pro (QME-200) preset file builder.
//
// The device stores presets as a flat linear byte stream: a fixed header, the
// patch name as ASCII + a PRO signature, exactly 10 slot blocks (one per
// hardware position), and a fixed footer. Each slot is always present — an
// inactive slot is written as a zeroed block so following slots stay aligned.

import algData from '../data/alg_data.json';
import { HARDWARE_SLOTS, findCadeiaIndexForSlot } from './hardwareSlots';

type AlgEntry = {
  fxid: number;
  fxtitle: string;
  name?: string;
  widget?: { name: string }[];
};

type AlgModule = { name: string; alg: AlgEntry[] };

const MODULES: AlgModule[] = (algData as { Modules: AlgModule[] }).Modules;

// fxTitle → fxid and name → fxid lookups. The AI is prompted with fxTitles,
// but it sometimes returns the internal `name` instead, so resolving against
// both prevents a silently dropped effect.
const FX_TITLE_TO_ID = new Map<string, number>();
const FX_NAME_TO_ID = new Map<string, number>();
for (const mod of MODULES) {
  for (const alg of mod.alg) {
    FX_TITLE_TO_ID.set((alg.fxtitle || '').toLowerCase(), alg.fxid);
    if (alg.name) FX_NAME_TO_ID.set(alg.name.toLowerCase(), alg.fxid);
  }
}

// Status byte 0 (OFF) + 4 zeroed fxid bytes. Knobs are omitted because the
// hardware reads the 0 status and skips to the next slot.
const EMPTY_BLOCK: number[] = [0, 0, 0, 0, 0];

const HEADER_BYTES = [
  3, 2, 0, 0, 16, 11, 0, 128, 0, 5, 1, 4, 3, 12, 1, 5, 1, 15, 105, 2, 105, 164,
  2, 0, 2, 1,
];

const PRO_SIGNATURE = [32, 80, 82, 79];

const FOOTER_BYTES = [
  16, 12, 0, 0, 0, 0, 0, 9, 1, 0, 0, 128, 63, 200, 0, 0, 48, 17, 0, 0,
];

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
  bytes: number[];
  base64: string;
  nomePatch: string;
}

function clampByte(n: number): number {
  const v = Math.round(n);
  if (Number.isNaN(v)) return 0;
  return Math.min(255, Math.max(0, v));
}

function fxidToBytes(fxid: number): [number, number, number, number] {
  return [fxid & 0xff, (fxid >>> 8) & 0xff, (fxid >>> 16) & 0xff, (fxid >>> 24) & 0xff];
}

function sanitizeName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
}

function bytesToBase64(bytes: number[]): string {
  const bin = String.fromCharCode(...bytes.map((b) => clampByte(b)));
  let base64 = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bin.length; i += chunkSize) {
    base64 += btoa(bin.slice(i, i + chunkSize));
  }
  return base64;
}

/** Resolve the fxid for an effect name, matching fxTitle first, then name. */
export function resolveFxId(nomeEfeito: string): number | undefined {
  const key = (nomeEfeito || '').toLowerCase().trim();
  if (!key) return undefined;
  const byTitle = FX_TITLE_TO_ID.get(key);
  if (byTitle !== undefined) return byTitle;
  return FX_NAME_TO_ID.get(key);
}

/**
 * Build the full byte stream for a Matribox II Pro preset. Iterates the 10
 * hardware slots in fixed order; each active slot emits [1, fxidLE...,
 * knobs...], each inactive slot emits the zeroed block.
 */
export function buildPresetFile(ai: AiPresetResponse): BuiltPreset {
  const nomePatch = sanitizeName(ai.nomePatch);
  const bytes: number[] = [];

  bytes.push(...HEADER_BYTES);

  for (let i = 0; i < nomePatch.length; i++) {
    bytes.push(clampByte(nomePatch.charCodeAt(i)));
  }
  bytes.push(0); // null terminator
  bytes.push(...PRO_SIGNATURE);

  const cadeia = ai.cadeia || [];
  for (let slotIndex = 0; slotIndex < HARDWARE_SLOTS.length; slotIndex++) {
    const entryIndex = findCadeiaIndexForSlot(cadeia, slotIndex);
    const entry = entryIndex >= 0 ? cadeia[entryIndex] : undefined;
    const fxid = entry ? resolveFxId(entry.nomeEfeito) : undefined;

    if (!entry || fxid === undefined) {
      bytes.push(...EMPTY_BLOCK);
      continue;
    }

    bytes.push(1); // status ON
    bytes.push(...fxidToBytes(fxid));
    for (const knob of entry.knobs || []) {
      bytes.push(clampByte(knob));
    }
  }

  bytes.push(...FOOTER_BYTES);

  return { bytes, base64: bytesToBase64(bytes), nomePatch };
}

/**
 * Trigger a browser download of the preset as a .prst file. The pedal editor
 * expects plain text whose sole contents are the Base64-encoded byte stream.
 */
export function downloadPresetFile(built: BuiltPreset): void {
  const blob = new Blob([built.base64], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${built.nomePatch || 'preset'}.prst`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
