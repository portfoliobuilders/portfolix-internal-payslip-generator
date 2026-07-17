/**
 * Deterministic QR PNG bytes for embedding in authorised PDFs.
 * QR encodes the full verification URL; display text stays short.
 */

import QRCode from 'qrcode';

export async function buildVerificationQrPng(
  verificationUrl: string,
  sizePx = 160,
): Promise<Uint8Array> {
  const url = verificationUrl.trim();
  if (!url) {
    throw new Error('Verification URL is required to generate QR code.');
  }
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: sizePx,
    color: { dark: '#111111', light: '#FFFFFF' },
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Uint8Array.from(Buffer.from(base64, 'base64'));
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
