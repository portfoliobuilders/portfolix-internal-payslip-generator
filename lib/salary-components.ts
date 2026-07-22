/**
 * Optional salary-component breakdown helpers.
 * Empty/undefined components = legacy (treated as single Basic = baseSalary at render).
 */

import { roundMoney } from '@/lib/payroll-calc';

export interface SalaryComponent {
  label: string;
  amount: number;
}

export interface SalaryComponentsSumResult {
  ok: boolean;
  error?: string;
}

const SUM_TOLERANCE = 0.009;

/**
 * When components are provided, their amounts must sum exactly to baseSalary
 * (within floating-point tolerance after roundMoney).
 */
export function validateSalaryComponentsSum(
  components: SalaryComponent[] | undefined | null,
  baseSalary: number,
): SalaryComponentsSumResult {
  if (!components || components.length === 0) {
    return { ok: true };
  }

  for (const c of components) {
    if (!c.label.trim()) {
      return { ok: false, error: 'Each salary component needs a label.' };
    }
    if (!Number.isFinite(c.amount) || c.amount < 0) {
      return { ok: false, error: 'Salary component amounts must be 0 or more.' };
    }
  }

  const sum = roundMoney(components.reduce((acc, c) => acc + (Number(c.amount) || 0), 0));
  const target = roundMoney(baseSalary);
  if (Math.abs(sum - target) > SUM_TOLERANCE) {
    return {
      ok: false,
      error: `Salary components must sum to base salary (₹${target.toFixed(2)}; got ₹${sum.toFixed(2)}).`,
    };
  }

  return { ok: true };
}
