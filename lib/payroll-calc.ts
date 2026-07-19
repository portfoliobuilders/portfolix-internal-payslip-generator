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
   * Professional Tax for this slip month only.
   * Derived by derivePtThisMonth (lump in ptDeductionMonths, or monthly accrual).
   */
  ptThisMonth?: number;
  variableEarned: number;
  variablePaid: number;
  deferredOpening: number;
  committedPayoutDate: string | null;
  /**
   * Payroll day-count divisor used for per-day rate.
   * Defaults to FIXED_DIVISOR (25) for back-compat. Must be provided by the
   * server integrity layer from the approved calculation method — never trust
   * a client-submitted final daily rate.
   */
  payrollDivisor?: number;
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

// ---------------------------------------------------------------------------
// Kerala Professional Tax — slabs, caps, monthly accrual
// ---------------------------------------------------------------------------

/** Article 276 hard cap: ₹1,250 per half-year (non-configurable). */
export const PT_HALF_YEARLY_CAP = 1250 as const;
/** Article 276 hard cap: ₹2,500 per annum (non-configurable). */
export const PT_ANNUAL_CAP = 2500 as const;

export type PtCollectionMode = 'half_yearly_lump' | 'monthly_accrual';

export interface PtSlab {
  minGross: number;
  maxGross: number | null;
  tax: number;
}

/** Seeded Kerala half-yearly PT schedule (basis = half-yearly gross). */
export const KERALA_PT_SLABS_SEED: readonly PtSlab[] = [
  { minGross: 0, maxGross: 11_999, tax: 0 },
  { minGross: 12_000, maxGross: 17_999, tax: 120 },
  { minGross: 18_000, maxGross: 29_999, tax: 180 },
  { minGross: 30_000, maxGross: 44_999, tax: 300 },
  { minGross: 45_000, maxGross: 59_999, tax: 450 },
  { minGross: 60_000, maxGross: 74_999, tax: 600 },
  { minGross: 75_000, maxGross: 99_999, tax: 750 },
  { minGross: 100_000, maxGross: 124_999, tax: 1_000 },
  { minGross: 125_000, maxGross: null, tax: 1_250 },
] as const;

export interface DerivePtOptions {
  /**
   * Collection mode. Omitted → `half_yearly_lump` so existing 3-arg callers
   * keep legacy Aug/Feb behaviour. Settings default is `monthly_accrual`.
   */
  mode?: PtCollectionMode;
  /** ISO date — used for mid-half joiner accrual start. */
  joiningDate?: string | null;
}

/** Half-yearly gross for slab lookup: (base + fixed allowance) × 6. */
export function halfYearlyGrossForPt(baseSalary: number, fixedAllowance = 0): number {
  const base = Number.isFinite(baseSalary) ? Math.max(0, baseSalary) : 0;
  const allowance = Number.isFinite(fixedAllowance) ? Math.max(0, fixedAllowance) : 0;
  return (base + allowance) * 6;
}

/** Look up half-yearly PT from slabs for a given half-yearly gross. */
export function lookupPtHalfYearly(halfYearlyGross: number, slabs: readonly PtSlab[]): number {
  const gross = Number.isFinite(halfYearlyGross) ? Math.max(0, halfYearlyGross) : 0;
  for (const slab of slabs) {
    const lo = slab.minGross;
    const hi = slab.maxGross;
    if (gross < lo) continue;
    if (hi == null || gross <= hi) return Math.max(0, slab.tax);
  }
  return 0;
}

/**
 * Suggested ptHalfYearly from roster compensation (fixedAllowance defaults to 0
 * on the employee form — slip-level allowance does not rewrite the roster PT).
 */
export function suggestPtHalfYearly(
  baseSalary: number,
  slabs: readonly PtSlab[],
  fixedAllowance = 0,
): number {
  return lookupPtHalfYearly(halfYearlyGrossForPt(baseSalary, fixedAllowance), slabs);
}

/**
 * HARD CAP validation (non-configurable).
 * Rejects any slab whose half-yearly tax exceeds ₹1,250 or whose annual
 * total (2 × half-yearly) would exceed ₹2,500 under Article 276.
 *
 * the circulating ₹1,500 top-slab figure breaches the constitutional annual
 * cap and must not be entered.
 */
