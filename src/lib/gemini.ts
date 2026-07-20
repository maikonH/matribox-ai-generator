import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule } from './types';
import { ALGORITHM_CATALOG } from './algorithmCatalog';
import { getEffectiveApiKey } from './apiKeyStore';
import type { AiPresetResponse, ChainEntry } from './presetBuilder';
import { findSlotForCode } from './hardwareSlots';

const MODEL_NAME = 'gemini-2.5-flash';

// The catalog sent to the Gemini model is projected dynamically from
// src/data/alg_data.json (via ALGORITHM_CATALOG — the single projection of the
// JSON, never re-read here). The projection strips fxid and verbose metadata:
// the AI picks effects by name, and the application resolves the fxid locally
// from the same JSON. This keeps the prompt compact (~19KB) while still giving
// the model every name and knob count it is allowed to use.

interface SlimEffect {
  fxTitle: string;
  parametros: string[];
}

interface SlimModule {
  modulo: string;
  efeitos: SlimEffect[];
}

function slimFromAlgorithms(algorithms: Algorithm[]): SlimModule[] {
  const byModule = new Map<string, SlimEffect[]>();
  for (const a of algorithms) {
    const key = a.type.toUpperCase();
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key)!.push({
      fxTitle: a.fxTitle,
      parametros: a.params.map((p) => p.name),
    });
  }
  return Array.from(byModule.entries()).map(([modulo, efeitos]) => ({ modulo, efeitos }));
}

// Canonical hardware module codes the AI is allowed to emit in `cadeia[].modulo`.
// Kept in sync with HARDWARE_SLOTS in hardwareSlots.ts.
const ALLOWED_MODULE_CODES = ['DYN', 'FREQ', 'WAH', 'DRV', 'AMP', 'CAB', 'MOD', 'DELAY', 'RVB', 'VOL'];

