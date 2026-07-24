/**
 * Document lifecycle helpers — unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  activeFinalsOnly,
  groupSlipsByEmployeeMonth,
  isActiveFinal,
  isHiddenFromDefaultViews,
} from '@/lib/payroll-lifecycle';
import type { SlipSnapshot } from '@/lib/types';

function slip(partial: Partial<SlipSnapshot> & Pick<SlipSnapshot, 'id' | 'status' | 'monthYear'>): SlipSnapshot {
  return {
    employeeId: 'emp-1',
    generatedAt: '2026-07-01T00:00:00.000Z',
    employee: {
      fullName: 'Test Person',
      empId: 'PX-1',
      entityCode: 'PX',
      department: '',
      designation: '',
      joiningDate: '2026-01-01',
      employeeAddress: '',
      paymentMode: 'Bank Transfer',
      bankName: '',
      bankAccountNumber: '',
      bankLast4: '',
      pan: '',
      panMasked: '',
      ifsc: '',
      workLocation: '',
    },
    inputs: {
      absentDays: 0,
      halfDays: 0,
      lateMinutes: 0,
      flexMinutesEarned: 0,
      fixedAllowance: 0,
      otherDeductions: 0,
      tdsMonthly: 0,
      ptThisMonth: 0,
      variableLabel: '',
      variableEarned: 0,
      variablePaid: 0,
      deferredOpening: 0,
      committedPayoutDate: null,
      remarks: '',
      flexBankBalanceBefore: 0,
      baseSalary: 25000,
    },
    computed: {
      perDayRate: 1000,
      flexAvailable: 0,
      unpaidLateMinutes: 0,
      lopFromLateness: 0,
      lopDays: 0,
      lopDeduction: 0,
      grossEarnings: 25000,
      totalDeductions: 0,
      netPay: 25000,
      deferredClosing: 0,
      flexBankBalanceAfter: 0,
      tds: 0,
      pt: 0,
    },
    ...partial,
  } as SlipSnapshot;
}

describe('payroll-lifecycle', () => {
  it('treats only final as active', () => {
    expect(isActiveFinal(slip({ id: 'a', status: 'final', monthYear: '2026-06' }))).toBe(true);
    expect(isActiveFinal(slip({ id: 'b', status: 'superseded', monthYear: '2026-06' }))).toBe(false);
    expect(isHiddenFromDefaultViews(slip({ id: 'c', status: 'voided', monthYear: '2026-06' }))).toBe(true);
  });

  it('activeFinalsOnly keeps newest final per employee-month', () => {
    const result = activeFinalsOnly([
      slip({ id: 'old', status: 'final', monthYear: '2026-06', generatedAt: '2026-06-01T00:00:00.000Z' }),
      slip({ id: 'new', status: 'final', monthYear: '2026-06', generatedAt: '2026-06-20T00:00:00.000Z' }),
      slip({ id: 'draft', status: 'draft', monthYear: '2026-06' }),
      slip({ id: 'sup', status: 'superseded', monthYear: '2026-06' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('new');
  });

  it('groupSlipsByEmployeeMonth separates draft, final, and trail', () => {
    const groups = groupSlipsByEmployeeMonth([
      slip({ id: 'd', status: 'draft', monthYear: '2026-06' }),
      slip({ id: 'f', status: 'final', monthYear: '2026-06' }),
      slip({ id: 's', status: 'superseded', monthYear: '2026-06' }),
    ]);
    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.draft?.id).toBe('d');
    expect(group.activeFinal?.id).toBe('f');
    expect(group.trail.map((t) => t.id)).toContain('s');
  });
});
