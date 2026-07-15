/**
 * Payroll attendance-cycle model.
 *
 * Salary month ≠ attendance cycle.
 * Default company convention: PREVIOUS_25_TO_CURRENT_24
 *   July 2026 salary → 25 Jun 2026 – 24 Jul 2026
 *
 * LOP / salary calculation divisors live in calculation-method.ts — never
 * confuse the attendance window length with the daily-rate divisor.
 */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parse,
  startOfDay,
  startOfMonth,
} from 'date-fns';

export type PayrollCycleMethod =
  | 'CALENDAR_MONTH'
  | 'PREVIOUS_25_TO_CURRENT_24'
  | 'PREVIOUS_24_TO_CURRENT_23'
  | 'CUSTOM_FIXED_CYCLE';

export const DEFAULT_PAYROLL_CYCLE_METHOD: PayrollCycleMethod =
  'PREVIOUS_25_TO_CURRENT_24';

export interface PayrollCyclePolicy {
  id?: string;
  code?: string;
  cycleMethod: PayrollCycleMethod;
  customStartDay?: number | null;
  customEndDay?: number | null;
  /** Absolute max attendance days unless documented exception. */
  maxDays?: number;
  exceptionDocumented?: boolean;
}

export interface AttendancePeriod {
  salaryMonth: string;
  attendancePeriodStart: string; // yyyy-MM-dd
  attendancePeriodEnd: string; // yyyy-MM-dd
  payrollCycleMethod: PayrollCycleMethod;
  payrollCyclePolicyId: string | null;
  dayCount: number;
}

export interface CycleValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

