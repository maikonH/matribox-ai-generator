import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule, PresetModuleParam } from './types';
import { findAlgorithm } from './algorithmStore';
import { ALGORITHM_CATALOG } from './algorithmCatalog';
import { getEffectiveApiKey } from './apiKeyStore';

const MODEL_NAME = 'gemini-3.1-flash-lite';

// Fixed signal-chain slot order. The AI must emit modules in this order and
// the reconcile step enforces it. AMP and CAB each appear exactly once — no
// stacking, no duplication, no parallel loops.
const SLOT_ORDER = ['DRIVE', 'AMP', 'CAB', 'EQ', 'MOD', 'DELAY', 'REVERB', 'VOLUME'] as const;
type Slot = (typeof SLOT_ORDER)[number];

// Real DRV algorithms the AI is allowed to put in the DRIVE slot. fxIds come
// straight from alg_data.json. Anything outside this set in the DRIVE slot is
// rejected by the reconcile step.
const DRV_PEDALS = new Set([
  'Skreamer', 'Skreamer 9', 'Butter OD', 'Warm OD', 'Super OD', 'Blues OD',
  'Full OD', 'Breaker OD', 'Gerden OD', 'Timmy OD', 'Master OD', 'Solar Fuzz',
  'Fuzz Cream', 'Red Fuzz', 'JP Dist', 'Dark Mouse', 'Plexi Dist', 'Master Dist',
  'Dist Plus', 'Shark', 'Strive', 'Sardar Dist', 'Bass OD', 'Bass Dist',
]);

// Canonical amp → cabinet pairings used to auto-fill the CAB slot when the
// model omits it or picks an unrelated cabinet. Keys are AMP fxTitles from
// alg_data.json; values are CAB fxTitles.
const AMP_CAB_PAIRINGS: Record<string, string> = {
  'Tweed Lux': 'Tweed Lux 1x12',
  'Baseman Norm': 'Baseman 4x10',
  'Baseman Bright': 'Baseman 4x10',
  'Black Twin': 'Black Twin 2x12',
  'Black Deluxe': 'Black Lux 1x12',
  'Superb Dual Clean': 'Superb 2x12',
  'Superb Dual Drive': 'Superb 2x12',
  'Voxy 15 TB': 'Voxy 1x12',
  'Voxy 30HW Norm': 'Voxy 2x12',
  'Voxy 30HW TB': 'Voxy 2x12',
  'Jazz Clean': 'Jazz Twin 2x12',
  'Emperor Clean': 'Emperor 2x12',
  'Emperor Drive': 'Emperor 2x12',
  'Superstar Clean': 'Superstar 2x12',
  'Superstar Drive': 'Superstar 2x12',
  'Glacian Clean': 'Glacian 1x12',
  'Glacian Drive': 'Glacian 1x12',
  'Boger XT Blue V': 'Boger 4x12',
  'Boger XT Red M': 'Boger 4x12',
  'Dr. 38 Clean': 'US Studio 1x12',
  'Dr. 38 Drive': 'US Studio 1x12',
  'Pendragon Clean': 'UK Green 4x12',
  'Pendragon Clean+': 'UK Modern 4x12',
  'Pendragon Drive': 'UK Modern 4x12',
  'Soloist 100 Clean': 'Soloist 4x12',
  'Soloist 100 Crunch': 'Soloist 4x12',
  'Soloist 100 Lead': 'Soloist 4x12',
  'Marshell 45': 'UK Green 4x12',
  'Marshell 45+': 'UK Green 4x12',
  'Marshell 45 Jump': 'UK Green 4x12',
  'Marshell 50': 'UK Lead 4x12',
  'Marshell 50+': 'UK Lead 4x12',
  'Marshell 50 Jump': 'UK Lead 4x12',
  'Marshell SLP': 'UK Lead 4x12',
  'Marshell 800': 'UK Lead 4x12',
  'Marshell 900': 'UK T75 4x12',
  'Fryman B1': 'UK Green 4x12',
  'Fryman B2': 'UK Green 4x12',
  'Fryman HB+': 'UK Green 4x12',
  'Fryman HB': 'UK Green 4x12',
  'Messe IIC+ 1': 'UK Black 4x12',
  'Messe IIC+ 2': 'UK Black 4x12',
  'Messe IIC+ 3': 'UK Black 4x12',
  'Messe IV Lead 1': 'UK Black 4x12',
  'Messe IV Lead 2': 'UK Black 4x12',
  'Messe IV Lead 3': 'UK Black 4x12',
  'Rector Dual V': 'Rector 4x12',
  'Rector Dual M': 'Rector 4x12',
  'Tangerine R100': 'Tang 4x12',
  'Eddie 51': 'Eddie 4x12',
  'Engle Saga 1': 'Engle 4x12',
  'Engle Saga 2': 'Engle 4x12',
  'Dizzle VH B': 'Dizzle 4x12',
  'Dizzle VH S': 'Dizzle 4x12',
  'Dizzle VH+ B': 'Dizzle 4x12',
  'Dizzle VH+ S': 'Dizzle 4x12',
  'Ampage Classic': 'Ampage 4x10',
  'Voxy Bass': 'Voxy 1x12',
  'Messe Bass 400': 'US Bass 2x10',
  'Ampage Flip': 'Ampage 4x10',
  'Alchemy Pre': 'UK Green 4x12',
  'Acoustic Preamp 1': 'Dreadnought 1',
  'Acoustic Preamp 2': 'Dreadnought 2',
};

