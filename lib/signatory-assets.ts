/**
 * Signatory asset storage — PRIVATE bucket only.
 * Paths are stored in settings; images are rendered via short-lived signed URLs
 * (preview) or server-side byte download (PDF). Never persist signed URLs.
 */

export const SIGNATORY_ASSETS_BUCKET = 'signatory-assets' as const;
export const ISSUED_DOCUMENTS_BUCKET = 'issued-documents' as const;

/** Max upload size: 2 MB (signature or seal). */
export const MAX_SIGNATORY_ASSET_BYTES = 2 * 1024 * 1024;

/** Maximum decoded image dimension (either axis). */
export const MAX_SIGNATORY_ASSET_DIMENSION = 3000;

/** PDF-embeddable MIME types only (pdf-lib: PNG + JPEG). WebP rejected at upload. */
export type SignatoryAssetMime = 'image/png' | 'image/jpeg';

const ACCEPTED_MIME = new Set<string>(['image/png', 'image/jpeg']);

export type SignatoryAssetKind = 'signature' | 'seal';

export type AuthorisationMode =
  | 'SIGNATURE_AND_SEAL'
  | 'COMPUTER_GENERATED_VERIFICATION'
  | 'CRYPTOGRAPHIC_DIGITAL_SIGNATURE';

export const DEFAULT_AUTHORISATION_MODE: AuthorisationMode = 'SIGNATURE_AND_SEAL';

export function validateSignatoryAssetFile(file: {
  type: string;
  size: number;
  name?: string;
}): void {
  const name = (file.name ?? '').toLowerCase();
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) {
    throw new Error('SVG uploads are not allowed for signature or seal assets.');
  }
  if (file.type === 'image/webp' || name.endsWith('.webp')) {
    throw new Error(
      'WebP is not supported for PDF embedding. Please upload a transparent PNG (preferred) or JPEG.',
    );
  }
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error('Please upload a PNG or JPEG image (transparent PNG preferred).');
  }
  if (file.size > MAX_SIGNATORY_ASSET_BYTES) {
    throw new Error('Signature/seal image must be under 2 MB.');
  }
  // Block obvious executables renamed as images
  if (/\.(exe|dll|bat|cmd|sh|ps1|js|html|htm)$/i.test(name)) {
    throw new Error('Invalid file type for signature or seal.');
  }
}

/** Validate decoded PNG dimensions from raw bytes (IHDR). JPEG skips dimension gate. */
export function assertImageDimensionsWithinLimit(
  bytes: Uint8Array,
  mimeType: SignatoryAssetMime,
): void {
  if (mimeType !== 'image/png' || bytes.length < 24) return;
  const width =
    (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height =
    (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  if (
    width > MAX_SIGNATORY_ASSET_DIMENSION ||
    height > MAX_SIGNATORY_ASSET_DIMENSION
  ) {
    throw new Error(
      `Image dimensions must be at most ${MAX_SIGNATORY_ASSET_DIMENSION}×${MAX_SIGNATORY_ASSET_DIMENSION}.`,
    );
  }
  if (width <= 0 || height <= 0) {
    throw new Error('Could not read image dimensions.');
  }
}

/**
 * Versioned private object path — never overwrite in place.
 * Example: px/signatures/a1b2c3d4-1710000000000.png
 */
export function signatoryAssetPath(
  entityCode: string,
  kind: SignatoryAssetKind,
  extension: string,
): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const folder = kind === 'signature' ? 'signatures' : 'seals';
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${entityCode.toLowerCase()}/${folder}/${id}-${Date.now()}.${safeExt}`;
}

/** Canonical signatory settings shape (paths only — never signed URLs). */
export type AuthorisedSignatorySettings = {
  signatoryName: string;
  signatoryDesignation: string;
  signatureStoragePath: string | null;
  sealStoragePath: string | null;
  authorityEffectiveFrom: string | null;
  authorityEffectiveTo: string | null;
  isActive: boolean;
  authorisationMode: AuthorisationMode;
};

/** Signed URL lifetime for browser preview only (seconds). PDF never uses these. */
export const SIGNATORY_SIGNED_URL_TTL_SECONDS = 900;
