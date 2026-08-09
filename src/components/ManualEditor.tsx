import { useMemo, useState } from 'react';
import type { Algorithm, GeneratedPreset, PresetModule } from '../lib/types';
import btnAmpOn from '../icons/chain_btn_amp_on.png';
import btnCabOn from '../icons/chain_btn_cab&ir_on.png';
import btnDlyOn from '../icons/chain_btn_dly_on.png';
import btnDrvOn from '../icons/chain_btn_drv_on.png';
import btnDynOn from '../icons/chain_btn_dyn_on.png';
import btnEqOn from '../icons/chain_btn_eq_on.png';
import btnFreqOn from '../icons/chain_btn_freq_on.png';
import btnModOn from '../icons/chain_btn_mod_on.png';
import btnOff from '../icons/chain_btn_off.png';
import btnRvbOn from '../icons/chain_btn_rvb_on.png';
import btnVolOn from '../icons/chain_btn_vol_on.png';
import btnWahOn from '../icons/chain_btn_wah_on.png';
import imgAmpOff from '../icons/chain_img_amp_off.png';
import imgAmpOn from '../icons/chain_img_amp_on.png';
import imgCabOff from '../icons/chain_img_cab_off.png';
import imgCabOn from '../icons/chain_img_cab_on.png';
import imgDlyOff from '../icons/chain_img_dly_off.png';
import imgDlyOn from '../icons/chain_img_dly_on.png';
import imgDrvOff from '../icons/chain_img_drv_off.png';
import imgDrvOn from '../icons/chain_img_drv_on.png';
import imgDynOff from '../icons/chain_img_dyn_off.png';
import imgDynOn from '../icons/chain_img_dyn_on.png';
import imgEqOff from '../icons/chain_img_eq_off.png';
import imgEqOn from '../icons/chain_img_eq_on.png';
import imgFreqOff from '../icons/chain_img_freq_off.png';
import imgFreqOn from '../icons/chain_img_freq_on.png';
import imgModOff from '../icons/chain_img_mod_off.png';
import imgModOn from '../icons/chain_img_mod_on.png';
import imgRvbOff from '../icons/chain_img_rvb_off.png';
import imgRvbOn from '../icons/chain_img_rvb_on.png';
import imgVolOff from '../icons/chain_img_vol_off.png';
import imgVolOn from '../icons/chain_img_vol_on.png';
import imgWahOff from '../icons/chain_img_wah_off.png';
import imgWahOn from '../icons/chain_img_wah_on.png';
import moduleAmp from '../icons/module_btn_amp.png';
import moduleCab from '../icons/module_btn_cab.png';
import moduleDly from '../icons/module_btn_dly.png';
import moduleDrv from '../icons/module_btn_drv.png';
import moduleDyn from '../icons/module_btn_dyn.png';
import moduleEq from '../icons/module_btn_eq.png';
import moduleFreq from '../icons/module_btn_freq.png';
import moduleMod from '../icons/module_btn_mod.png';
import moduleRvb from '../icons/module_btn_rvb.png';
import moduleVol from '../icons/module_btn_vol.png';
import moduleWah from '../icons/module_btn_wah.png';

interface Props {
  algorithms: Algorithm[];
  currentPreset: GeneratedPreset;
  onPresetChange: (preset: GeneratedPreset) => void;
}

type IconPair = { on: string; off: string; buttonOn: string; category: string };

