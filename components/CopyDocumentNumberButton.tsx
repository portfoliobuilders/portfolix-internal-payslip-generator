'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** One-tap copy for the payslip / document number on the public verify page. */
export default function CopyDocumentNumberButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value || value === '—') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be blocked; fail silently — value remains selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-hairline text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      aria-label={copied ? 'Copied' : 'Copy document number'}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  );
}
