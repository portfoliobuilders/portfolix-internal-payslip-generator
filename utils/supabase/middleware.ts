import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv, logMissingSupabaseCredentials } from './config';

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) {
    logMissingSupabaseCredentials('middleware');
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.error('[supabase:middleware] Failed to refresh auth session:', error);
  }

  return supabaseResponse;
}
