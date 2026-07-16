/**
 * PNG QR bytes for embedding in the authorised vector PDF.
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

export async function buildQrPngBytes(
  payload: string,
  size = 128,
): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#111111', light: '#FFFFFF' },
  });
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return decodeBase64(b64);
}
