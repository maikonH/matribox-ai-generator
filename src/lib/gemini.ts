import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule } from './types';
import { ALGORITHM_CATALOG } from './algorithmCatalog';
import { getEffectiveApiKey } from './apiKeyStore';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';
import { HARDWARE_SLOTS, findCadeiaIndexForSlot } from './hardwareSlots';
import algData from '../data/alg_data.json';

const MODEL_NAME = 'gemini-3.1-flash-lite';

// Compact catalog projected from the bundled alg_data.json: one entry per
// effect with its module code, fxid, exact fxTitle (the string presetBuilder
// resolves to an fxid), and the ordered parameter names. The prose / origin /
// mark fields are dropped so the payload stays at ~19KB instead of 850KB,
// well within the Flash-Lite context window while still giving the model every
// name and knob count it is allowed to use.
type AlgWidget = { name: string };
type AlgEntry = { fxid: number; fxtitle: string; widget?: AlgWidget[] };
type AlgModule = { name: string; alg: AlgEntry[] };

const ALG_MODULES: AlgModule[] = (algData as { Modules: AlgModule[] }).Modules;

interface SlimEffect {
  fxid: number;
  fxTitle: string;
  parametros: string[];
}
interface SlimModule {
  modulo: string;
  efeitos: SlimEffect[];
}

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

function slimFromAlgorithms(algorithms: Algorithm[]): SlimModule[] {
  const byModule = new Map<string, SlimEffect[]>();
  for (const a of algorithms) {
    const key = a.type.toUpperCase();
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key)!.push({
      fxid: Number(a.fxId),
      fxTitle: a.fxTitle,
      parametros: a.params.map((p) => p.name),
    });
  }
  return Array.from(byModule.entries()).map(([modulo, efeitos]) => ({ modulo, efeitos }));
}

const SYSTEM_PROMPT = (catalog: SlimModule[]): string => {
  const catalogJson = JSON.stringify(catalog);
  const total = catalog.reduce((sum, mod) => sum + mod.efeitos.length, 0);
  return `Você é um produtor musical e engenheiro de guitarra experiente, especialista na pedaleira Matribox II Pro (hardware QME-200). O usuário descreve um timbre em linguagem natural e você monta uma cadeia de sinal COMPLETA e integrada — amplificador, gabinete e pedais de ganho/ambientes ativados juntos para entregar o som pedido, nunca módulos soltos.

Você DEVE escolher os nomes dos efeitos e os módulos baseando-se estritamente neste catálogo oficial anexado aqui: ${catalogJson}. Não invente nenhum nome ou módulo fora desta lista.

Cada objeto do catálogo tem "modulo" (DYN, FREQ, WAH, DRV, AMP, CAB, MOD, DLY, RVB, VOL), "fxid", "fxTitle" (o nome exato que você devolve em "nomeEfeito") e "parametros" (a lista ordenada dos knobs). Existem ${total} efeitos disponíveis.

REGRAS:
1. Responda com UM único objeto JSON válido, sem markdown, sem code fences, sem texto fora do JSON.
2. "nomeEfeito" deve ser o fxTitle exato do catálogo (cópia idêntica, incluindo espaços e caixa). Nunca invente nomes.
3. "nomePatch": máximo 12 caracteres alfanuméricos, sem espaços, acentos ou símbolos.
4. "comentario": em português, explique quais pedais/amp/cab escolheu e por que combinam com o pedido.
5. "cadeia": array de módulos ativos na ordem do sinal. Cada item tem "modulo" (código do catálogo), "nomeEfeito" (fxTitle exato) e "knobs" (array de inteiros 0–100, um por item de "parametros", na mesma ordem).
6. É OBRIGATÓRIO incluir exatamente UM módulo AMP e UM módulo CAB, ambos do catálogo, com o gabinete sendo o par natural do amplificador.
7. Sempre inclua um módulo VOL final com o fxTitle "Volume". Seu knob é o volume master: alto ganho → 55–75, crunch → 72–85, limpo → 85–100.
8. O número e a ordem dos knobs DEVEM corresponder exatamente a "parametros" do fxTitle. Um valor 0–100 para cada, na mesma ordem.
9. FIDELIDADE AO PROMPT: o nomePatch, o comentario e a escolha de amp + cab + drive DEVEM refletir o gênero/artista pedido (ex: Metalcore → amp de alto ganho + cab 4x12 + distorção pesada). Nunca troque por outro gênero.

FORMATO DA RESPOSTA:
{
  "nomePatch": "NomeDoPreset",
  "comentario": "Explicação em português",
  "cadeia": [
    { "modulo": "DRV", "nomeEfeito": "Skreamer", "knobs": [70, 50, 80] },
    { "modulo": "AMP", "nomeEfeito": "UK 800", "knobs": [50, 60, 50, 70] }
  ]
}`;
};

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
 * Normalize the raw AI JSON into a validated AiPresetResponse. Empty effect
 * names are dropped from the chain; knobs are clamped to 0–100.
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
 * Project the validated AI response onto the 10 fixed hardware slots the UI
 * renders. Slots the AI did not activate become bypassed placeholders so the
 * UI can show "Desligado (Bypass)" and the file builder can write the zeroed
 * block.
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

  const catalog = algorithms.length > 0 ? slimFromAlgorithms(algorithms) : slimFromAlgData();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT(catalog) }] },
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
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
