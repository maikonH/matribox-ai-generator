import algData from '../data/alg_data.json';

export interface PrstWidget {
  name: string;
  id: string;
  widgetType: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  valueRange: string;
  options: string[];
  knobId: string;
}

export interface PrstEffect {
  fxid: number;
  name: string;
  title: string;
  type: string;
  widgets: PrstWidget[];
}

export interface PrstFloat {
  offset: number;
  value: number;
}

export type BlockMode = 'matched' | 'compressed' | 'extra' | 'none';

export type PrstBlockKind = 'amp' | 'cab';

export interface PrstBlock {
  start: number;
  fxidOffset: number;
  encodedFxid: number;
  effect: PrstEffect;
  kind: PrstBlockKind;
  linkedCabByteOffset: number | null;
  floatStart: number | null;
  floats: PrstFloat[];
  mode: BlockMode;
  extraFloats: PrstFloat[];
  warning: string;
}

export interface PrstDecoded {
  bytes: number[];
  name: string;
  timestamp: string;
  blocks: PrstBlock[];
}

interface RawWidget {
  name?: unknown;
  ID?: unknown;
  id?: unknown;
  widgetType?: unknown;
  min?: unknown;
  max?: unknown;
  step?: unknown;
  defaultValue?: unknown;
  valueRange?: unknown;
  KnobID?: unknown;
  knobId?: unknown;
}

interface RawAlgorithm {
  fxid?: unknown;
  fxtitle?: unknown;
  name?: unknown;
  type?: unknown;
  widget?: RawWidget[];
}

interface RawModule {
  name?: unknown;
  alg?: RawAlgorithm[];
}

interface RawCatalog {
  Modules?: RawModule[];
}

function trimValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(trimValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptions(value: string): string[] {
  if (!value || /^-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?$/.test(value)) return [];
  return value.split(/[,|;]/).map((option) => option.trim()).filter(Boolean);
}

function normalizeWidget(raw: RawWidget): PrstWidget {
  const valueRange = trimValue(raw.valueRange);
  return {
    name: trimValue(raw.name) || 'Parâmetro',
    id: trimValue(raw.ID ?? raw.id),
    widgetType: numberValue(raw.widgetType, 0),
    min: numberValue(raw.min, 0),
    max: numberValue(raw.max, 100),
    step: Math.max(numberValue(raw.step, 1), Number.EPSILON),
    defaultValue: numberValue(raw.defaultValue, 0),
    valueRange,
    options: parseOptions(valueRange),
    knobId: trimValue(raw.KnobID ?? raw.knobId),
  };
}

function buildEffects(): Map<number, PrstEffect> {
  const catalog = algData as RawCatalog;
  const effects = new Map<number, PrstEffect>();
  for (const module of catalog.Modules ?? []) {
    for (const raw of module.alg ?? []) {
      const fxid = numberValue(raw.fxid, -1);
      if (fxid < 0) continue;
      const effect: PrstEffect = {
        fxid,
        name: trimValue(raw.name) || `FXID ${fxid}`,
        title: trimValue(raw.fxtitle),
        type: trimValue(raw.type),
        widgets: (raw.widget ?? []).map(normalizeWidget).sort((a, b) => numberValue(a.id, 0) - numberValue(b.id, 0)),
      };
      effects.set(fxid, effect);
    }
  }
  return effects;
}

const EFFECTS = buildEffects();
const AMP_EFFECTS_BY_INDEX = new Map<number, PrstEffect>();
const CAB_EFFECTS_BY_INDEX = new Map<number, PrstEffect>();
const catalogModules = (algData as RawCatalog).Modules ?? [];
const ampModule = catalogModules.find((module) => trimValue(module.name) === 'AMP');
const cabModule = catalogModules.find((module) => trimValue(module.name) === 'CAB');
for (const raw of ampModule?.alg ?? []) {
  const fxid = numberValue(raw.fxid, -1);
  const effect = EFFECTS.get(fxid);
  if (effect) AMP_EFFECTS_BY_INDEX.set(fxid & 0xff, effect);
}
for (const raw of cabModule?.alg ?? []) {
  const fxid = numberValue(raw.fxid, -1);
  const effect = EFFECTS.get(fxid);
  if (effect) CAB_EFFECTS_BY_INDEX.set(fxid & 0xff, effect);
}
const CAB_FXID_BASE = 167772160;
const CAB_FXID_MAX = 167772229;

function cabEffect(fxid: number): PrstEffect | undefined {
  const effect = EFFECTS.get(fxid);
  return effect && fxid >= CAB_FXID_BASE && fxid <= CAB_FXID_MAX ? effect : undefined;
}

function isLinkedCabHeader(bytes: number[], offset: number): boolean {
  return bytes[offset + 1] === 0 && bytes[offset + 2] === 0 && bytes[offset + 3] === 188;
}

function findCabFloatValues(bytes: number[], start: number, end: number): { start: number | null; values: PrstFloat[] } {
  for (let marker = start; marker + 3 < end; marker += 1) {
    if (bytes[marker] !== 100 || bytes[marker + 1] !== 4 || bytes[marker + 2] !== 32 || bytes[marker + 3] !== 1) continue;
    const values: PrstFloat[] = [];
    let offset = marker + 4;
    while (offset + 3 < end && values.length < 8) {
      if (isTailStart(bytes, offset, end)) break;
      const value = readFloatLE(bytes, offset);
      if (!Number.isFinite(value) || Math.abs(value) > 20001) break;
      values.push({ offset, value });
      offset += 4;
    }
    return { start: values.length > 0 ? values[0].offset : marker + 4, values };
  }
  return { start: null, values: [] };
}

function blockMode(effect: PrstEffect, floats: PrstFloat[]): { mode: BlockMode; extraFloats: PrstFloat[]; warning: string } {
  const widgetCount = effect.widgets.length;
  const floatCount = floats.length;
  if (floatCount === 0) return { mode: 'none', extraFloats: [], warning: 'Nenhum float encontrado para este bloco.' };
  if (floatCount === widgetCount) return { mode: 'matched', extraFloats: [], warning: '' };
  if (floatCount === 1 && widgetCount > 1) return { mode: 'compressed', extraFloats: [], warning: `Modo comprimido: 1 float encontrado para ${widgetCount} widgets. Mostrando defaults do catálogo como somente leitura.` };
  if (floatCount > widgetCount) return { mode: 'extra', extraFloats: floats.slice(widgetCount), warning: `${floatCount} floats encontrados para ${widgetCount} widgets. Os primeiros ${widgetCount} foram mapeados; ${floatCount - widgetCount} extra(s) não mapeado(s).` };
  return { mode: 'none', extraFloats: [], warning: `${floatCount} floats encontrados para ${widgetCount} widgets. Mapeamento incompleto — editando manualmente.` };
}

function readUint32LE(bytes: number[], offset: number): number {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) * 0x1000000)) >>> 0;
}

