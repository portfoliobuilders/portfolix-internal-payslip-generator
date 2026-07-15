/**
 * Entity logo uploads (PUBLIC branding bucket).
 *
 * TODO(auth session): guard uploadEntityLogo behind requirePayrollAdmin() —
 * same guard list as app/actions/payroll.ts and app/actions/settings.ts.
 * Do NOT copy this public-bucket pattern for signatory assets
 * (see app/actions/signatory-assets.ts + SUPABASE_SECRET_KEY).
 */

import type { EntityCode, EntityInfo } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';

/** Bundled fallback logos when no custom upload is saved in settings. */
export const DEFAULT_ENTITY_LOGOS: Record<EntityCode, string> = {
  PX: '/logos/portfolix-enterprise.svg',
  PB: '/logos/portfolio-builders.svg',
  PT: '/logos/portfolix-tech.svg',
  PH: '/logos/portfolix-hub.svg',
};

/** Max upload size — keeps localStorage backups reasonable. */
export const MAX_LOGO_BYTES = 400_000;

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export function entityLogoSrc(entity: EntityInfo, code: EntityCode): string {
  return entity.logoDataUrl?.trim() || DEFAULT_ENTITY_LOGOS[code];
}

const BRANDING_BUCKET = 'branding';

function validateLogoFile(file: File): void {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error('Please upload a PNG, JPEG, WebP, or SVG image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`);
  }
}

/** Uploads an entity logo to Supabase Storage and returns its public URL. */
export async function uploadEntityLogo(file: File, code: EntityCode): Promise<string> {
  validateLogoFile(file);

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'png';
  const logoPath = `${code.toLowerCase()}-logo.${extension}`;
  const supabase = createClient();
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(BRANDING_BUCKET).upload(logoPath, bytes, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) throw new Error(uploadError.message);

  const cacheBust =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(`${logoPath}?v=${cacheBust}`);
  return data.publicUrl;
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      validateLogoFile(file);
    } catch (err) {
      reject(err);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}
