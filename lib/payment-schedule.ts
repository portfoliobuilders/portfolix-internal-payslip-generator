/**
 * Employee / compensation payment schedule resolution.
 *
 * Do not permanently derive payment date from designation alone.
 * Executive dates (CEO 1st, CTO 3rd, COO 5th) are configurable examples only.
 */

import { format, isValid, parse } from 'date-fns';
import { clampPaydayDayOfMonth, dateInMonth, payrollCycleDates } from './format';

export type PaymentScheduleType =
  | 'FIXED_DAY_OF_SUCCEEDING_MONTH'
  | 'MANUAL_PER_PAYROLL'
  | 'BOARD_APPROVED_EXECUTIVE_SCHEDULE'
  | 'CONTRACTUAL'
  | 'OTHER_APPROVED';

export interface EmployeePaymentSchedule {
  preferredPaymentDay: number | null;
  defaultPaymentDay: number | null;
  paymentScheduleType: PaymentScheduleType | null;
  paymentScheduleEffectiveFrom: string | null;
  paymentScheduleEffectiveTo: string | null;
  paymentScheduleNotes: string | null;
}

export interface ResolvedPaymentDates {
  /** Immutable original due date for this payroll. */
  originalDueDate: string;
  /** Scheduled / company-committed date at creation. */
  scheduledPaymentDate: string;
  /** Latest revised expected date (null until rescheduled). */
  revisedExpectedPaymentDate: string | null;
  paydayDayOfMonthUsed: number;
  paymentScheduleType: PaymentScheduleType;
}

export const DEFAULT_PAYMENT_DAY = 5;

/**
 * Resolve payday day-of-month from employee schedule, falling back to company default.
 * Does NOT use designation heuristics.
 */
export function resolvePreferredPaymentDay(input: {
  employeeSchedule?: Partial<EmployeePaymentSchedule> | null;
  companyDefaultPayday?: number;
  /** Explicit per-payroll override (MANUAL_PER_PAYROLL). */
  manualPaydayDay?: number | null;
  asOfDate?: string;
}): { day: number; scheduleType: PaymentScheduleType; notes?: string } {
  const companyDefault = input.companyDefaultPayday ?? DEFAULT_PAYMENT_DAY;
  const schedule = input.employeeSchedule;
  const asOf = input.asOfDate;

  if (asOf && schedule?.paymentScheduleEffectiveFrom) {
    const from = schedule.paymentScheduleEffectiveFrom;
    const to = schedule.paymentScheduleEffectiveTo;
    if (asOf < from || (to && asOf > to)) {
      return {
        day: companyDefault,
        scheduleType: 'FIXED_DAY_OF_SUCCEEDING_MONTH',
        notes: 'Employee schedule outside effective window; company default used.',
      };
    }
  }

  const type = schedule?.paymentScheduleType ?? 'FIXED_DAY_OF_SUCCEEDING_MONTH';

  if (type === 'MANUAL_PER_PAYROLL') {
    if (input.manualPaydayDay != null && input.manualPaydayDay >= 1 && input.manualPaydayDay <= 31) {
      return { day: input.manualPaydayDay, scheduleType: type };
    }
    // Fall through to preferred/default when no manual day supplied yet
  }

  const day =
    schedule?.preferredPaymentDay ??
    schedule?.defaultPaymentDay ??
    companyDefault;

  return {
    day: clampPaydayDayOfMonth(day),
    scheduleType: type,
    notes: schedule?.paymentScheduleNotes ?? undefined,
  };
}

export function computePaymentDates(input: {
  salaryMonth: string;
  employeeSchedule?: Partial<EmployeePaymentSchedule> | null;
  companyDefaultPayday?: number;
  manualPaydayDay?: number | null;
  /** Explicit scheduled date override (ISO date) — still preserves originalDueDate when provided separately. */
  scheduledPaymentDateOverride?: string | null;
  revisedExpectedPaymentDate?: string | null;
}): ResolvedPaymentDates {
  const resolved = resolvePreferredPaymentDay({
    employeeSchedule: input.employeeSchedule,
    companyDefaultPayday: input.companyDefaultPayday,
    manualPaydayDay: input.manualPaydayDay,
    asOfDate: `${input.salaryMonth}-01`,
  });

  const { creditDate } = payrollCycleDates(input.salaryMonth, resolved.day);
  const statutory = format(creditDate, 'yyyy-MM-dd');

  let scheduled = statutory;
  if (input.scheduledPaymentDateOverride) {
    const parsed = parse(input.scheduledPaymentDateOverride, 'yyyy-MM-dd', new Date());
    if (isValid(parsed)) scheduled = format(parsed, 'yyyy-MM-dd');
  }

  return {
    originalDueDate: statutory,
    scheduledPaymentDate: scheduled,
    revisedExpectedPaymentDate: input.revisedExpectedPaymentDate ?? null,
    paydayDayOfMonthUsed: resolved.day,
    paymentScheduleType: resolved.scheduleType,
  };
}