const ICONS: Record<string, IconPair> = {
  DYN: { on: imgDynOn, off: imgDynOff, buttonOn: btnDynOn, category: moduleDyn },
  FREQ: { on: imgFreqOn, off: imgFreqOff, buttonOn: btnFreqOn, category: moduleFreq },
  WAH: { on: imgWahOn, off: imgWahOff, buttonOn: btnWahOn, category: moduleWah },
  DRV: { on: imgDrvOn, off: imgDrvOff, buttonOn: btnDrvOn, category: moduleDrv },
  AMP: { on: imgAmpOn, off: imgAmpOff, buttonOn: btnAmpOn, category: moduleAmp },
  CAB: { on: imgCabOn, off: imgCabOff, buttonOn: btnCabOn, category: moduleCab },
  EQ: { on: imgEqOn, off: imgEqOff, buttonOn: btnEqOn, category: moduleEq },
  MOD: { on: imgModOn, off: imgModOff, buttonOn: btnModOn, category: moduleMod },
  DLY: { on: imgDlyOn, off: imgDlyOff, buttonOn: btnDlyOn, category: moduleDly },
  RVB: { on: imgRvbOn, off: imgRvbOff, buttonOn: btnRvbOn, category: moduleRvb },
  VOL: { on: imgVolOn, off: imgVolOff, buttonOn: btnVolOn, category: moduleVol },
};

