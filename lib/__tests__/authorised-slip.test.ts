import { describe, expect, it } from 'vitest';
import { normalizeEmployeeId } from '../payroll-db';

describe('normalizeEmployeeId', () => {
  it('trims and strips internal whitespace', () => {
    expect(normalizeEmployeeId('  PX-OPS-2512 -005 ')).toBe('PX-OPS-2512-005');
  });
});
