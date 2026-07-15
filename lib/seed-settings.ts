import { SEED_SETTINGS as DEFAULTS } from '@/lib/settings-defaults';
import type { Settings } from '@/lib/types';

/**
 * Legacy seed re-export. Prefer `@/lib/settings-defaults` SEED_SETTINGS.
 * Kept so older imports keep working; values are placeholders pending admin confirmation.
 */
export const SEED_SETTINGS: Settings = structuredClone(DEFAULTS);
