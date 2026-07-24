/**
 * Payroll admin auth — fail closed.
 * Signed-in users must be listed in payroll_admins when the service role is configured.
 */

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseEnv, MISSING_CREDENTIALS_MESSAGE } from '@/utils/supabase/config';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

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

  // Fail closed: payroll admin membership is always required when auth is configured.
  // SUPABASE_SECRET_KEY is mandatory so membership can be checked via service role.
  const service = createServiceRoleClient();
  if (!service) {
    return {
      ok: false,
      error:
        'SUPABASE_SECRET_KEY is required to verify payroll admin access. Set it in the server environment.',
      code: 'SUPABASE_CONFIG_MISSING',
    };
  }

  const { data: admin, error: adminError } = await service
    .from('payroll_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (adminError || !admin) {
    return {
      ok: false,
      error:
        'Payroll admin access required. Ask an operator to add your user to payroll_admins.',
      code: 'AUTH_REQUIRED',
    };
  }

  return { ok: true, user: data.user };
}

export { isPublicAppPath } from '@/lib/public-paths';
