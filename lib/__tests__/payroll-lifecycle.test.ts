/**
 * Lifecycle aggregation tests — active finals only for deferred / History grouping.
 * (Authorised YTD column/module removed on main — #50.)
 */

import { describe, expect, it } from 'vitest';
import { findPreviousFinalSlip, findFinalSlipForMonth } from '../payroll-helpers';
import { groupSlipsByEmployeeMonth } from '../payroll-lifecycle';
import { generateAuthorisedPayslipNumber } from '../verification';
import type { SlipComputed, SlipEmployeeInfo, SlipInputs, SlipSnapshot } from '../types';

const employee: SlipEmployeeInfo = {
  fullName: 'Tinu Test',
  empId: 'TINU01',
  entityCode: 'PX',
  department: 'Ops',
  designation: 'Associate',
  joiningDate: '2025-01-01',
  employeeAddress: '',
  paymentMode: 'Bank Transfer',
  engagementType: 'regular_employee',
  employmentStatus: 'active',
  paymentType: 'salary',
  bankLast4: '1234',
  panMasked: 'XXXXXX1234',
};

const baseInputs: SlipInputs = {
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
  baseSalary: 50000,
};

const baseComputed: SlipComputed = {
  perDayRate: 2000,
  flexAvailable: 0,
  unpaidLateMinutes: 0,
  flexOffsetMinutes: 0,
  lopFromLateness: 0,
  lopDays: 0,
  lopDeduction: 0,
  otherDeductions: 0,
  tds: 0,
  pt: 0,
  totalDeductions: 0,
  grossFixed: 50000,
  variableEarned: 0,
  variablePaid: 0,
  variableDeferred: 0,
  deferredOpening: 0,
  deferredClosing: 0,
  committedPayoutDate: null,
  netPay: 50000,
  netPayWords: 'Fifty Thousand Only',
};

function makeSlip(
  partial: Partial<SlipSnapshot> & Pick<SlipSnapshot, 'id' | 'monthYear' | 'status'>,
): SlipSnapshot {
  return {
    employeeId: 'emp-tinu',
    inputs: { ...baseInputs },
    computed: { ...baseComputed },
    flexBalanceAfter: 0,
    generatedAt: partial.generatedAt ?? `${partial.monthYear}-28T10:00:00.000Z`,
    employee,
    ...partial,
  };
}

describe('lifecycle aggregations', () => {
  it('findFinalSlipForMonth returns the active final after supersedes', () => {
    const slips = [
      makeSlip({
        id: 'jul-1',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: false,
        workflowStatus: 'SUPERSEDED',
        generatedAt: '2026-07-20T10:00:00.000Z',
      }),
      makeSlip({
        id: 'jul-2',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: false,
        workflowStatus: 'SUPERSEDED',
        generatedAt: '2026-07-25T10:00:00.000Z',
      }),
      makeSlip({
        id: 'jul-3',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: true,
        generatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ];
    expect(findFinalSlipForMonth(slips, 'emp-tinu', '2026-07')?.id).toBe('jul-3');
  });

  it('deferred opening for August reads the active July final only', () => {
    const slips = [
      makeSlip({
        id: 'jul-old',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: false,
        workflowStatus: 'SUPERSEDED',
        generatedAt: '2026-07-20T10:00:00.000Z',
        computed: { ...baseComputed, deferredClosing: 999 },
      }),
      makeSlip({
        id: 'jul-active',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: true,
        generatedAt: '2026-07-28T10:00:00.000Z',
        computed: { ...baseComputed, deferredClosing: 1200 },
      }),
      makeSlip({
        id: 'jul-void',
        monthYear: '2026-06',
        status: 'final',
        activeFinal: false,
        workflowStatus: 'CANCELLED',
        generatedAt: '2026-06-28T10:00:00.000Z',
        computed: { ...baseComputed, deferredClosing: 5000 },
      }),
    ];
    const prev = findPreviousFinalSlip(slips, 'emp-tinu', '2026-08');
    expect(prev?.id).toBe('jul-active');
    expect(prev?.computed.deferredClosing).toBe(1200);
  });

  it('History grouping collapses to one row per employee-month', () => {
    const slips = [
      makeSlip({ id: 'd1', monthYear: '2026-07', status: 'draft' }),
      makeSlip({
        id: 'f-old',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: false,
        workflowStatus: 'SUPERSEDED',
        generatedAt: '2026-07-20T10:00:00.000Z',
      }),
      makeSlip({
        id: 'f-new',
        monthYear: '2026-07',
        status: 'final',
        activeFinal: true,
        generatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ];
    const groups = groupSlipsByEmployeeMonth(slips);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.draft?.id).toBe('d1');
    expect(groups[0]?.activeFinal?.id).toBe('f-new');
  });
});

describe('authorised document numbers (ASL)', () => {
  it('uses a stable ASL id per employee+month; revision is separate', () => {
    expect(generateAuthorisedPayslipNumber('PX-OPS-2512-005', '2026-04')).toBe(
      'ASL-PX-OPS-2512-005-2026-04',
    );
    expect(generateAuthorisedPayslipNumber('px-ops-2512-005', '2026-04')).toBe(
      'ASL-PX-OPS-2512-005-2026-04',
    );
  });
});