export function validatePtSlabs(slabs: readonly PtSlab[]): string | null {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return 'PT slab table cannot be empty.';
  }
  for (const slab of slabs) {
    const tax = Number(slab.tax);
    if (!Number.isFinite(tax) || tax < 0) {
      return 'Each PT slab tax must be a non-negative number.';
    }
    // the circulating ₹1,500 top-slab figure breaches the constitutional annual
    // cap and must not be entered.
    if (tax > PT_HALF_YEARLY_CAP) {
      return `PT slab tax ₹${tax} exceeds the Article 276 half-yearly cap of ₹${PT_HALF_YEARLY_CAP}.`;
    }
    if (tax * 2 > PT_ANNUAL_CAP) {
      return `PT slab tax ₹${tax} implies annual ₹${tax * 2}, exceeding the Article 276 annual cap of ₹${PT_ANNUAL_CAP}.`;
    }
    if (!Number.isFinite(slab.minGross) || slab.minGross < 0) {
      return 'Each PT slab minGross must be a non-negative number.';
    }
    if (slab.maxGross != null && (!Number.isFinite(slab.maxGross) || slab.maxGross < slab.minGross)) {
      return 'Each PT slab maxGross must be ≥ minGross (or null for open-ended).';
    }
  }
  return null;
}

/**
 * Position within the Apr–Sep (H1) or Oct–Mar (H2) half.
 * Returns index 0–5, or null if month is invalid.
 */
export function ptHalfYearMonthIndex(calendarMonth: number): number | null {
  if (!Number.isInteger(calendarMonth) || calendarMonth < 1 || calendarMonth > 12) return null;
  if (calendarMonth >= 4 && calendarMonth <= 9) return calendarMonth - 4; // Apr=0 … Sep=5
  if (calendarMonth >= 10) return calendarMonth - 10; // Oct=0 … Dec=2
  return calendarMonth + 2; // Jan=3, Feb=4, Mar=5
}

/**
 * First full salary month (YYYY-MM): joining month if day === 1, else next month.
 * Mid-month joiners start PT accrual from the following calendar month.
 */
