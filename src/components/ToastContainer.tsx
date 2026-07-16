import type { ToastState } from '../hooks/useToasts';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface Props {
  toasts: ToastState[];
  onDismiss: (id: number) => void;
}

const config = {
  success: { icon: CheckCircle2, border: 'border-cyan-400/60', bg: 'bg-cyan-400/10', text: 'text-cyan-300' },
  error: { icon: AlertCircle, border: 'border-red-500/60', bg: 'bg-red-500/10', text: 'text-red-300' },
  info: { icon: Info, border: 'border-sky-500/60', bg: 'bg-sky-500/10', text: 'text-sky-300' },
};

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => {
        const c = config[toast.type];
        const Icon = c.icon;
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border ${c.border} ${c.bg} backdrop-blur-md px-4 py-3 shadow-lg shadow-black/40 animate-[slideIn_0.3s_ease-out]`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${c.text}`} />
            <p className="text-sm text-slate-200 flex-1 leading-relaxed">{toast.message}</p>
            <button onClick={() => onDismiss(toast.id)} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
