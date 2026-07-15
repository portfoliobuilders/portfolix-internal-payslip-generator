'use server';

import { revalidatePath } from 'next/cache';
import { fetchSettings, saveSettings } from '@/app/actions/settings';
import type { EntityCode } from '@/lib/types';
import {
  MAX_SIGNATORY_ASSET_BYTES,
  SIGNATORY_ASSETS_BUCKET,
  SIGNATORY_SIGNED_URL_TTL_SECONDS,
  signatoryAssetPath,
  validateSignatoryAssetFile,
  type SignatoryAssetKind,
} from '@/lib/signatory-assets';
import { createClient } from '@/utils/supabase/server';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getSupabase() {
  return createClient();
}

/**
 * Uploads a signature or seal image to the private signatory-assets bucket.
 * Returns the storage path (never a public URL).
 */
export async function uploadSignatoryAsset(
  entityCode: EntityCode,
  kind: SignatoryAssetKind,
  formData: FormData,
): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'No file uploaded.' };
    }

    validateSignatoryAssetFile(file);
    if (file.size > MAX_SIGNATORY_ASSET_BYTES) {
      return { ok: false, error: 'Signature/seal image must be under 1 MB.' };
    }

    const extension = file.name.includes('.')
      ? file.name.split('.').pop()!.toLowerCase()
      : file.type === 'image/webp'
        ? 'webp'
        : file.type === 'image/jpeg'
          ? 'jpg'
          : 'png';
    const path = signatoryAssetPath(entityCode, kind, extension);
    const bytes = await file.arrayBuffer();
    const supabase = await getSupabase();

    const { error: uploadError } = await supabase.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .upload(path, bytes, {
        upsert: true,
        contentType: file.type,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

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

    const { data: signed, error: signError } = await supabase.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .createSignedUrl(path, SIGNATORY_SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      return { ok: false, error: signError?.message ?? 'Could not create signed URL.' };
    }

    revalidatePath('/');
    return { ok: true, data: { path, signedUrl: signed.signedUrl } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to upload signatory asset.',
    };
  }
}

/** Removes a signature/seal object and clears the path in settings. */
export async function removeSignatoryAsset(
  entityCode: EntityCode,
  kind: SignatoryAssetKind,
): Promise<ActionResult<{ removed: true }>> {
  try {
    const settingsResult = await fetchSettings();
    if (!settingsResult.ok) return settingsResult;

    const entity = settingsResult.data.entities[entityCode];
    const path = kind === 'signature' ? entity.signatureAssetPath : entity.sealAssetPath;
    const supabase = await getSupabase();

    if (path?.trim()) {
      await supabase.storage.from(SIGNATORY_ASSETS_BUCKET).remove([path]);
    }

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
  try {
    if (!path?.trim()) return { ok: true, data: { signedUrl: null } };

    const supabase = await getSupabase();
    const { data, error } = await supabase.storage
      .from(SIGNATORY_ASSETS_BUCKET)
      .createSignedUrl(path.trim(), SIGNATORY_SIGNED_URL_TTL_SECONDS);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { signedUrl: data?.signedUrl ?? null } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create signed URL.',
    };
  }
}

/** Pair of signed URLs for signature + seal at preview/PDF time. */
export async function createSignatorySignedUrls(paths: {
  signatureAssetPath: string | null;
  sealAssetPath: string | null;
}): Promise<ActionResult<{ signatureUrl: string | null; sealUrl: string | null }>> {
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
