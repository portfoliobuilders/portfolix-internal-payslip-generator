/**
 * Server-side payroll period / attendance / finalization validation.
 * Does not invent missing data — returns structured issues for HR review.
 */

import { endOfMonth, parse, isAfter, isBefore, isValid, startOfDay } from 'date-fns';
import { moneyEquals, reconcileNet, roundRupees } from './money';
import type { SlipComputed, SlipInputs, SlipSnapshot } from './types';

export type PayrollWorkflowStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FINAL'
  | 'FINALISED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export type IntegrityStatus = 'OK' | 'LEGACY_UNVERIFIED' | 'NEEDS_REVIEW';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface AttendanceTotals {
  calendarDays: number;
  workingDays: number | null;
  paidDays: number | null;
  presentDays: number | null;
  weeklyOffs: number | null;
  paidLeaveDays: number | null;
  unpaidLeaveDays: number | null;
  lopDays: number;
  payableDays: number | null;
  absentDays: number;
  halfDays: number;
  lateMinutes: number;
  attendanceLocked: boolean;
}

export interface FinalizationContext {
  monthYear: string;
  /**
   * Server-computed attendance period end (yyyy-MM-dd).
   * Preferred over calendar-month inference.
   */
  attendancePeriodEnd?: string | null;
  attendancePeriodStart?: string | null;
  /** Wall-clock "now" (injectable for tests). */
  now?: Date;
  workflowStatus: PayrollWorkflowStatus;
  attendance: AttendanceTotals;
  /** Obligation payment status — FINAL payroll does not imply PAID. */
  paymentStatus:
    | 'NOT_SCHEDULED'
    | 'SCHEDULED'
    | 'PROCESSING'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'FAILED'
    | 'REJECTED_BY_BANK'
    | 'ON_HOLD'
    | 'PAYMENT_DEFERRED'
    | 'OVERDUE'
    | 'REVERSED'
    | 'CANCELLED'
    | 'UNDER_RECONCILIATION'
    | 'NO_SALARY_DUE'
    | 'SALARY_WAIVED'
    /** @deprecated Phase 2 legacy alias — treat as NOT_SCHEDULED */
    | 'UNPAID';
  salaryCreditDate: string | null;
  expectedPaymentDate: string | null;
  documentIssueDate?: string | null;
  existingFinalForPeriod: boolean;
  integrityStatus: IntegrityStatus;
  /** When true, period/attendance gates are enforced (new finals). Legacy path uses warnings. */
  enforceStrictGates: boolean;
}

/**
 * @deprecated Calendar-month end — only for CALENDAR_MONTH cycle or legacy rows
 * lacking attendance_period_end. Prefer attendancePeriodEnd.
 */
export function payPeriodEnd(monthYear: string): Date {
  const start = parse(monthYear, 'yyyy-MM', new Date());
  if (!isValid(start)) throw new Error(`Invalid monthYear: ${monthYear}`);
  return endOfMonth(start);
}

/** True when attendance cycle (or calendar fallback) has ended. */
export function isPayPeriodEnded(
  monthYear: string,
  now = new Date(),
  attendancePeriodEnd?: string | null,
): boolean {
  if (attendancePeriodEnd) {
    const end = parse(attendancePeriodEnd, 'yyyy-MM-dd', new Date());
    if (isValid(end)) {
      return !isBefore(startOfDay(now), startOfDay(end));
    }
  }
  return !isBefore(startOfDay(now), startOfDay(payPeriodEnd(monthYear)));
}