function writeUint32LE(bytes: number[], offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function effectForEncodedFxid(encodedFxid: number): PrstEffect | undefined {
  const direct = EFFECTS.get(encodedFxid);
  if (direct) return direct;

  const ampIndex = encodedFxid & 0xff;
  const encodedPrefix = encodedFxid >>> 24;
  if (encodedPrefix === 4 || encodedPrefix === 5) {
    const amp = AMP_EFFECTS_BY_INDEX.get(ampIndex);
    if (amp) return amp;
  }

  const lowByte = EFFECTS.get(ampIndex);
  if (lowByte && (encodedFxid >>> 8) !== 0) return lowByte;
  return undefined;
}

function readFloatLE(bytes: number[], offset: number): number {
  const buffer = new ArrayBuffer(4);
  new Uint8Array(buffer).set(bytes.slice(offset, offset + 4));
  return new DataView(buffer).getFloat32(0, true);
}

function writeFloatLE(bytes: number[], offset: number, value: number): void {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  bytes.splice(offset, 4, ...Array.from(new Uint8Array(buffer)));
}

const FLOAT_MARKER = [5, 1, 0, 0];
const FLOAT_TAIL_PREFIXES = [
  [52, 12, 0, 124, 3],
  [12, 0, 124, 3],
];

function isTailStart(bytes: number[], pos: number, end: number): boolean {
  for (const prefix of FLOAT_TAIL_PREFIXES) {
    if (pos + prefix.length > end) continue;
    let match = true;
    for (let j = 0; j < prefix.length; j++) {
      if (bytes[pos + j] !== prefix[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

function findFloatValues(bytes: number[], start: number, end: number): { start: number | null; values: PrstFloat[] } {
  let marker = -1;
  for (let i = start; i + 3 < end; i += 1) {
    if (bytes[i] === FLOAT_MARKER[0] && bytes[i + 1] === FLOAT_MARKER[1] && bytes[i + 2] === FLOAT_MARKER[2] && bytes[i + 3] === FLOAT_MARKER[3]) {
      marker = i;
      break;
    }
  }
  if (marker === -1) return { start: null, values: [] };

  const values: PrstFloat[] = [];
  let offset = marker + 2;
  while (offset + 3 < end) {
    if (isTailStart(bytes, offset, end)) break;
    if (bytes[offset] !== 0 || bytes[offset + 1] !== 0) break;
    const value = readFloatLE(bytes, offset);
    if (!Number.isFinite(value) || Math.abs(value) > 20001) break;
    values.push({ offset, value });
    offset += 4;
  }
  return { start: marker + 4, values };
}

export function decodePrst(base64: string): PrstDecoded {
  const source = base64.trim();
  let payload = source;

  if (source.startsWith('{')) {
    let parsedWrapper: unknown;
    try {
      parsedWrapper = JSON.parse(source);
    } catch {
      throw new Error('O arquivo .prst não contém um JSON válido.');
    }
    if (
      !parsedWrapper ||
      typeof parsedWrapper !== 'object' ||
      !('data' in parsedWrapper) ||
      typeof parsedWrapper.data !== 'string'
    ) {
      throw new Error('O arquivo .prst não contém os dados esperados.');
    }
    payload = parsedWrapper.data;
  }

  const normalized = payload.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error('O conteúdo precisa ser uma string Base64 válida.');
  }

  let decoded: string;
  try {
    decoded = atob(normalized);
  } catch {
    throw new Error('Não foi possível decodificar o Base64 do preset.');
  }

  const text = new TextDecoder().decode(Uint8Array.from(decoded, (char) => char.charCodeAt(0)));
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O Base64 não contém o array JSON esperado.');
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error('O preset precisa conter um array JSON de bytes entre 0 e 255.');
  }

  const bytes = parsed as number[];
  const nameEnd = bytes.slice(30).indexOf(0);
  const nameBytes = nameEnd >= 0 ? bytes.slice(30, 30 + nameEnd) : bytes.slice(30, 62);
  const name = String.fromCharCode(...nameBytes).split('').filter((char) => char.charCodeAt(0) >= 32).join('').trim() || '(sem nome)';
  const timestamp = bytes.slice(26, 30).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  const starts: Array<{ start: number; fxidOffset: number; encodedFxid: number; effect: PrstEffect }> = [];
  for (let i = 0; i + 4 < bytes.length; i += 1) {
    if (bytes[i] !== 255) continue;
    const encodedFxid = readUint32LE(bytes, i + 1);
    const effect = effectForEncodedFxid(encodedFxid);
    if (effect) starts.push({ start: i, fxidOffset: i + 1, encodedFxid, effect });
  }

  const rawBlocks: Array<{ start: number; fxidOffset: number; encodedFxid: number; effect: PrstEffect; kind: PrstBlockKind; linkedCabByteOffset: number | null }> = [];
  starts.forEach((block) => {
    const isCab = Boolean(cabEffect(block.encodedFxid));
    if (isCab) {
      rawBlocks.push({ ...block, kind: 'cab', linkedCabByteOffset: null });
      return;
    }
    const linkedCabByteOffset = block.start + 5;
    const hasLinkedCab = isLinkedCabHeader(bytes, linkedCabByteOffset);
    rawBlocks.push({ ...block, kind: 'amp', linkedCabByteOffset: hasLinkedCab ? linkedCabByteOffset : null });
    if (hasLinkedCab) {
      const cabFxid = CAB_FXID_BASE + bytes[linkedCabByteOffset];
      const effect = cabEffect(cabFxid);
      if (effect) rawBlocks.push({ start: linkedCabByteOffset, fxidOffset: linkedCabByteOffset, encodedFxid: cabFxid, effect, kind: 'cab', linkedCabByteOffset });
    }
  });

  const floatRegion = findSharedFloatRegion(bytes, starts);
  const blocks: PrstBlock[] = [];
  let floatCursor = floatRegion.start;
  for (const raw of rawBlocks) {
    const widgetCount = raw.effect.widgets.length;
    const floats: PrstFloat[] = [];
    if (floatCursor !== null && widgetCount > 0) {
      for (let i = 0; i < widgetCount && floatCursor + 3 < floatRegion.end; i += 1) {
        floats.push({ offset: floatCursor, value: readFloatLE(bytes, floatCursor) });
        floatCursor += 4;
      }
    }
    blocks.push({
      start: raw.start,
      fxidOffset: raw.fxidOffset,
      encodedFxid: raw.encodedFxid,
      effect: raw.effect,
      kind: raw.kind,
      linkedCabByteOffset: raw.linkedCabByteOffset,
      floatStart: floats.length > 0 ? floats[0].offset : null,
      floats,
      ...blockMode(raw.effect, floats),
    });
  }

  return { bytes, name, timestamp, blocks };
}

export function encodePrst(bytes: number[]): string {
  return bytesToBase64(bytes);
}

export function updateFloat(bytes: number[], offset: number, value: number): void {
  writeFloatLE(bytes, offset, value);
}

export function updateFxid(bytes: number[], block: PrstBlock, newFxid: number): void {
  if (block.kind === 'cab' && block.linkedCabByteOffset !== null) {
    bytes[block.linkedCabByteOffset] = newFxid - CAB_FXID_BASE;
    return;
  }
  writeUint32LE(bytes, block.fxidOffset, newFxid >>> 0);
}

export function reconcileFloats(bytes: number[], block: PrstBlock, newEffect: PrstEffect): void {
  const oldWidgets = block.effect.widgets;
  const newWidgets = newEffect.widgets;
  const oldFloats = block.floats;
  const floatStart = oldFloats.length > 0 ? oldFloats[0].offset : block.floatStart;
  if (floatStart === null) return;

  const maxCount = Math.max(oldWidgets.length, newWidgets.length);
  for (let i = 0; i < maxCount; i++) {
    const offset = floatStart + i * 4;
    if (i < newWidgets.length) {
      if (i < oldFloats.length) continue;
      writeFloatLE(bytes, offset, newWidgets[i].defaultValue);
    } else {
      writeFloatLE(bytes, offset, 0);
    }
  }
}

export function normalizeWidgetValue(widget: PrstWidget, value: number): number {
  const bounded = Math.min(widget.max, Math.max(widget.min, Number.isFinite(value) ? value : widget.defaultValue));
  const stepped = widget.min + Math.round((bounded - widget.min) / widget.step) * widget.step;
  return Number(Math.min(widget.max, Math.max(widget.min, stepped)).toFixed(6));
}

export function effectsForWidgetCount(count: number): PrstEffect[] {
  return Array.from(EFFECTS.values()).filter((effect) => effect.widgets.length === count);
}

export function effectLabel(effect: PrstEffect): string {
  return `${effect.name} · FXID ${effect.fxid} (0x${effect.fxid.toString(16).toUpperCase().padStart(8, '0')})`;
}

export interface AmpListItem {
  fxid: number;
  name: string;
  type: string;
  label: string;
}

let ampListCache: AmpListItem[] | null = null;

export function getAmpList(): AmpListItem[] {
  if (ampListCache) return ampListCache;
  const modules = (algData as { Modules: RawModule[] }).Modules;
  const ampModule = modules.find((m) => String(m.name ?? '').trim() === 'AMP');
  const amps = ampModule?.alg ?? [];
  ampListCache = amps.map((entry) => {
    const fxid = numberValue(entry.fxid, -1);
    const name = String(entry.name ?? entry.fxtitle ?? `Algorithm ${fxid}`).trim();
    const type = String(entry.type ?? '').trim();
    const hex = `0x${fxid.toString(16).toUpperCase().padStart(8, '0')}`;
    return { fxid, name, type, label: `${name} - FXID ${fxid} (${hex})` };
  });
  return ampListCache;
}

export interface AmpTypeGroup {
  type: string;
  amps: AmpListItem[];
}

let ampGroupCache: AmpTypeGroup[] | null = null;

export function getAmpListGrouped(): AmpTypeGroup[] {
  if (ampGroupCache) return ampGroupCache;
  const amps = getAmpList();
  const order = ['Clean', 'Drive', 'Hi Gain', 'Bass', 'Acoustic'];
  const groups = new Map<string, AmpListItem[]>();
  for (const amp of amps) {
    const key = amp.type || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(amp);
  }
  ampGroupCache = order
    .filter((t) => groups.has(t))
    .map((t) => ({ type: t, amps: groups.get(t)! }))
    .concat(
      [...groups.keys()]
        .filter((t) => !order.includes(t))
        .map((t) => ({ type: t, amps: groups.get(t)! })),
    );
  return ampGroupCache;
}

export function findEffectByFxid(fxid: number): PrstEffect | null {
  return EFFECTS.get(fxid) ?? null;
}

export function getCabList(): AmpListItem[] {
  const modules = (algData as { Modules: RawModule[] }).Modules;
  const cabModule = modules.find((m) => String(m.name ?? '').trim() === 'CAB');
  return (cabModule?.alg ?? []).map((entry) => {
    const fxid = numberValue(entry.fxid, -1);
    const name = String(entry.name ?? entry.fxtitle ?? `Algorithm ${fxid}`).trim();
    const type = String(entry.type ?? '').trim();
    const hex = `0x${fxid.toString(16).toUpperCase().padStart(8, '0')}`;
    return { fxid, name, type, label: `${name} - FXID ${fxid} (${hex})` };
  });
}

export function bytesToBase64(bytes: number[]): string {
  const encoded = new TextEncoder().encode(JSON.stringify(bytes));
  let binary = '';
  for (let i = 0; i < encoded.length; i += 0x8000) {
    binary += String.fromCharCode(...encoded.slice(i, i + 0x8000));
  }
  return btoa(binary);
}
