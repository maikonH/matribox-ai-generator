import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule } from './types';
import { findAlgorithm } from './algorithmStore';
import { getEffectiveApiKey } from './apiKeyStore';
import type { BasePreset } from './basePresets';

const MODEL_NAME = 'gemini-3.1-flash-lite';

function buildSystemPrompt(algorithms: Algorithm[], basePreset?: BasePreset | null): string {
  const algList = algorithms
    .map((a) => {
      const params = a.params
        .map((p) => `    ${p.name} (min:${p.min}, max:${p.max}${p.unit ? ', unit:' + p.unit : ''})`)
        .join('\n');
      return `  - fxId: "${a.fxId}" | fxTitle: "${a.fxTitle}" | type: "${a.type}" | subType: "${a.subType}"\n    params:\n${params}`;
    })
    .join('\n');

  const baseInstruction = basePreset
    ? `BASE OBRIGATÓRIO: O usuário selecionou o tom base "${basePreset.name}" (${basePreset.ampName} + ${basePreset.cabName}).
Você DEVE usar obrigatoriamente:
  - Módulo AMP: fxId="${basePreset.ampFxId}" (fxTitle="${basePreset.ampName}")
  - Módulo CAB: fxId="${basePreset.cabFxId}" (fxTitle="${basePreset.cabName}")
NÃO substitua o amplificador nem a caixa — construa o resto da cadeia (DRIVE, EQ, MOD, DELAY, REVERB, VOLUME) AO REDOR deste tom base.
Descrição do tom base: ${basePreset.description}

`
    : '';

  return `Você é o Matribox II Pro, um engenheiro de som especializado em gerar presets para processadores de guitarra.
Sua tarefa é criar um preset completo baseado no prompt do usuário, utilizando SOMENTE os algoritmos disponíveis na lista abaixo.

${baseInstruction}ALGORITMOS DISPONÍVEIS (fxId, fxTitle, type, subType, params com min/max):
${algList}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em JSON válido, sem markdown, sem texto adicional.
2. Use apenas fxId e fxTitle que existam na lista acima.
3. Gere EXATAMENTE 8 módulos nesta ordem fixa: DRIVE, AMP, CAB, EQ, MOD, DELAY, REVERB, VOLUME.
4. Parâmetros por módulo: DRIVE(3), AMP(5), CAB(3), EQ(3), MOD(3), DELAY(2), REVERB(4), VOLUME(1).
5. Cada parâmetro deve estar dentro do range [min, max] do algoritmo correspondente.
6. A descrição do preset deve ser textual, conceitual e detalhada sobre o timbre, estilo musical e contexto de uso.

FORMATO DE RESPOSTA (JSON estrito):
{
  "title": "Nome do Preset",
  "description": "Descrição detalhada e conceitual do timbre...",
  "bpm": 120,
  "volume": 95,
  "modules": [
    {
      "fxId": "drive_tube808",
      "fxTitle": "Tube 808 Drive",
      "type": "DRIVE",
      "subType": "DRIVE",
      "params": [
        { "name": "gain", "value": 35 },
        { "name": "tone", "value": 50 },
        { "name": "level", "value": 70 }
      ]
    }
  ]
}`;
}

function clampParam(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

function reconcilePreset(
  raw: GeneratedPreset,
  algorithms: Algorithm[],
  basePreset?: BasePreset | null,
): GeneratedPreset {
  const modules = (raw.modules || []).map((mod) => {
    const alg = findAlgorithm(algorithms, mod.fxId, mod.type);
    const validParams = (alg?.params || []).map((algParam) => {
      const incoming = mod.params?.find((p) => p.name === algParam.name);
      const value = incoming ? clampParam(Number(incoming.value), algParam.min, algParam.max) : algParam.value;
      return {
        name: algParam.name,
        displayName: algParam.displayName,
        value,
        min: algParam.min,
        max: algParam.max,
        unit: algParam.unit,
      };
    });
    return {
      fxId: alg?.fxId || mod.fxId,
      fxTitle: alg?.fxTitle || mod.fxTitle,
      type: alg?.type || mod.type,
      subType: alg?.subType || mod.subType,
      params: validParams.length > 0 ? validParams : mod.params,
    };
  });

  // Force the selected base tone's amp + cab fxIds so the downloaded .prst
  // preserves the exact amp+cab algorithm the user picked, regardless of what
  // the AI returned for those slots.
  let finalModules = modules;
  if (basePreset) {
    finalModules = modules.map((mod, i) => {
      if (i === 1) {
        return patchModule(mod, basePreset.ampFxId, basePreset.ampName, algorithms);
      }
      if (i === 2) {
        return patchModule(mod, basePreset.cabFxId, basePreset.cabName, algorithms);
      }
      return mod;
    });
  }

  return {
    title: raw.title || 'Preset Sem Nome',
    description: raw.description || '',
    bpm: raw.bpm || 120,
    volume: raw.volume ?? 95,
    modules: finalModules,
  };
}

function patchModule(
  mod: PresetModule,
  fxId: string,
  fxTitle: string,
  algorithms: Algorithm[],
): PresetModule {
  const alg = findAlgorithm(algorithms, fxId);
  if (alg) {
    const validParams = alg.params.map((algParam) => {
      const incoming = mod.params?.find((p) => p.name === algParam.name);
      const value = incoming ? clampParam(Number(incoming.value), algParam.min, algParam.max) : algParam.value;
      return {
        name: algParam.name,
        displayName: algParam.displayName,
        value,
        min: algParam.min,
        max: algParam.max,
        unit: algParam.unit,
      };
    });
    return {
      fxId: alg.fxId,
      fxTitle: alg.fxTitle,
      type: alg.type,
      subType: alg.subType || '',
      params: validParams,
    };
  }
  return { ...mod, fxId, fxTitle };
}

export async function generatePreset(
  userPrompt: string,
  algorithms: Algorithm[],
  basePreset?: BasePreset | null,
): Promise<GeneratedPreset> {
  const apiKey = getEffectiveApiKey();
  if (!apiKey) {
    throw new Error('Chave do Gemini não configurada. Abra Settings e adicione sua chave da API Gemini, ou defina VITE_GEMINI_API_KEY no .env.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(algorithms, basePreset),
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
      throw new Error('Limite de requisições atingido (Rate Limit 429). Aguarde alguns segundos e tente novamente.');
    }
    throw new Error(`Erro na API Gemini: ${err?.message || String(e)}`);
  }

  const text = result.response.text();
  let parsed: GeneratedPreset;
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

  return reconcilePreset(parsed, algorithms, basePreset);
}
