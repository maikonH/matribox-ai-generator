import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule } from './types';
import { ALGORITHM_CATALOG } from './algorithmCatalog';
import { getEffectiveApiKey } from './apiKeyStore';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';

const MODEL_NAME = 'gemini-3.1-flash';

// Map the AI's short module codes (DRV, DLY, RVB, …) to the canonical slot
// types used by the UI's signal-chain renderer.
const MODULE_CODE_TO_TYPE: Record<string, string> = {
  DYN: 'DYN',
  FREQ: 'FREQ',
  WAH: 'WAH',
  DRV: 'DRIVE',
  DRIVE: 'DRIVE',
  OD: 'DRIVE',
  DIST: 'DRIVE',
  AMP: 'AMP',
  AMPLIFIER: 'AMP',
  CAB: 'CAB',
  CABINET: 'CAB',
  IR: 'IR',
  EQ: 'EQ',
  EQUALIZER: 'EQ',
  MOD: 'MOD',
  MODULATION: 'MOD',
  CHORUS: 'MOD',
  FLANGER: 'MOD',
  PHASER: 'MOD',
  TREMOLO: 'MOD',
  DLY: 'DELAY',
  DELAY: 'DELAY',
  RVB: 'REVERB',
  REVERB: 'REVERB',
  VOL: 'VOLUME',
  VOLUME: 'VOLUME',
};

function buildSystemPrompt(algorithms: Algorithm[]): string {
  // Group algorithms by module so the model sees the fxTitle vocabulary it is
  // allowed to draw from, without being flooded with internal fxids.
  const byModule = new Map<string, string[]>();
  for (const a of algorithms) {
    const key = a.type.toUpperCase();
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key)!.push(a.fxTitle);
  }
  const catalog = Array.from(byModule.entries())
    .map(([mod, titles]) => `  ${mod}: ${titles.map((t) => `"${t}"`).join(', ')}`)
    .join('\n');

  return `Você é um produtor musical e engenheiro de guitarra especialista na pedaleira Matribox II Pro (hardware QME-200). O usuário descreve um timbre em linguagem natural (ex: "Timbre para solo do Pink Floyd") e você monta a cadeia de sinal escolhendo pedais, amplificadores e gabinetes reais do catálogo oficial abaixo.

CATÁLOGO OFICIAL DE ALGORITMOS (${algorithms.length} efeitos — use SOMENTE estes fxTitles):
${catalog}

REGRAS RÍGIDAS:
1. Responda com UM único objeto JSON válido. Sem markdown, sem comentários, sem code fences, sem texto fora do JSON.
2. Use SOMENTE fxTitles que existem no catálogo acima. Nunca invente nomes de efeitos.
3. O campo "nomePatch" deve ter no MÁXIMO 12 caracteres alfanuméricos (sem espaços, sem acentos, sem símbolos).
4. O campo "comentario" deve explicar em português quais pedais/amp/cab foram escolhidos e por que combinam com o pedido.
5. O campo "cadeia" é um array de módulos ativos na ordem do sinal. Cada módulo tem "modulo" (código curto: DRV, AMP, CAB, EQ, MOD, DLY, RVB, VOL, DYN, WAH, FREQ), "nomeEfeito" (fxTitle exato do catálogo) e "knobs" (array de números inteiros de 0 a 100, um por parâmetro do efeito).
6. É OBRIGATÓRIO incluir exatamente UM módulo AMP e UM módulo CAB na cadeia, ambos do catálogo. O gabinete deve ser o par natural do amplificador escolhido.
7. Inclua um módulo VOL final com o algoritmo "Volume" do catálogo. Seu knob é o volume master (0–100): timbres de alto ganho → 55–75; crunch médio → 72–85; limpo/boutique → 85–100.
8. O número de knobs de cada efeito deve corresponder à quantidade de parâmetros do algoritmo no catálogo. Se não souber, use 3 valores padrão (50, 50, 50).
9. Proibido gerar arrays numéricos longos, bytes, hex ou Base64 por conta própria. Apenas os knobs 0–100 de cada efeito.
10. FIDELIDADE AO PROMPT: o nomePatch e o comentario DEVEM refletir o gênero/artista solicitado. O amp + cab + drive DEVEM ser apropriados ao gênero (ex: Metalcore → amp de alto ganho + cab 4x12 + distorção pesada). Nunca substitua por outro gênero.

FORMATO DE RESPOSTA (JSON estrito):
{
  "nomePatch": "NomeDoPreset",
  "comentario": "Explicação em português de quais pedais foram escolhidos",
  "cadeia": [
    { "modulo": "DRV", "nomeEfeito": "Skreamer", "knobs": [70, 50, 80] },
    { "modulo": "AMP", "nomeEfeito": "UK 800", "knobs": [50, 60, 50, 70] }
  ]
}

REGRAS DOS CAMPOS:
- "nomePatch": string alfanumérica, máximo 12 caracteres.
- "comentario": string em português.
- "cadeia": array de objetos com "modulo" (string), "nomeEfeito" (string exata do catálogo), "knobs" (array de números 0–100).
- Sem campos extras, sem markdown.`;
}

