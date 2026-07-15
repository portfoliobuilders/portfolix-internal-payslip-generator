/**
 * Portfolix payroll calculation engine.
 *
 * SAFETY-CRITICAL, DEPENDENCY-FREE PURE MODULE.
 * No React, no zustand, no I/O — designed to be lifted into the
 * Portfolix EMS unchanged. The UI must render this module's output
 * and never re-derive a number on its own.
 *
 * All intermediate math runs at full float precision; rounding to
 * 2 decimal places happens exactly once, at the display boundary
 * (see roundMoney / the computed snapshot fields).
 */

import { amountInWords } from './amount-in-words';
import type { SlipComputed } from './types';

/**
 * The 25-Day Constant. Per-day rate is ALWAYS baseSalary / 25.
 * This is company policy, hardcoded on purpose, and must never be
 * editable from the UI.
 */
export const FIXED_DIVISOR = 25 as const;

/** A full working day, in minutes (8h × 60). */
export const MINUTES_PER_DAY = 480 as const;

/** Round to 2 decimal places — applied exactly once per displayed amount. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface PayrollInput {
  baseSalary: number;
  /** Persistent flex-bank balance carried into this month (minutes). */
  flexBankBalance: number;
  /** Flex minutes earned this month (extra time worked). */
  flexMinutesEarned: number;
  /** Total late minutes accrued this month. */
  totalLateMinutes: number;
  absentDays: number;
  halfDays: number;
  fixedAllowance: number;
  otherDeductions: number;
  /** Monthly TDS — additive deduction line. Default 0 for back-compat. */
  tdsMonthly?: number;
  /**
   * Professional Tax for this slip month only. Server derives this as
   * pt_half_yearly when the slip month ∈ pt_deduction_months, else 0.
   */
  ptThisMonth?: number;
  variableEarned: number;
  variablePaid: number;
  deferredOpening: number;
  committedPayoutDate: string | null;
}

export interface PayrollResult extends SlipComputed {
  /** Flex-bank balance to commit back to the employee on finalize. */
  newFlexBalance: number;
}

/**
 * Floor a day count to the nearest 0.5 — rounding always favors the
 * employee (e.g. 0.9 days of unpaid lateness charges only 0.5 LOP).
 */
export function floorToHalfDay(days: number): number {
  return Math.floor(days * 2) / 2;
}

/**
 * Flex-bank order of operations (rule 3):
 *   flexAvailable = flexBankBalance + flexMinutesEarnedThisMonth
 *   unpaidLate    = max(totalLateMinutes − flexAvailable, 0)
 *   lopFromLateness = floorToHalfDay(unpaidLate / 480)
 *   newFlexBalance  = max(flexAvailable − totalLateMinutes, 0)
 */
export function computeFlexBank(input: {
  flexBankBalance: number;
  flexMinutesEarned: number;
  totalLateMinutes: number;
}): {
  flexAvailable: number;
  unpaidLateMinutes: number;
  flexOffsetMinutes: number;
  lopFromLateness: number;
  newFlexBalance: number;
} {
  const flexAvailable = input.flexBankBalance + input.flexMinutesEarned;
  const unpaidLateMinutes = Math.max(input.totalLateMinutes - flexAvailable, 0);
  const flexOffsetMinutes = input.totalLateMinutes - unpaidLateMinutes;
  const lopFromLateness = floorToHalfDay(unpaidLateMinutes / MINUTES_PER_DAY);
  const newFlexBalance = Math.max(flexAvailable - input.totalLateMinutes, 0);
  return { flexAvailable, unpaidLateMinutes, flexOffsetMinutes, lopFromLateness, newFlexBalance };
}

/**
 * Deferral is variable-only (rule 6): fixed wages are never deferred.
 *   deferredClosing = max(deferredOpening + variableEarned − variablePaid, 0)
 */
