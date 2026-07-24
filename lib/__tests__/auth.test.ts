import { describe, expect, it } from 'vitest';
import { isPublicAppPath } from '../public-paths';

describe('isPublicAppPath', () => {
  it('allows login, auth callback, and verify routes', () => {
    expect(isPublicAppPath('/login')).toBe(true);
    expect(isPublicAppPath('/auth/callback')).toBe(true);
    expect(isPublicAppPath('/verify/payslip/abc')).toBe(true);
  });

  it('protects all payroll app routes', () => {
    expect(isPublicAppPath('/')).toBe(false);
    expect(isPublicAppPath('/employee-roster')).toBe(false);
    expect(isPublicAppPath('/generator')).toBe(false);
    expect(isPublicAppPath('/history')).toBe(false);
    expect(isPublicAppPath('/settings')).toBe(false);
    expect(isPublicAppPath('/todos')).toBe(false);
  });
});
