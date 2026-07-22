/**
 * Server-side payroll integrity pipeline.
 * Recomputes figures, aggregates YTD from FINAL snapshots, never trusts client totals.
 */

import { computeAuthorisedYtd } from './authorised-slip';
import {
  calendarDaysInMonthYear,
  DEFAULT_CALCULATION_METHOD_CODE,
  lopCalculationBasisDisplayText,
  resolvePayrollDivisor,
  type CalculationMethodCode,
} from './calculation-method';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
  inclusiveAttendanceDayCount,
  validateAttendancePeriod,
  type AttendancePeriod,
  type PayrollCycleMethod,
} from './payroll-cycle';
import { computePayroll, derivePtThisMonth, ptMonthlyAccrualFootnote, isPartialHalfPtLiability, type PayrollInput, type PayrollResult } from './payroll-calc';
import {
  buildAttendanceFromInputs,
  hasBlockingErrors,
  validateClientComputedMatch,
  validateFinalization,
  validateMoneyReconciliation,
  type FinalizationContext,
  type IntegrityStatus,
  type PayrollWorkflowStatus,
  type ValidationIssue,
} from './payroll-validate';
import { roundRupees } from './money';
import type { AuthorisedSlipYtd, Settings, SlipInputs, SlipSnapshot } from './types';

export interface TrustedPayrollInputs {
  employeeId: string;
  monthYear: string;
  baseSalary: number;
  flexBankBalance: number;
  flexMinutesEarned: number;
  totalLateMinutes: number;
  absentDays: number;
  halfDays: number;
  fixedAllowance: number;
  otherDeductions: number;
  tdsMonthly: number;
  ptHalfYearly: number;
  /** ISO joining date — mid-half PT accrual start. */
  joiningDate?: string | null;
  variableEarned: number;
  variablePaid: number;
  deferredOpening: number;
  committedPayoutDate: string | null;
  variableLabel: string;
  remarks: string;
  calculationMethodCode?: CalculationMethodCode;
  workingDays?: number | null;
  contractualDivisor?: number | null;
  attendanceLocked?: boolean;
  payrollCycleMethod?: PayrollCycleMethod;
  attendancePeriodStart?: string | null;
  attendancePeriodEnd?: string | null;
  cycleOverrideReason?: string | null;
  isManualCycleOverride?: boolean;
}

export interface ServerPayrollComputation {
  inputs: SlipInputs;
  computed: Omit<PayrollResult, 'newFlexBalance'>;
  newFlexBalance: number;
  payrollDivisor: number;
  calculationMethodCode: CalculationMethodCode;
  calculationSource: string;
  issues: ValidationIssue[];
}

/**
 * Recompute payroll on the server from trusted inputs (+ roster TDS/PT settings).
 * Client-supplied computed fields are ignored for the authoritative result.
 */
export function recomputePayrollServerSide(
  trusted: TrustedPayrollInputs,
  settings: Pick<Settings, 'ptDeductionMonths' | 'ptCollectionMode'>,
  clientComputed?: SlipSnapshot['computed'] | null,
): ServerPayrollComputation {
  const methodCode = trusted.calculationMethodCode ?? DEFAULT_CALCULATION_METHOD_CODE;
  const calendarDays = calendarDaysInMonthYear(trusted.monthYear);
  const { divisor, source } = resolvePayrollDivisor({
    methodCode,
    calendarDaysInMonth: calendarDays,
    workingDays: trusted.workingDays,
    contractualDivisor: trusted.contractualDivisor,
  });

  const ptThisMonth = derivePtThisMonth(
    trusted.ptHalfYearly,
    trusted.monthYear,
    settings.ptDeductionMonths,
    {
      mode: settings.ptCollectionMode ?? 'monthly_accrual',
      joiningDate: trusted.joiningDate ?? null,
    },
  );

  const engineInput: PayrollInput = {
    baseSalary: trusted.baseSalary,
    flexBankBalance: trusted.flexBankBalance,
    flexMinutesEarned: trusted.flexMinutesEarned,
    totalLateMinutes: trusted.totalLateMinutes,
    absentDays: trusted.absentDays,
    halfDays: trusted.halfDays,
    fixedAllowance: trusted.fixedAllowance,
    otherDeductions: trusted.otherDeductions,
    tdsMonthly: trusted.tdsMonthly,
    ptThisMonth,
    variableEarned: trusted.variableEarned,
    variablePaid: trusted.variablePaid,
    deferredOpening: trusted.deferredOpening,
    committedPayoutDate: trusted.committedPayoutDate,
    payrollDivisor: divisor,
  };

  const result = computePayroll(engineInput);
  const { newFlexBalance, ...computed } = result;

  const inputs: SlipInputs = {
    absentDays: trusted.absentDays,
    halfDays: trusted.halfDays,
    lateMinutes: trusted.totalLateMinutes,
    flexMinutesEarned: trusted.flexMinutesEarned,
    fixedAllowance: trusted.fixedAllowance,
    otherDeductions: trusted.otherDeductions,
    tdsMonthly: trusted.tdsMonthly,
    ptThisMonth,
    variableLabel: trusted.variableLabel,
    variableEarned: trusted.variableEarned,
    variablePaid: trusted.variablePaid,
    deferredOpening: trusted.deferredOpening,
    committedPayoutDate: trusted.committedPayoutDate,
    remarks: trusted.remarks,
    flexBankBalanceBefore: trusted.flexBankBalance,
    baseSalary: trusted.baseSalary,
  };

  const issues: ValidationIssue[] = [
    ...validateMoneyReconciliation({
      // Fixed gross only (variable is additive on the net line in Portfolix rules)
      grossEarnings: computed.grossFixed,
      totalDeductions: computed.totalDeductions,
      netSalary: computed.netPay,
      variablePaid: computed.variablePaid,
    }),
    ...validateClientComputedMatch(computed, clientComputed),
  ];

  return {
    inputs,
    computed,
    newFlexBalance,
    payrollDivisor: divisor,
    calculationMethodCode: methodCode,
    calculationSource: source,
    issues,
  };
}

