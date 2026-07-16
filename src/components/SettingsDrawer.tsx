import { useState, useRef, useCallback } from 'react';
import type { Algorithm } from '../lib/types';
import { validateAlgData } from '../lib/jsonValidator';
import { saveAlgorithms, getCategorized } from '../lib/algorithmStore';
import { X, UploadCloud, FileJson, Check, AlertTriangle, Database, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  algorithms: Algorithm[];
  onAlgorithmsChanged: (algs: Algorithm[]) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SettingsDrawer({
  open,
  onClose,
  algorithms,
  onAlgorithmsChanged,
  onToast,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = getCategorized(algorithms);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = validateAlgData(text);
        if (result.success) {
          saveAlgorithms(result.algorithms);
          onAlgorithmsChanged(result.algorithms);
          setPreviewCount(result.count);
          setPreviewError(null);
          onToast(`${result.count} algoritmos carregados e salvos!`, 'success');
        } else {
          setPreviewError(result.error || 'Erro ao processar arquivo.');
          setPreviewCount(null);
          onToast(result.error || 'Erro ao processar arquivo.', 'error');
        }
      };
      reader.onerror = () => {
        setPreviewError('Falha ao ler o arquivo.');
        onToast('Falha ao ler o arquivo.', 'error');
      };
      reader.readAsText(file);
    },
    [onAlgorithmsChanged, onToast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.json') || file.type === 'application/json')) {
        handleFile(file);
      } else {
        onToast('Envie um arquivo .json válido.', 'error');
      }
    },
    [handleFile, onToast],
  );

  const handleReset = () => {
    localStorage.removeItem('matribox_algorithms');
    onAlgorithmsChanged([]);
    setPreviewCount(null);
    setPreviewError(null);
    onToast('Algoritmos limpos da memória.', 'info');
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#030712] border-l border-slate-800/60 z-[70] transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-bold text-sm tracking-tight">Configurações</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Upload do alg_data.json
            </h3>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 p-8 text-center ${
                dragOver
                  ? 'border-cyan-400 bg-cyan-400/5 scale-[1.01]'
                  : 'border-slate-700 bg-[#0b0f19] hover:border-cyan-500/40'
              }`}
            >
              <UploadCloud
                className={`w-10 h-10 mx-auto mb-3 transition-colors ${
                  dragOver ? 'text-cyan-400' : 'text-slate-500'
                }`}
              />
              <p className="text-slate-300 text-sm font-medium">
                Arraste o arquivo ou clique para selecionar
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Formato: .json — compatível com Sonicake (fxTitle/name, fxId string/number)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            {previewCount !== null && (
              <div className="mt-3 flex items-center gap-2 text-sm text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-lg px-3 py-2">
                <Check className="w-4 h-4" />
                {previewCount} algoritmos processados
              </div>
            )}
            {previewError && (
              <div className="mt-3 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {previewError}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
                Algoritmos na Memória
              </h3>
              <span className="text-cyan-300 text-xs font-bold tabular-nums">{algorithms.length}</span>
            </div>

            {algorithms.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                <FileJson className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nenhum algoritmo carregado.
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((cat) => (
                  <div key={cat.type} className="bg-[#0d1527] rounded-xl border border-slate-800/60 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-900/40 border-b border-slate-800/40">
                      <span className="text-xs font-semibold text-slate-300">
                        {cat.displayName}
                      </span>
                      <span className="text-slate-500 text-xs ml-2 tabular-nums">
                        ({cat.algorithms.length})
                      </span>
                    </div>
                    <div className="divide-y divide-slate-800/40">
                      {cat.algorithms.map((alg) => (
                        <div key={alg.fxId} className="px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-400 truncate">{alg.fxTitle}</span>
                          <span className="text-[10px] font-mono text-slate-600 shrink-0">{alg.fxId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {algorithms.length > 0 && (
              <button
                onClick={handleReset}
                className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg py-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Limpar memória
              </button>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
