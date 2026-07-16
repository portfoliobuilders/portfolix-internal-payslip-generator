/**
 * Embedded TTF fonts for pdf-lib (₹ glyph + Indian digit grouping display).
 * Standard WinAnsi Helvetica cannot encode ₹ — hence the old "INR" fallback.
 *
 * Always loaded via fetch in the browser. Node/Vitest uses an eval'd require
 * so the client webpack graph never sees `fs` / `path`.
 */

let regularCache: Uint8Array | null = null;
let boldCache: Uint8Array | null = null;

async function loadFontBytes(filename: string): Promise<Uint8Array> {
  if (typeof window !== 'undefined') {
    const res = await fetch(`/fonts/${filename}`);
    if (!res.ok) {
      throw new Error(`Failed to load font ${filename} (${res.status}).`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  // Node / Vitest only — hide from bundler static analysis.
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const fs = nodeRequire('fs') as typeof import('fs');
  const path = nodeRequire('path') as typeof import('path');
  const filePath = path.join(process.cwd(), 'public', 'fonts', filename);
  const buf = fs.readFileSync(filePath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function loadPdfFontRegular(): Promise<Uint8Array> {
  if (!regularCache) regularCache = await loadFontBytes('NotoSans-Regular.ttf');
  return regularCache;
}

export async function loadPdfFontBold(): Promise<Uint8Array> {
  if (!boldCache) boldCache = await loadFontBytes('NotoSans-Bold.ttf');
  return boldCache;
}