export function validateAttendance(attendance: AttendanceTotals): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (attendance.calendarDays < 28 || attendance.calendarDays > 31) {
    issues.push({
      severity: 'error',
      code: 'INVALID_CALENDAR_DAYS',
      message: `Calendar days must be 28–31 (got ${attendance.calendarDays}).`,
    });
  }
  if (attendance.payableDays != null && attendance.payableDays > attendance.calendarDays) {
    issues.push({
      severity: 'error',
      code: 'PAYABLE_EXCEEDS_CALENDAR',
      message: 'Payable days cannot exceed calendar days.',
    });
  }
  if (attendance.lopDays < 0 || attendance.absentDays < 0 || attendance.halfDays < 0) {
    issues.push({
      severity: 'error',
      code: 'NEGATIVE_ATTENDANCE',
      message: 'Attendance values cannot be negative without an approved adjustment.',
    });
  }
  if (attendance.absentDays > 31 || attendance.halfDays > 31) {
    issues.push({
      severity: 'error',
      code: 'ATTENDANCE_OUT_OF_RANGE',
      message: 'Absent/half days cannot exceed 31.',
    });
  }
  if (
    attendance.payableDays != null &&
    attendance.workingDays != null &&
    attendance.payableDays > attendance.workingDays + 1e-9
  ) {
    issues.push({
      severity: 'warning',
      code: 'PAYABLE_EXCEEDS_WORKING',
      message: 'Payable days exceed working days — confirm leave/attendance totals.',
    });
  }
  return issues;
}

