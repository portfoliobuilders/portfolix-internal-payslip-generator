'use client';

import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  durationMs?: number;
}

/** Lightweight success toast — auto-dismisses after a few seconds. */
export default function Toast({ message, onClose, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-6 right-6 z-[60] flex max-w-sm items-start gap-2 rounded-lg border border-emerald-brand/30 bg-paper px-4 py-3 shadow-lg"
    >
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-brand" />
      <p className="flex-1 text-sm font-medium text-ink">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-muted hover:bg-surface hover:text-ink"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