/**
 * Reschedule: write revised expected only — never overwrite originalDueDate.
 */
export function reviseExpectedPaymentDate(input: {
  originalDueDate: string;
  revisedExpectedPaymentDate: string;
  reason: string;
}):
  | { ok: true; originalDueDate: string; revisedExpectedPaymentDate: string }
  | { ok: false; error: string; code: string } {
  if (!input.reason.trim()) {
    return { ok: false, error: 'Revised expected date requires a reason.', code: 'REASON_REQUIRED' };
  }
  const parsed = parse(input.revisedExpectedPaymentDate, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed)) {
    return { ok: false, error: 'Revised expected date is invalid.', code: 'INVALID_DATE' };
  }
  return {
    ok: true,
    originalDueDate: input.originalDueDate,
    revisedExpectedPaymentDate: format(parsed, 'yyyy-MM-dd'),
  };
}

/** Seed helpers for common executive examples (configuration, not hardcoded permanent rules). */
export const EXAMPLE_EXECUTIVE_SCHEDULE_SEEDS: Record<
  string,
  Pick<EmployeePaymentSchedule, 'preferredPaymentDay' | 'paymentScheduleType' | 'paymentScheduleNotes'>
> = {
  CEO: {
    preferredPaymentDay: 1,
    paymentScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
    paymentScheduleNotes: 'Example board-approved CEO schedule (1st of succeeding month). Configurable.',
  },
  CTO: {
    preferredPaymentDay: 3,
    paymentScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
    paymentScheduleNotes: 'Example board-approved CTO schedule (3rd of succeeding month). Configurable.',
  },
  COO: {
    preferredPaymentDay: 5,
    paymentScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
    paymentScheduleNotes: 'Example board-approved COO schedule (5th of succeeding month). Configurable.',
  },
};

export function succeedingMonthPaymentDate(salaryMonth: string, dayOfMonth: number): string {
  const { creditDate } = payrollCycleDates(salaryMonth, dayOfMonth);
  return format(creditDate, 'yyyy-MM-dd');
}

export function clampPaymentDay(day: number): number {
  return clampPaydayDayOfMonth(day);
}

/**
 * Compatibility wrapper used by payroll finalisation when creating the
 * parent salary-payment obligation. Delegates to computePaymentDates.
 */
export function resolvePaymentSchedule(input: {
  salaryMonth: string;
  companyDefaultPaymentDay: number;
  employeePreferredPaymentDay?: number | null;
  employeeDefaultPaymentDay?: number | null;
  employeeScheduleType?: PaymentScheduleType | null;
  manualPaymentDay?: number | null;
}): Pick<ResolvedPaymentDates, 'originalDueDate' | 'scheduledPaymentDate'> & {
  paymentScheduleType: PaymentScheduleType;
  paymentDayUsed: number;
} {
  const resolved = computePaymentDates({
    salaryMonth: input.salaryMonth,
    companyDefaultPayday: input.companyDefaultPaymentDay,
    manualPaydayDay: input.manualPaymentDay,
    employeeSchedule: {
      preferredPaymentDay: input.employeePreferredPaymentDay ?? null,
      defaultPaymentDay: input.employeeDefaultPaymentDay ?? null,
      paymentScheduleType: input.employeeScheduleType ?? null,
      paymentScheduleEffectiveFrom: null,
      paymentScheduleEffectiveTo: null,
      paymentScheduleNotes: null,
    },
  });
  return {
    originalDueDate: resolved.originalDueDate,
    scheduledPaymentDate: resolved.scheduledPaymentDate,
    paymentScheduleType: resolved.paymentScheduleType,
    paymentDayUsed: resolved.paydayDayOfMonthUsed,
  };
}

void dateInMonth;