export function aggregateYtdFromFinals(
  slips: SlipSnapshot[],
  employeeId: string,
  throughMonthYear: string,
): AuthorisedSlipYtd {
  return computeAuthorisedYtd(slips, employeeId, throughMonthYear);
}

export interface BuildFinalSnapshotArgs {
  trusted: TrustedPayrollInputs;
  settings: Settings;
  employeeSnapshot: SlipSnapshot['employee'];
  slipId: string;
  generatedAt: string;
  /** Existing FINAL for same employee+month (blocks unless superseding). */
  existingFinal: boolean;
  /** Confirm supersede of an existing FINAL. */
  supersedeConfirmed?: boolean;
  /** All history used for YTD (FINAL only aggregated). */
  history: SlipSnapshot[];
  workflowStatus?: PayrollWorkflowStatus;
  paymentStatus?: FinalizationContext['paymentStatus'];
  salaryCreditDate?: string | null;
  expectedPaymentDate?: string | null;
  integrityStatus?: IntegrityStatus;
  enforceStrictGates?: boolean;
  clientComputed?: SlipSnapshot['computed'] | null;
  now?: Date;
  payrollCycleMethod?: PayrollCycleMethod;
  payrollCyclePolicyId?: string | null;
  previousAttendancePeriodEnd?: string | null;
  attendanceCycleOverrideReason?: string | null;
  attendancePeriodOverrideStart?: string | null;
  attendancePeriodOverrideEnd?: string | null;
}

export interface BuildFinalSnapshotResult {
  ok: boolean;
  issues: ValidationIssue[];
  snapshot: SlipSnapshot | null;
  newFlexBalance: number | null;
  ytd: AuthorisedSlipYtd | null;
  payrollDivisor: number | null;
  calculationMethodCode: CalculationMethodCode | null;
  attendancePeriod: AttendancePeriod | null;
}

/**
 * Authoritative FINAL snapshot builder. Client computed values are not used.
 */