// Master volume level inferred from the gain structure when the model does
// not supply a usable VOLUME value. High-gain → quieter master; clean → louder.
function inferVolumeLevel(ampTitle: string, driveTitle: string | undefined): number {
  const amp = ampTitle.toLowerCase();
  const drv = (driveTitle || '').toLowerCase();
  const highGainAmps = ['marshell', 'pendragon', 'soloist', 'rector', 'boger', 'dizzle', 'engle', 'messe', 'tangerine', 'fryman hb'];
  const highGainDrives = ['fuzz', 'dist', 'master dist', 'plexi', 'dark mouse', 'sardar'];
  const isHighGainAmp = highGainAmps.some((k) => amp.includes(k));
  const isHighGainDrive = highGainDrives.some((k) => drv.includes(k));
  if (isHighGainAmp || isHighGainDrive) return 65;
  const midGainAmps = ['superb dual drive', 'emperor drive', 'dr. 38 drive', 'glacian drive', 'superstar drive', 'marshell 45', 'voxy 30hw'];
  if (midGainAmps.some((k) => amp.includes(k))) return 78;
  return 90;
}

function buildSystemPrompt(algorithms: Algorithm[]): string {
  const algList = algorithms
    .map((a) => {
      const params = a.params
        .map(
          (p) =>
            `    ${p.name} (min:${p.min}, max:${p.max}${p.unit ? ', unit:' + p.unit : ''})`,
        )
        .join('\n');
      return `  - fxId: "${a.fxId}" | fxTitle: "${a.fxTitle}" | type: "${a.type}" | subType: "${a.subType}"\n    params:\n${params}`;
    })
    .join('\n');

  return `You are the Matribox II Pro tone engineer. You build guitar presets using ONLY the ${algorithms.length} algorithms listed below. This list is your single source of truth — never invent fxIds, fxTitles, or parameters that are not in it.

AVAILABLE ALGORITHMS (${algorithms.length} total — fxId, fxTitle, type, subType, params with min/max):
${algList}

HARD RULES:
1. Respond with ONE valid JSON object. No markdown, no commentary, no code fences.
2. Use ONLY fxId + fxTitle values that exist in the list above.
3. Emit EXACTLY 8 modules in this fixed order: DRIVE, AMP, CAB, EQ, MOD, DELAY, REVERB, VOLUME. Never reorder, never skip a slot, never add a ninth module.
4. Parameter counts per slot: DRIVE(3), AMP(5), CAB(3), EQ(3), MOD(3), DELAY(2), REVERB(4), VOLUME(1). Each value must be a plain number inside the algorithm's [min, max] range.
5. MANDATORY AMP & CAB: The preset chain MUST ALWAYS feature exactly ONE active, valid AMPLIFIER model in the AMP slot and exactly ONE valid CABINET model in the CAB slot, both selected directly from the ${algorithms.length} catalog entries above. They are strictly mandatory — they CANNOT be left empty, blank, null, or bypassed, and you MUST NOT emit a placeholder like "AMP (vazio)" or "CAB (vazio)". The cabinet must be the natural match for the chosen amp (e.g. Black Twin → Black Twin 2x12, Baseman Norm → Baseman 4x10, Voxy 30HW TB → Voxy 2x12, Marshell 800 → UK Lead 4x12, Pendragon Drive → UK Modern 4x12). Stacking multiple AMP blocks, duplicating any amp, or inserting loops is strictly prohibited.
6. DRIVE slot: may ONLY hold a real overdrive/distortion/fuzz pedal from the DRV section (e.g. Bass OD, Tube 808, Skreamer 9, Fuzz Cream, Master Dist). Never put an AMP, CAB, MOD, or EQ algorithm in the DRIVE slot. If the prompt is for a clean tone, still pick a real DRV pedal and set its gain low.
7. MOD slot: modulation only. Map "Flanger" and "Phaser" (and variants like Flanger N, Phaser ST, BBD Phaser) to this slot — they are MOD algorithms, never DRIVE or AMP. Same for chorus, tremolo, vibrato, vibe, detune.
8. Choose creatively per prompt: match amp + cab + drive + modulation to the genre, decade, and reference artist the user names. Vary between generations; do not default to one "standard" preset.
9. MANDATORY VOLUME: The final VOLUME slot MUST ALWAYS load the standard factory volume pedal algorithm from the catalog (fxTitle "Volume") — it can NEVER be left empty or null. Its single parameter is the master volume level, computed dynamically from the gain structure: high-gain amps + heavy drive → 55–75; mid-gain crunch → 72–85; clean/boutique low-gain → 85–100. Never hardcode 90, never leave the VOLUME slot blank.
10. PROMPT FIDELITY (critical): The "name" and "description" fields MUST directly reflect the user's exact request. If the user asks for "Metalcore agressivo com boost", the preset name MUST reference Metalcore/aggressive tone and the description MUST mention Metalcore and a boost-style drive — NEVER output an unrelated preset like "Texas Spring Blues" or any tone that does not match the user's stated genre. The amp + cab + drive selection MUST be appropriate to the user's named genre (e.g. Metalcore → high-gain amp like Rector Dual, Pendragon Drive, or Marshell 800 + matching 4x12 cab + heavy drive/distortion pedal). Do not substitute a different genre under any circumstances.

RESPONSE FORMAT (strict Matribox II Pro JSON):
{
  "name": "Preset Name",
  "description": "Detailed conceptual description of the tone, genre and context.",
  "bpm": 120,
  "volume": 95,
  "modules": [
    { "effect_code": <integer fxId from the list>, "fxTitle": "<exact fxTitle>", "type": "DRIVE", "subType": "DRIVE", "parameters": [0, 0, 0] }
  ]
}

FIELD RULES:
- "effect_code": the integer fxId of the chosen algorithm (a number, never a string, never hex).
- "fxTitle": the exact fxTitle string from the list.
- "type": one of DRIVE, AMP, CAB, EQ, MOD, DELAY, REVERB, VOLUME.
- "parameters": a flat array of plain numbers (integers or decimals), one per algorithm parameter, in the same order as the list. No bytes, no hex, no strings.
- No extra fields, no markdown.`;
}

