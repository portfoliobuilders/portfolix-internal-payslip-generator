/**
 * Payroll attendance-cycle model.
 *
 * Salary month ≠ attendance cycle.
 * Default Portfolix policy: 25th of previous month through 24th of salary month.
 * Divisor / LOP basis is a SEPARATE concern (see calculation-method.ts).
 */

import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';

export type PayrollCycleMethod =
  | 'CALENDAR_MONTH'
  | 'PREVIOUS_25_TO_CURRENT_24'
  | 'PREVIOUS_24_TO_CURRENT_23'
  | 'CUSTOM_FIXED_CYCLE';

export const DEFAULT_PAYROLL_CYCLE_METHOD: PayrollCycleMethod = 'PREVIOUS_25_TO_CURRENT_24';

export interface AttendancePeriod {
  salaryMonth: string; // YYYY-MM
  attendancePeriodStart: string; // YYYY-MM-DD
  attendancePeriodEnd: string; // YYYY-MM-DD
  payrollCycleMethod: PayrollCycleMethod;
  payrollCyclePolicyId: string | null;
  /** Inclusive day count of the attendance window. */
  attendanceDayCount: number;
}

export interface CycleValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

function parseSalaryMonth(salaryMonth: string): Date {
  const d = parse(salaryMonth, 'yyyy-MM', new Date());
  if (!isValid(d)) throw new Error(`Invalid salary month: ${salaryMonth}`);
  return d;
}

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Compute attendance period for a salary month. Server-side only —
 * frontend must not invent these dates.
 */
export function computeAttendancePeriod(input: {
  salaryMonth: string;
  method?: PayrollCycleMethod;
  policyId?: string | null;
  /** Required when method is CUSTOM_FIXED_CYCLE. */
  customStart?: string | null;
  customEnd?: string | null;
}): AttendancePeriod {
  const method = input.method ?? DEFAULT_PAYROLL_CYCLE_METHOD;
  const base = parseSalaryMonth(input.salaryMonth);

  let start: Date;
  let end: Date;

  switch (method) {
    case 'CALENDAR_MONTH':
      start = startOfMonth(base);
      end = endOfMonth(base);
      break;
    case 'PREVIOUS_25_TO_CURRENT_24': {
      const prev = subMonths(base, 1);
      start = new Date(prev.getFullYear(), prev.getMonth(), 25);
      end = new Date(base.getFullYear(), base.getMonth(), 24);
      break;
    }
    case 'PREVIOUS_24_TO_CURRENT_23': {
      const prev = subMonths(base, 1);
      start = new Date(prev.getFullYear(), prev.getMonth(), 24);
      end = new Date(base.getFullYear(), base.getMonth(), 23);
      break;
    }
    case 'CUSTOM_FIXED_CYCLE': {
      if (!input.customStart || !input.customEnd) {
        throw new Error('CUSTOM_FIXED_CYCLE requires explicit start and end dates.');
      }
      start = startOfDay(parse(input.customStart, 'yyyy-MM-dd', new Date()));
      end = startOfDay(parse(input.customEnd, 'yyyy-MM-dd', new Date()));
      if (!isValid(start) || !isValid(end)) {
        throw new Error('CUSTOM_FIXED_CYCLE dates are invalid.');
      }
      break;
    }
    default:
      throw new Error(`Unhandled payroll cycle method: ${method}`);
  }

  if (isAfter(start, end)) {
    throw new Error('Attendance period start cannot be after end.');
  }

  const attendanceDayCount = differenceInCalendarDays(end, start) + 1;

  return {
    salaryMonth: input.salaryMonth,
    attendancePeriodStart: ymd(start),
    attendancePeriodEnd: ymd(end),
    payrollCycleMethod: method,
    payrollCyclePolicyId: input.policyId ?? null,
    attendanceDayCount,
  };
}

/** Inclusive calendar-day count between YYYY-MM-DD dates. */
export function inclusiveAttendanceDayCount(startYmd: string, endYmd: string): number {
  const start = startOfDay(parse(startYmd, 'yyyy-MM-dd', new Date()));
  const end = startOfDay(parse(endYmd, 'yyyy-MM-dd', new Date()));
  if (!isValid(start) || !isValid(end)) {
    throw new Error(`Invalid attendance dates: ${startYmd} → ${endYmd}`);
  }
  if (isAfter(start, end)) {
    throw new Error('Attendance period start cannot be after end.');
  }
  return differenceInCalendarDays(end, start) + 1;
}

/** Human-readable range, e.g. "25 Jun 2026 – 24 Jul 2026". */
export function formatAttendanceCycle(period: Pick<
  AttendancePeriod,
  'attendancePeriodStart' | 'attendancePeriodEnd'
>): string {
  const s = parse(period.attendancePeriodStart, 'yyyy-MM-dd', new Date());
  const e = parse(period.attendancePeriodEnd, 'yyyy-MM-dd', new Date());
  if (!isValid(s) || !isValid(e)) return '—';
  return `${format(s, 'dd MMM yyyy')} – ${format(e, 'dd MMM yyyy')}`;
}

export function isAttendanceCycleEnded(
  attendancePeriodEnd: string,
  now = new Date(),
): boolean {
  const end = startOfDay(parse(attendancePeriodEnd, 'yyyy-MM-dd', new Date()));
  if (!isValid(end)) return false;
  return !isBefore(startOfDay(now), end);
}

