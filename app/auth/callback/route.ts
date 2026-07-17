import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/utils/supabase/config';

/** OAuth / magic-link callback — exchanges code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/employee-roster';
  const safeNext = next.startsWith('/') ? next : '/employee-roster';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const response = NextResponse.redirect(`${origin}${safeNext}`);
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
  return response;
}
