'use client';

/**
 * Preview/legacy A4 export via html2canvas + jsPDF.
 *
 * Production AUTHORISED / INTERNAL final documents should use
 * lib/pdf-vector.ts (text/vector). Do not treat a full-page screenshot
 * as the bank-grade PDF of record.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** Safe inset so captures never clip at the page edge. */
const MARGIN_MM = 6;

/** Wait for webfonts and in-tree images so baselines and assets capture cleanly. */
async function waitForExportReady(element: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness failures — continue with best-effort capture.
    }
  }

  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }),
    ),
  );
}

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  await waitForExportReady(element);

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#FFFFFF',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/png');

  const contentWidth = A4_WIDTH_MM - MARGIN_MM * 2;
  const contentHeight = A4_HEIGHT_MM - MARGIN_MM * 2;
  const imgHeightMm = (canvas.height * contentWidth) / canvas.width;

  if (imgHeightMm <= contentHeight + 0.5) {
    pdf.addImage(imgData, 'PNG', MARGIN_MM, MARGIN_MM, contentWidth, imgHeightMm);
  } else {
    // Scale down to fit a single A4 page when content is slightly tall.
    const scale = contentHeight / imgHeightMm;
    const scaledWidth = contentWidth * scale;
    const scaledHeight = imgHeightMm * scale;
    const x = MARGIN_MM + (contentWidth - scaledWidth) / 2;
    pdf.addImage(imgData, 'PNG', x, MARGIN_MM, scaledWidth, scaledHeight);
  }

  pdf.save(filename);
}
