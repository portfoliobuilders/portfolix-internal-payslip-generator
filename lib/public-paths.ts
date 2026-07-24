/** Paths that stay public (no session required). Safe for Edge middleware. */

export function isPublicAppPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/verify/')) return true;
  return false;
}
