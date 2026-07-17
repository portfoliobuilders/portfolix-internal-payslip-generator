import { describe, expect, it } from 'vitest';
import { validateSalaryComponentsSum } from '../salary-components';

describe('validateSalaryComponentsSum', () => {
  it('accepts empty / undefined components (legacy)', () => {
    expect(validateSalaryComponentsSum(undefined, 25000).ok).toBe(true);
    expect(validateSalaryComponentsSum([], 25000).ok).toBe(true);
    expect(validateSalaryComponentsSum(null, 25000).ok).toBe(true);
  });

  it('accepts components that sum exactly to base salary', () => {
    const result = validateSalaryComponentsSum(
      [
        { label: 'Basic', amount: 15000 },
        { label: 'HRA', amount: 10000 },
      ],
      25000,
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects when sum differs beyond tolerance', () => {
    const result = validateSalaryComponentsSum(
      [
        { label: 'Basic', amount: 15000 },
        { label: 'HRA', amount: 9999 },
      ],
      25000,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sum to base salary/i);
  });

  it('allows sum within 0.009 tolerance after roundMoney', () => {
    const result = validateSalaryComponentsSum(
      [
        { label: 'Basic', amount: 10000.004 },
        { label: 'HRA', amount: 15000.004 },
      ],
      25000.01,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects blank labels and negative amounts', () => {
    expect(
      validateSalaryComponentsSum([{ label: '  ', amount: 100 }], 100).ok,
    ).toBe(false);
    expect(
      validateSalaryComponentsSum([{ label: 'Basic', amount: -1 }], 0).ok,
    ).toBe(false);
  });
});
