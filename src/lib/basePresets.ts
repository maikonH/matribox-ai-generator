// Base tone presets (amp + cab only). Each is a factory .prst file containing
// an amp+cab combination that the AI builds the rest of the chain around.
// The amp/cab fxIds are mapped from alg_data.json so the AI and the download
// template use the exact algorithm the user selected.

import darkDeluxe from '../data/amp+cab/60-A_Dark_Deluxe.prst?raw';
import darkDouble from '../data/amp+cab/60-A_Dark_Double.prst?raw';
import supero2CL from '../data/amp+cab/60-A_Supero_2_CL.prst?raw';
import supero2OD from '../data/amp+cab/60-A_Supero_2_OD.prst?raw';
import voks15TB from '../data/amp+cab/60-A_Voks_15TB.prst?raw';
import voks30N from '../data/amp+cab/60-A_Voks_30N.prst?raw';
import voks30TB from '../data/amp+cab/60-A_Voks_30TB.prst?raw';
import bmanBri from '../data/amp+cab/60-A_b-man_Bri.prst?raw';
import bmanN from '../data/amp+cab/60-A_b-man_N.prst?raw';
import twdDeluxe from '../data/amp+cab/60-A_twd_deluxe.prst?raw';

export interface BasePreset {
  id: string;
  name: string;
  fileName: string;
  ampFxId: string;
  ampName: string;
  cabFxId: string;
  cabName: string;
  description: string;
  bytes: number[];
}

function decode(b64: string): number[] {
  return JSON.parse(atob(b64.trim()));
}

function readName(bytes: number[]): string {
  let s = '';
  for (let i = 30; i <= 44 && i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += String.fromCharCode(bytes[i]);
  }
  return s.trim();
}

interface RawEntry {
  id: string;
  fileName: string;
  raw: string;
  ampFxId: string;
  ampName: string;
  cabFxId: string;
  cabName: string;
  description: string;
}

const rawEntries: RawEntry[] = [
  {
    id: 'twd_deluxe',
    fileName: '60-A_twd_deluxe.prst',
    raw: twdDeluxe,
    ampFxId: '117440513',
    ampName: 'TWD Deluxe',
    cabFxId: '167772180',
    cabName: 'TWD 2x10',
    description: 'Fender Tweed Deluxe 5E3 — clean dinâmico, do country ao overdrive selvagem',
  },
  {
    id: 'bman_n',
    fileName: '60-A_b-man_N.prst',
    raw: bmanN,
    ampFxId: '117440515',
    ampName: 'B-Man N',
    cabFxId: '167772190',
    cabName: 'B-Man 4x10',
    description: 'Fender 5F6-A Tweed Bassman Normal — clean cristalino com dinâmica de tubo',
  },
  {
    id: 'bman_bri',
    fileName: '60-A_b-man_Bri.prst',
    raw: bmanBri,
    ampFxId: '117440548',
    ampName: 'B-Man Bri',
    cabFxId: '167772190',
    cabName: 'B-Man 4x10',
    description: 'Fender 5F6-A Tweed Bassman Bright — brilho extra, timbre clássico de rock',
  },
  {
    id: 'dark_double',
    fileName: '60-A_Dark_Double.prst',
    raw: darkDouble,
    ampFxId: '117440516',
    ampName: 'Dark Double',
    cabFxId: '167772163',
    cabName: 'Dark LUX 1x12',
    description: 'Dark Double — clean encorpado com presença, ideal para ritmos encorpados',
  },
  {
    id: 'dark_deluxe',
    fileName: '60-A_Dark_Deluxe.prst',
    raw: darkDeluxe,
    ampFxId: '117440517',
    ampName: 'Dark Deluxe',
    cabFxId: '167772163',
    cabName: 'Dark LUX 1x12',
    description: 'Dark Deluxe — clean luxuoso e quente, excelente base para timbres modernos',
  },
  {
    id: 'supero_2_cl',
    fileName: '60-A_Supero_2_CL.prst',
    raw: supero2CL,
    ampFxId: '117440527',
    ampName: 'Supero 2 CL',
    cabFxId: '167772183',
    cabName: 'Supero 2x12',
    description: 'Supero 2 Clean — clean de amplo range, versátil para qualquer estilo',
  },
  {
    id: 'supero_2_od',
    fileName: '60-A_Supero_2_OD.prst',
    raw: supero2OD,
    ampFxId: '117440552',
    ampName: 'Supero 2 OD',
    cabFxId: '167772183',
    cabName: 'Supero 2x12',
    description: 'Supero 2 Overdrive — drive musculoso, ótimo para rock e hard rock',
  },
  {
    id: 'voks_15tb',
    fileName: '60-A_Voks_15TB.prst',
    raw: voks15TB,
    ampFxId: '117440528',
    ampName: 'Voks 15TB',
    cabFxId: '167772168',
    cabName: 'Voks 1x12',
    description: 'Voks 15TB — timbre britânico chimeante, clean nítido com caráter',
  },
  {
    id: 'voks_30n',
    fileName: '60-A_Voks_30N.prst',
    raw: voks30N,
    ampFxId: '117440529',
    ampName: 'Voks 30N',
    cabFxId: '167772175',
    cabName: 'Voks 2x12',
    description: 'Voks 30 Normal — clean britânico clássico, base perfeita para blues e rock',
  },
  {
    id: 'voks_30tb',
    fileName: '60-A_Voks_30TB.prst',
    raw: voks30TB,
    ampFxId: '117440551',
    ampName: 'Voks 30TB',
    cabFxId: '167772175',
    cabName: 'Voks 2x12',
    description: 'Voks 30 Top Boost — brilho britânico icônico, timbre de rock clássico',
  },
];

export const basePresets: BasePreset[] = rawEntries.map((e) => {
  const bytes = decode(e.raw);
  return {
    id: e.id,
    name: readName(bytes),
    fileName: e.fileName,
    ampFxId: e.ampFxId,
    ampName: e.ampName,
    cabFxId: e.cabFxId,
    cabName: e.cabName,
    description: e.description,
    bytes,
  };
});

export function getBasePreset(id: string): BasePreset | undefined {
  return basePresets.find((p) => p.id === id);
}