export function validateMoneyReconciliation(input: {
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
  variablePaid: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Portfolix net = (gross fixed − deductions) + variable paid
  const expectedNet = roundRupees(input.grossEarnings - input.totalDeductions + input.variablePaid);
  if (!moneyEquals(expectedNet, input.netSalary)) {
    issues.push({
      severity: 'error',
      code: 'NET_MISMATCH',
      message: `Net salary ${input.netSalary} does not equal gross ${input.grossEarnings} − deductions ${input.totalDeductions} + variable paid ${input.variablePaid} (expected ${expectedNet}).`,
    });
  }

  const baseReconcile = reconcileNet(
    input.grossEarnings,
    input.totalDeductions,
    roundRupees(input.grossEarnings - input.totalDeductions),
  );
  if (!baseReconcile.ok) {
    issues.push({
      severity: 'error',
      code: 'GROSS_DEDUCTION_RECONCILE',
      message: 'Gross and deductions do not reconcile in paise arithmetic.',
    });
  }

  for (const [label, value] of [
    ['grossEarnings', input.grossEarnings],
    ['totalDeductions', input.totalDeductions],
    ['netSalary', input.netSalary],
    ['variablePaid', input.variablePaid],
  ] as const) {
    if (value < 0) {
      issues.push({
        severity: 'error',
        code: 'NEGATIVE_MONEY',
        message: `${label} is negative without an approved adjustment.`,
      });
    }
  }
  return issues;
}

export function validateClientComputedMatch(
  server: Pick<SlipComputed, 'netPay' | 'totalDeductions' | 'grossFixed' | 'lopDeduction' | 'lopDays'>,
  client: Partial<SlipComputed> | null | undefined,
): ValidationIssue[] {
  if (!client) return [];
  const issues: ValidationIssue[] = [];
  const checks: Array<['netPay' | 'totalDeductions' | 'grossFixed' | 'lopDeduction', number | undefined]> = [
    ['netPay', client.netPay],
    ['totalDeductions', client.totalDeductions],
    ['grossFixed', client.grossFixed],
    ['lopDeduction', client.lopDeduction],
  ];
  for (const [key, value] of checks) {
    if (value == null) continue;
    const serverValue = server[key];
    if (!moneyEquals(serverValue, value)) {
      issues.push({
        severity: 'error',
        code: 'CLIENT_COMPUTED_MISMATCH',
        message: `Client-supplied ${key}=${value} does not match server ${serverValue}. Frontend totals are not trusted.`,
      });
    }
  }
  if (client.lopDays != null && Math.abs(client.lopDays - server.lopDays) > 1e-9) {
    issues.push({
      severity: 'error',
      code: 'CLIENT_LOP_MISMATCH',
      message: `Client lopDays=${client.lopDays} does not match server ${server.lopDays}.`,
    });
  }
  return issues;
}

/**
 * Gates for issuing / finalizing an internal payroll document.
 * Strict errors block finalization; warnings are for HR review (legacy).
 */
export function validateFinalization(ctx: FinalizationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const now = ctx.now ?? new Date();
  const periodEnded = isPayPeriodEnded(
    ctx.monthYear,
    now,
    ctx.attendancePeriodEnd,
  );

  if (!periodEnded) {
    issues.push({
      severity: ctx.enforceStrictGates ? 'error' : 'warning',
      code: 'PERIOD_NOT_ENDED',
      message: ctx.attendancePeriodEnd
        ? `Attendance cycle ending ${ctx.attendancePeriodEnd} has not ended. Final payroll cannot be issued yet.`
        : `Pay period ${ctx.monthYear} has not ended. Final payroll cannot be issued yet.`,
    });
  }

  if (ctx.existingFinalForPeriod) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_FINAL',
      message:
        'An active FINAL payroll already exists for this employee and period. Supersede it explicitly before issuing another.',
    });
  }

  if (['CANCELLED', 'SUPERSEDED'].includes(ctx.workflowStatus)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_WORKFLOW_STATUS',
      message: `Cannot finalize from status ${ctx.workflowStatus}.`,
    });
  }

  if (ctx.enforceStrictGates && !ctx.attendance.attendanceLocked) {
    issues.push({
      severity: 'error',
      code: 'ATTENDANCE_NOT_LOCKED',
      message: 'Attendance must be locked before finalization.',
    });
  } else if (!ctx.attendance.attendanceLocked) {
    issues.push({
      severity: 'warning',
      code: 'ATTENDANCE_NOT_LOCKED',
      message: 'Attendance is not locked. Mark locked after review (legacy slip warning).',
    });
  }

  issues.push(...validateAttendance(ctx.attendance));

  if (ctx.salaryCreditDate) {
    const credit = parse(ctx.salaryCreditDate, 'yyyy-MM-dd', new Date());
    const periodEnd = ctx.attendancePeriodEnd
      ? parse(ctx.attendancePeriodEnd, 'yyyy-MM-dd', new Date())
      : payPeriodEnd(ctx.monthYear);
    if (isValid(credit) && isValid(periodEnd) && isBefore(credit, startOfDay(periodEnd))) {
      issues.push({
        severity: 'error',
        code: 'CREDIT_BEFORE_PERIOD_END',
        message: 'Actual salary credit date cannot be before the attendance period ends.',
      });
    }
    if (isValid(credit) && isAfter(startOfDay(credit), startOfDay(now))) {
      issues.push({
        severity: 'error',
        code: 'FUTURE_CREDIT_DATE',
        message: 'Actual credit date cannot be in the future.',
      });
    }
    if (ctx.paymentStatus !== 'PAID') {
      issues.push({
        severity: 'error',
        code: 'CREDIT_DATE_WITHOUT_PAID',
        message:
          'Actual salary credit date requires payment status PAID. Use Expected Payment Date until then.',
      });
    }
  }

  if (ctx.documentIssueDate) {
    const issued = parse(ctx.documentIssueDate, 'yyyy-MM-dd', new Date());
    if (isValid(issued) && isAfter(startOfDay(issued), startOfDay(now))) {
      issues.push({
        severity: 'error',
        code: 'FUTURE_ISSUE_DATE',
        message: 'Document issue date cannot be in the future.',
      });
    }
  }

  if (ctx.integrityStatus === 'LEGACY_UNVERIFIED') {
    issues.push({
      severity: 'warning',
      code: 'LEGACY_UNVERIFIED',
      message:
        'This record is marked LEGACY_UNVERIFIED. Do not silently alter historical amounts — review source evidence before reissue.',
    });
  }

  return issues;
}

/** True when any issue is an error. */
export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Map legacy draft/final slip status onto the expanded workflow enum. */
export function workflowFromLegacySlipStatus(status: SlipSnapshot['status']): PayrollWorkflowStatus {
  return status === 'final' ? 'FINAL' : 'DRAFT';
}

export function buildAttendanceFromInputs(
  inputs: SlipInputs,
  lopDays: number,
  calendarDays: number,
  attendanceLocked = false,
): AttendanceTotals {
  return {
    calendarDays,
    workingDays: null,
    paidDays: null,
    presentDays: null,
    weeklyOffs: null,
    paidLeaveDays: null,
    unpaidLeaveDays: null,
    lopDays,
    payableDays: null,
    absentDays: inputs.absentDays,
    halfDays: inputs.halfDays,
    lateMinutes: inputs.lateMinutes,
    attendanceLocked,
  };
}
