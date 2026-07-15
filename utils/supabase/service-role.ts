/**
 * Server-only Supabase client using SUPABASE_SECRET_KEY (service role).
 * NEVER import this module from client components or any NEXT_PUBLIC path.
 *
 * TODO(auth session): wrap callers with requirePayrollAdmin() — settings writes
 * and signatory uploads must not remain open once auth lands.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const MISSING_SECRET =
  'SUPABASE_SECRET_KEY is not configured. Signatory uploads and bank-copy assets cannot run without the server secret key.';

export function getSupabaseSecretKey(): string | null {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  return key || null;
}

export function isSignatoryStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && getSupabaseSecretKey());
}

/** Returns a service-role client, or null when the secret key / URL is missing (fail closed). */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export { MISSING_SECRET as SIGNATORY_SECRET_MISSING_MESSAGE };
