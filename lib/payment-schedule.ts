/**
 * Employee / compensation payment schedule resolution.
 *
 * Do not permanently derive payment day from designation alone.
 * Prefer configured schedule rows effective for the salary month.
 */

import { format, parse } from 'date-fns';
import { dateInMonth } from './format';

export type PaymentScheduleType =
  | 'FIXED_DAY_OF_SUCCEEDING_MONTH'
  | 'MANUAL_PER_PAYROLL'
  | 'BOARD_APPROVED_EXECUTIVE_SCHEDULE'
  | 'CONTRACTUAL'
  | 'OTHER_APPROVED';

export interface PaymentScheduleConfig {
  paymentScheduleType: PaymentScheduleType;
  preferredPaymentDay?: number | null;
  defaultPaymentDay?: number | null;
  paymentScheduleEffectiveFrom: string; // yyyy-MM-dd
  paymentScheduleEffectiveTo?: string | null;
  paymentScheduleNotes?: string | null;
  active?: boolean;
}

export interface ResolvedPaymentSchedule {
  originalDueDate: string; // yyyy-MM-dd — immutable once stored on payroll
  scheduledPaymentDate: string;
  paymentScheduleType: PaymentScheduleType;
  paymentDayUsed: number;
  source: 'employee_schedule' | 'employee_defaults' | 'company_default' | 'manual_override';
  notes: string | null;
}

function succeedingMonthKey(salaryMonth: string): string {
  const base = parse(salaryMonth, 'yyyy-MM', new Date());
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return format(next, 'yyyy-MM');
}

function clampDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day)));
}

function scheduleCoversMonth(
  schedule: PaymentScheduleConfig,
  salaryMonth: string,
): boolean {
  if (schedule.active === false) return false;
  const monthStart = `${salaryMonth}-01`;
  const from = schedule.paymentScheduleEffectiveFrom;
  const to = schedule.paymentScheduleEffectiveTo;
  if (from && monthStart < from.slice(0, 10)) return false;
  if (to && monthStart > to.slice(0, 10)) return false;
  return true;
}

/**
 * Resolve due / scheduled payment dates for a salary month.
 * Manual per-payroll override supplies `manualPaymentDay` without erasing
 * an already-persisted originalDueDate (call site preserves original).
 */
export function resolvePaymentSchedule(input: {
  salaryMonth: string;
  companyDefaultPaymentDay: number;
  employeePreferredPaymentDay?: number | null;
  employeeDefaultPaymentDay?: number | null;
  employeeScheduleType?: PaymentScheduleType | null;
  schedules?: PaymentScheduleConfig[];
  /** One-off day for MANUAL_PER_PAYROLL or board exception. */
  manualPaymentDay?: number | null;
}): ResolvedPaymentSchedule {
  const schedules = (input.schedules ?? []).filter((s) =>
    scheduleCoversMonth(s, input.salaryMonth),
  );
  // Prefer the latest effective_from
  schedules.sort((a, b) =>
    b.paymentScheduleEffectiveFrom.localeCompare(a.paymentScheduleEffectiveFrom),
  );

  const active = schedules[0];
  const succMonth = succeedingMonthKey(input.salaryMonth);

  if (active) {
    const day =
      input.manualPaymentDay ??
      active.preferredPaymentDay ??
      active.defaultPaymentDay ??
      input.employeePreferredPaymentDay ??
      input.employeeDefaultPaymentDay ??
      input.companyDefaultPaymentDay;
    const paymentDayUsed = clampDay(day);
    const due = format(dateInMonth(succMonth, paymentDayUsed), 'yyyy-MM-dd');
    return {
      originalDueDate: due,
      scheduledPaymentDate: due,
      paymentScheduleType: active.paymentScheduleType,
      paymentDayUsed,
      source: 'employee_schedule',
      notes: active.paymentScheduleNotes ?? null,
    };
  }

  const type: PaymentScheduleType =
    input.employeeScheduleType ?? 'FIXED_DAY_OF_SUCCEEDING_MONTH';

  if (type === 'MANUAL_PER_PAYROLL' && input.manualPaymentDay == null) {
    // Fall back to company default until a manual day is supplied for the payroll.
    const paymentDayUsed = clampDay(input.companyDefaultPaymentDay);
    const due = format(dateInMonth(succMonth, paymentDayUsed), 'yyyy-MM-dd');
    return {
      originalDueDate: due,
      scheduledPaymentDate: due,
      paymentScheduleType: type,
      paymentDayUsed,
      source: 'company_default',
      notes: 'Manual schedule pending per-payroll payment day.',
    };
  }

  const day =
    input.manualPaymentDay ??
    input.employeePreferredPaymentDay ??
    input.employeeDefaultPaymentDay ??
    input.companyDefaultPaymentDay;
  const paymentDayUsed = clampDay(day);
  const due = format(dateInMonth(succMonth, paymentDayUsed), 'yyyy-MM-dd');

  const source =
    input.manualPaymentDay != null
      ? 'manual_override'
      : input.employeePreferredPaymentDay != null ||
          input.employeeDefaultPaymentDay != null
        ? 'employee_defaults'
        : 'company_default';

  return {
    originalDueDate: due,
    scheduledPaymentDate: due,
    paymentScheduleType: type,
    paymentDayUsed,
    source,
    notes: null,
  };
}

/**
 * When expected payment date is revised, preserve original due date.
 */
export function reviseExpectedPaymentDate(input: {
  originalDueDate: string;
  revisedExpectedPaymentDate: string;
}): { originalDueDate: string; revisedExpectedPaymentDate: string } {
  return {
    originalDueDate: input.originalDueDate,
    revisedExpectedPaymentDate: input.revisedExpectedPaymentDate,
  };
}