const EDITOR_TYPES = ['DYN', 'DRV', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'];

export function createManualPreset(algorithms: Algorithm[]): GeneratedPreset {
  const modules = EDITOR_TYPES.flatMap((type) => {
    const algorithm = algorithms.find((item) => item.type.toUpperCase() === type);
    if (!algorithm) return [];
    return [{
      fxId: algorithm.fxId,
      fxTitle: algorithm.fxTitle,
      name: algorithm.name,
      type,
      subType: type,
      enabled: true,
      params: algorithm.params.map((param) => ({ ...param })),
    }];
  });

  return {
    title: 'ManualPreset',
    description: 'Preset criado no Editor Manual.',
    bpm: 120,
    volume: 95,
    modules,
  };
}

export default function ManualEditor({ algorithms, currentPreset, onPresetChange }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const selectedModule = currentPreset.modules[selectedIndex] ?? currentPreset.modules[0];
  const selectedType = selectedModule?.type.toUpperCase() ?? 'AMP';
  const listType = categoryFilter ?? selectedType;
  const models = useMemo(
    () => algorithms.filter((algorithm) => algorithm.type.toUpperCase() === listType),
    [algorithms, listType],
  );

  const updateModule = (index: number, update: (module: PresetModule) => PresetModule) => {
    onPresetChange({
      ...currentPreset,
      modules: currentPreset.modules.map((module, moduleIndex) =>
        moduleIndex === index ? update(module) : module,
      ),
    });
  };

  const toggleModule = (index: number) => {
    updateModule(index, (module) => ({ ...module, enabled: module.enabled === false }));
  };

  const selectCategory = (type: string) => {
    setCategoryFilter(type);
    const moduleIndex = currentPreset.modules.findIndex((module) => module.type.toUpperCase() === type);
    if (moduleIndex >= 0) setSelectedIndex(moduleIndex);
  };

  const selectModel = (algorithm: Algorithm) => {
    const moduleIndex = currentPreset.modules.findIndex((module) => module.type.toUpperCase() === algorithm.type.toUpperCase());
    if (moduleIndex < 0) return;
    setSelectedIndex(moduleIndex);
    updateModule(moduleIndex, (module) => ({
      ...module,
      fxId: algorithm.fxId,
      fxTitle: algorithm.fxTitle,
      name: algorithm.name,
      params: algorithm.params.map((param) => ({ ...param })),
    }));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="rounded-2xl border border-[#1e293b] bg-[#0b0f19] p-4 sm:p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold">Editor Manual</p>
            <h2 className="text-white text-lg font-bold mt-1">Cadeia de Sinal</h2>
          </div>
          <span className="text-xs text-slate-500">{currentPreset.modules.length} blocos ativos</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {currentPreset.modules.map((module, index) => {
            const icon = ICONS[module.type.toUpperCase()] ?? ICONS.AMP;
            const enabled = module.enabled !== false;
            return (
              <div
                key={`${module.fxId}-${index}`}
                className={`min-w-[92px] rounded-xl border p-2 transition-all ${
                  selectedIndex === index
                    ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_18px_-8px_rgba(34,211,238,0.9)]'
                    : 'border-[#1e293b] bg-[#131a26] hover:border-slate-600'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleModule(index)}
                  className="mx-auto block h-7 w-12 rounded-md hover:bg-slate-800/60 transition-colors"
                  aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${module.name}`}
                >
                  <img src={enabled ? icon.buttonOn : btnOff} alt="" className="h-full w-full object-contain" />
                </button>
                <button type="button" onClick={() => setSelectedIndex(index)} className="w-full text-center">
                  <img src={enabled ? icon.on : icon.off} alt={module.type} className="h-16 w-full object-contain mt-1" />
                  <span className={`block truncate text-[11px] mt-1 ${enabled ? 'text-slate-200' : 'text-slate-600'}`}>
                    {module.name}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1e293b] bg-[#0b0f19] p-3 sm:p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {EDITOR_TYPES.map((type) => {
            const icon = ICONS[type];
            const active = listType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectCategory(type)}
                className={`shrink-0 rounded-lg border p-1.5 transition-all ${active ? 'border-cyan-400 bg-cyan-400/10' : 'border-[#1e293b] bg-[#131a26] hover:border-slate-600'}`}
                aria-label={`Filtrar ${type}`}
              >
                <img src={icon.category} alt={type} className="h-9 w-auto object-contain" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1fr)_minmax(0,3fr)] gap-4 rounded-2xl border border-[#1e293b] bg-[#0b0f19] p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Modelos</p>
              <h3 className="text-white font-semibold mt-1">{listType}</h3>
            </div>
            <span className="text-[10px] text-slate-500">{models.length}</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto space-y-1 pr-1">
            {models.map((algorithm) => {
              const active = selectedModule?.fxId === algorithm.fxId;
              return (
                <button
                  key={algorithm.fxId}
                  type="button"
                  onClick={() => selectModel(algorithm)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-all ${active ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-200' : 'border-transparent text-slate-400 hover:border-[#1e293b] hover:bg-[#131a26] hover:text-slate-200'}`}
                >
                  <span className="block truncate">{algorithm.name}</span>
                  {active && <span className="text-[10px] text-cyan-400">Modelo atual</span>}
                </button>
              );
            })}
            {models.length === 0 && <p className="text-xs text-slate-600 py-6">Nenhum modelo nesta categoria.</p>}
          </div>
        </div>

        <div className="border-t lg:border-t-0 lg:border-l border-[#1e293b] pt-4 lg:pt-0 lg:pl-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Parâmetros</p>
              <h3 className="text-white font-semibold mt-1">{selectedModule?.name ?? 'Selecione um bloco'}</h3>
            </div>
            <span className="text-xs font-mono text-cyan-300">{selectedType}</span>
          </div>
          {selectedModule ? (
            <div className="space-y-5">
              {selectedModule.params.map((param, paramIndex) => {
                const range = param.max - param.min;
                const percent = range > 0 ? ((param.value - param.min) / range) * 100 : 0;
                return (
                  <div key={`${param.name}-${paramIndex}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-300">{param.displayName || param.name}</span>
                      <span className="text-xs font-mono text-cyan-300 tabular-nums">{Math.round(param.value)}</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-slate-800">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${percent}%` }} />
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={range > 10 ? 1 : 0.01}
                        value={param.value}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          updateModule(selectedIndex, (module) => ({
                            ...module,
                            params: module.params.map((item, index) => index === paramIndex ? { ...item, value } : item),
                          }));
                        }}
                        className="absolute inset-0 h-2 w-full cursor-pointer opacity-0"
                        aria-label={param.displayName || param.name}
                      />
                      <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-cyan-200 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" style={{ left: `calc(${percent}% - 8px)` }} />
                    </div>
                  </div>
                );
              })}
              {selectedModule.params.length === 0 && <p className="text-sm text-slate-500">Este modelo não possui parâmetros ajustáveis.</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Selecione um bloco na cadeia para editar.</p>
          )}
        </div>
      </section>
    </div>
  );
}
