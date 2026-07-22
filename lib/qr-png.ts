/**
 * PNG QR bytes for embedding in authorised PDFs.
 * QR encodes the full verification URL; display text stays short.
 */

import QRCode from 'qrcode';

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const binary = Buffer.from(b64, 'base64');
    return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function qrPngBytes(payload: string, sizePx: number): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: sizePx,
    color: { dark: '#111111', light: '#FFFFFF' },
  });
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return decodeBase64(b64);
}

/** Preferred name used by server-side authorised PDF generation. */
export async function buildVerificationQrPng(
  verificationUrl: string,
  sizePx = 160,
): Promise<Uint8Array> {
  const url = verificationUrl.trim();
  if (!url) {
    throw new Error('Verification URL is required to generate QR code.');
  }
  return qrPngBytes(url, sizePx);
}

/** Alias used by the main-branch vector PDF path. */
export async function buildQrPngBytes(
  payload: string,
  size = 128,
): Promise<Uint8Array> {
  return qrPngBytes(payload, size);
}

/** Concise path shown on the slip (full URL stays inside the QR only). */
export function shortVerificationDisplay(verificationUrl: string | null | undefined): string {
  if (!verificationUrl?.trim()) return 'payroll verification portal';
  try {
    const u = new URL(
      verificationUrl.startsWith('http') ? verificationUrl : `https://${verificationUrl}`,
    );
    const host = u.hostname.replace(/^www\./, '');
    return `${host}/verify`;
  } catch {
    return 'verify portal';
  }
}
