'use server';

import { requirePayrollAdmin } from '@/lib/auth';

/**
 * Signatory asset server actions — PRIVATE bucket only, service-role client only.
 * Do not reuse lib/logos.ts (browser → public branding bucket).
 * Every export is gated by requirePayrollAdmin() (fail closed).
 */

import { revalidatePath } from 'next/cache';
import { fetchSettings, saveSettings } from '@/app/actions/settings';
import type { EntityCode } from '@/lib/types';
import {
  assertImageDimensionsWithinLimit,
  MAX_SIGNATORY_ASSET_BYTES,
  SIGNATORY_ASSETS_BUCKET,
  SIGNATORY_SIGNED_URL_TTL_SECONDS,
  signatoryAssetPath,
  validateSignatoryAssetFile,
  type SignatoryAssetKind,
  type SignatoryAssetMime,
} from '@/lib/signatory-assets';
import {
  createServiceRoleClient,
  isSignatoryStorageConfigured,
  SIGNATORY_SECRET_MISSING_MESSAGE,
} from '@/utils/supabase/service-role';
import { logAssetFailure } from '@/lib/documents/load-company-asset';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function getSignatoryStorageStatus(): Promise<{
  configured: boolean;
  message: string | null;
}> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) {
    return { configured: false, message: auth.error };
  }
  if (isSignatoryStorageConfigured()) {
    return { configured: true, message: null };
  }
  return { configured: false, message: SIGNATORY_SECRET_MISSING_MESSAGE };
}

function requireServiceClient() {
  const client = createServiceRoleClient();
  if (!client) {
    return { ok: false as const, error: SIGNATORY_SECRET_MISSING_MESSAGE };
  }
  return { ok: true as const, client };
}

function detectMimeFromBytes(bytes: Uint8Array): SignatoryAssetMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * Uploads a signature or seal image via the service-role client.
 * Returns the storage path (never a public URL / never base64 in settings).
 * Uses versioned object names — never overwrites prior assets in place.
 */
export async function uploadSignatoryAsset(
  entityCode: EntityCode,
  kind: SignatoryAssetKind,
  formData: FormData,
): Promise<
  ActionResult<{
    path: string;
    signedUrl: string;
    mimeType: string;
    sizeBytes: number;
  }>
> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const service = requireServiceClient();
    if (!service.ok) return service;

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'No file uploaded.' };
    }

    validateSignatoryAssetFile(file);
    if (file.size > MAX_SIGNATORY_ASSET_BYTES) {
      return { ok: false, error: 'Signature/seal image must be under 2 MB.' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectMimeFromBytes(bytes);
    if (!detected) {
      return {
        ok: false,
        error: 'File contents are not a valid PNG or JPEG image.',
      };
    }
    assertImageDimensionsWithinLimit(bytes, detected);

    const extension = detected === 'image/jpeg' ? 'jpg' : 'png';
    const path = signatoryAssetPath(entityCode, kind, extension);

    const { error: uploadError } = await service.client.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .upload(path, bytes, {
        upsert: false,
        contentType: detected,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    // Verify object exists before saving path
    const { data: listed, error: listError } = await service.client.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .list(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', {
        search: path.split('/').pop(),
        limit: 5,
      });
    if (listError || !listed?.some((o) => path.endsWith(o.name))) {
      // Fallback head via download
      const { error: headError } = await service.client.storage
        .from(SIGNATORY_ASSETS_BUCKET)
        .download(path);
      if (headError) {
        return { ok: false, error: 'Upload verification failed — object not found in storage.' };
      }
    }

    const settingsResult = await fetchSettings();
    if (!settingsResult.ok) return settingsResult;

    const entity = settingsResult.data.entities[entityCode];
    const patch =
      kind === 'signature'
        ? { signatureAssetPath: path }
        : { sealAssetPath: path };

    const saveResult = await saveSettings({
      ...settingsResult.data,
      entities: {
        ...settingsResult.data.entities,
        [entityCode]: { ...entity, ...patch },
      },
    });
    if (!saveResult.ok) return saveResult;

    const { data: signed, error: signError } = await service.client.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .createSignedUrl(path, SIGNATORY_SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      logAssetFailure({
        documentType: 'SETTINGS_UPLOAD',
        assetType: kind,
        storagePath: path,
        category: 'SIGNED_URL_FAILED',
        detail: signError?.message,
      });
      return { ok: false, error: signError?.message ?? 'Could not create signed URL.' };
    }

    revalidatePath('/');
    return {
      ok: true,
      data: {
        path,
        signedUrl: signed.signedUrl,
        mimeType: detected,
        sizeBytes: bytes.byteLength,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to upload signatory asset.',
    };
  }
}

/**
 * Clears the path in settings. Does NOT delete the storage object so
 * historically issued documents that reference the path remain valid.
 */
export async function removeSignatoryAsset(
  entityCode: EntityCode,
  kind: SignatoryAssetKind,
): Promise<ActionResult<{ removed: true }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const settingsResult = await fetchSettings();
    if (!settingsResult.ok) return settingsResult;

    const entity = settingsResult.data.entities[entityCode];
    const patch =
      kind === 'signature'
        ? { signatureAssetPath: null }
        : { sealAssetPath: null };

    const saveResult = await saveSettings({
      ...settingsResult.data,
      entities: {
        ...settingsResult.data.entities,
        [entityCode]: { ...entity, ...patch },
      },
    });
    if (!saveResult.ok) return saveResult;

    revalidatePath('/');
    return { ok: true, data: { removed: true } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to remove signatory asset.',
    };
  }
}

/** Short-lived signed URL for a private storage path. Never returns a public URL. */
export async function createSignatorySignedUrl(
  path: string | null | undefined,
): Promise<ActionResult<{ signedUrl: string | null }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    if (!path?.trim()) return { ok: true, data: { signedUrl: null } };

    const service = requireServiceClient();
    if (!service.ok) return service;

    const { data, error } = await service.client.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .createSignedUrl(path.trim(), SIGNATORY_SIGNED_URL_TTL_SECONDS);

    if (error) {
      logAssetFailure({
        documentType: 'PREVIEW',
        assetType: 'signatory',
        storagePath: path,
        category: 'SIGNED_URL_FAILED',
        detail: error.message,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true, data: { signedUrl: data?.signedUrl ?? null } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create signed URL.',
    };
  }
}

/** Pair of signed URLs for signature + seal at preview time only. */
export async function createSignatorySignedUrls(paths: {
  signatureAssetPath: string | null;
  sealAssetPath: string | null;
}): Promise<ActionResult<{ signatureUrl: string | null; sealUrl: string | null }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  if (!isSignatoryStorageConfigured()) {
    return { ok: false, error: SIGNATORY_SECRET_MISSING_MESSAGE };
  }
  const [sig, seal] = await Promise.all([
    createSignatorySignedUrl(paths.signatureAssetPath),
    createSignatorySignedUrl(paths.sealAssetPath),
  ]);
  if (!sig.ok) return sig;
  if (!seal.ok) return seal;
  return {
    ok: true,
    data: { signatureUrl: sig.data.signedUrl, sealUrl: seal.data.signedUrl },
  };
}