function parseSalaryMonth(salaryMonth: string): Date {
  const d = parse(salaryMonth, 'yyyy-MM', new Date());
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid salary_month: ${salaryMonth}`);
  }
  return d;
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Compute attendance period for a salary month. Server-side only — do not
 * re-derive period bounds from salary month alone in UI render paths.
 */
export function computeAttendancePeriod(input: {
  salaryMonth: string;
  method: PayrollCycleMethod;
  policyId?: string | null;
  customStartDay?: number | null;
  customEndDay?: number | null;
  /** Explicit override dates (require reason + audit at call site). */
  overrideStart?: string | null;
  overrideEnd?: string | null;
}): AttendancePeriod {
  if (input.overrideStart && input.overrideEnd) {
    const start = startOfDay(parse(input.overrideStart, 'yyyy-MM-dd', new Date()));
    const end = startOfDay(parse(input.overrideEnd, 'yyyy-MM-dd', new Date()));
    if (isAfter(start, end)) {
      throw new Error('Attendance period start must be on or before end.');
    }
    return {
      salaryMonth: input.salaryMonth,
      attendancePeriodStart: isoDate(start),
      attendancePeriodEnd: isoDate(end),
      payrollCycleMethod: input.method,
      payrollCyclePolicyId: input.policyId ?? null,
      dayCount: differenceInCalendarDays(end, start) + 1,
    };
  }

  const monthStart = startOfMonth(parseSalaryMonth(input.salaryMonth));
  let start: Date;
  let end: Date;

  switch (input.method) {
    case 'CALENDAR_MONTH':
      start = monthStart;
      end = endOfMonth(monthStart);
      break;
    case 'PREVIOUS_25_TO_CURRENT_24': {
      const prev = addMonths(monthStart, -1);
      start = new Date(prev.getFullYear(), prev.getMonth(), 25);
      end = new Date(monthStart.getFullYear(), monthStart.getMonth(), 24);
      break;
    }
    case 'PREVIOUS_24_TO_CURRENT_23': {
      const prev = addMonths(monthStart, -1);
      start = new Date(prev.getFullYear(), prev.getMonth(), 24);
      end = new Date(monthStart.getFullYear(), monthStart.getMonth(), 23);
      break;
    }
    case 'CUSTOM_FIXED_CYCLE': {
      const startDay = input.customStartDay;
      const endDay = input.customEndDay;
      if (startDay == null || endDay == null) {
        throw new Error('CUSTOM_FIXED_CYCLE requires customStartDay and customEndDay.');
      }
      const prev = addMonths(monthStart, -1);
      start = new Date(prev.getFullYear(), prev.getMonth(), startDay);
      end = new Date(monthStart.getFullYear(), monthStart.getMonth(), endDay);
      break;
    }
    default: {
      const _exhaustive: never = input.method;
      throw new Error(`Unhandled payroll cycle method: ${_exhaustive}`);
    }
  }

  start = startOfDay(start);
  end = startOfDay(end);

  return {
    salaryMonth: input.salaryMonth,
    attendancePeriodStart: isoDate(start),
    attendancePeriodEnd: isoDate(end),
    payrollCycleMethod: input.method,
    payrollCyclePolicyId: input.policyId ?? null,
    dayCount: differenceInCalendarDays(end, start) + 1,
  };
}

/** Format "25 Jun 2026 – 24 Jul 2026". */
export function formatAttendanceCycleRange(
  startIso: string,
  endIso: string,
): string {
  const start = parse(startIso, 'yyyy-MM-dd', new Date());
  const end = parse(endIso, 'yyyy-MM-dd', new Date());
  return `${format(start, 'dd MMM yyyy')} – ${format(end, 'dd MMM yyyy')}`;
}

export function isAttendanceCycleEnded(
  attendancePeriodEnd: string,
  now = new Date(),
): boolean {
  const end = startOfDay(parse(attendancePeriodEnd, 'yyyy-MM-dd', new Date()));
  return !isBefore(startOfDay(now), end);
}

/**
 * Validate attendance period against prior period, finalisation time, and length.
 */
export function validateAttendancePeriod(input: {
  period: AttendancePeriod;
  previousPeriodEnd?: string | null;
  previousPeriodStart?: string | null;
  now?: Date;
  finalising?: boolean;
  overrideReason?: string | null;
  maxDays?: number;
  exceptionDocumented?: boolean;
}): CycleValidationIssue[] {
  const issues: CycleValidationIssue[] = [];
  const now = input.now ?? new Date();
  const start = startOfDay(
    parse(input.period.attendancePeriodStart, 'yyyy-MM-dd', new Date()),
  );
  const end = startOfDay(
    parse(input.period.attendancePeriodEnd, 'yyyy-MM-dd', new Date()),
  );

  if (isAfter(start, end)) {
    issues.push({
      severity: 'error',
      code: 'ATTENDANCE_START_AFTER_END',
      message: 'Attendance period start must be on or before end.',
    });
  }

  if (input.previousPeriodEnd) {
    const prevEnd = startOfDay(
      parse(input.previousPeriodEnd, 'yyyy-MM-dd', new Date()),
    );
    // No overlap: new start must be day after previous end
    if (isBefore(start, addDays(prevEnd, 1))) {
      issues.push({
        severity: 'error',
        code: 'ATTENDANCE_OVERLAP',
        message:
          'Attendance period overlaps the previous payroll period for this employee.',
      });
    }
    // No unexplained gap
    if (isAfter(start, addDays(prevEnd, 1))) {
      issues.push({
        severity: 'error',
        code: 'ATTENDANCE_GAP',
        message:
          'Attendance period leaves an unexplained gap after the previous period.',
      });
    }
  }

  const maxDays = input.maxDays ?? 31;
  if (input.period.dayCount > maxDays && !input.exceptionDocumented) {
    issues.push({
      severity: 'error',
      code: 'ATTENDANCE_EXCEEDS_ONE_MONTH',
      message: `Payroll cycle is ${input.period.dayCount} days; exceeds ${maxDays} without a documented exception.`,
    });
  }

  if (input.finalising) {
    if (isBefore(startOfDay(now), end)) {
      issues.push({
        severity: 'error',
        code: 'FINALISE_BEFORE_CYCLE_END',
        message:
          'Final payroll cannot be issued before the attendance period ends.',
      });
    }
  }

  // Period end must be on or before payroll finalisation wall-clock day
  if (input.finalising && isAfter(end, startOfDay(now))) {
    issues.push({
      severity: 'error',
      code: 'PERIOD_END_AFTER_FINALISATION',
      message: 'Attendance period end must be on or before payroll finalisation.',
    });
  }

  if (
    (input.period.payrollCycleMethod === 'CUSTOM_FIXED_CYCLE' ||
      input.overrideReason != null) &&
    input.overrideReason != null &&
    input.overrideReason.trim() === ''
  ) {
    issues.push({
      severity: 'error',
      code: 'OVERRIDE_REASON_REQUIRED',
      message: 'Manual attendance-cycle override requires a reason and audit event.',
    });
  }

  return issues;
}

/** Contiguous next period start = prior end + 1 day. */
export function expectNextPeriodStart(previousPeriodEnd: string): string {
  const prevEnd = parse(previousPeriodEnd, 'yyyy-MM-dd', new Date());
  return isoDate(addDays(prevEnd, 1));
}

export function periodsAreContiguous(
  earlierEnd: string,
  laterStart: string,
): boolean {
  return expectNextPeriodStart(earlierEnd) === laterStart;
}

export function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = startOfDay(parse(aStart, 'yyyy-MM-dd', new Date()));
  const ae = startOfDay(parse(aEnd, 'yyyy-MM-dd', new Date()));
  const bs = startOfDay(parse(bStart, 'yyyy-MM-dd', new Date()));
  const be = startOfDay(parse(bEnd, 'yyyy-MM-dd', new Date()));
  // Overlap when each starts on or before the other's end.
  return !isAfter(as, be) && !isAfter(bs, ae);
}
