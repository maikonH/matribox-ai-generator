import { Sparkles, Loader2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onQuickPrompt: (prompt: string) => void;
}

const quickPrompts = [
  'Djent moderno em Drop A',
  'Blues limpo com reverb de mola',
  'Solo rock anos 80 saturado',
  'Metalcore agressivo com boost',
  'Ambient etéreo com delay longo',
  'Funk rhythm wah cortante',
];

export default function PromptBar({ value, onChange, onSubmit, loading, onQuickPrompt }: Props) {
  return (
    <div className="w-full">
      <div className="relative flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading && value.trim()) onSubmit();
          }}
          placeholder="Descreva o timbre que você quer gerar..."
          disabled={loading}
          className="flex-1 h-12 rounded-xl bg-[#0b0f19] border border-slate-800/80 px-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all disabled:opacity-50"
        />
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="h-12 px-5 sm:px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-bold text-sm flex items-center gap-2 hover:shadow-lg hover:shadow-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          <span className="hidden sm:inline">{loading ? 'Gerando...' : 'Gerar Preset'}</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onQuickPrompt(prompt)}
            disabled={loading}
            className="px-3 py-1.5 rounded-full bg-[#0d1527] border border-slate-800/60 text-xs text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-all disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
