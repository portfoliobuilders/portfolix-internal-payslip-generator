/**
 * Configurable LOP / salary-calculation day-count divisor.
 *
 * This is NOT the attendance-cycle length.
 * Attendance windows live in lib/payroll-cycle.ts.
 *
 * Display label for the historical default:
 *   LOP Calculation Basis: Fixed 25-day divisor
 */

export type CalculationMethodCode =
  | 'FIXED_25_DAY_DIVISOR'
  | 'FIXED_26_DAY_DIVISOR'
  | 'FIXED_30_DAY_DIVISOR'
  | 'CALENDAR_DAY_DIVISOR'
  | 'ACTUAL_WORKING_DAYS'
  | 'EMPLOYEE_CONTRACTUAL_DIVISOR'
  /** @deprecated legacy aliases retained for stored rows */
  | 'CALENDAR_DAYS'
  | 'CALENDAR_DAY_DIVISOR'
  | 'FIXED_30'
  | 'FIXED_30_DAY_DIVISOR'
  | 'FIXED_26'
  | 'FIXED_26_DAY_DIVISOR'
  | 'FIXED_25'
  | 'FIXED_25_DAY_DIVISOR'
  | 'ACTUAL_WORKING_DAYS'
  | 'EMPLOYEE_CONTRACTUAL'
  | 'EMPLOYEE_CONTRACTUAL_DIVISOR';

export interface CalculationMethod {
  code: CalculationMethodCode;
  label: string;
  /** Null when divisor is derived from calendar / working days. */
  fixedDivisor: number | null;
  requiresWorkingDaysInput: boolean;
}

/** Back-compat default matching historical Portfolix policy. */
export const DEFAULT_CALCULATION_METHOD_CODE: CalculationMethodCode = 'FIXED_25';

/** Map legacy short codes ↔ required long names. */
export function normalizeCalculationMethodCode(
  code: string | null | undefined,
): CalculationMethodCode {
  switch (code) {
    case 'CALENDAR_DAY_DIVISOR':
    case 'CALENDAR_DAYS':
      return 'CALENDAR_DAYS';
    case 'FIXED_30_DAY_DIVISOR':
    case 'FIXED_30':
      return 'FIXED_30';
    case 'FIXED_26_DAY_DIVISOR':
    case 'FIXED_26':
      return 'FIXED_26';
    case 'FIXED_25_DAY_DIVISOR':
    case 'FIXED_25':
      return 'FIXED_25';
    case 'ACTUAL_WORKING_DAYS':
      return 'ACTUAL_WORKING_DAYS';
    case 'EMPLOYEE_CONTRACTUAL_DIVISOR':
    case 'EMPLOYEE_CONTRACTUAL':
      return 'EMPLOYEE_CONTRACTUAL';
    default:
      return DEFAULT_CALCULATION_METHOD_CODE;
  }
}

export const CALCULATION_METHODS: Record<CalculationMethodCode, CalculationMethod> = {
  CALENDAR_DAYS: {
    code: 'CALENDAR_DAYS',
    label: 'Calendar-day divisor',
    fixedDivisor: null,
    requiresWorkingDaysInput: false,
  },
  CALENDAR_DAY_DIVISOR: {
    code: 'CALENDAR_DAY_DIVISOR',
    label: 'Calendar-day divisor',
    fixedDivisor: null,
    requiresWorkingDaysInput: false,
  },
  FIXED_30: {
    code: 'FIXED_30',
    label: 'Fixed 30-day divisor',
    fixedDivisor: 30,
    requiresWorkingDaysInput: false,
  },
  FIXED_30_DAY_DIVISOR: {
    code: 'FIXED_30_DAY_DIVISOR',
    label: 'Fixed 30-day divisor',
    fixedDivisor: 30,
    requiresWorkingDaysInput: false,
  },
  FIXED_26: {
    code: 'FIXED_26',
    label: 'Fixed 26-day divisor',
    fixedDivisor: 26,
    requiresWorkingDaysInput: false,
  },
  FIXED_26_DAY_DIVISOR: {
    code: 'FIXED_26_DAY_DIVISOR',
    label: 'Fixed 26-day divisor',
    fixedDivisor: 26,
    requiresWorkingDaysInput: false,
  },
  FIXED_25: {
    code: 'FIXED_25',
    label: 'Fixed 25-day divisor',
    fixedDivisor: 25,
    requiresWorkingDaysInput: false,
  },
  FIXED_25_DAY_DIVISOR: {
    code: 'FIXED_25_DAY_DIVISOR',
    label: 'Fixed 25-day divisor',
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
    label: 'Employee-specific contractual divisor',
    fixedDivisor: null,
    requiresWorkingDaysInput: true,
  },
  EMPLOYEE_CONTRACTUAL_DIVISOR: {
    code: 'EMPLOYEE_CONTRACTUAL_DIVISOR',
    label: 'Employee-specific contractual divisor',
    fixedDivisor: null,
    requiresWorkingDaysInput: true,
  },
};

/** Short UI label — never call this the “pay period”. */
export function lopCalculationBasisLabel(methodCode: CalculationMethodCode | string): string {
  const code = normalizeCalculationMethodCode(methodCode);
  return CALCULATION_METHODS[code].label;
}

/** Full display sentence including the “LOP Calculation Basis:” prefix. */
export function lopCalculationBasisDisplayText(
  methodCode: CalculationMethodCode | string,
): string {
  return `LOP Calculation Basis: ${lopCalculationBasisLabel(methodCode)}`;
}

export interface ResolvedPayrollDivisor {
  divisor: number;
  source: string;
  methodCode: CalculationMethodCode;
}

export function resolvePayrollDivisor(input: {
  methodCode: CalculationMethodCode | string;
  /** Days in the calendar month (1–31). */
  calendarDaysInMonth: number;
  /** Working days when method requires them. */
  workingDays?: number | null;
  /** Contractual divisor override when method is employee contractual. */
  contractualDivisor?: number | null;
}): ResolvedPayrollDivisor {
  const methodCode = normalizeCalculationMethodCode(input.methodCode);
  const method = CALCULATION_METHODS[methodCode];

  if (method.fixedDivisor != null) {
    return { divisor: method.fixedDivisor, source: method.label, methodCode };
  }

  if (methodCode === 'CALENDAR_DAYS') {
    if (input.calendarDaysInMonth < 28 || input.calendarDaysInMonth > 31) {
      throw new Error(`Invalid calendar days: ${input.calendarDaysInMonth}`);
    }
    return {
      divisor: input.calendarDaysInMonth,
      source: method.label,
      methodCode,
    };
  }

  if (methodCode === 'ACTUAL_WORKING_DAYS') {
    const days = input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Working days are required for actual working-day basis.');
    }
    return { divisor: days, source: method.label, methodCode };
  }

  if (methodCode === 'EMPLOYEE_CONTRACTUAL') {
    const days = input.contractualDivisor ?? input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Contractual divisor is required for employee-specific basis.');
    }
    return { divisor: days, source: method.label, methodCode };
  }

  throw new Error(`Unhandled calculation method: ${methodCode}`);
}

/** Calendar days in YYYY-MM. */
export function calendarDaysInMonthYear(monthYear: string): number {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid monthYear: ${monthYear}`);
  return new Date(y, m, 0).getDate();
}
