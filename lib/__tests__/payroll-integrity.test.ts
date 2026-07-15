import { describe, expect, it } from 'vitest';
import {
  calendarDaysInMonthYear,
  resolvePayrollDivisor,
} from '../calculation-method';
import { joiningDateDisplay, validateEmploymentDates } from '../employment-dates';
import {
  buildServerFinalSnapshot,
  recomputePayrollServerSide,
} from '../payroll-integrity';
import {
  hasBlockingErrors,
  isPayPeriodEnded,
  validateFinalization,
  validateMoneyReconciliation,
} from '../payroll-validate';
import { SEED_SETTINGS } from '../settings-defaults';
import type { SlipSnapshot } from '../types';

describe('calculation methods', () => {
  it('defaults FIXED_25 divisor to 25', () => {
    expect(
      resolvePayrollDivisor({
        methodCode: 'FIXED_25',
        calendarDaysInMonth: 31,
      }).divisor,
    ).toBe(25);
  });

  it('uses calendar days when configured', () => {
    expect(
      resolvePayrollDivisor({
        methodCode: 'CALENDAR_DAYS',
        calendarDaysInMonth: 31,
      }).divisor,
    ).toBe(31);
    expect(calendarDaysInMonthYear('2026-02')).toBe(28);
  });

  it('requires working days for actual working-day basis', () => {
    expect(() =>
      resolvePayrollDivisor({
        methodCode: 'ACTUAL_WORKING_DAYS',
        calendarDaysInMonth: 30,
      }),
    ).toThrow(/Working days/);
  });
});

describe('employment dates', () => {
  it('errors when legal join predates incorporation', () => {
    const issues = validateEmploymentDates({
      companyIncorporationDate: '2024-08-01',
      groupJoiningDate: null,
      legalEntityJoiningDate: '2024-06-24',
      employmentTransferDate: null,
      confirmationDate: null,
      currentSalaryEffectiveDate: null,
      hasEmploymentContinuityRecord: false,
    });
    expect(issues.some((i) => i.code === 'LEGAL_JOIN_BEFORE_INCORPORATION')).toBe(true);
  });

  it('warns when group join predates incorporation without continuity', () => {
    const issues = validateEmploymentDates({
      companyIncorporationDate: '2024-08-01',
      groupJoiningDate: '2024-06-24',
      legalEntityJoiningDate: '2024-08-15',
      employmentTransferDate: null,
      confirmationDate: null,
      currentSalaryEffectiveDate: null,
      hasEmploymentContinuityRecord: false,
    });
    expect(issues.some((i) => i.code === 'GROUP_JOIN_BEFORE_INCORPORATION')).toBe(true);
  });

  it('does not invent transfer display without dates', () => {
    const display = joiningDateDisplay({
      groupJoiningDate: null,
      legalEntityJoiningDate: '2024-09-01',
      employmentTransferDate: null,
      legacyJoiningDate: '2024-06-24',
    });
    expect(display.mode).toBe('legal_only');
    expect(display.primaryDate).toBe('2024-09-01');
  });
});

describe('finalization gates', () => {
  it('blocks when period has not ended under strict gates', () => {
    const issues = validateFinalization({
      monthYear: '2099-12',
      now: new Date('2026-07-15T12:00:00Z'),
      workflowStatus: 'APPROVED',
      attendance: {
        calendarDays: 31,
        workingDays: null,
        paidDays: null,
        presentDays: null,
        weeklyOffs: null,
        paidLeaveDays: null,
        unpaidLeaveDays: null,
        lopDays: 0,
        payableDays: null,
        absentDays: 0,
        halfDays: 0,
        lateMinutes: 0,
        attendanceLocked: true,
      },
      paymentStatus: 'UNPAID',
      salaryCreditDate: null,
      expectedPaymentDate: null,
      existingFinalForPeriod: false,
      integrityStatus: 'OK',
      enforceStrictGates: true,
    });
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(issues.some((i) => i.code === 'PERIOD_NOT_ENDED')).toBe(true);
  });

  it('blocks duplicate FINAL', () => {
    const issues = validateFinalization({
      monthYear: '2026-06',
      now: new Date('2026-07-15T12:00:00Z'),
      workflowStatus: 'APPROVED',
      attendance: {
        calendarDays: 30,
        workingDays: null,
        paidDays: null,
        presentDays: null,
        weeklyOffs: null,
        paidLeaveDays: null,
        unpaidLeaveDays: null,
        lopDays: 0,
        payableDays: null,
        absentDays: 0,
        halfDays: 0,
        lateMinutes: 0,
        attendanceLocked: true,
      },
      paymentStatus: 'UNPAID',
      salaryCreditDate: null,
      expectedPaymentDate: null,
      existingFinalForPeriod: true,
      integrityStatus: 'OK',
      enforceStrictGates: false,
    });
    expect(issues.some((i) => i.code === 'DUPLICATE_FINAL' && i.severity === 'error')).toBe(true);
  });

  it('treats June 2026 as ended on 15 Jul 2026', () => {
    expect(isPayPeriodEnded('2026-06', new Date('2026-07-15'))).toBe(true);
    expect(isPayPeriodEnded('2026-07', new Date('2026-07-15'))).toBe(false);
  });
});

