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

/** Open the same PDF blob in a print-friendly window (browsers print PDFs natively). */
export function printPdfBlobUrl(pdfUrl: string): void {
  const w = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  if (!w) return;
  const tryPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      // Browser may block; user can print from the opened tab.
    }
  };
  // Give the PDF viewer a moment to load.
  w.addEventListener('load', () => setTimeout(tryPrint, 250));
  setTimeout(tryPrint, 800);
}
