/**
 * Shared client/server checks that block Authorised (bank-copy) generation.
 * Keep UI disable reasons aligned with lib/authorised-export.ts fail-closed guards.
 */

import { resolveCanonicalAppUrl } from '@/lib/authorised-export';
import {
  assertNoSettingsPlaceholders,
  signatoryIncompleteReason,
} from '@/lib/settings-defaults';
import type { EntityInfo } from '@/lib/types';

/** First blocking reason for bank-copy, or null when generation may proceed. */
export function authorisedSlipBlockedReason(
  entity: EntityInfo | null | undefined,
  opts?: {
    signatoryStorageConfigured?: boolean;
    signatoryStorageMessage?: string | null;
  },
): string | null {
  if (!entity) return 'Select an employee entity.';

  if (opts?.signatoryStorageConfigured === false) {
    return (
      opts.signatoryStorageMessage ??
      'SUPABASE_SECRET_KEY is not configured. Bank copy cannot embed signature/seal.'
    );
  }

  const placeholder = assertNoSettingsPlaceholders(entity);
  if (placeholder) return placeholder;

  const signatory = signatoryIncompleteReason(entity);
  if (signatory) return signatory;

  const canonical = resolveCanonicalAppUrl();
  if (!canonical.ok) return canonical.error;

  return null;
}
