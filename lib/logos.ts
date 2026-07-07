import type { EntityCode, EntityInfo } from '@/lib/types';

/** Bundled fallback logos when no custom upload is saved in settings. */
export const DEFAULT_ENTITY_LOGOS: Record<EntityCode, string> = {
  PX: '/logos/portfolix-enterprise.png',
  PB: '/logos/portfolio-builders.png',
  PT: '/logos/portfolix-tech.png',
  PH: '/logos/portfolix-hub.png',
};

/** Max upload size — keeps localStorage backups reasonable. */
export const MAX_LOGO_BYTES = 400_000;

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export function entityLogoSrc(entity: EntityInfo, code: EntityCode): string {
  return entity.logoDataUrl?.trim() || DEFAULT_ENTITY_LOGOS[code];
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_MIME.has(file.type)) {
      reject(new Error('Please upload a PNG, JPEG, WebP, or SVG image.'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`));
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
