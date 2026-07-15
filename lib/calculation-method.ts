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
  | 'FIXED_30'
  | 'FIXED_26'
  | 'FIXED_25'
  | 'EMPLOYEE_CONTRACTUAL';

export interface CalculationMethod {
  code: CalculationMethodCode;
  label: string;
  /** Null when divisor is derived from calendar / working days. */
  fixedDivisor: number | null;
  requiresWorkingDaysInput: boolean;
}

function method(
  code: CalculationMethodCode,
  label: string,
  fixedDivisor: number | null,
  requiresWorkingDaysInput: boolean,
): CalculationMethod {
  return { code, label, fixedDivisor, requiresWorkingDaysInput };
}

export const CALCULATION_METHODS: Record<CalculationMethodCode, CalculationMethod> = {
  FIXED_25_DAY_DIVISOR: method(
    'FIXED_25_DAY_DIVISOR',
    'LOP Calculation Basis: Fixed 25-day divisor',
    25,
    false,
  ),
  FIXED_26_DAY_DIVISOR: method(
    'FIXED_26_DAY_DIVISOR',
    'LOP Calculation Basis: Fixed 26-day divisor',
    26,
    false,
  ),
  FIXED_30_DAY_DIVISOR: method(
    'FIXED_30_DAY_DIVISOR',
    'LOP Calculation Basis: Fixed 30-day divisor',
    30,
    false,
  ),
  CALENDAR_DAY_DIVISOR: method(
    'CALENDAR_DAY_DIVISOR',
    'LOP Calculation Basis: Calendar-day divisor',
    null,
    false,
  ),
  ACTUAL_WORKING_DAYS: method(
    'ACTUAL_WORKING_DAYS',
    'LOP Calculation Basis: Actual working days',
    null,
    true,
  ),
  EMPLOYEE_CONTRACTUAL_DIVISOR: method(
    'EMPLOYEE_CONTRACTUAL_DIVISOR',
    'LOP Calculation Basis: Employee contractual divisor',
    null,
    true,
  ),
  FIXED_25: method('FIXED_25', 'LOP Calculation Basis: Fixed 25-day divisor', 25, false),
  FIXED_26: method('FIXED_26', 'LOP Calculation Basis: Fixed 26-day divisor', 26, false),
  FIXED_30: method('FIXED_30', 'LOP Calculation Basis: Fixed 30-day divisor', 30, false),
  CALENDAR_DAYS: method(
    'CALENDAR_DAYS',
    'LOP Calculation Basis: Calendar-day divisor',
    null,
    false,
  ),
  EMPLOYEE_CONTRACTUAL: method(
    'EMPLOYEE_CONTRACTUAL',
    'LOP Calculation Basis: Employee contractual divisor',
    null,
    true,
  ),
};

/** Back-compat default matching historical Portfolix policy. */
export const DEFAULT_CALCULATION_METHOD_CODE: CalculationMethodCode = 'FIXED_25_DAY_DIVISOR';

/** Map legacy stored codes → canonical requirement codes. */
const ALIASES: Record<string, CalculationMethodCode> = {
  FIXED_25: 'FIXED_25_DAY_DIVISOR',
  FIXED_26: 'FIXED_26_DAY_DIVISOR',
  FIXED_30: 'FIXED_30_DAY_DIVISOR',
  CALENDAR_DAYS: 'CALENDAR_DAY_DIVISOR',
  EMPLOYEE_CONTRACTUAL: 'EMPLOYEE_CONTRACTUAL_DIVISOR',
  FIXED_25_DAY_DIVISOR: 'FIXED_25_DAY_DIVISOR',
  FIXED_26_DAY_DIVISOR: 'FIXED_26_DAY_DIVISOR',
  FIXED_30_DAY_DIVISOR: 'FIXED_30_DAY_DIVISOR',
  CALENDAR_DAY_DIVISOR: 'CALENDAR_DAY_DIVISOR',
  ACTUAL_WORKING_DAYS: 'ACTUAL_WORKING_DAYS',
  EMPLOYEE_CONTRACTUAL_DIVISOR: 'EMPLOYEE_CONTRACTUAL_DIVISOR',
};

export function normalizeCalculationMethodCode(
  code: string | null | undefined,
): CalculationMethodCode {
  if (!code) return DEFAULT_CALCULATION_METHOD_CODE;
  const canonical = ALIASES[code];
  if (!canonical) {
    throw new Error(`Unknown calculation method: ${code}`);
  }
  return canonical;
}

export function resolvePayrollDivisor(input: {
  methodCode: CalculationMethodCode | string;
  /** Days in the calendar month (1–31) — used only for calendar-day divisor. */
  calendarDaysInMonth: number;
  /** Working days when method requires them. */
  workingDays?: number | null;
  /** Contractual divisor override when method is employee contractual. */
  contractualDivisor?: number | null;
}): { divisor: number; source: string; methodCode: CalculationMethodCode } {
  const methodCode = normalizeCalculationMethodCode(input.methodCode);
  const meta = CALCULATION_METHODS[methodCode];

  if (meta.fixedDivisor != null) {
    return { divisor: meta.fixedDivisor, source: meta.label, methodCode };
  }

  if (methodCode === 'CALENDAR_DAY_DIVISOR' || methodCode === 'CALENDAR_DAYS') {
    if (input.calendarDaysInMonth < 28 || input.calendarDaysInMonth > 31) {
      throw new Error(`Invalid calendar days: ${input.calendarDaysInMonth}`);
    }
    return {
      divisor: input.calendarDaysInMonth,
      source: meta.label,
      methodCode,
    };
  }

  if (methodCode === 'ACTUAL_WORKING_DAYS') {
    const days = input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Working days are required for actual working-day basis.');
    }
    return { divisor: days, source: meta.label, methodCode };
  }

  if (
    methodCode === 'EMPLOYEE_CONTRACTUAL_DIVISOR' ||
    methodCode === 'EMPLOYEE_CONTRACTUAL'
  ) {
    const days = input.contractualDivisor ?? input.workingDays;
    if (days == null || !(days > 0)) {
      throw new Error('Contractual divisor is required for employee-specific basis.');
    }
    return { divisor: days, source: meta.label, methodCode };
  }

  throw new Error(`Unhandled calculation method: ${methodCode}`);
}

/** Calendar days in YYYY-MM. */
export function calendarDaysInMonthYear(monthYear: string): number {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Invalid monthYear: ${monthYear}`);
  return new Date(y, m, 0).getDate();
}

/** Short UI label — never call this the “pay period”. */
export function lopCalculationBasisLabel(methodCode: CalculationMethodCode | string): string {
  const code = normalizeCalculationMethodCode(methodCode);
  return CALCULATION_METHODS[code].label;
}
