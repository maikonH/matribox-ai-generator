import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

const CATEGORY_TYPES = ['DYN', 'FREQ', 'WAH', 'DRV', 'AMP', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'];

let instanceCounter = 0;
function nextInstanceId(type: string): string {
  instanceCounter += 1;
  return `${type.toLowerCase()}-instance-${instanceCounter}`;
}

export function createManualPreset(algorithms: Algorithm[]): GeneratedPreset {
  const modules = CATEGORY_TYPES.flatMap((type) => {
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

type ChainItem = PresetModule & { id: string };

function toChainItems(preset: GeneratedPreset): ChainItem[] {
  return preset.modules.map((module, index) => ({
    ...module,
    id: (module as PresetModule & { id?: string }).id ?? `${module.type.toLowerCase()}-instance-${index + 1}`,
  }));
}

function toPresetModules(items: ChainItem[]): PresetModule[] {
  return items.map(({ id: _id, ...module }) => module);
}

function createModule(type: string, algorithms: Algorithm[]): ChainItem {
  const algorithm = algorithms.find((item) => item.type.toUpperCase() === type) ?? algorithms[0];
  return {
    id: nextInstanceId(type),
    fxId: algorithm.fxId,
    fxTitle: algorithm.fxTitle,
    name: algorithm.name,
    type,
    subType: type,
    enabled: true,
    params: algorithm.params.map((param) => ({ ...param })),
  };
}

export default function ManualEditor({ algorithms, currentPreset, onPresetChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const chainItems = useMemo(() => toChainItems(currentPreset), [currentPreset]);
  const selected = chainItems.find((item) => item.id === selectedId) ?? chainItems[0] ?? null;
  const selectedType = selected?.type.toUpperCase() ?? 'AMP';
  const listType = categoryFilter ?? selectedType;
  const models = useMemo(
    () => algorithms.filter((algorithm) => algorithm.type.toUpperCase() === listType),
    [algorithms, listType],
  );

  const commit = (items: ChainItem[]) => {
    onPresetChange({
      ...currentPreset,
      modules: toPresetModules(items),
    });
  };

  const updateItem = (id: string, update: (module: ChainItem) => ChainItem) => {
    commit(chainItems.map((item) => (item.id === id ? update(item) : item)));
  };

  const toggleModule = (id: string) => {
    updateItem(id, (module) => ({ ...module, enabled: module.enabled === false }));
  };

  const selectCategory = (type: string) => {
    setCategoryFilter(type);
    const firstOfType = chainItems.find((item) => item.type.toUpperCase() === type);
    if (firstOfType) setSelectedId(firstOfType.id);
  };

  const selectModel = (algorithm: Algorithm) => {
    if (!selected) return;
    updateItem(selected.id, (module) => ({
      ...module,
      fxId: algorithm.fxId,
      fxTitle: algorithm.fxTitle,
      name: algorithm.name,
      params: algorithm.params.map((param) => ({ ...param })),
    }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    if (id.startsWith('palette-')) {
      setActiveDragType(id.replace('palette-', ''));
      setShowTrash(false);
    } else {
      setActiveDragType(null);
      setShowTrash(true);
    }
  };

  const computeInsertIndex = (active: { rect: { current: { translated: { left: number; width: number } | null; initial: { left: number; width: number } | null } } }, over: { id: string | number; rect: { left: number; width: number } } | null): number | null => {
    const overId = over ? String(over.id) : null;
    if (!overId || overId === 'trash-zone' || overId.startsWith('palette-')) return null;
    if (overId === 'chain-container') return chainItems.length;
    if (overId === 'chain-end') return chainItems.length;

    const overIndex = chainItems.findIndex((item) => item.id === overId);
    if (overIndex < 0) return null;

    let insertIndex = overIndex;
    const overRect = over?.rect;
    const activeRect = active.rect.current.translated ?? active.rect.current.initial;
    if (overRect && activeRect) {
      const overCenter = overRect.left + overRect.width / 2;
      const activeCenter = activeRect.left + activeRect.width / 2;
      if (activeCenter > overCenter) insertIndex = overIndex + 1;
    }
    return insertIndex;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;
    const overId = over ? String(over.id) : null;
    setOverTrash(overId === 'trash-zone');

    if (activeId?.startsWith('palette-')) {
      setPreviewIndex(computeInsertIndex(active, over));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdStr = String(active.id);
    const overId = over ? String(over.id) : null;

    setActiveId(null);
    setActiveDragType(null);
    setShowTrash(false);
    setOverTrash(false);
    setPreviewIndex(null);

    if (activeIdStr.startsWith('palette-')) {
      const type = activeIdStr.replace('palette-', '');
      const newModule = createModule(type, algorithms);

      const insertIndex = computeInsertIndex(active, over);
      if (insertIndex === null) {
        commit([...chainItems, newModule]);
        setSelectedId(newModule.id);
        return;
      }

      const newItems = [...chainItems];
      newItems.splice(insertIndex, 0, newModule);
      commit(newItems);
      setSelectedId(newModule.id);
      return;
    }

    if (overId === 'trash-zone' || overId === null) {
      const newItems = chainItems.filter((item) => item.id !== activeIdStr);
      if (selectedId === activeIdStr) setSelectedId(newItems[0]?.id ?? null);
      commit(newItems);
      return;
    }

    if (activeIdStr !== overId) {
      const oldIndex = chainItems.findIndex((item) => item.id === activeIdStr);
      const newIndex = chainItems.findIndex((item) => item.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) {
        commit(arrayMove(chainItems, oldIndex, newIndex));
      }
    }
  };

  const activeItem = activeId ? chainItems.find((item) => item.id === activeId) : null;
  const isDraggingFromPalette = activeId?.startsWith('palette-') ?? false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-5 animate-fade-in">
        <section className="rounded-2xl border border-[#1e293b] bg-[#0b0f19] p-4 sm:p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold">Editor Manual</p>
              <h2 className="text-white text-lg font-bold mt-1">Cadeia de Sinal Livre</h2>
            </div>
            <span className="text-xs text-slate-500">{chainItems.length} blocos</span>
          </div>
          <SortableContext items={chainItems.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
            <ChainContainer>
              {chainItems.map((item, index) => (
                <SortableBlock
                  key={item.id}
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onToggle={() => toggleModule(item.id)}
                  showGapBefore={previewIndex === index}
                />
              ))}
              <ChainEndDropzone />
            </ChainContainer>
          </SortableContext>
          <p className="text-[11px] text-slate-500 mt-2">
            Arraste para reordenar. Solte um bloco fora da cadeia ou na lixeira para remover.
          </p>
        </section>

        <section className="rounded-2xl border border-[#1e293b] bg-[#0b0f19] p-3 sm:p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Arraste uma categoria para a cadeia</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_TYPES.map((type) => {
              const icon = ICONS[type];
              const active = listType === type;
              return (
                <PaletteButton key={type} type={type} icon={icon.category} active={active} onClick={() => selectCategory(type)} />
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
                const active = selected?.fxId === algorithm.fxId;
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
                <h3 className="text-white font-semibold mt-1">{selected?.name ?? 'Selecione um bloco'}</h3>
              </div>
              <span className="text-xs font-mono text-cyan-300">{selectedType}</span>
            </div>
            {selected ? (
              <div className="space-y-5">
                {selected.params.map((param, paramIndex) => {
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
                            updateItem(selected.id, (module) => ({
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
                {selected.params.length === 0 && <p className="text-sm text-slate-500">Este modelo não possui parâmetros ajustáveis.</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecione ou arraste um bloco para a cadeia para editar.</p>
            )}
          </div>
        </section>
      </div>

      <TrashDropzone visible={showTrash} active={overTrash} />

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <BlockGhost item={activeItem} />
        ) : isDraggingFromPalette && activeDragType ? (
          <BlockGhost item={createModule(activeDragType, algorithms)} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableBlock({ item, selected, onSelect, onToggle, showGapBefore }: {
  item: ChainItem;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  showGapBefore: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const icon = ICONS[item.type.toUpperCase()] ?? ICONS.AMP;
  const enabled = item.enabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: showGapBefore ? '3rem' : '0',
      }}
      className={`min-w-[92px] rounded-xl border p-2 transition-all ${isDragging ? 'opacity-40' : ''} ${
        selected
          ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_18px_-8px_rgba(34,211,238,0.9)]'
          : 'border-[#1e293b] bg-[#131a26] hover:border-slate-600'
      }`}
    >
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          className="h-7 w-12 rounded-md hover:bg-slate-800/60 transition-colors"
          aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${item.name}`}
        >
          <img src={enabled ? icon.buttonOn : btnOff} alt="" className="h-full w-full object-contain" />
        </button>
      </div>
      <button type="button" onClick={onSelect} className="w-full text-center mt-1" {...attributes} {...listeners}>
        <img src={enabled ? icon.on : icon.off} alt={item.type} className="h-16 w-full object-contain" />
        <span className={`block truncate text-[11px] mt-1 ${enabled ? 'text-slate-200' : 'text-slate-600'}`}>
          {item.name}
        </span>
      </button>
    </div>
  );
}

function BlockGhost({ item }: { item: ChainItem }) {
  const icon = ICONS[item.type.toUpperCase()] ?? ICONS.AMP;
  const enabled = item.enabled !== false;
  return (
    <div className="min-w-[92px] rounded-xl border border-cyan-400 bg-[#131a26]/90 p-2 opacity-80 shadow-[0_0_24px_-4px_rgba(34,211,238,0.8)] pointer-events-none">
      <div className="flex justify-center">
        <img src={enabled ? icon.buttonOn : btnOff} alt="" className="h-7 w-12 object-contain" />
      </div>
      <img src={enabled ? icon.on : icon.off} alt={item.type} className="h-16 w-full object-contain mt-1" />
      <span className="block truncate text-[11px] mt-1 text-slate-200">{item.name}</span>
    </div>
  );
}

function PaletteButton({ type, icon, active, onClick }: {
  type: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`shrink-0 rounded-lg border p-1.5 transition-all ${isDragging ? 'opacity-40' : ''} ${active ? 'border-cyan-400 bg-cyan-400/10' : 'border-[#1e293b] bg-[#131a26] hover:border-slate-600'}`}
      aria-label={`Adicionar ${type}`}
    >
      <img src={icon} alt={type} className="h-9 w-auto object-contain" />
    </button>
  );
}

function ChainContainer({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'chain-container' });
  return (
    <div ref={setNodeRef} className="flex gap-3 overflow-x-auto pb-2 min-h-[120px]">
      {children}
    </div>
  );
}

function ChainEndDropzone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'chain-end' });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-[40px] rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${isOver ? 'border-cyan-400 bg-cyan-400/10' : 'border-[#1e293b] border-transparent'}`}
    >
      {isOver && <span className="text-[10px] text-cyan-400">+ soltar</span>}
    </div>
  );
}

function TrashDropzone({ visible, active }: { visible: boolean; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash-zone' });
  const show = visible && (active || isOver);
  return (
    <div
      ref={setNodeRef}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
    >
      <div className={`flex items-center gap-2 rounded-full border px-5 py-3 ${isOver ? 'border-red-500 bg-red-500/20 shadow-[0_0_24px_-4px_rgba(239,68,68,0.8)]' : 'border-red-500/40 bg-red-950/40 backdrop-blur'}`}>
        <svg className={`w-5 h-5 ${isOver ? 'text-red-400' : 'text-red-400/80'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
        <span className={`text-xs font-semibold ${isOver ? 'text-red-300' : 'text-red-300/80'}`}>
          {isOver ? 'Solte para remover' : 'Arraste para a lixeira'}
        </span>
      </div>
    </div>
  );
}

export default ManualEditor

export { createManualPreset }