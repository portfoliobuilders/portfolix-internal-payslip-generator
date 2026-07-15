/**
 * Decimal-safe money helpers.
 *
 * All payroll money maths should operate on integer paise (1 ₹ = 100 paise)
 * and convert to display rupees only at boundaries. Avoids IEEE-754 drift.
 */

/** Integer paise (₹0.01). Never use float for storage of monetary state. */
export type Paise = number & { readonly __brand: 'Paise' };

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new Error(`Invalid rupee amount: ${rupees}`);
  }
  // Round half-away-from-zero to nearest paise.
  const scaled = rupees * 100;
  const rounded = scaled >= 0 ? Math.floor(scaled + 0.5) : Math.ceil(scaled - 0.5);
  return rounded as Paise;
}

export function fromPaise(paise: Paise | number): number {
  return (paise as number) / 100;
}

export function addPaise(...amounts: Array<Paise | number>): Paise {
  let sum = 0;
  for (const a of amounts) sum += a as number;
  return sum as Paise;
}

export function subPaise(a: Paise | number, b: Paise | number): Paise {
  return ((a as number) - (b as number)) as Paise;
}

export function mulPaiseByScalar(paise: Paise | number, scalar: number): Paise {
  if (!Number.isFinite(scalar)) throw new Error(`Invalid scalar: ${scalar}`);
  const product = (paise as number) * scalar;
  const rounded = product >= 0 ? Math.floor(product + 0.5) : Math.ceil(product - 0.5);
  return rounded as Paise;
}

/** Compare two rupee amounts within 1 paise tolerance. */
export function moneyEquals(a: number, b: number, tolerancePaise = 1): boolean {
  return Math.abs(toPaise(a) - toPaise(b)) <= tolerancePaise;
}

/** Round a rupee float to exactly 2 decimal places via paise. */
export function roundRupees(value: number): number {
  return fromPaise(toPaise(value));
}

/** Reconcile: net must equal gross − deductions (paise exact). */
export function reconcileNet(
  grossRupees: number,
  deductionsRupees: number,
  netRupees: number,
): { ok: true } | { ok: false; expectedNet: number; deltaPaise: number } {
  const expected = subPaise(toPaise(grossRupees), toPaise(deductionsRupees));
  const actual = toPaise(netRupees);
  if (expected === actual) return { ok: true };
  return {
    ok: false,
    expectedNet: fromPaise(expected),
    deltaPaise: (actual as number) - (expected as number),
  };
}
