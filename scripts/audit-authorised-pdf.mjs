import fs from 'node:fs';
import * as mupdf from 'mupdf';
import jsQR from 'jsqr';

const input = process.argv[2] ?? 'artifacts/authorised-salary-slip-sample.pdf';
const outputPrefix = process.argv[3] ?? 'artifacts/authorised-salary-slip-sample-200dpi';
const bytes = fs.readFileSync(input);
const document = new mupdf.PDFDocument(bytes);
const page = document.loadPage(0);
const zoom = 200 / 72;
const pixmap = page.toPixmap(
  mupdf.Matrix.scale(zoom, zoom),
  mupdf.ColorSpace.DeviceRGB,
  false,
  true,
);
fs.writeFileSync(`${outputPrefix}.png`, pixmap.asPNG());
const text = page.toStructuredText('preserve-whitespace').asText();
fs.writeFileSync(`${outputPrefix}.txt`, text, 'utf8');
const rgbPixels = pixmap.getPixels();
const rgbaPixels = new Uint8ClampedArray(pixmap.getWidth() * pixmap.getHeight() * 4);
for (let source = 0, target = 0; source < rgbPixels.length; source += 3, target += 4) {
  rgbaPixels[target] = rgbPixels[source];
  rgbaPixels[target + 1] = rgbPixels[source + 1];
  rgbaPixels[target + 2] = rgbPixels[source + 2];
  rgbaPixels[target + 3] = 255;
}
const decodedQr = jsQR(rgbaPixels, pixmap.getWidth(), pixmap.getHeight(), {
  inversionAttempts: 'dontInvert',
});
console.log(JSON.stringify({
  pages: document.countPages(),
  widthPx: pixmap.getWidth(),
  heightPx: pixmap.getHeight(),
  pdfBytes: bytes.byteLength,
  extractedCharacters: text.length,
  qrData: decodedQr?.data ?? null,
  png: `${outputPrefix}.png`,
  text: `${outputPrefix}.txt`,
}));
pixmap.destroy();
page.destroy();
document.destroy();
