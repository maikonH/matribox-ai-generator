import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset, PresetModule, PresetModuleParam } from './types';
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

ESCOLHA DE ALGORITMOS — SEJA CRIATIVO E FIEL À DESCRIÇÃO:
- Analise RIGOROSAMENTE a descrição do usuário. Cada palavra importa: gênero, intensidade, referências de artista, década, clima. NUNCA use um algoritmo padrão por preguiça — escolha o que melhor representa o pedido.
- VARIE os blocos a cada geração. Não repita sempre a mesma cadeia. Dois prompts parecidos podem gerar timbres diferentes se o contexto mudar.
- AMP: escolha o amplificador condizente com o estilo:
  * Metal pesado / djent / hardcore → amps high-gain (ex.: Bog SV OD, Dragon, Euro Blue, Uber)
  * Hard rock / clássico → amps de ganho médio-alto (ex.: Brit 800, Plexi, J45)
  * Blues / vintage → amps vintage low-watt (ex.: B-Man, TWD Deluxe, Dark Deluxe)
  * Pop / funk / limpo → amps clean (ex.: Supero CL, Voks CL, TWD Lux)
  * Fusion / crunch → amps de break-up (ex.: Voks 30, B-Man, Dark Deluxe)
- CAB: escolha a caixa que combina com o amp e o estilo (1x12 para estúdio íntimo, 4x12 para palco, 2x12 para equilíbrio).
- DRIVE: só use pedais de drive quando o estilo pedir saturação extra. Para tons limpos, use drive com gain baixo ou prefira EQ/Volume. Varie o tipo de drive (overdrive, distortion, fuzz) conforme o pedido.
- MOD, DELAY, REVERB: ajuste aos efeitos típicos do gênero (chorus para funk, long delay para ambient, spring reverb para surf, etc.). Não inclua efeito que não combine só para preencher o slot — use parâmetros discretos quando necessário.
- NÃO existe um "preset padrão". Se a descrição for genérica, interprete o clima predominante e faça uma escolha artística, nunca a mesma de sempre.

FORMATO DE RESPOSTA (JSON estrito, formato Matribox II Pro):
{
  "name": "Nome do Preset",
  "description": "Descrição detalhada e conceitual do timbre...",
  "bpm": 120,
  "volume": 95,
  "modules": [
    {
      "effect_code": <número inteiro do fxId da lista>,
      "fxTitle": "<fxTitle exato da lista>",
      "type": "DRIVE",
      "subType": "DRIVE",
      "parameters": [0, 0, 0]
    }
  ]
}

REGRAS DO FORMATO MATRIBOX II PRO:
- "name": string com o nome do preset.
- "bpm": número inteiro.
- "volume": número inteiro (0-100).
- "modules": lista de objetos, cada um com:
  * "effect_code": número inteiro correspondente ao fxId numérico do algoritmo (NÃO string).
  * "fxTitle": string com o nome exato do algoritmo.
  * "type": string (DRIVE, AMP, CAB, EQ, MOD, DELAY, REVERB, VOLUME).
  * "subType": string.
  * "parameters": lista de números comuns (inteiros ou decimais), um por parâmetro do algoritmo, na mesma ordem da lista de params. Use números normais — NÃO use bytes, hexadecimais nem strings.
- Não inclua campos extras nem markdown.`;
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

function reconcilePreset(
  raw: MatriboxPreset,
  algorithms: Algorithm[],
  basePreset?: BasePreset | null,
): GeneratedPreset {
  const modules = (raw.modules || []).map((mod) => {
    const fxId = mod.effect_code !== undefined ? String(mod.effect_code) : mod.fxId || '';
    const alg = findAlgorithm(algorithms, fxId, mod.type, mod.fxTitle);
    const flatParams = Array.isArray(mod.parameters)
      ? mod.parameters.map((v) => Number(v))
      : null;
    const validParams = (alg?.params || []).map((algParam, idx) => {
      let value: number;
      if (flatParams && idx < flatParams.length) {
        value = clampParam(flatParams[idx], algParam.min, algParam.max);
      } else {
        const incoming = mod.params?.find((p) => p.name === algParam.name);
        value = incoming ? clampParam(Number(incoming.value), algParam.min, algParam.max) : algParam.value;
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
      // No matching algorithm found, but the AI returned numeric parameter
      // values — render them as generic 0-100 sliders so the chain is never
      // left visually empty.
      params = flatParams.map((v, i) => ({
        name: `param_${i}`,
        displayName: `Param ${i + 1}`,
        value: clampParam(v, 0, 100),
        min: 0,
        max: 100,
      }));
    } else {
      params = (mod.params || []).map((p) => ({ name: p.name, value: Number(p.value), min: 0, max: 100 }));
    }

    return {
      fxId: alg?.fxId || fxId,
      fxTitle: alg?.fxTitle || mod.fxTitle || '',
      type: alg?.type || mod.type || 'unknown',
      subType: alg?.subType || mod.subType || '',
      params,
    };
  });

  // Force the selected base tone's amp + cab fxIds so the rendered chain
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
    title: raw.name || raw.title || 'Preset Sem Nome',
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

  return reconcilePreset(parsed, algorithms, basePreset);
}