export function computeDeferral(input: {
  deferredOpening: number;
  variableEarned: number;
  variablePaid: number;
}): { deferredClosing: number } {
  return {
    deferredClosing: Math.max(
      input.deferredOpening + input.variableEarned - input.variablePaid,
      0,
    ),
  };
}

/**
 * Validates the variable-pay invariant: variablePaid ≤ variableEarned + deferredOpening.
 * Returns null when valid, or a human-readable violation message.
 */
export function validateVariablePaid(input: {
  deferredOpening: number;
  variableEarned: number;
  variablePaid: number;
}): string | null {
  const cap = input.variableEarned + input.deferredOpening;
  if (input.variablePaid > cap + 1e-9) {
    return `Variable paid cannot exceed earned + deferred opening (max ₹${roundMoney(cap).toFixed(2)}).`;
  }
  return null;
}

/**
 * Derives this month's PT deduction from the employee's half-yearly PT
 * and the configured deduction months (1–12).
 */
export function derivePtThisMonth(
  ptHalfYearly: number,
  monthYear: string,
  ptDeductionMonths: number[],
): number {
  const month = Number(monthYear.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return 0;
  if (!ptDeductionMonths.includes(month)) return 0;
  return Math.max(0, ptHalfYearly);
}

/**
 * The single computation entry point. Produces every derived number
 * shown on a slip, rounded exactly once for display.
 *
 * net = (base + fixedAllowance) − (lopDeduction + tds + pt + otherDeductions) + variablePaid
 */
export function computePayroll(input: PayrollInput): PayrollResult {
  const tdsMonthly = input.tdsMonthly ?? 0;
  const ptThisMonth = input.ptThisMonth ?? 0;

  const perDayRateExact = input.baseSalary / FIXED_DIVISOR;

  const flex = computeFlexBank({
    flexBankBalance: input.flexBankBalance,
    flexMinutesEarned: input.flexMinutesEarned,
    totalLateMinutes: input.totalLateMinutes,
  });

  // Rule 4: LOP is not only lateness.
  const lopDays = input.absentDays + 0.5 * input.halfDays + flex.lopFromLateness;

  // Full precision throughout; round once per displayed figure below.
  const lopDeductionExact = lopDays * perDayRateExact;
  const grossFixedExact = input.baseSalary + input.fixedAllowance;
  const totalDeductionsExact =
    lopDeductionExact + input.otherDeductions + tdsMonthly + ptThisMonth;

  const { deferredClosing } = computeDeferral({
    deferredOpening: input.deferredOpening,
    variableEarned: input.variableEarned,
    variablePaid: input.variablePaid,
  });

  // Rule 5: net = (base + fixedAllowance) − (lop + tds + pt + other) + variablePaid, rounded once.
  const netExact = grossFixedExact - totalDeductionsExact + input.variablePaid;
  const netPay = roundMoney(netExact);

  const variableDeferredExact = Math.max(input.variableEarned - input.variablePaid, 0);

  return {
    perDayRate: roundMoney(perDayRateExact),
    flexAvailable: flex.flexAvailable,
    unpaidLateMinutes: flex.unpaidLateMinutes,
    flexOffsetMinutes: flex.flexOffsetMinutes,
    lopFromLateness: flex.lopFromLateness,
    lopDays,
    lopDeduction: roundMoney(lopDeductionExact),
    otherDeductions: roundMoney(input.otherDeductions),
    tdsMonthly: roundMoney(tdsMonthly),
    ptThisMonth: roundMoney(ptThisMonth),
    totalDeductions: roundMoney(totalDeductionsExact),
    grossFixed: roundMoney(grossFixedExact),
    variableEarned: roundMoney(input.variableEarned),
    variablePaid: roundMoney(input.variablePaid),
    variableDeferred: roundMoney(variableDeferredExact),
    deferredOpening: roundMoney(input.deferredOpening),
    deferredClosing: roundMoney(deferredClosing),
    committedPayoutDate: input.committedPayoutDate,
    netPay,
    netPayWords: amountInWords(netPay),
    newFlexBalance: flex.newFlexBalance,
  };
}
