import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv, logMissingSupabaseCredentials } from './config';
import { createMockSupabaseClient } from './mock-client';

export function createClient(): SupabaseClient {
  const env = getSupabaseEnv();
  if (!env) {
    logMissingSupabaseCredentials('client');
    return createMockSupabaseClient();
  }

  return createBrowserClient(env.url, env.key);
}
