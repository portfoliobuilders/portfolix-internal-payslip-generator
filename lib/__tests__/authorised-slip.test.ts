import { describe, expect, it } from 'vitest';
import { computeAuthorisedYtd, indianFyMonthRange } from '../authorised-slip';
import { normalizeEmployeeId } from '../payroll-db';
import type { SlipComputed, SlipInputs, SlipSnapshot } from '../types';

const BASE_INPUTS: SlipInputs = {
  absentDays: 0,
  halfDays: 0,
  lateMinutes: 0,
  flexMinutesEarned: 0,
  fixedAllowance: 1000,
  otherDeductions: 0,
  tdsMonthly: 0,
  ptThisMonth: 0,
  variableLabel: '',
  variableEarned: 0,
  variablePaid: 500,
  deferredOpening: 0,
  committedPayoutDate: null,
  remarks: '',
  flexBankBalanceBefore: 0,
  baseSalary: 20000,
  compensationAmount: 20000,
};

const BASE_COMPUTED: SlipComputed = {
  perDayRate: 800,
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
  grossFixed: 21000,
  variableEarned: 0,
  variablePaid: 500,
  variableDeferred: 0,
  deferredOpening: 0,
  deferredClosing: 0,
  committedPayoutDate: null,
  netPay: 21500,
  netPayWords: 'Rupees Twenty One Thousand Five Hundred Only',
};

function makeFinal(opts: {
  id: string;
  employeeId: string;
  monthYear: string;
  generatedAt: string;
  status?: SlipSnapshot['status'];
  inputs?: Partial<SlipInputs>;
  computed?: Partial<SlipComputed>;
}): SlipSnapshot {
  return {
    id: opts.id,
    employeeId: opts.employeeId,
    monthYear: opts.monthYear,
    generatedAt: opts.generatedAt,
    status: opts.status ?? 'final',
    flexBalanceAfter: 0,
    inputs: { ...BASE_INPUTS, ...opts.inputs },
    computed: { ...BASE_COMPUTED, ...opts.computed },
    employee: {
      fullName: 'Test',
      empId: 'PX-TEST-001',
      entityCode: 'PX',
      department: 'Ops',
      designation: 'Associate',
      joiningDate: '2024-01-01',
      employeeAddress: '',
      paymentMode: 'Bank Transfer',
      engagementType: 'regular_employee',
      employmentStatus: 'active',
      paymentType: 'salary',
      compensationAmount: 20000,
      bankLast4: '1234',
      panMasked: 'ABXXXXXX1F',
    },
  };
}

describe('normalizeEmployeeId', () => {
  it('trims and strips internal whitespace', () => {
    expect(normalizeEmployeeId('  PX-OPS-2512 -005 ')).toBe('PX-OPS-2512-005');
  });
});

describe('indianFyMonthRange', () => {
  it('Apr–Mar for dates after April', () => {
    expect(indianFyMonthRange('2026-07')).toEqual({ start: '2026-04', end: '2026-07' });
  });
  it('crosses into prior year before April', () => {
    expect(indianFyMonthRange('2026-02')).toEqual({ start: '2025-04', end: '2026-02' });
  });
});