describe('server recompute integrity', () => {
  const trusted = {
    employeeId: 'emp-1',
    monthYear: '2026-06',
    baseSalary: 50000,
    flexBankBalance: 0,
    flexMinutesEarned: 0,
    totalLateMinutes: 0,
    absentDays: 0,
    halfDays: 0,
    fixedAllowance: 0,
    otherDeductions: 0,
    tdsMonthly: 0,
    ptHalfYearly: 0,
    variableEarned: 0,
    variablePaid: 0,
    deferredOpening: 0,
    committedPayoutDate: null,
    variableLabel: '',
    remarks: '',
    compensationAmount: 50000,
  };

  it('recomputes net and rejects forged client net', () => {
    const result = recomputePayrollServerSide(trusted, SEED_SETTINGS, {
      netPay: 999999,
      totalDeductions: 0,
      grossFixed: 50000,
      lopDeduction: 0,
      lopDays: 0,
      perDayRate: 2000,
      flexAvailable: 0,
      unpaidLateMinutes: 0,
      flexOffsetMinutes: 0,
      lopFromLateness: 0,
      otherDeductions: 0,
      variableEarned: 0,
      variablePaid: 0,
      variableDeferred: 0,
      deferredOpening: 0,
      deferredClosing: 0,
      committedPayoutDate: null,
      netPayWords: 'x',
    });
    expect(result.computed.netPay).toBe(50000);
    expect(result.issues.some((i) => i.code === 'CLIENT_COMPUTED_MISMATCH')).toBe(true);
  });

  it('reconciles 50000 ÷ 25 rate basis', () => {
    const result = recomputePayrollServerSide(trusted, SEED_SETTINGS);
    expect(result.payrollDivisor).toBe(25);
    expect(result.computed.perDayRate).toBe(2000);
    expect(validateMoneyReconciliation({
      grossEarnings: result.computed.grossFixed,
      totalDeductions: result.computed.totalDeductions,
      netSalary: result.computed.netPay,
      variablePaid: result.computed.variablePaid,
    })).toEqual([]);
  });

  it('builds a FINAL snapshot from server totals only', () => {
    const built = buildServerFinalSnapshot({
      trusted: { ...trusted, attendanceLocked: false },
      settings: SEED_SETTINGS,
      employeeSnapshot: {
        fullName: 'Test Employee',
        empId: 'PX-TEST-001',
        entityCode: 'PX',
        department: 'Ops',
        designation: 'Associate',
        joiningDate: '2024-09-01',
        employeeAddress: '',
        paymentMode: 'Bank Transfer',
        engagementType: 'regular_employee',
        employmentStatus: 'active',
        paymentType: 'salary',
        compensationAmount: 50000,
        bankLast4: '5931',
        panMasked: 'RFXPXXXXX5H',
      },
      slipId: 'slip-1',
      generatedAt: '2026-07-15T10:00:00.000Z',
      existingFinal: false,
      history: [] as SlipSnapshot[],
      enforceStrictGates: false,
      now: new Date('2026-07-15T12:00:00Z'),
      clientComputed: undefined,
    });
    expect(built.ok).toBe(true);
    expect(built.snapshot?.status).toBe('final');
    expect(built.snapshot?.computed.netPay).toBe(50000);
  });

  it('blocks duplicate final even when money reconciles', () => {
    const built = buildServerFinalSnapshot({
      trusted,
      settings: SEED_SETTINGS,
      employeeSnapshot: {
        fullName: 'Test Employee',
        empId: 'PX-TEST-001',
        entityCode: 'PX',
        department: 'Ops',
        designation: 'Associate',
        joiningDate: '2024-09-01',
        employeeAddress: '',
        paymentMode: 'Bank Transfer',
        engagementType: 'regular_employee',
        employmentStatus: 'active',
        paymentType: 'salary',
        compensationAmount: 50000,
        bankLast4: '5931',
        panMasked: 'RFXPXXXXX5H',
      },
      slipId: 'slip-2',
      generatedAt: '2026-07-15T10:00:00.000Z',
      existingFinal: true,
      supersedeConfirmed: false,
      history: [],
      enforceStrictGates: false,
      now: new Date('2026-07-15T12:00:00Z'),
    });
    expect(built.ok).toBe(false);
    expect(built.issues.some((i) => i.code === 'DUPLICATE_FINAL')).toBe(true);
  });
});