const SYSTEM_PROMPT = (catalog: SlimModule[]): string => {
  const catalogJson = JSON.stringify(catalog);
  const total = catalog.reduce((sum, mod) => sum + mod.efeitos.length, 0);
  return `Você é um produtor musical e engenheiro de guitarra experiente, especialista na pedaleira Matribox II Pro. O usuário descreve um timbre em linguagem natural e você monta uma cadeia de sinal COMPLETA e integrada — amplificador, gabinete e pedais de ganho/ambientes ativados juntos para entregar o som pedido, nunca módulos soltos.

Escolha os efeitos e os módulos estritamente a partir deste catálogo oficial anexado: ${catalogJson}. Não invente nenhum nome, efeito, amplificador ou gabinete fora desta lista. Existem ${total} efeitos disponíveis, organizados por módulo. Cada efeito tem "fxTitle" (o nome exato que você devolve em "nomeEfeito") e "parametros" (a lista ordenada dos knobs).

REGRAS:
1. Responda com UM único objeto JSON válido, sem markdown, sem code fences, sem texto fora do JSON.
2. Nunca inclua fxid, bytes, Base64 ou buffers na resposta. A aplicação localiza os FXIDs a partir do catálogo.
3. "nomeEfeito" deve ser o fxTitle exato do catálogo (cópia idêntica, incluindo espaços e caixa). Nunca invente nomes.
4. "nomePatch": máximo 12 caracteres alfanuméricos, sem espaços, acentos ou símbolos.
5. "comentario": em português, explique quais pedais/amp/cab escolheu e por que combinam com o pedido.
6. "cadeia": array de módulos ativos na ordem do sinal. Cada item tem EXATAMENTE três campos:\n   - "modulo": o código do módulo (apenas o campo "modulo" do catálogo). Os únicos valores permitidos são: ${ALLOWED_MODULE_CODES.join(', ')}. Nunca use o fxTitle, o nome do efeito, nem o subtipo do efeito (ex.: "4 X 12", "/", "Comp") como "modulo".\n   - "nomeEfeito": o fxTitle exato do catálogo.\n   - "knobs": array de inteiros 0–100, um por item de "parametros", na mesma ordem.
7. É OBRIGATÓRIO incluir exatamente UM módulo AMP e UM módulo CAB, ambos do catálogo, com o gabinete sendo o par natural do amplificador.
8. Sempre inclua um módulo VOL final com o fxTitle "Volume". Seu knob é o volume master: alto ganho → 55–75, crunch → 72–85, limpo → 85–100.
9. O número e a ordem dos knobs DEVEM corresponder exatamente a "parametros" do fxTitle. Um valor 0–100 para cada, na mesma ordem.
10. FIDELIDADE AO PROMPT: o nomePatch, o comentario e a escolha de amp + cab + drive DEVEM refletir o gênero/artista pedido (ex: Metalcore → amp de alto ganho + cab 4x12 + distorção pesada). Nunca troque por outro gênero.

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

// Normalize a name for comparison only — the original string is preserved for
// display. Collapses whitespace, lowercases, maps typographic quotes and the
// multiplication sign to ASCII, so "4 X 12", "4x12" and "4×12" all match.
function normalizeForCompare(name: string): string {
  return (name || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201C\u201D\u0060\u00B4]/g, "'")
    .replace(/[\u00D7\u2715]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normalize the raw AI JSON into a typed AiPresetResponse. Entries with an
 * empty effect name are dropped as noise; knobs are clamped to 0–100. This
 * does NOT validate against the catalog — that is validateAiResponse's job.
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
 * Validate the normalized AI response against the catalog (the alg_data.json
 * projection). Every entry must reference a known hardware module, an effect
 * that exists in the catalog, and the exact knob count the effect defines.
 * Throws on any validation failure so no preset is rendered and no .prst is
 * built — per spec, the app never generates a file when validation fails.
 */
export function validateAiResponse(ai: AiPresetResponse, catalog: Algorithm[]): AiPresetResponse {
  const byTitle = new Map(catalog.map((a) => [normalizeForCompare(a.fxTitle), a]));
  const errors: string[] = [];

  if (ai.cadeia.length === 0) {
    errors.push('A IA não retornou nenhum módulo na cadeia.');
  }

  ai.cadeia.forEach((entry, i) => {
    const pos = i + 1;
    const slot = findSlotForCode(entry.modulo);
    if (!slot) {
      errors.push(`Módulo "${entry.modulo}" (posição ${pos}) não existe na Matribox II Pro. Códigos permitidos: ${ALLOWED_MODULE_CODES.join(', ')}.`);
      return;
    }
    const alg = byTitle.get(normalizeForCompare(entry.nomeEfeito));
    if (!alg) {
      errors.push(`Efeito "${entry.nomeEfeito}" (posição ${pos}) não existe em alg_data.json.`);
      return;
    }
    if (entry.knobs.length !== alg.params.length) {
      errors.push(
        `Efeito "${entry.nomeEfeito}" (posição ${pos}): ${entry.knobs.length} knobs recebidos, ${alg.params.length} esperados.`,
      );
    }
  });

  if (errors.length > 0) {
    throw new Error(`Validação do preset falhou:\n${errors.join('\n')}`);
  }
  return ai;
}

/**
 * Project the validated AI response onto the UI. Returns ONLY the modules the
 * AI actually activated, in the order the AI returned them — the UI renders
 * exactly this list and nothing else. The 10-slot padding with zeroed bypass
 * blocks happens exclusively inside buildPresetFile, never here.
 */
export function aiResponseToPreset(ai: AiPresetResponse): GeneratedPreset {
  const byTitle = new Map(ALGORITHM_CATALOG.map((a) => [normalizeForCompare(a.fxTitle), a]));
  const modules: PresetModule[] = [];
  for (const entry of ai.cadeia) {
    const slot = findSlotForCode(entry.modulo);
    const alg = byTitle.get(normalizeForCompare(entry.nomeEfeito));
    if (!slot || !alg) continue;
    const params = alg.params.map((p, i) => ({
      name: p.name,
      displayName: p.displayName,
      value: i < entry.knobs.length ? entry.knobs[i] : p.value,
      min: p.min,
      max: p.max,
      unit: p.unit,
    }));
    modules.push({
      fxId: alg.fxId,
      fxTitle: alg.fxTitle,
      type: slot.uiType,
      subType: slot.uiType,
      enabled: true,
      params,
    });
  }

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

  // Single source of truth: the alg_data.json projection (ALGORITHM_CATALOG),
  // or a user-uploaded replacement when present. The same set builds the
  // prompt and validates the response, so the AI can never pick an effect the
  // app cannot resolve.
  const catalog = algorithms.length > 0 ? algorithms : ALGORITHM_CATALOG;
  const slim = slimFromAlgorithms(catalog);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT(slim) }] },
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

  // Audit trail: raw response, parsed JSON, and the object handed to the
  // validator. Surface these to the console so a validation failure can be
  // traced to the exact field that diverged.
  const normalized = normalizeAiResponse(parsed);
  console.log('===== GEMINI RAW RESPONSE =====');
  console.log(text);
  console.log('===== PARSED JSON =====');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('===== VALIDATION INPUT =====');
  console.table(normalized.cadeia);

  return validateAiResponse(normalized, catalog);
}