export function buildServerFinalSnapshot(args: BuildFinalSnapshotArgs): BuildFinalSnapshotResult {
  const computation = recomputePayrollServerSide(args.trusted, args.settings, args.clientComputed);
  const calendarDays = calendarDaysInMonthYear(args.trusted.monthYear);

  const cycleMethod =
    args.trusted.payrollCycleMethod ??
    args.payrollCycleMethod ??
    DEFAULT_PAYROLL_CYCLE_METHOD;

  const trustedStart =
    args.trusted.attendancePeriodStart ?? args.attendancePeriodOverrideStart ?? null;
  const trustedEnd =
    args.trusted.attendancePeriodEnd ?? args.attendancePeriodOverrideEnd ?? null;

  const attendancePeriod: AttendancePeriod =
    trustedStart && trustedEnd
      ? {
          salaryMonth: args.trusted.monthYear,
          attendancePeriodStart: trustedStart,
          attendancePeriodEnd: trustedEnd,
          payrollCycleMethod: cycleMethod,
          payrollCyclePolicyId: args.payrollCyclePolicyId ?? null,
          attendanceDayCount: inclusiveAttendanceDayCount(trustedStart, trustedEnd),
        }
      : computeAttendancePeriod({
          salaryMonth: args.trusted.monthYear,
          method: cycleMethod,
          policyId: args.payrollCyclePolicyId,
        });

  const attendance = buildAttendanceFromInputs(
    computation.inputs,
    computation.computed.lopDays,
    calendarDays,
    args.trusted.attendanceLocked ?? false,
    attendancePeriod,
  );

  const ctx: FinalizationContext = {
    monthYear: args.trusted.monthYear,
    attendancePeriodStart: attendancePeriod.attendancePeriodStart,
    attendancePeriodEnd: attendancePeriod.attendancePeriodEnd,
    now: args.now,
    workflowStatus: args.workflowStatus ?? 'APPROVED',
    attendance,
    paymentStatus: args.paymentStatus ?? 'NOT_SCHEDULED',
    salaryCreditDate: args.salaryCreditDate ?? null,
    expectedPaymentDate: args.expectedPaymentDate ?? null,
    existingFinalForPeriod: args.existingFinal && !args.supersedeConfirmed,
    integrityStatus: args.integrityStatus ?? 'OK',
    enforceStrictGates: args.enforceStrictGates ?? false,
    isManualCycleOverride: args.trusted.isManualCycleOverride,
    cycleOverrideReason: args.trusted.cycleOverrideReason,
  };

  const issues = [
    ...computation.issues,
    ...validateFinalization(ctx),
    ...validateAttendancePeriod({
      period: attendancePeriod,
      previousPeriod: args.previousAttendancePeriodEnd
        ? {
            salaryMonth: args.trusted.monthYear,
            attendancePeriodStart: args.previousAttendancePeriodEnd,
            attendancePeriodEnd: args.previousAttendancePeriodEnd,
          }
        : null,
      now: args.now,
      isManualOverride: Boolean(args.trusted.isManualCycleOverride),
      overrideReason:
        args.attendanceCycleOverrideReason ?? args.trusted.cycleOverrideReason ?? null,
    }),
  ];

  // YTD must be computable from history (may be zero for first FY month).
  let ytd: AuthorisedSlipYtd;
  try {
    ytd = aggregateYtdFromFinals(args.history, args.trusted.employeeId, args.trusted.monthYear);
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'YTD_UNAVAILABLE',
      message: err instanceof Error ? err.message : 'YTD could not be calculated.',
    });
    ytd = {
      basic: 0,
      fixedAllowance: 0,
      variablePaid: 0,
      grossEarnings: 0,
      lopDeduction: 0,
      professionalTax: 0,
      tds: 0,
      otherDeductions: 0,
      totalDeductions: 0,
    };
  }

  if (hasBlockingErrors(issues)) {
    return {
      ok: false,
      issues,
      snapshot: null,
      newFlexBalance: null,
      ytd,
      payrollDivisor: computation.payrollDivisor,
      calculationMethodCode: computation.calculationMethodCode,
      attendancePeriod,
    };
  }

  const snapshot: SlipSnapshot = {
    id: args.slipId,
    employeeId: args.trusted.employeeId,
    monthYear: args.trusted.monthYear,
    salaryMonth: args.trusted.monthYear,
    status: 'final',
    inputs: computation.inputs,
    computed: {
      ...computation.computed,
      netPay: roundRupees(computation.computed.netPay),
    },
    flexBalanceAfter: computation.newFlexBalance,
    generatedAt: args.generatedAt,
    employee: args.employeeSnapshot,
    attendancePeriodStart: attendancePeriod.attendancePeriodStart,
    attendancePeriodEnd: attendancePeriod.attendancePeriodEnd,
    payrollCycleMethod: attendancePeriod.payrollCycleMethod,
    payrollDivisor: computation.payrollDivisor,
    calculationMethodCode: computation.calculationMethodCode,
    calculationMethodLabel: lopCalculationBasisDisplayText(computation.calculationMethodCode),
    paymentStatus: args.paymentStatus ?? 'NOT_SCHEDULED',
    expectedPaymentDate: args.expectedPaymentDate ?? null,
    actualCreditDate: args.salaryCreditDate ?? null,
    revisionNumber: 1,
    ptFootnote:
      args.settings.ptCollectionMode === 'monthly_accrual'
        ? ptMonthlyAccrualFootnote(args.trusted.ptHalfYearly)
        : null,
    ptPartialHalfCaFlag:
      args.settings.ptCollectionMode === 'monthly_accrual' &&
      isPartialHalfPtLiability(args.trusted.joiningDate, args.trusted.monthYear),
  };

  return {
    ok: true,
    issues,
    snapshot,
    newFlexBalance: computation.newFlexBalance,
    ytd,
    payrollDivisor: computation.payrollDivisor,
    calculationMethodCode: computation.calculationMethodCode,
    attendancePeriod,
  };
}
