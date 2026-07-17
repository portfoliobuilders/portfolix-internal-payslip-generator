/**
 * Authorised salary-slip issuance policy: chronology, placeholders,
 * forbidden PDF strings, payable-day derivation.
 */

import { containsPlaceholderToken, registeredAddressIncomplete } from './company-address';
import type { EntityInfo, SlipSnapshot } from './types';

export const FORBIDDEN_AUTHORISED_PDF_STRINGS = [
  'SET-IN-SETTINGS',
  'TODO',
  'TBD',
  'placeholder',
  'PLACEHOLDER',
  'example',
  'EXAMPLE',
  'dummy',
  'DUMMY',
  'undefined',
  'null',
  'Scheduled credit',
  'Scheduled Credit',
  'payable days referenced for rate basis',
  'Do not treat a pasted signature',
  'Nil — Sec 87A',
  'not a PT deduction month',
] as const;

export function financialYearLabel(monthYear: string): string {
  const [yStr, mStr] = monthYear.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return '—';
  return m >= 4 ? `${y}–${String(y + 1).slice(-2)}` : `${y - 1}–${String(y).slice(-2)}`;
}

/** Payable days for fixed-divisor payroll: divisor − LOP days. */
export function resolvePayableDays(snapshot: SlipSnapshot): number | null {
  const divisor = snapshot.payrollDivisor;
  if (divisor == null || !(divisor > 0)) return null;
  const lop = snapshot.computed?.lopDays ?? 0;
  const payable = Math.round((divisor - lop) * 10) / 10;
  return payable >= 0 ? payable : null;
}

export function validateAuthorisedChronology(input: {
  attendancePeriodEnd: string | null | undefined;
  payrollFinalisedAt: string | null | undefined;
  issueDate: string;
  actualCreditDate: string | null | undefined;
  today?: string;
}): { ok: true } | { ok: false; error: string } {
  const end = input.attendancePeriodEnd?.slice(0, 10) ?? null;
  const finalised = input.payrollFinalisedAt?.slice(0, 10) ?? null;
  const issue = input.issueDate.slice(0, 10);
  const credit = input.actualCreditDate?.slice(0, 10) ?? null;
  const today = (input.today ?? new Date().toISOString()).slice(0, 10);

  if (end && finalised && end > finalised) {
    return {
      ok: false,
      error: 'Payroll finalised date cannot be before attendance cycle end.',
    };
  }
  if (finalised && finalised > issue) {
    return {
      ok: false,
      error: 'Issue date cannot be before payroll finalised date.',
    };
  }
  if (!credit) {
    return { ok: false, error: 'Actual salary-credit date is required.' };
  }
  if (credit > today) {
    return {
      ok: false,
      error: 'Actual salary-credit date cannot be in the future.',
    };
  }
  return { ok: true };
}

export function companyIdentityGate(entity: EntityInfo): string | null {
  if (containsPlaceholderToken(entity.name)) {
    return 'Exact registered legal company name is missing or unconfirmed.';
  }
  if (containsPlaceholderToken(entity.cin) || entity.cin.length < 8) {
    return 'CIN is missing or invalid.';
  }
  if (registeredAddressIncomplete(entity.registeredAddress)) {
    return 'Registered office address is incomplete.';
  }
  if (containsPlaceholderToken(entity.payrollEmail) || !entity.payrollEmail.includes('@')) {
    return 'Official payroll email is missing.';
  }
  if (containsPlaceholderToken(entity.phone)) {
    return 'Official employer-verification phone is missing.';
  }
  if (containsPlaceholderToken(entity.signatoryName) || /authorized signatory/i.test(entity.signatoryName)) {
    return 'Authorised signatory name must be a real person, not a generic title.';
  }
  if (containsPlaceholderToken(entity.signatoryDesignation)) {
    return 'Authorised signatory designation is missing.';
  }
  return null;
}

export function assertExtractedTextClean(
  extractedText: string,
): { ok: true } | { ok: false; found: string[] } {
  const found = FORBIDDEN_AUTHORISED_PDF_STRINGS.filter((s) =>
    extractedText.toLowerCase().includes(s.toLowerCase()),
  );
  return found.length ? { ok: false, found: [...found] } : { ok: true };
}

/** Layout geometry used by visual regression tests (PDF points). */
export const AUTHORISED_PAGE = {
  width: 595.28,
  height: 841.89,
  marginLeft: 38,
  marginRight: 38,
  marginTop: 34,
  marginBottom: 32,
  /** Minimum gap between header bottom divider and document title baseline. */
  titleGapAfterDivider: 12,
} as const;