export function firstFullSalaryMonthYear(joiningDate: string | null | undefined): string | null {
  if (!joiningDate || !/^\d{4}-\d{2}-\d{2}/.test(joiningDate)) return null;
  const y = Number(joiningDate.slice(0, 4));
  const m = Number(joiningDate.slice(5, 7));
  const d = Number(joiningDate.slice(8, 10));
  if (![y, m, d].every((n) => Number.isFinite(n)) || m < 1 || m > 12) return null;
  if (d <= 1) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
  }
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}`;
}

/** Compare YYYY-MM keys. */
function monthYearCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Monthly accrual installment for one slot in a half-year.
 * Months 1–5 (index 0–4): round(ptHalfYearly / 6).
 * Month 6 (index 5): remainder so the half totals exactly ptHalfYearly.
 */
export function monthlyPtInstallment(ptHalfYearly: number, monthIndexInHalf: number): number {
  const pt = Math.max(0, Number.isFinite(ptHalfYearly) ? ptHalfYearly : 0);
  if (pt === 0) return 0;
  if (monthIndexInHalf < 0 || monthIndexInHalf > 5) return 0;
  const monthly = Math.round(pt / 6);
  if (monthIndexInHalf < 5) return monthly;
  return roundMoney(pt - 5 * monthly);
}

/**
 * True when the employee’s first full salary month falls mid-way through
 * THIS slip’s half-year (Apr–Sep or Oct–Mar). Prior-half joiners are full
 * liability for later halves — do not keep the CA flag forever.
 * Partial-half PT liability should get one CA confirmation.
 */
export function isPartialHalfPtLiability(
  joiningDate: string | null | undefined,
  monthYear: string,
): boolean {
  const firstFull = firstFullSalaryMonthYear(joiningDate);
  if (!firstFull || !/^\d{4}-\d{2}$/.test(monthYear)) return false;
  if (monthYearCmp(monthYear, firstFull) < 0) return false;

  const halfStart = monthYearAtHalfIndex(monthYear, 0);
  if (!halfStart) return false;
  // Joined before this half began → full half liability, no CA flag.
  if (monthYearCmp(firstFull, halfStart) < 0) return false;

  const joinMonth = Number(firstFull.slice(5, 7));
  const joinIdx = ptHalfYearMonthIndex(joinMonth);
  return joinIdx != null && joinIdx > 0;
}

/** Footnote printed on Final + Authorised slips in monthly accrual mode. */
export function ptMonthlyAccrualFootnote(ptHalfYearly: number): string {
  const amt = roundMoney(Math.max(0, ptHalfYearly));
  return `Monthly accrual of half-yearly Kerala Professional Tax (₹${amt.toFixed(2)}/half-year); remitted half-yearly by employer.`;
}

/**
 * Derives this month's PT deduction.
 *
 * - `half_yearly_lump` (legacy / 3-arg default): full ptHalfYearly in
 *   ptDeductionMonths, else 0.
 * - `monthly_accrual`: exact half-year total via 5×round(pt/6) + remainder;
 *   mid-half joiners start at first full salary month; final month of the
 *   half collects the unpaid balance for that half.
 */
export function derivePtThisMonth(
  ptHalfYearly: number,
  monthYear: string,
  ptDeductionMonths: number[],
  options?: DerivePtOptions,
): number {
  const pt = Math.max(0, Number.isFinite(ptHalfYearly) ? ptHalfYearly : 0);
  const month = Number(monthYear.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return 0;

  const mode: PtCollectionMode = options?.mode ?? 'half_yearly_lump';

  if (mode === 'half_yearly_lump') {
    if (!ptDeductionMonths.includes(month)) return 0;
    return pt;
  }

  // --- monthly_accrual ---
  if (pt === 0) return 0;

  const firstFull = firstFullSalaryMonthYear(options?.joiningDate);
  if (firstFull && monthYearCmp(monthYear, firstFull) < 0) return 0;

  const idx = ptHalfYearMonthIndex(month);
  if (idx == null) return 0;

  const monthly = Math.round(pt / 6);

  // Count how many prior months in this half already accrued (from first full month).
  let priorMonths = 0;
  for (let i = 0; i < idx; i++) {
    const priorMy = monthYearAtHalfIndex(monthYear, i);
    if (!priorMy) continue;
    if (firstFull && monthYearCmp(priorMy, firstFull) < 0) continue;
    priorMonths += 1;
  }

  if (idx < 5) {
    // Only deduct if this month is on/after first full salary month (already checked).
    return monthly;
  }

  // Final month of the half: remainder of (pt − amounts already collected this half).
  const alreadyCollected = priorMonths * monthly;
  return roundMoney(Math.max(0, pt - alreadyCollected));
}

/**
 * Given any monthYear in a half and an index 0–5 within that same half,
 * return the YYYY-MM for that slot.
 */
function monthYearAtHalfIndex(monthYear: string, indexInHalf: number): string | null {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const idx = ptHalfYearMonthIndex(m);
  if (idx == null || indexInHalf < 0 || indexInHalf > 5) return null;

  // H1 Apr–Sep stays in calendar year y when month is Apr–Sep.
  // H2 Oct–Mar: Oct–Dec in y, Jan–Mar in y+1 when monthYear is Jan–Mar (y is the later year).
  const inH1 = m >= 4 && m <= 9;
  if (inH1) {
    const calMonth = 4 + indexInHalf;
    return `${String(y).padStart(4, '0')}-${String(calMonth).padStart(2, '0')}`;
  }

  // H2
  if (m >= 10) {
    // monthYear is Oct–Dec of year y
    if (indexInHalf <= 2) {
      const calMonth = 10 + indexInHalf;
      return `${String(y).padStart(4, '0')}-${String(calMonth).padStart(2, '0')}`;
    }
    const calMonth = indexInHalf - 2; // 3→Jan, 4→Feb, 5→Mar
    return `${String(y + 1).padStart(4, '0')}-${String(calMonth).padStart(2, '0')}`;
  }
  // monthYear is Jan–Mar of year y → H2 started Oct of y-1
  if (indexInHalf <= 2) {
    const calMonth = 10 + indexInHalf;
    return `${String(y - 1).padStart(4, '0')}-${String(calMonth).padStart(2, '0')}`;
  }
  const calMonth = indexInHalf - 2;
  return `${String(y).padStart(4, '0')}-${String(calMonth).padStart(2, '0')}`;
}

/**
 * Snapshot statutory amounts with back-compat for pre-TDS/PT finals.
 * Missing fields → 0.00 (old slips are immutable and never regenerated).
 */
export function slipStatutoryDeductions(computed: {
  tds?: number;
  pt?: number;
  /** Legacy field name from the first Authorised Slip draft — still accepted. */
  tdsMonthly?: number;
  ptThisMonth?: number;
}, inputs?: {
  tdsMonthly?: number;
  ptThisMonth?: number;
}): { tds: number; pt: number } {
  return {
    tds: computed.tds ?? computed.tdsMonthly ?? inputs?.tdsMonthly ?? 0,
    pt: computed.pt ?? computed.ptThisMonth ?? inputs?.ptThisMonth ?? 0,
  };
}

/**
 * The single computation entry point. Produces every derived number
 * shown on a slip, rounded exactly once for display.
 *
 * net = (base + fixedAllowance) − (lopDeduction + tds + pt + otherDeductions) + variablePaid
 */
export function computePayroll(input: PayrollInput): PayrollResult {
  const tds = input.tdsMonthly ?? 0;
  const pt = input.ptThisMonth ?? 0;

  const divisor = input.payrollDivisor ?? FIXED_DIVISOR;
  if (!(divisor > 0) || !Number.isFinite(divisor)) {
    throw new Error(`Invalid payroll divisor: ${divisor}`);
  }
  const perDayRateExact = input.baseSalary / divisor;

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
  const totalDeductionsExact = lopDeductionExact + input.otherDeductions + tds + pt;

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
    tds: roundMoney(tds),
    pt: roundMoney(pt),
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
