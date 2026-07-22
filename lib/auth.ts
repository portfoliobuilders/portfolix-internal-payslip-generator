/**
 * Payroll admin auth — fail closed.
 * Any signed-in Supabase user is treated as a payroll admin for this internal tool.
 */

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseEnv, MISSING_CREDENTIALS_MESSAGE } from '@/utils/supabase/config';

export const AUTH_REQUIRED_MESSAGE = 'Authentication required. Sign in to continue.';

export class AuthRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED';
  constructor(message = AUTH_REQUIRED_MESSAGE) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export type PayrollAdmin =
  | { ok: true; user: User }
  | { ok: false; error: string; code: 'AUTH_REQUIRED' | 'SUPABASE_CONFIG_MISSING' };

/**
 * Require an authenticated Supabase session for server actions.
 * Returns a typed result so callers can `if (!auth.ok) return auth`.
 */
export async function requirePayrollAdmin(): Promise<PayrollAdmin> {
  if (!getSupabaseEnv()) {
    return {
      ok: false,
      error: MISSING_CREDENTIALS_MESSAGE,
      code: 'SUPABASE_CONFIG_MISSING',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, error: AUTH_REQUIRED_MESSAGE, code: 'AUTH_REQUIRED' };
  }
  return { ok: true, user: data.user };
}

/** Paths that stay public (no session required). */
export function isPublicAppPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/verify/')) return true;
  return false;
}
