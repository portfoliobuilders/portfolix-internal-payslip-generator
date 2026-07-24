import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseEnv,
  isProductionRuntime,
  logMissingSupabaseCredentials,
  MISSING_CREDENTIALS_MESSAGE,
} from './config';
import { createMockSupabaseClient } from './mock-client';

export function createClient(): SupabaseClient {
  const env = getSupabaseEnv();
  if (!env) {
    logMissingSupabaseCredentials('client');
    if (isProductionRuntime()) {
      throw new Error(MISSING_CREDENTIALS_MESSAGE);
    }
    return createMockSupabaseClient();
  }

  return createBrowserClient(env.url, env.key);
}