/**
 * Validate a proposed attendance period against prior period and policy.
 * Does not silently modify dates.
 */
export function validateAttendancePeriod(input: {
  period: AttendancePeriod;
  /** Prior period for the same employee (most recent previous salary month). */
  previousPeriod?: Pick<
    AttendancePeriod,
    'attendancePeriodStart' | 'attendancePeriodEnd' | 'salaryMonth'
  > | null;
  /** Next period if already drafted (gap check). */
  nextPeriod?: Pick<
    AttendancePeriod,
    'attendancePeriodStart' | 'attendancePeriodEnd'
  > | null;
  now?: Date;
  /** Manual override of computed dates. */
  isManualOverride?: boolean;
  overrideReason?: string | null;
  allowMultiMonthException?: boolean;
  payrollFinalisedAt?: Date | string | null;
}): CycleValidationIssue[] {
  const issues: CycleValidationIssue[] = [];
  const period = input.period;
  const start = startOfDay(parse(period.attendancePeriodStart, 'yyyy-MM-dd', new Date()));
  const end = startOfDay(parse(period.attendancePeriodEnd, 'yyyy-MM-dd', new Date()));

  if (!isValid(start) || !isValid(end)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_ATTENDANCE_DATES',
      message: 'Attendance period dates are invalid.',
    });
    return issues;
  }

  if (isAfter(start, end)) {
    issues.push({
      severity: 'error',
      code: 'ATTENDANCE_START_AFTER_END',
      message: 'Attendance period start must be on or before end.',
    });
  }

  // Cycle length: normally ≤ ~31 days unless documented exception
  const days = differenceInCalendarDays(end, start) + 1;
  if (days > 31 && !input.allowMultiMonthException) {
    issues.push({
      severity: 'error',
      code: 'CYCLE_EXCEEDS_ONE_MONTH',
      message: `Attendance cycle is ${days} days which exceeds one month. Configure a documented multi-month exception.`,
    });
  }

  if (input.previousPeriod) {
    const prevEnd = startOfDay(
      parse(input.previousPeriod.attendancePeriodEnd, 'yyyy-MM-dd', new Date()),
    );
    if (isValid(prevEnd)) {
      const expectedNextStart = addDays(prevEnd, 1);
      if (isBefore(start, expectedNextStart) && !isEqual(start, expectedNextStart)) {
        // overlap if start <= prevEnd
        if (!isAfter(start, prevEnd)) {
          issues.push({
            severity: 'error',
            code: 'ATTENDANCE_OVERLAP',
            message: `Attendance period overlaps the previous cycle ending ${input.previousPeriod.attendancePeriodEnd}.`,
          });
        }
      }
      if (isAfter(start, expectedNextStart)) {
        issues.push({
          severity: 'error',
          code: 'ATTENDANCE_GAP',
          message: `Unexplained gap after previous cycle ending ${input.previousPeriod.attendancePeriodEnd}. Expected start ${ymd(expectedNextStart)}.`,
        });
      }
    }
  }

  if (input.nextPeriod) {
    const nextStart = startOfDay(
      parse(input.nextPeriod.attendancePeriodStart, 'yyyy-MM-dd', new Date()),
    );
    if (isValid(nextStart)) {
      const expectedNext = addDays(end, 1);
      if (!isEqual(nextStart, expectedNext)) {
        if (!isAfter(nextStart, end)) {
          issues.push({
            severity: 'error',
            code: 'ATTENDANCE_OVERLAP_NEXT',
            message: 'Attendance period overlaps the next payroll period.',
          });
        } else {
          issues.push({
            severity: 'error',
            code: 'ATTENDANCE_GAP_NEXT',
            message: 'Unexplained gap before the next payroll period.',
          });
        }
      }
    }
  }

  if (input.isManualOverride && !input.overrideReason?.trim()) {
    issues.push({
      severity: 'error',
      code: 'OVERRIDE_REASON_REQUIRED',
      message: 'Manual attendance-date overrides require a reason and audit event.',
    });
  }

  if (input.payrollFinalisedAt) {
    const finalised =
      typeof input.payrollFinalisedAt === 'string'
        ? startOfDay(parse(input.payrollFinalisedAt.slice(0, 10), 'yyyy-MM-dd', new Date()))
        : startOfDay(input.payrollFinalisedAt);
    if (isValid(finalised) && isBefore(finalised, end)) {
      issues.push({
        severity: 'error',
        code: 'FINALISED_BEFORE_CYCLE_END',
        message: 'Attendance period end must be on or before payroll finalisation.',
      });
    }
  }

  return issues;
}

/**
 * Block finalisation before attendance cycle ends.
 */
export function assertFinalisationAllowed(input: {
  attendancePeriodEnd: string;
  now?: Date;
}): CycleValidationIssue | null {
  const now = input.now ?? new Date();
  if (!isAttendanceCycleEnded(input.attendancePeriodEnd, now)) {
    return {
      severity: 'error',
      code: 'FINALISATION_BEFORE_CYCLE_END',
      message: `Final payroll cannot be issued before the attendance period ends (${input.attendancePeriodEnd}).`,
    };
  }
  return null;
}

/** Example fixture helper used by tests. */
export function july2026DefaultCycle(): AttendancePeriod {
  return computeAttendancePeriod({
    salaryMonth: '2026-07',
    method: 'PREVIOUS_25_TO_CURRENT_24',
  });
}
