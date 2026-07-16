import { describe, expect, it } from 'vitest';
import { getLegacyRouteRedirect } from '../route-aliases';

describe('getLegacyRouteRedirect', () => {
  it('redirects legacy mixed-case aliases to canonical routes', () => {
    expect(getLegacyRouteRedirect('/Generator')).toBe('/generator');
    expect(getLegacyRouteRedirect('/History')).toBe('/history');
    expect(getLegacyRouteRedirect('/Settings')).toBe('/settings');
    expect(getLegacyRouteRedirect('/EmployeeRoster')).toBe('/employee-roster');
    expect(getLegacyRouteRedirect('/employeeroster')).toBe('/employee-roster');
    expect(getLegacyRouteRedirect('/roster')).toBe('/employee-roster');
  });

  it('does not redirect canonical lowercase routes to themselves', () => {
    expect(getLegacyRouteRedirect('/employee-roster')).toBeNull();
    expect(getLegacyRouteRedirect('/generator')).toBeNull();
    expect(getLegacyRouteRedirect('/history')).toBeNull();
    expect(getLegacyRouteRedirect('/settings')).toBeNull();
  });
});
