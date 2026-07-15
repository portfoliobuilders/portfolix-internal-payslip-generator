'use client';

/** Tiny shared UI primitives — kept deliberately minimal. */

import { X } from 'lucide-react';
import { forwardRef } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-lg border border-hairline bg-paper shadow-pop sm:max-h-[calc(100dvh-4rem)] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 sm:h-8 sm:w-8"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[11px] leading-snug text-muted">{hint}</span>}
      {error && (
        <span className="mt-1.5 block text-[11px] font-medium leading-snug text-amber-brand">{error}</span>
      )}
    </label>
  );
}

// text-base (16px) on mobile prevents iOS Safari's auto-zoom on focus;
// sm+ drops back to the compact 14px desktop size.
export const inputCls =
  'w-full rounded-md border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors duration-150 hover:border-muted/40 focus:border-ink/40 focus:ring-2 focus:ring-ink/15 placeholder:text-muted/60 sm:text-sm';

export const inputAmountCls = `${inputCls} amount text-right`;

// min-h 44px on mobile = comfortable touch target; resets to compact on sm+.
export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-paper shadow-sm transition duration-150 hover:bg-ink/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-ink disabled:active:scale-100 sm:min-h-0';

export const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3.5 py-2 text-sm font-medium text-ink transition duration-150 hover:bg-surface hover:border-muted/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 sm:min-h-0';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${inputCls} ${className}`} {...props} />;
  },
);

export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function NumberInput({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        className={`${inputCls} tabular-nums ${className}`}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`${inputCls} min-h-[70px] resize-y ${className}`}
        {...props}
      />
    );
  },
);
