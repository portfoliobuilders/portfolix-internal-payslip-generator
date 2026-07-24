/**
 * Session-proven actor identity for audit trails.
 * Never trust client-supplied "acting as" / self-ticked override flags.
 */

import { createClient } from '@/utils/supabase/server';
import { getSupabaseEnv, isProductionRuntime } from '@/utils/supabase/config';

export type SessionActor = {
  userId: string;
  email: string | null;
  /** True when the session user is listed in payroll_admins. */
  isPayrollAdmin: boolean;
};

/**
 * Resolve the authenticated user from the Supabase session.
 * Fail closed when auth is configured but no user is present.
 * Local-dev actor is allowed only when credentials are missing AND not production.
 */
export async function resolveSessionActor(): Promise<
  { ok: true; actor: SessionActor } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error('[session-actor] getUser failed', error.message);
    }

    const user = data?.user ?? null;
    if (!user?.id) {
      if (!getSupabaseEnv() && !isProductionRuntime()) {
        return {
          ok: true,
          actor: { userId: 'local-dev', email: null, isPayrollAdmin: false },
        };
      }
      return {
        ok: false,
        error: 'Authentication required. Sign in to continue.',
      };
    }

    let isPayrollAdmin = false;
    try {
      const { data: adminRow, error: adminError } = await supabase
        .from('payroll_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!adminError && adminRow) isPayrollAdmin = true;
    } catch {
      // Table may not exist until migration 017 — treat as non-admin.
      isPayrollAdmin = false;
    }

    return {
      ok: true,
      actor: {
        userId: user.id,
        email: user.email ?? null,
        isPayrollAdmin,
      },
    };
  } catch (err) {
    console.error('[session-actor]', err);
    return {
      ok: false,
      error: 'Could not resolve signed-in user. Sign in again and retry.',
    };
  }
}
