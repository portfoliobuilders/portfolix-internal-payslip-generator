/**
 * Signatory asset storage — PRIVATE bucket only.
 * Paths are stored in settings; images are rendered exclusively via
 * short-lived signed URLs generated server-side.
 */

export const SIGNATORY_ASSETS_BUCKET = 'signatory-assets' as const;

/** Max upload size: 1 MB. */
export const MAX_SIGNATORY_ASSET_BYTES = 1_048_576;

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type SignatoryAssetKind = 'signature' | 'seal';

export function validateSignatoryAssetFile(file: {
  type: string;
  size: number;
  name?: string;
}): void {
  if (file.type === 'image/svg+xml' || (file.name ?? '').toLowerCase().endsWith('.svg')) {
    throw new Error('SVG uploads are not allowed for signature or seal assets.');
  }
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error('Please upload a PNG, JPEG, or WebP image.');
  }
  if (file.size > MAX_SIGNATORY_ASSET_BYTES) {
    throw new Error('Signature/seal image must be under 1 MB.');
  }
}

export function signatoryAssetPath(
  entityCode: string,
  kind: SignatoryAssetKind,
  extension: string,
): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  return `${entityCode.toLowerCase()}/${kind}.${safeExt}`;
}

/** Signed URL lifetime for preview/PDF embedding (seconds). */
export const SIGNATORY_SIGNED_URL_TTL_SECONDS = 120;