function clampParam(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

type MatriboxModule = {
  effect_code?: number | string;
  fxId?: string;
  fxTitle?: string;
  type?: string;
  subType?: string;
  parameters?: (number | string)[];
  params?: { name: string; value: number | string }[];
};

type MatriboxPreset = {
  name?: string;
  title?: string;
  description?: string;
  bpm?: number;
  volume?: number;
  modules?: MatriboxModule[];
};

// Remap loose modulation names the model sometimes emits (Flanger, Phaser,
// Chorus, Tremolo, Vibe, Detune) into the canonical MOD slot type so the blue
// MOD block icon lights up in the signal chain.
function canonicalizeType(raw: string | undefined): Slot | string {
  const t = (raw || '').toUpperCase().trim();
  if (t === 'CHORUS' || t === 'FLANGER' || t === 'PHASER' ||
      t === 'TREMOLO' || t === 'VIBRATO' || t === 'VIBE' ||
      t === 'DETUNE' || t === 'ROTARY' || t.includes('PHASE') ||
      t.includes('FLANGE') || t.includes('CHORU')) {
    return 'MOD';
  }
  if (t === 'VOLUME' || t === 'VOL' || t === 'VOLUME_PEDAL') return 'VOLUME';
  if (t === 'DELAY' || t === 'DLY') return 'DELAY';
  if (t === 'REVERB' || t === 'RVB') return 'REVERB';
  if (t === 'DRIVE' || t === 'DRV' || t === 'OD' || t === 'DIST') return 'DRIVE';
  if (t === 'AMP' || t === 'AMPLIFIER') return 'AMP';
  if (t === 'CAB' || t === 'CABINET') return 'CAB';
  if (t === 'EQ' || t === 'EQUALIZER') return 'EQ';
  return t;
}

function reconcilePreset(raw: MatriboxPreset, algorithms: Algorithm[]): GeneratedPreset {
  // Merge the static 267-entry catalog as a guaranteed fallback so the
  // mandatory AMP/CAB/VOLUME finds never return undefined, even when the
  // caller passes an empty or partial algorithms array (e.g. IndexedDB miss).
  const merged = algorithms.length > 0 ? algorithms : ALGORITHM_CATALOG;
  const catalog = [...merged, ...ALGORITHM_CATALOG.filter((c) => !merged.some((m) => m.fxId === c.fxId))];
  const byId = new Map(catalog.map((a) => [a.fxId, a]));
  const byTitle = new Map(catalog.map((a) => [a.fxTitle.toLowerCase(), a]));

  const incoming = (raw.modules || []).map((mod) => {
    const fxId = mod.effect_code !== undefined ? String(mod.effect_code) : mod.fxId || '';
    const alg =
      (fxId && byId.get(fxId)) ||
      (mod.fxTitle && byTitle.get(mod.fxTitle.toLowerCase()));
    const type = canonicalizeType(alg?.type || mod.type);
    return { mod, fxId, alg, type };
  });

  // Enforce the fixed slot order. For each slot, take the first incoming
  // module whose canonicalized type matches, then filter that one out so it
  // cannot be reused. This guarantees exactly one AMP, one CAB, one DRIVE,
  // etc. — stacking and duplication collapse into the single canonical slot.
  const used = new Set<number>();
  const ordered: PresetModule[] = [];

  for (const slot of SLOT_ORDER) {
    const hitIdx = incoming.findIndex((m, i) => !used.has(i) && m.type === slot);

    // MANDATORY SLOT FILLING — AMP, CAB and VOLUME can never be empty. If the
    // model omitted them, auto-fill from the catalog so the chain always has a
    // real amp, its matched cabinet, and the factory volume pedal.
    if (hitIdx === -1) {
      if (slot === 'AMP') {
        const fallbackAmp = catalog.find((a) => a.type === 'AMP')!;
        ordered.push({
          fxId: fallbackAmp.fxId,
          fxTitle: fallbackAmp.fxTitle,
          type: 'AMP',
          subType: 'AMP',
          params: fallbackAmp.params.map((p) => ({
            name: p.name, displayName: p.displayName, value: p.value,
            min: p.min, max: p.max, unit: p.unit,
          })),
        });
        continue;
      }
      if (slot === 'CAB') {
        const chosenAmp = ordered.find((m) => m.type === 'AMP');
        const pairedCabTitle = chosenAmp ? AMP_CAB_PAIRINGS[chosenAmp.fxTitle] : undefined;
        const cabAlg = (pairedCabTitle && byTitle.get(pairedCabTitle.toLowerCase()))
          || catalog.find((a) => a.type === 'CAB')!;
        ordered.push({
          fxId: cabAlg.fxId,
          fxTitle: cabAlg.fxTitle,
          type: 'CAB',
          subType: 'CAB',
          params: cabAlg.params.map((p) => ({
            name: p.name, displayName: p.displayName, value: p.value,
            min: p.min, max: p.max, unit: p.unit,
          })),
        });
        continue;
      }
      if (slot === 'VOLUME') {
        const volAlg = catalog.find((a) => a.type === 'VOL' || a.fxTitle === 'Volume')!;
        const chosenAmp = ordered.find((m) => m.type === 'AMP');
        const chosenDrive = ordered.find((m) => m.type === 'DRIVE');
        const level = inferVolumeLevel(chosenAmp?.fxTitle || '', chosenDrive?.fxTitle);
        ordered.push({
          fxId: volAlg.fxId,
          fxTitle: volAlg.fxTitle,
          type: 'VOLUME',
          subType: 'VOLUME',
          params: volAlg.params.map((p, i) => ({
            name: p.name, displayName: p.displayName,
            value: i === 0 ? clampParam(level, p.min, p.max) : p.value,
            min: p.min, max: p.max, unit: p.unit,
          })),
        });
        continue;
      }
      // Non-mandatory slot missing — leave a placeholder.
      ordered.push({
        fxId: '',
        fxTitle: `${slot} (vazio)`,
        type: slot,
        subType: slot,
        params: [],
      });
      continue;
    }

    used.add(hitIdx);
    const { mod, fxId, alg } = incoming[hitIdx];

    // When fxId lookup missed (e.g. model returned hex or wrong int), try
    // resolving by fxTitle before falling back to type-based defaults.
    let resolvedAlg = alg
      ?? (mod.fxTitle ? byTitle.get(mod.fxTitle.toLowerCase()) : undefined);

    // DRIVE slot must hold a real DRV pedal.
    if (slot === 'DRIVE') {
      if (!resolvedAlg || !DRV_PEDALS.has(resolvedAlg.fxTitle)) {
        resolvedAlg = catalog.find((a) => DRV_PEDALS.has(a.fxTitle)) ?? resolvedAlg;
      }
    }
    // AMP slot must hold a real amplifier from the catalog.
    if (slot === 'AMP') {
      if (!resolvedAlg || resolvedAlg.type !== 'AMP') {
        // Try matching by the fxTitle the AI provided before falling back to first AMP.
        const titleMatch = mod.fxTitle ? byTitle.get(mod.fxTitle.toLowerCase()) : undefined;
        resolvedAlg = (titleMatch?.type === 'AMP' ? titleMatch : undefined)
          ?? catalog.find((a) => a.type === 'AMP')!;
      }
    }
    // CAB slot: honour the AI's chosen cabinet when it's valid; otherwise use
    // the canonical pairing for the chosen amp.
    if (slot === 'CAB') {
      if (!resolvedAlg || resolvedAlg.type !== 'CAB') {
        const chosenAmp = ordered.find((m) => m.type === 'AMP');
        const pairedCabTitle = chosenAmp ? AMP_CAB_PAIRINGS[chosenAmp.fxTitle] : undefined;
        const titleMatch = mod.fxTitle ? byTitle.get(mod.fxTitle.toLowerCase()) : undefined;
        resolvedAlg = (titleMatch?.type === 'CAB' ? titleMatch : undefined)
          ?? (pairedCabTitle ? byTitle.get(pairedCabTitle.toLowerCase()) : undefined)
          ?? catalog.find((a) => a.type === 'CAB')!;
      }
    }
    // VOLUME slot must always load the factory volume pedal algorithm.
    if (slot === 'VOLUME') {
      const volAlg = catalog.find((a) => a.type === 'VOL' || a.fxTitle === 'Volume');
      if (volAlg) resolvedAlg = volAlg;
    }

    const flatParams = Array.isArray(mod.parameters)
      ? mod.parameters.map((v) => Number(v))
      : null;
    const validParams = (resolvedAlg?.params || []).map((algParam, idx) => {
      let value: number;
      if (flatParams && idx < flatParams.length) {
        value = clampParam(flatParams[idx], algParam.min, algParam.max);
      } else {
        const incomingParam = mod.params?.find((p) => p.name === algParam.name);
        value = incomingParam
          ? clampParam(Number(incomingParam.value), algParam.min, algParam.max)
          : algParam.value;
      }
      return {
        name: algParam.name,
        displayName: algParam.displayName,
        value,
        min: algParam.min,
        max: algParam.max,
        unit: algParam.unit,
      };
    });

    let params: PresetModuleParam[];
    if (validParams.length > 0) {
      params = validParams;
    } else if (flatParams) {
      params = flatParams.map((v, i) => ({
        name: `param_${i}`,
        displayName: `Param ${i + 1}`,
        value: clampParam(v, 0, 100),
        min: 0,
        max: 100,
      }));
    } else {
      params = (mod.params || []).map((p) => ({
        name: p.name,
        value: Number(p.value),
        min: 0,
        max: 100,
      }));
    }

    // For the VOLUME slot, force the first param to the dynamic master level
    // when the model didn't supply a believable value.
    if (slot === 'VOLUME' && params.length > 0) {
      const chosenAmp = ordered.find((m) => m.type === 'AMP');
      const chosenDrive = ordered.find((m) => m.type === 'DRIVE');
      const level = inferVolumeLevel(chosenAmp?.fxTitle || '', chosenDrive?.fxTitle);
      params = params.map((p, i) =>
        i === 0 ? { ...p, value: clampParam(level, p.min, p.max) } : p,
      );
    }

    ordered.push({
      fxId: resolvedAlg?.fxId || fxId,
      fxTitle: resolvedAlg?.fxTitle || mod.fxTitle || '',
      type: slot,
      subType: slot,
      params,
    });
  }

  return {
    title: raw.name || raw.title || 'Preset Sem Nome',
    description: raw.description || '',
    bpm: raw.bpm || 120,
    volume: raw.volume ?? 95,
    modules: ordered,
  };
}

export async function generatePreset(
  userPrompt: string,
  algorithms: Algorithm[],
): Promise<GeneratedPreset> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) {
    throw new Error(
      'Chave do Gemini não configurada. Abra Settings e adicione sua chave da API Gemini, ou defina VITE_GEMINI_API_KEY no .env.',
    );
  }

  // Always feed the full catalog to the model. If the caller passed an empty
  // array (IndexedDB miss), the AI would otherwise see zero algorithms and
  // invent fxIds, which forces the reconciler onto its hardcoded fallbacks
  // (Tweed Lux / Tweed Lux 1x12) for every generation.
  const effective = algorithms.length > 0 ? algorithms : ALGORITHM_CATALOG;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(effective),
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  });

  let result;
  try {
    result = await model.generateContent(userPrompt);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes('429')) {
      throw new Error(
        'Limite de requisições atingido (Rate Limit 429). Aguarde alguns segundos e tente novamente.',
      );
    }
    throw new Error(`Erro na API Gemini: ${err?.message || String(e)}`);
  }

  const text = result.response.text();
  let parsed: MatriboxPreset;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('A IA não retornou um JSON válido.');
    }
  }

  return reconcilePreset(parsed, effective);
}
