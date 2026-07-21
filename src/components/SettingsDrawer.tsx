import { useState, useRef, useCallback } from 'react';
import type { Algorithm } from '../lib/types';
import { validateAlgData } from '../lib/jsonValidator';
import { getCategorized, isOverlayActive } from '../lib/algorithmStore';
import { ALGORITHM_COUNT } from '../lib/algorithmCatalog';
import { loadApiKey, saveApiKey, hasEnvApiKey } from '../lib/apiKeyStore';
import {
  X,
  UploadCloud,
  FileJson,
  Check,
  AlertTriangle,
  Database,
  Trash2,
  Key,
  Eye,
  EyeOff,
  Wrench,
  Info,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  algorithms: Algorithm[];
  onApplyDevOverlay: (algs: Algorithm[] | null) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SettingsDrawer({
  open,
  onClose,
  algorithms,
  onApplyDevOverlay,
  onToast,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const categories = getCategorized(algorithms);
  const overlayActive = isOverlayActive();

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = validateAlgData(text);
        if (result.success) {
          onApplyDevOverlay(result.algorithms);
          setPreviewCount(result.count);
          setPreviewError(null);
          onToast(
            `Overlay de desenvolvimento ativo: ${result.count} algoritmos carregados em memória.`,
            'info',
          );
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
    [onApplyDevOverlay, onToast],
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

  const handleResetOverlay = () => {
    onApplyDevOverlay(null);
    setPreviewCount(null);
    setPreviewError(null);
    onToast('Overlay de desenvolvimento removido. Catálogo oficial restaurado.', 'info');
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
              Chave da API Gemini
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeySaved(false);
                    }}
                    placeholder="AIza..."
                    className="w-full h-10 rounded-xl bg-[#0b0f19] border border-slate-800/80 pl-9 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => {
                    saveApiKey(apiKey.trim());
                    setKeySaved(true);
                    onToast('Chave salva com sucesso!', 'success');
                  }}
                  disabled={!apiKey.trim()}
                  className="h-10 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-cyan-500/20 shrink-0"
                >
                  Salvar
                </button>
              </div>
              {keySaved && (
                <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-lg px-3 py-2">
                  <Check className="w-3.5 h-3.5" />
                  Chave salva no navegador
                </div>
              )}
              {hasEnvApiKey() && !apiKey && (
                <div className="flex items-center gap-2 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2">
                  <Check className="w-3.5 h-3.5" />
                  Chave encontrada no .env (VITE_GEMINI_API_KEY) — já ativa no boot.
                </div>
              )}
              <p className="text-slate-600 text-xs">
                A chave do navegador tem prioridade; sem ela, a chave do .env é
                usada automaticamente. Nunca é enviada a terceiros.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Catálogo Oficial
            </h3>
            <div className="rounded-xl border border-slate-800/60 bg-[#0b0f19] p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center shrink-0">
                  <FileJson className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-200 text-sm font-semibold">Fonte</p>
                  <p className="text-slate-400 text-xs font-mono break-all">
                    src/data/alg_data.json
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
                <span className="text-slate-400 text-xs">Algoritmos carregados</span>
                <span className="text-cyan-300 text-sm font-bold tabular-nums">
                  {ALGORITHM_COUNT}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Última carga</span>
                <span className="text-slate-300 text-xs font-medium">Automática</span>
              </div>

              {overlayActive && (
                <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2 mt-1">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Overlay de desenvolvimento ativo — substitui temporariamente o
                  catálogo oficial em memória. Recarregar a página restaura o
                  catálogo oficial.
                </div>
              )}
            </div>
            <p className="text-slate-600 text-xs mt-2">
              Para atualizar o catálogo oficial, substitua{' '}
              <span className="font-mono text-slate-500">src/data/alg_data.json</span>{' '}
              e recompile a aplicação.
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
                Algoritmos na Memória
              </h3>
              <span className="text-cyan-300 text-xs font-bold tabular-nums">
                {algorithms.length}
              </span>
            </div>

            {algorithms.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                <FileJson className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nenhum algoritmo carregado.
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((cat) => (
                  <div
                    key={cat.type}
                    className="bg-[#0d1527] rounded-xl border border-slate-800/60 overflow-hidden"
                  >
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
                        <div
                          key={alg.fxId}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <span className="text-xs text-slate-400 truncate">
                            {alg.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-600 shrink-0">
                            {alg.fxId}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <button
              onClick={() => setDevOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-800/60 bg-[#0b0f19] hover:border-slate-700 transition-colors"
            >
              <span className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <Wrench className="w-4 h-4 text-amber-400" />
                Ferramentas do Desenvolvedor
              </span>
              <span className="text-slate-500 text-xs">{devOpen ? '−' : '+'}</span>
            </button>

            {devOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Substitui temporariamente o catálogo oficial para testes. Não
                  persiste após recarregar a página.
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 p-6 text-center ${
                    dragOver
                      ? 'border-amber-400 bg-amber-400/5 scale-[1.01]'
                      : 'border-slate-700 bg-[#0b0f19] hover:border-amber-500/40'
                  }`}
                >
                  <UploadCloud
                    className={`w-8 h-8 mx-auto mb-2 transition-colors ${
                      dragOver ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  />
                  <p className="text-slate-300 text-xs font-medium">
                    Arraste um alg_data.json ou clique
                  </p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Apenas para depuração — não substitui o catálogo oficial
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
                  <div className="flex items-center gap-2 text-sm text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2">
                    <Check className="w-4 h-4" />
                    {previewCount} algoritmos em overlay temporário
                  </div>
                )}
                {previewError && (
                  <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    {previewError}
                  </div>
                )}

                {overlayActive && (
                  <button
                    onClick={handleResetOverlay}
                    className="w-full flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg py-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover overlay de desenvolvimento
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
