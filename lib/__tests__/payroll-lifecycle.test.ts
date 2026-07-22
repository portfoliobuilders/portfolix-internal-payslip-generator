/**
 * Lifecycle aggregation tests — active finals only for YTD / deferred.
 */

import { describe, expect, it } from 'vitest';
import { computeAuthorisedYtd } from '../authorised-slip';
import { findPreviousFinalSlip, findFinalSlipForMonth } from '../payroll-helpers';
import {
  authorisedDocumentNumber,
  groupSlipsByEmployeeMonth,
  legacyAuthorisedDocumentNumber,
} from '../payroll-lifecycle';
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
  it('(a) finalize July, supersede twice → YTD = one month value', () => {
    const slips = [
      makeSlip({
        id: 'jul-1',
        monthYear: '2026-07',
        status: 'superseded',
        generatedAt: '2026-07-20T10:00:00.000Z',
      }),
      makeSlip({
        id: 'jul-2',
        monthYear: '2026-07',
        status: 'superseded',
        generatedAt: '2026-07-25T10:00:00.000Z',
      }),
      makeSlip({
        id: 'jul-3',
        monthYear: '2026-07',
        status: 'final',
        generatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ];
    const ytd = computeAuthorisedYtd(slips, 'emp-tinu', '2026-07');
    expect(ytd.basic).toBe(50000);
    expect(findFinalSlipForMonth(slips, 'emp-tinu', '2026-07')?.id).toBe('jul-3');
  });

  it('(b) void a May test final → YTD excludes it', () => {
    const slips = [
      makeSlip({
        id: 'may-void',
        monthYear: '2026-05',
        status: 'voided',
        generatedAt: '2026-05-28T10:00:00.000Z',
      }),
      makeSlip({
        id: 'jul-active',
        monthYear: '2026-07',
        status: 'final',
        generatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ];
    const ytd = computeAuthorisedYtd(slips, 'emp-tinu', '2026-07');
    expect(ytd.basic).toBe(50000);
  });

  it('(c) deferred opening for August reads the active July final only', () => {
    const slips = [
      makeSlip({
        id: 'jul-old',
        monthYear: '2026-07',
        status: 'superseded',
        generatedAt: '2026-07-20T10:00:00.000Z',
        computed: { ...baseComputed, deferredClosing: 999 },
      }),
      makeSlip({
        id: 'jul-active',
        monthYear: '2026-07',
        status: 'final',
        generatedAt: '2026-07-28T10:00:00.000Z',
        computed: { ...baseComputed, deferredClosing: 1200 },
      }),
      makeSlip({
        id: 'jul-void',
        monthYear: '2026-06',
        status: 'voided',
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
        status: 'superseded',
        generatedAt: '2026-07-20T10:00:00.000Z',
      }),
      makeSlip({
        id: 'f-new',
        monthYear: '2026-07',
        status: 'final',
        generatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ];
    const groups = groupSlipsByEmployeeMonth(slips);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.draft?.id).toBe('d1');
    expect(groups[0]?.activeFinal?.id).toBe('f-new');
  });
});

describe('authorised document numbers', () => {
  it('uses a unique PX-AUTH id per revision so supersede cannot collide', () => {
    expect(authorisedDocumentNumber('2026-04', 'PX-OPS-2512-005', 1)).toBe(
      'PX-AUTH-2026-04-PX-OPS-2512-005-R1',
    );
    expect(authorisedDocumentNumber('2026-04', 'PX-OPS-2512-005', 2)).toBe(
      'PX-AUTH-2026-04-PX-OPS-2512-005-R2',
    );
    expect(authorisedDocumentNumber('2026-04', 'PX-OPS-2512-005', 1)).not.toBe(
      authorisedDocumentNumber('2026-04', 'PX-OPS-2512-005', 2),
    );
  });

  it('keeps the legacy ASL lookup key for historical rows', () => {
    expect(legacyAuthorisedDocumentNumber('PX-OPS-2512-005', '2026-04')).toBe(
      'ASL-PX-OPS-2512-005-2026-04',
    );
  });
});
