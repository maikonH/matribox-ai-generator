import { useState } from 'react';
import type { PresetModule, PresetModuleParam } from '../lib/types';
import PremiumSlider from './PremiumSlider';
import ToggleSwitch from './ToggleSwitch';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import imgDrv from '../assets/module_btn_drv.png';
import imgAmp from '../assets/module_btn_amp.png';
import imgCab from '../assets/module_btn_cab.png';
import imgEq from '../assets/module_btn_eq.png';
import imgMod from '../assets/module_btn_mod.png';
import imgDly from '../assets/module_btn_dly.png';
import imgRvb from '../assets/module_btn_rvb.png';
import imgVol from '../assets/module_btn_vol.png';
import imgWah from '../assets/module_btn_wah.png';
import imgDyn from '../assets/module_btn_dyn.png';
import imgFreq from '../assets/module_btn_freq.png';

const moduleImageMap: Record<string, string> = {
  DRIVE: imgDrv,
  OD: imgDrv,
  AMP: imgAmp,
  CAB: imgCab,
  EQ: imgEq,
  MOD: imgMod,
  CHORUS: imgMod,
  DELAY: imgDly,
  REVERB: imgRvb,
  VOLUME: imgVol,
  VOLUME_PEDAL: imgVol,
  VOL: imgVol,
  WAH: imgWah,
  DYN: imgDyn,
  COMP: imgDyn,
  GATE: imgDyn,
  FREQ: imgFreq,
};

const TOGGLE_NAMES = new Set(['sync', 'trail', 'switch']);

function isToggleParam(param: PresetModuleParam): boolean {
  if (TOGGLE_NAMES.has(param.name.toLowerCase())) return true;
  return param.min === 0 && param.max === 1;
}

interface Props {
  module: PresetModule;
  index: number;
  onParamChange: (paramIndex: number, value: number) => void;
}

function resolveModuleIcon(module: PresetModule): string | undefined {
  const key = module.type.toUpperCase().trim();
  const direct = moduleImageMap[key];
  if (direct) return direct;
  const hay = `${module.type} ${module.name}`.toUpperCase().trim();
  if (hay.includes('VOLUME') || hay.includes('VOL')) return imgVol;
  if (
    hay.includes('MOD') ||
    hay.includes('CHORUS') ||
    hay.includes('FLANGER') ||
    hay.includes('PHASER')
  ) {
    return imgMod;
  }
  return moduleImageMap[key];
}

export default function SignalBlock({ module, index, onParamChange }: Props) {
  const [expanded, setExpanded] = useState(index === 0);

  if (!module || !module.fxId) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-xl px-4 py-3 text-xs text-slate-500">
        Desligado (Bypass)
      </div>
    );
  }

  const moduleIcon = resolveModuleIcon(module);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden transition-all">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-light/50 transition-colors text-left"
      >
        {moduleIcon ? (
          <img
            src={moduleIcon}
            alt={module.type}
            className="h-7 w-auto object-contain flex-shrink-0 mr-3"
          />
        ) : (
          <span className="flex items-center justify-center h-7 w-7 rounded-md bg-surface-light border border-border text-slate-500 flex-shrink-0 mr-3">
            <Layers className="w-4 h-4" />
          </span>
        )}
        <span className="text-white text-sm font-medium truncate flex-1">{module.name}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px]' : 'max-h-0'
        }`}
      >
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border">
          {module.params.map((param, pIdx) =>
            isToggleParam(param) ? (
              <ToggleSwitch
                key={param.name}
                param={param}
                onChange={(value) => onParamChange(pIdx, value)}
              />
            ) : (
              <PremiumSlider
                key={param.name}
                param={param}
                onChange={(value) => onParamChange(pIdx, value)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
