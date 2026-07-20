import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule } from './types';
import { ALGORITHM_CATALOG } from './algorithmCatalog';
import { getEffectiveApiKey } from './apiKeyStore';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';
import { HARDWARE_SLOTS, findCadeiaIndexForSlot } from './hardwareSlots';
import algData from '../data/alg_data.json';

const MODEL_NAME = 'gemini-3.1-flash-lite';

type AlgWidget = { name: string };
type AlgEntry = { fxid: number; fxtitle: string; name?: string; widget?: AlgWidget[] };
type AlgModule = { name: string; alg: AlgEntry[] };

const ALG_MODULES: AlgModule[] = (algData as { Modules: AlgModule[] }).Modules;

interface SlimEffect {
  fxid: number | string;
  fxTitle: string;
  parametros: string[];
}
interface SlimModule {
  modulo: string;
  efeitos: SlimEffect[];
}

// Compact catalog built straight from alg_data.json: every effect with its
// module code, fxid, exact fxTitle (the string presetBuilder resolves), and
// the ordered list of parameter names — so the AI cannot hallucinate names or
// knob counts. We drop the Chinese prose / origin / mark fields (the bulk of
// the 850KB file) to stay well within the model context window.
function slimFromAlgData(): SlimModule[] {
  return ALG_MODULES.map((mod) => ({
    modulo: mod.name,
    efeitos: (mod.alg ?? []).map((alg) => ({
      fxid: alg.fxid,
      fxTitle: alg.fxtitle,
      parametros: (alg.widget ?? []).map((w) => w.name),
    })),
  }));
}

// Same compact shape, but sourced from the effective Algorithm[] set — used
// when the user uploaded a custom alg_data.json via Settings, so the AI draws
// from that catalog instead of the bundled one.
function slimFromAlgorithms(algorithms: Algorithm[]): SlimModule[] {
  const byModule = new Map<string, SlimEffect[]>();
  for (const a of algorithms) {
    const key = a.type.toUpperCase();
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key)!.push({
      fxid: a.fxId,
      fxTitle: a.fxTitle,
      parametros: a.params.map((p) => p.name),
    });
  }
  return Array.from(byModule.entries()).map(([modulo, efeitos]) => ({ modulo, efeitos }));
}

function buildSystemPrompt(algorithms: Algorithm[]): string {
  const slim = algorithms.length > 0 ? slimFromAlgorithms(algorithms) : slimFromAlgData();
  const catalogJson = JSON.stringify(slim);
  const totalEffects = slim.reduce((sum, mod) => sum + mod.efeitos.length, 0);

  return `Você é um produtor musical e engenheiro de guitarra especialista na pedaleira Matribox II Pro (hardware QME-200). O usuário descreve um timbre em linguagem natural (ex: "Timbre para solo do Pink Floyd") e você monta a cadeia de sinal escolhendo pedais, amplificadores e gabinetes reais do catálogo oficial abaixo.

Você DEVE escolher os nomes dos efeitos e os módulos baseando-se estritamente neste catálogo oficial anexado aqui: ${catalogJson}. Não invente nenhum nome ou módulo fora desta lista.

CATÁLOGO OFICIAL DE ALGORITMOS (${totalEffects} efeitos — o JSON anexado acima é a fonte única da verdade):
- Cada objeto tem "modulo" (DYN, FREQ, WAH, DRV, AMP, CAB, MOD, DLY, RVB, VOL), "fxid", "fxTitle" (o nome exato que você deve devolver em "nomeEfeito") e "parametros" (lista dos nomes dos knobs, em ordem).

REGRAS RÍGIDAS:
1. Responda com UM único objeto JSON válido. Sem markdown, sem comentários, sem code fences, sem texto fora do JSON.
2. Use SOMENTE fxTitle que existem no catálogo anexado. Nunca invente nomes de efeitos. O campo "nomeEfeito" deve ser o fxTitle exato (cópia idêntica, incluindo espaços e maiúsculas/minúsculas).
3. O campo "nomePatch" deve ter no MÁXIMO 12 caracteres alfanuméricos (sem espaços, sem acentos, sem símbolos).
4. O campo "comentario" deve explicar em português quais pedais/amp/cab foram escolhidos e por que combinam com o pedido.
5. O campo "cadeia" é um array de módulos ativos na ordem do sinal. Cada módulo tem "modulo" (código curto presente no catálogo), "nomeEfeito" (fxTitle exato do catálogo) e "knobs" (array de números inteiros de 0 a 100, um por parâmetro listado em "parametros", na mesma ordem).
6. É OBRIGATÓRIO incluir exatamente UM módulo AMP e UM módulo CAB na cadeia, ambos do catálogo. O gabinete deve ser o par natural do amplificador escolhido.
7. Inclua um módulo VOL final com o fxTitle "Volume" do catálogo. Seu knob é o volume master (0–100): timbres de alto ganho → 55–75; crunch médio → 72–85; limpo/boutique → 85–100.
8. O número e a ordem dos knobs de cada efeito DEVEM corresponder exatamente à lista "parametros" do fxTitle no catálogo anexado. Um valor 0–100 para cada parâmetro, na mesma ordem. Nunca use valores padrão genéricos.
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
- "cadeia": array de objetos com "modulo" (string do catálogo), "nomeEfeito" (fxTitle exato do catálogo), "knobs" (array de números 0–100, um por item de "parametros").
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
 * signal-chain renderer expects. The UI always shows exactly the 10 hardware
 * slots of the Matribox II Pro, in fixed order. For each slot we look up the
 * matching cadeia entry by its `modulo` code; when the AI did not activate a
 * slot we emit a bypassed placeholder so the UI can render "Desligado
 * (Bypass)" and the file builder can write the zeroed block.
 */
export function aiResponseToPreset(ai: AiPresetResponse): GeneratedPreset {
  const byTitle = new Map(ALGORITHM_CATALOG.map((a) => [a.fxTitle.toLowerCase(), a]));
  const cadeia = ai.cadeia || [];
  const modules: PresetModule[] = HARDWARE_SLOTS.map((slot, slotIndex) => {
    const entryIndex = findCadeiaIndexForSlot(cadeia, slotIndex);
    const entry = entryIndex >= 0 ? cadeia[entryIndex] : undefined;
    if (!entry) {
      return {
        fxId: '',
        fxTitle: 'Desligado (Bypass)',
        type: slot.uiType,
        subType: slot.uiType,
        enabled: false,
        params: [],
      };
    }
    const alg = byTitle.get(entry.nomeEfeito.toLowerCase());
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
      type: slot.uiType,
      subType: slot.uiType,
      enabled: true,
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
    systemInstruction: {
      role: 'system',
      parts: [{ text: buildSystemPrompt(effective) }],
    },
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
