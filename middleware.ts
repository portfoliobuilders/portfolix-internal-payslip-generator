import { NextResponse, type NextRequest } from 'next/server';
import { getLegacyRouteRedirect } from '@/lib/route-aliases';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const legacyRedirect = getLegacyRouteRedirect(request.nextUrl.pathname);
  if (legacyRedirect) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = legacyRedirect;

    if (redirectUrl.pathname !== request.nextUrl.pathname) {
      return NextResponse.redirect(redirectUrl);
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
