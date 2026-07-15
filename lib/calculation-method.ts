/**
 * Configurable payroll day-count / per-day rate basis.
 * Replaces hardcoded UI trust of a fixed 25-day divisor for new structures,
 * while DEFAULT_CALCULATION_METHOD_CODE remains 'FIXED_25' for back-compat.
 */

export type CalculationMethodCode =
  | 'CALENDAR_DAYS'
  | 'FIXED_30'
  | 'FIXED_26'
  | 'FIXED_25'
  | 'ACTUAL_WORKING_DAYS'
  | 'EMPLOYEE_CONTRACTUAL';

export interface CalculationMethod {
  code: CalculationMethodCode;
  label: string;
  /** Null when divisor is derived from the pay period (calendar / working days). */
  fixedDivisor: number | null;
  requiresWorkingDaysInput: boolean;
}

export const CALCULATION_METHODS: Record<CalculationMethodCode, CalculationMethod> = {
  CALENDAR_DAYS: {
    code: 'CALENDAR_DAYS',
    label: 'Calendar-day basis',
    fixedDivisor: null,
    requiresWorkingDaysInput: false,
  },
  FIXED_30: {
    code: 'FIXED_30',
    label: 'Fixed 30-day basis',
    fixedDivisor: 30,
    requiresWorkingDaysInput: false,
  },
  FIXED_26: {
    code: 'FIXED_26',
    label: 'Fixed 26-day basis',
    fixedDivisor: 26,
    requiresWorkingDaysInput: false,
  },
  FIXED_25: {
    code: 'FIXED_25',
    label: 'Fixed 25-day basis',
    fixedDivisor: 25,
    requiresWorkingDaysInput: false,
  },
  ACTUAL_WORKING_DAYS: {
    code: 'ACTUAL_WORKING_DAYS',
    label: 'Actual working-day basis',
    fixedDivisor: null,
    requiresWorkingDaysInput: true,
  },
  EMPLOYEE_CONTRACTUAL: {
    code: 'EMPLOYEE_CONTRACTUAL',
    label: 'Employee-specific contractual basis',
    fixedDivisor: null,
    requiresWorkingDaysInput: true,
  },
};

/** Back-compat default matching historical Portfolix policy. */
export const DEFAULT_CALCULATION_METHOD_CODE: CalculationMethodCode = 'FIXED_25';

export function resolvePayrollDivisor(input: {
  methodCode: CalculationMethodCode;
  /** Days in the calendar month (1–31). */
  calendarDaysInMonth: number;
  /** Working days when method requires them. */
  workingDays?: number | null;
  /** Contractual divisor override when method is EMPLOYEE_CONTRACTUAL. */
  contractualDivisor?: number | null;
}): { divisor: number; source: string } {
  const method = CALCULATION_METHODS[input.methodCode];

  if (method.fixedDivisor != null) {
    return { divisor: method.fixedDivisor, source: method.label };
  }

  if (input.methodCode === 'CALENDAR_DAYS') {
    if (input.calendarDaysInMonth < 28 || input.calendarDaysInMonth > 31) {
      throw new Error(`Invalid calendar days: ${input.calendarDaysInMonth}`);
    }
    return { divisor: input.calendarDaysInMonth, source: method.label };
  }

  if (input.methodCode === 'ACTUAL_WORKING_DAYS') {
    const days = input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Working days are required for actual working-day basis.');
    }
    return { divisor: days, source: method.label };
  }

  if (input.methodCode === 'EMPLOYEE_CONTRACTUAL') {
    const days = input.contractualDivisor ?? input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Contractual divisor is required for employee-specific basis.');
    }
    return { divisor: days, source: method.label };
  }

  throw new Error(`Unhandled calculation method: ${input.methodCode}`);
}

/** Calendar days in YYYY-MM. */
export function calendarDaysInMonthYear(monthYear: string): number {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid monthYear: ${monthYear}`);
  return new Date(y, m, 0).getDate();
}
