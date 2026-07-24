/**
 * Server-side loader for private company images (signature / seal / logo).
 * Downloads via the service-role client — never via public URLs.
 *
 * Safe to import only from server actions / Node runtimes.
 */

import { createHash } from 'node:crypto';
import {
  SIGNATORY_ASSETS_BUCKET,
  type SignatoryAssetMime,
} from '@/lib/signatory-assets';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export type LoadedImageAsset = {
  bytes: Uint8Array;
  mimeType: SignatoryAssetMime;
  width?: number;
  height?: number;
  /** SHA-256 hex of bytes — for issued-document immutability metadata. */
  contentHash: string;
  /** Storage object path that was loaded. */
  storagePath: string;
};

export type AssetLoadFailureCategory =
  | 'SETTINGS_PATH_MISSING'
  | 'STORAGE_OBJECT_NOT_FOUND'
  | 'STORAGE_ACCESS_DENIED'
  | 'UNSUPPORTED_MIME'
  | 'EMPTY_FILE'
  | 'PDF_EMBED_FAILED'
  | 'SIGNED_URL_FAILED'
  | 'SECRET_KEY_MISSING'
  | 'DECODE_FAILED';

export class CompanyAssetLoadError extends Error {
  readonly category: AssetLoadFailureCategory;
  readonly assetType: string;
  readonly pathBasename: string;

  constructor(
    category: AssetLoadFailureCategory,
    message: string,
    opts: { assetType: string; storagePath?: string | null },
  ) {
    super(message);
    this.name = 'CompanyAssetLoadError';
    this.category = category;
    this.assetType = opts.assetType;
    this.pathBasename = safeBasename(opts.storagePath);
  }
}

export function safeBasename(storagePath: string | null | undefined): string {
  if (!storagePath?.trim()) return '(none)';
  const parts = storagePath.trim().split('/');
  return parts[parts.length - 1] || '(none)';
}

/** Structured server log — never logs bytes, tokens, or full signed URLs. */
export function logAssetFailure(input: {
  documentType: string;
  companyId?: string | null;
  assetType: string;
  storagePath?: string | null;
  category: AssetLoadFailureCategory;
  detail?: string;
}): void {
  console.error(
    JSON.stringify({
      event: 'company_asset_load_failed',
      documentType: input.documentType,
      companyId: input.companyId ?? null,
      assetType: input.assetType,
      pathBasename: safeBasename(input.storagePath),
      pathHash: input.storagePath
        ? createHash('sha256').update(input.storagePath).digest('hex').slice(0, 16)
        : null,
      failureCategory: input.category,
      detail: input.detail ?? null,
      timestamp: new Date().toISOString(),
    }),
  );
}

function detectMime(bytes: Uint8Array): SignatoryAssetMime | null {
  if (bytes.length >= 8) {
    // PNG
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png';
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return null; // WebP not embeddable by pdf-lib without conversion
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  // IHDR starts at byte 16 after 8-byte signature + 8-byte chunk header
  if (bytes.length < 24) return undefined;
  const width =
    (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height =
    (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  if (width <= 0 || height <= 0 || width > 10000 || height > 10000) return undefined;
  return { width, height };
}

export function imageBytesToDataUri(bytes: Uint8Array, mimeType: SignatoryAssetMime): string {
  const b64 = Buffer.from(bytes).toString('base64');
  return `data:${mimeType};base64,${b64}`;
}

/**
 * Download a private signatory-assets object and return validated image bytes.
 */
export async function loadPrivateCompanyImage(
  storagePath: string,
  opts?: { assetType?: string; documentType?: string; companyId?: string | null },
): Promise<LoadedImageAsset> {
  const assetType = opts?.assetType ?? 'image';
  const documentType = opts?.documentType ?? 'UNKNOWN';
  const path = storagePath?.trim();

  if (!path) {
    logAssetFailure({
      documentType,
      companyId: opts?.companyId,
      assetType,
      storagePath: path,
      category: 'SETTINGS_PATH_MISSING',
    });
    throw new CompanyAssetLoadError('SETTINGS_PATH_MISSING', `${assetType} storage path is missing.`, {
      assetType,
      storagePath: path,
    });
  }

  const client = createServiceRoleClient();
  if (!client) {
    logAssetFailure({
      documentType,
      companyId: opts?.companyId,
      assetType,
      storagePath: path,
      category: 'SECRET_KEY_MISSING',
    });
    throw new CompanyAssetLoadError(
      'SECRET_KEY_MISSING',
      'SUPABASE_SECRET_KEY is not configured; cannot load private company assets.',
      { assetType, storagePath: path },
    );
  }

  const { data, error } = await client.storage.from(SIGNATORY_ASSETS_BUCKET).download(path);

  if (error || !data) {
    const msg = error?.message ?? 'Object not found';
    const denied = /permission|denied|not allowed|authorization|rls/i.test(msg);
    const category: AssetLoadFailureCategory = denied
      ? 'STORAGE_ACCESS_DENIED'
      : 'STORAGE_OBJECT_NOT_FOUND';
    logAssetFailure({
      documentType,
      companyId: opts?.companyId,
      assetType,
      storagePath: path,
      category,
      detail: msg,
    });
    throw new CompanyAssetLoadError(category, `Failed to load ${assetType}: ${msg}`, {
      assetType,
      storagePath: path,
    });
  }

  const buffer = new Uint8Array(await data.arrayBuffer());
  if (buffer.byteLength === 0) {
    logAssetFailure({
      documentType,
      companyId: opts?.companyId,
      assetType,
      storagePath: path,
      category: 'EMPTY_FILE',
    });
    throw new CompanyAssetLoadError('EMPTY_FILE', `${assetType} file is empty.`, {
      assetType,
      storagePath: path,
    });
  }

  const mimeType = detectMime(buffer);
  if (!mimeType) {
    logAssetFailure({
      documentType,
      companyId: opts?.companyId,
      assetType,
      storagePath: path,
      category: 'UNSUPPORTED_MIME',
      detail: 'Expected PNG or JPEG magic bytes (WebP is not supported for PDF embedding).',
    });
    throw new CompanyAssetLoadError(
      'UNSUPPORTED_MIME',
      `${assetType} must be PNG or JPEG for PDF embedding. Re-upload as a transparent PNG.`,
      { assetType, storagePath: path },
    );
  }

  const dims = mimeType === 'image/png' ? readPngDimensions(buffer) : undefined;
  const contentHash = createHash('sha256').update(buffer).digest('hex');

  return {
    bytes: buffer,
    mimeType,
    width: dims?.width,
    height: dims?.height,
    contentHash,
    storagePath: path,
  };
}
