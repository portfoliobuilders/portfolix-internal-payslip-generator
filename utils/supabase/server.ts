import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  getSupabaseEnv,
  isProductionRuntime,
  logMissingSupabaseCredentials,
  MISSING_CREDENTIALS_MESSAGE,
} from './config';
import { createMockSupabaseClient } from './mock-client';

export async function createClient(): Promise<SupabaseClient> {
  const env = getSupabaseEnv();
  if (!env) {
    logMissingSupabaseCredentials('server');
    if (isProductionRuntime()) {
      throw new Error(MISSING_CREDENTIALS_MESSAGE);
    }
    return createMockSupabaseClient();
  }

  const cookieStore = cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — cookie writes are ignored.
        }
      },
    },
  });
}
