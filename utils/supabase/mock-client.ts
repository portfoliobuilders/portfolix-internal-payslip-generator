import type { SupabaseClient } from '@supabase/supabase-js';
import { MISSING_CREDENTIALS_MESSAGE } from './config';

const missingCredentialsError = {
  message: MISSING_CREDENTIALS_MESSAGE,
  code: 'SUPABASE_CONFIG_MISSING',
  details: '',
  hint: '',
};

const missingCredentialsResult = Promise.resolve({
  data: null,
  error: missingCredentialsError,
  count: null,
  status: 503,
  statusText: 'Service Unavailable',
});

function createQueryBuilder(): PromiseLike<{
  data: null;
  error: typeof missingCredentialsError;
  count: null;
  status: number;
  statusText: string;
}> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return missingCredentialsResult.then.bind(missingCredentialsResult);
        }
        return () => createQueryBuilder();
      },
    },
  ) as PromiseLike<{
    data: null;
    error: typeof missingCredentialsError;
    count: null;
    status: number;
    statusText: string;
  }>;
}

/** Safe no-op client used when Supabase env vars are unavailable at runtime. */
export function createMockSupabaseClient(): SupabaseClient {
  return {
    from: () => createQueryBuilder(),
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: missingCredentialsError,
      }),
      getSession: async () => ({
        data: { session: null },
        error: missingCredentialsError,
      }),
    },
  } as unknown as SupabaseClient;
}
