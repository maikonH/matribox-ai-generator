import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule, PresetModuleParam } from './types';
import { findAlgorithm } from './algorithmStore';
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
5. AMP slot: exactly ONE real amplifier from the AMP section. CAB slot: exactly ONE real cabinet from the CAB section, and it must be the natural match for the chosen amp (e.g. Brit 800 → Brit LD 4x12, B-Man N → B-Man 2x10, Supero 2 CL → Supero 2x12). Stacking multiple AMP blocks, duplicating "Dr. 38 Clean" / any amp, or inserting loops is strictly prohibited.
6. DRIVE slot: may ONLY hold a real overdrive/distortion/fuzz pedal from the DRV section (e.g. Bass OD, Tube 808, Skreamer 9, Fuzz Cream, Master Dist). Never put an AMP, CAB, MOD, or EQ algorithm in the DRIVE slot. If the prompt is for a clean tone, still pick a real DRV pedal and set its gain low.
7. MOD slot: modulation only. Map "Flanger" and "Phaser" (and variants like Flanger N, Phaser ST, BBD Phaser) to this slot — they are MOD algorithms, never DRIVE or AMP. Same for chorus, tremolo, vibrato, vibe, detune.
8. Choose creatively per prompt: match amp + cab + drive + modulation to the genre, decade, and reference artist the user names. Vary between generations; do not default to one "standard" preset.
9. Master Volume (VOLUME slot) is computed dynamically from the gain structure: high-gain amps + heavy drive → 55–75; mid-gain crunch → 72–85; clean/boutique low-gain → 85–100. Never hardcode 90.

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
  const byId = new Map(algorithms.map((a) => [a.fxId, a]));
  const byTitle = new Map(algorithms.map((a) => [a.fxTitle.toLowerCase(), a]));

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
    if (hitIdx === -1) {
      // Slot missing — leave a placeholder that the caller can still render.
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

    // DRIVE slot must hold a real DRV pedal. If the model placed something
    // else there, pick the first real DRV pedal as a safe fallback so the red
    // DRIVE block never renders a non-drive algorithm.
    let resolvedAlg = alg;
    if (slot === 'DRIVE') {
      if (!alg || !DRV_PEDALS.has(alg.fxTitle)) {
        resolvedAlg = algorithms.find((a) => DRV_PEDALS.has(a.fxTitle)) ?? alg;
      }
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

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(algorithms),
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

  return reconcilePreset(parsed, algorithms);
}
