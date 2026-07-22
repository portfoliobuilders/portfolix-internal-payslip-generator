'use client';

/**
 * Thin host for the authorised bank copy.
 * Layout is owned exclusively by lib/pdf-vector.ts → buildVectorPayslipPdf.
 * Preview uses the same ScaledPreview A4 sheet chrome as Draft/Final —
 * not a browser PDF-viewer chrome modal.
 */

import { useEffect, useRef, useState } from 'react';

interface AuthorisedSlipProps {
  /** Object URL for the canonical pdf-lib blob. */
  pdfUrl: string | null;
  /** Optional loading / empty message. */
  emptyMessage?: string;
  className?: string;
  title?: string;
}

/** Same A4 scaling used by Generator Draft/Final live preview. */
function ScaledA4({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const SHEET_PX = 794; // 210mm at 96dpi

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScale(Math.min(el.clientWidth / SHEET_PX, 1));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: SHEET_PX,
          height: 1123 * scale, // 297mm at 96dpi
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function AuthorisedSlip({
  pdfUrl,
  emptyMessage = 'Preparing authorised bank copy…',
  className = '',
  title = 'Authorised Salary Slip',
}: AuthorisedSlipProps) {
  if (!pdfUrl) {
    return (
      <div
        className={`flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  // Hide browser PDF toolbar/nav so preview matches Draft/Final sheet chrome.
  const embedSrc = pdfUrl.includes('#') ? pdfUrl : `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`;

  return (
    <ScaledA4>
      <div
        className={`slip-sheet relative mx-auto box-border overflow-hidden bg-paper text-ink shadow-lg ${className}`}
        style={{ width: '210mm', height: '297mm' }}
      >
        <iframe
          src={embedSrc}
          title={title}
          className="h-full w-full border-0 bg-paper"
        />
      </div>
    </ScaledA4>
  );
}

/**
 * Print the same PDF blob browsers already display.
 * Uses a hidden iframe — window.open(..., 'noopener') returns null and cannot print.
 */
export function printPdfBlobUrl(pdfUrl: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Print authorised salary slip');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.src = pdfUrl;
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      // ignore
    }
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Popup/print blocked — leave iframe briefly so the user can retry.
    }
    setTimeout(cleanup, 60_000);
  };

  // Fallback cleanup if onload never fires.
  setTimeout(cleanup, 120_000);
}
