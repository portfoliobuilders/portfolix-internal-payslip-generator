/**
 * Browser download helper for vector PDF bytes (pdf-lib output).
 * Does not invent document content — caller supplies the built PDF.
 */

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  // Copy into a plain ArrayBuffer-backed view for BlobPart typing.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