type RawAiModule = {
  modulo?: string;
  nomeEfeito?: string;
  knobs?: (number | string)[];
};

type RawAiPreset = {
  nomePatch?: string;
  comentario?: string;
  cadeia?: RawAiModule[];
};

function clampKnob(value: number): number {
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sanitizePatchName(name: string): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return cleaned || 'Preset';
}

/**
 * Normalize the raw AI JSON into a validated AiPresetResponse. Unknown effect
 * names are dropped from the chain (they occupy no space in the file). Knobs
 * are clamped to 0–100 and coerced to integers.
 */
export function normalizeAiResponse(raw: RawAiPreset): AiPresetResponse {
  const cadeia: ChainEntry[] = [];
  for (const mod of raw.cadeia || []) {
    const nomeEfeito = (mod.nomeEfeito || '').trim();
    if (!nomeEfeito) continue;
    const knobs = (mod.knobs || []).map((v) => clampKnob(Number(v)));
    cadeia.push({
      modulo: (mod.modulo || '').toUpperCase().trim(),
      nomeEfeito,
      knobs,
    });
  }
  return {
    nomePatch: sanitizePatchName(raw.nomePatch || ''),
    comentario: (raw.comentario || '').trim(),
    cadeia,
  };
}

/**
 * Convert the validated AI response into the GeneratedPreset shape the UI
 * signal-chain renderer expects. Each cadeia entry is resolved against the
 * catalog so the sliders show real parameter names and ranges.
 */
export function aiResponseToPreset(ai: AiPresetResponse): GeneratedPreset {
  const byTitle = new Map(ALGORITHM_CATALOG.map((a) => [a.fxTitle.toLowerCase(), a]));
  const modules: PresetModule[] = ai.cadeia.map((entry) => {
    const alg = byTitle.get(entry.nomeEfeito.toLowerCase());
    const type = MODULE_CODE_TO_TYPE[entry.modulo] || entry.modulo || (alg?.type ?? 'UNKNOWN');
    const params = (alg?.params || []).map((p, i) => ({
      name: p.name,
      displayName: p.displayName,
      value: i < entry.knobs.length ? entry.knobs[i] : p.value,
      min: p.min,
      max: p.max,
      unit: p.unit,
    }));
    return {
      fxId: alg?.fxId || '',
      fxTitle: alg?.fxTitle || entry.nomeEfeito,
      type,
      subType: type,
      params,
    };
  });

  return {
    title: ai.nomePatch,
    description: ai.comentario,
    bpm: 120,
    volume: 95,
    modules,
  };
}

export async function generatePreset(
  userPrompt: string,
  algorithms: Algorithm[],
): Promise<AiPresetResponse> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) {
    throw new Error(
      'Chave do Gemini não configurada. Abra Settings e adicione sua chave da API Gemini, ou defina VITE_GEMINI_API_KEY no .env.',
    );
  }

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
  let parsed: RawAiPreset;
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

  return normalizeAiResponse(parsed);
}
