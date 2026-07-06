'use client';

/**
 * A4 PDF export via html2canvas + jsPDF. Libraries are imported lazily
 * so the main bundle stays lean and static export never touches them
 * at build time.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** Safe inset so captures never clip at the page edge. */
const MARGIN_MM = 6;

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
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
