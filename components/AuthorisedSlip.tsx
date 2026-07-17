'use client';

/**
 * Thin host for the authorised bank copy.
 * Layout is owned exclusively by lib/pdf-vector.ts → buildVectorPayslipPdf.
 * This component only displays the generated PDF blob (object URL).
 */

interface AuthorisedSlipProps {
  /** Object URL for the canonical pdf-lib blob. */
  pdfUrl: string | null;
  /** Optional loading / empty message. */
  emptyMessage?: string;
  className?: string;
  title?: string;
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
        className={`flex h-[min(80vh,842px)] items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`mx-auto overflow-hidden rounded-lg border border-hairline bg-paper shadow-lg ${className}`}
      style={{ width: '100%', maxWidth: '210mm' }}
    >
      <iframe
        src={pdfUrl}
        title={title}
        className="h-[min(80vh,842px)] w-full bg-paper"
      />
    </div>
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
