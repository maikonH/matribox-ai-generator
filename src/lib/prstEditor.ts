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
  widgets: PrstWidget[];
}

export interface PrstFloat {
  offset: number;
  value: number;
}

export type BlockMode = 'matched' | 'compressed' | 'extra' | 'none';

export interface PrstBlock {
  start: number;
  fxidOffset: number;
  encodedFxid: number;
  effect: PrstEffect;
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
  widget?: RawWidget[];
}

interface RawModule {
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
        widgets: (raw.widget ?? []).map(normalizeWidget).sort((a, b) => numberValue(a.id, 0) - numberValue(b.id, 0)),
      };
      effects.set(fxid, effect);
    }
  }
  return effects;
}

const EFFECTS = buildEffects();

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
  const lowByte = EFFECTS.get(encodedFxid & 0xff);
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
  let offset = marker + 4;
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
  const normalized = base64.trim().replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
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

  const blocks = starts.map((block, index) => {
    const end = starts[index + 1]?.start ?? bytes.length - 13;
    const floats = findFloatValues(bytes, block.start + 5, end);
    const widgetCount = block.effect.widgets.length;
    const floatCount = floats.values.length;

    let mode: BlockMode = 'none';
    let extraFloats: PrstFloat[] = [];
    let warning = '';

    if (floatCount === 0) {
      mode = 'none';
      warning = 'Nenhum float encontrado para este bloco.';
    } else if (floatCount === widgetCount) {
      mode = 'matched';
    } else if (floatCount === 1 && widgetCount > 1) {
      mode = 'compressed';
      warning = `Modo comprimido: 1 float encontrado para ${widgetCount} widgets. Mostrando defaults do catálogo como somente leitura.`;
    } else if (floatCount > widgetCount) {
      mode = 'extra';
      extraFloats = floats.values.slice(widgetCount);
      warning = `${floatCount} floats encontrados para ${widgetCount} widgets. Os primeiros ${widgetCount} foram mapeados; ${extraFloats.length} extra(s) não mapeado(s).`;
    } else {
      mode = 'none';
      warning = `${floatCount} floats encontrados para ${widgetCount} widgets. Mapeamento incompleto — editando manualmente.`;
    }

    return { ...block, floatStart: floats.start, floats: floats.values, mode, extraFloats, warning };
  });

  return { bytes, name, timestamp, blocks };
}

export function encodePrst(bytes: number[]): string {
  return bytesToBase64(bytes);
}

export function updateFloat(bytes: number[], offset: number, value: number): void {
  writeFloatLE(bytes, offset, value);
}

export function updateFxid(bytes: number[], block: PrstBlock, newFxid: number): void {
  const currentPrefix = block.encodedFxid & 0xffffff00;
  writeUint32LE(bytes, block.fxidOffset, currentPrefix | (newFxid & 0xff));
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
  return `${effect.name} · FXID ${effect.fxid} (0x${effect.fxid.toString(16).toUpperCase()})`;
}

export function bytesToBase64(bytes: number[]): string {
  const encoded = new TextEncoder().encode(JSON.stringify(bytes));
  let binary = '';
  for (let i = 0; i < encoded.length; i += 0x8000) {
    binary += String.fromCharCode(...encoded.slice(i, i + 0x8000));
  }
  return btoa(binary);
}
