import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicAppPath } from '@/lib/public-paths';
import {
  getSupabaseEnv,
  isProductionRuntime,
  logMissingSupabaseCredentials,
  MISSING_CREDENTIALS_MESSAGE,
} from './config';

/**
 * Refresh the auth session and enforce route protection.
 * Public: /login, /auth/*, /verify/*
 * All other app routes require a signed-in user when Supabase is configured.
 * Production without credentials fails closed (503) — no degraded open shell.
 */
export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicAppPath(pathname);

  if (!env) {
    logMissingSupabaseCredentials('middleware');
    if (isProductionRuntime() && !isPublic) {
      return new NextResponse(
        `Service unavailable. ${MISSING_CREDENTIALS_MESSAGE}`,
        {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        },
      );
    }
    // Local/dev only: shell may load; mutations still fail via mock client.
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

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error('[supabase:middleware] Failed to refresh auth session:', error);
  }

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/employee-roster';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return supabaseResponse;
}
