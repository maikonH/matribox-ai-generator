import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Algorithm, GeneratedPreset } from './types';
import { findAlgorithm } from './algorithmStore';

const MODEL_NAME = 'gemini-2.5-flash-lite';

function buildSystemPrompt(algorithms: Algorithm[]): string {
  const algList = algorithms
    .map((a) => {
      const params = a.params
        .map((p) => `    ${p.name} (min:${p.min}, max:${p.max}${p.unit ? ', unit:' + p.unit : ''})`)
        .join('\n');
      return `  - fxId: "${a.fxId}" | fxTitle: "${a.fxTitle}" | type: "${a.type}" | subType: "${a.subType}"\n    params:\n${params}`;
    })
    .join('\n');

  return `Você é o Matribox II Pro, um engenheiro de som especializado em gerar presets para processadores de guitarra.
Sua tarefa é criar um preset completo baseado no prompt do usuário, utilizando SOMENTE os algoritmos disponíveis na lista abaixo.

ALGORITMOS DISPONÍVEIS (fxId, fxTitle, type, subType, params com min/max):
${algList}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em JSON válido, sem markdown, sem texto adicional.
2. Use apenas fxId e fxTitle que existam na lista acima.
3. Cada módulo deve ter entre 3 e 6 parâmetros, cada um dentro do range [min, max] do algoritmo correspondente.
4. Inclua entre 5 e 8 módulos formando uma cadeia de sinal coerente (Comp, Drive, Amp, Cab, EQ, Delay, Reverb, etc.).
5. A descrição do preset deve ser textual, conceitual e detalhada sobre o timbre, estilo musical e contexto de uso.

FORMATO DE RESPOSTA (JSON estrito):
{
  "title": "Nome do Preset",
  "description": "Descrição detalhada e conceitual do timbre...",
  "bpm": 120,
  "volume": 95,
  "modules": [
    {
      "fxId": "comp_calif_fast",
      "fxTitle": "Calif IV Comp Fast",
      "type": "COMP",
      "subType": "COMP",
      "params": [
        { "name": "threshold", "value": -24 },
        { "name": "ratio", "value": 4 }
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

  return {
    title: raw.title || 'Preset Sem Nome',
    description: raw.description || '',
    bpm: raw.bpm || 120,
    volume: raw.volume ?? 95,
    modules,
  };
}

export async function generatePreset(
  userPrompt: string,
  algorithms: Algorithm[],
): Promise<GeneratedPreset> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY não configurada. Abra Settings e adicione sua chave do Gemini.');
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

  return reconcilePreset(parsed, algorithms);
}