describe('computeAuthorisedYtd', () => {
  it('sums FINAL snapshots within FY only', () => {
    const slips = [
      makeFinal({
        id: '1',
        employeeId: 'emp-a',
        monthYear: '2026-04',
        generatedAt: '2026-05-01T00:00:00.000Z',
        computed: {
          lopDeduction: 100,
          otherDeductions: 50,
          tds: 1000,
          pt: 0,
          totalDeductions: 1150,
          variablePaid: 500,
        },
      }),
      makeFinal({
        id: '2',
        employeeId: 'emp-a',
        monthYear: '2026-07',
        generatedAt: '2026-08-01T00:00:00.000Z',
        inputs: {
          tdsMonthly: 12500,
          variablePaid: 0,
        },
        computed: {
          lopDeduction: 0,
          otherDeductions: 0,
          tds: 12500,
          pt: 0,
          totalDeductions: 12500,
          variablePaid: 0,
        },
      }),
      makeFinal({
        id: '3',
        employeeId: 'emp-a',
        monthYear: '2026-03',
        generatedAt: '2026-04-01T00:00:00.000Z',
      }),
      makeFinal({
        id: '4',
        employeeId: 'emp-a',
        monthYear: '2026-05',
        generatedAt: '2026-06-01T00:00:00.000Z',
        status: 'draft',
      }),
    ];

    const ytd = computeAuthorisedYtd(slips, 'emp-a', '2026-07');
    expect(ytd.basic).toBe(40000);
    expect(ytd.fixedAllowance).toBe(2000);
    expect(ytd.variablePaid).toBe(500);
    expect(ytd.tds).toBe(13500);
    expect(ytd.lopDeduction).toBe(100);
    expect(ytd.otherDeductions).toBe(50);
  });

  it('YTD supersede regression: finalize month, supersede twice → YTD = ONE month value not three', () => {
    // Scenario: Month 2026-04 was finalised, then superseded twice.
    // YTD must count only one month of basic (20000), not three (60000).
    const slips = [
      // Original final — will be superseded.
      makeFinal({
        id: 'orig',
        employeeId: 'emp-b',
        monthYear: '2026-04',
        generatedAt: '2026-05-01T00:00:00.000Z',
        computed: { workflowStatus: undefined } as never,
      } as Parameters<typeof makeFinal>[0] & { computed: { workflowStatus?: string } }),
      // First supersede — becomes SUPERSEDED.
      {
        ...makeFinal({
          id: 'sup1',
          employeeId: 'emp-b',
          monthYear: '2026-04',
          generatedAt: '2026-05-02T00:00:00.000Z',
        }),
        workflowStatus: 'SUPERSEDED',
      },
      // Second supersede — active final.
      {
        ...makeFinal({
          id: 'sup2',
          employeeId: 'emp-b',
          monthYear: '2026-04',
          generatedAt: '2026-05-03T00:00:00.000Z',
        }),
        activeFinal: true,
        workflowStatus: 'ISSUED',
      },
    ];

    const ytd = computeAuthorisedYtd(slips, 'emp-b', '2026-04');
    // Only the activeFinal snapshot counts — one month of baseSalary (20000).
    expect(ytd.basic).toBe(20000);
    expect(ytd.fixedAllowance).toBe(1000);
  });

  it('falls back to latest generatedAt when no activeFinal flag is set', () => {
    // Pre-flag snapshots: no activeFinal, no workflowStatus.
    const slips = [
      makeFinal({
        id: 'a',
        employeeId: 'emp-c',
        monthYear: '2026-05',
        generatedAt: '2026-06-01T00:00:00.000Z',
      }),
      makeFinal({
        id: 'b',
        employeeId: 'emp-c',
        monthYear: '2026-05',
        generatedAt: '2026-06-02T00:00:00.000Z',
        inputs: { baseSalary: 25000 },
        computed: { netPay: 25000 },
      }),
    ];

    const ytd = computeAuthorisedYtd(slips, 'emp-c', '2026-05');
    // Latest generatedAt wins — baseSalary = 25000.
    expect(ytd.basic).toBe(25000);
  });

  it('non-superseded preferred over superseded when no activeFinal', () => {
    const slips = [
      {
        ...makeFinal({
          id: 'x1',
          employeeId: 'emp-d',
          monthYear: '2026-06',
          generatedAt: '2026-07-01T00:00:00.000Z',
        }),
        workflowStatus: 'SUPERSEDED',
        inputs: { ...BASE_INPUTS, baseSalary: 30000 },
        computed: { ...BASE_COMPUTED, netPay: 30000 },
      },
      {
        ...makeFinal({
          id: 'x2',
          employeeId: 'emp-d',
          monthYear: '2026-06',
          generatedAt: '2026-06-28T00:00:00.000Z',
        }),
        workflowStatus: 'ISSUED',
        inputs: { ...BASE_INPUTS, baseSalary: 20000 },
        computed: { ...BASE_COMPUTED, netPay: 20000 },
      },
    ];

    const ytd = computeAuthorisedYtd(slips, 'emp-d', '2026-06');
    // Non-superseded (ISSUED) wins even though it has an earlier generatedAt.
    expect(ytd.basic).toBe(20000);
  });
});
