'use client';

/**
 * A4 PDF export via html2canvas + jsPDF. Libraries are imported lazily
 * so the main bundle stays lean and static export never touches them
 * at build time.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: false,
    logging: false,
    backgroundColor: '#FFFFFF',
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/png');

  // Fit the capture to the A4 width; paginate if the sheet overflows one page.
  const imgHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

  if (imgHeightMm <= A4_HEIGHT_MM + 1) {
    pdf.addImage(imgData, 'PNG', 0, 0, A4_WIDTH_MM, imgHeightMm);
  } else {
    let remaining = imgHeightMm;
    let offset = 0;
    while (remaining > 0) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -offset, A4_WIDTH_MM, imgHeightMm);
      offset += A4_HEIGHT_MM;
      remaining -= A4_HEIGHT_MM;
    }
  }

  pdf.save(filename);
}
