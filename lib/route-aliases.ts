const LEGACY_ROUTE_ALIASES = new Map<string, string>([
  ['/EmployeeRoster', '/employee-roster'],
  ['/employeeroster', '/employee-roster'],
  ['/roster', '/employee-roster'],
  ['/Generator', '/generator'],
  ['/History', '/history'],
  ['/Settings', '/settings'],
]);

export function getLegacyRouteRedirect(pathname: string): string | null {
  const target = LEGACY_ROUTE_ALIASES.get(pathname);
  if (!target || target === pathname) {
    return null;
  }

  return target;
}
