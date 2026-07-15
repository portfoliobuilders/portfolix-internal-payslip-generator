import type { SlipSnapshot } from '@/lib/types';

/** Most recent FINAL slip for an employee strictly BEFORE the given month. */
export function findPreviousFinalSlip(
  slipHistory: SlipSnapshot[],
  employeeId: string,
  monthYear: string,
): SlipSnapshot | null {
  const candidates = slipHistory
    .filter(
      (s) => s.employeeId === employeeId && s.status === 'final' && s.monthYear < monthYear,
    )
    .sort((a, b) =>
      a.monthYear === b.monthYear
        ? a.generatedAt.localeCompare(b.generatedAt)
        : a.monthYear.localeCompare(b.monthYear),
    );
  return candidates.length > 0 ? candidates[candidates.length - 1] ?? null : null;
}

/** Existing FINAL slip for the same employee + month (supersede check). */
export function findFinalSlipForMonth(
  slipHistory: SlipSnapshot[],
  employeeId: string,
  monthYear: string,
): SlipSnapshot | null {
  const finals = slipHistory
    .filter((s) => s.employeeId === employeeId && s.status === 'final' && s.monthYear === monthYear)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return finals.length > 0 ? finals[finals.length - 1] ?? null : null;
}
