/**
 * Shared payday / payment-calendar derivation tests.
 */

import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import {
  clampPaydayDayOfMonth,
  dateInMonth,
  formatDate,
  formatQueryDeadline,
  payrollCycleDates,
} from '../format';

describe('payrollCycleDates', () => {
  it('payday 1 for July 2026 → review 30 Jul, credit 01 Aug', () => {
    const { creditDate, reviewDeadline } = payrollCycleDates('2026-07', 1);
    expect(formatDate(creditDate)).toBe('01 Aug 2026');
    expect(formatDate(reviewDeadline)).toBe('30 Jul 2026');
    expect(formatQueryDeadline(reviewDeadline, '6:00 PM')).toBe('30 Jul 2026 · 6:00 PM');
  });

  it('payday 5 keeps review in the same credit month', () => {
    const { creditDate, reviewDeadline } = payrollCycleDates('2026-07', 5);
    expect(format(creditDate, 'yyyy-MM-dd')).toBe('2026-08-05');
    expect(format(reviewDeadline, 'yyyy-MM-dd')).toBe('2026-08-03');
  });

  it('payday 31 clamps February credit to month end', () => {
    const { creditDate, reviewDeadline } = payrollCycleDates('2026-01', 31);
    expect(format(creditDate, 'yyyy-MM-dd')).toBe('2026-02-28');
    expect(format(reviewDeadline, 'yyyy-MM-dd')).toBe('2026-02-26');
  });

  it('payday 31 in a leap-year February credits on 29 Feb', () => {
    const { creditDate } = payrollCycleDates('2028-01', 31);
    expect(format(creditDate, 'yyyy-MM-dd')).toBe('2028-02-29');
  });

  it('payday 31 for July salary credits 31 Aug', () => {
    const { creditDate, reviewDeadline } = payrollCycleDates('2026-07', 31);
    expect(format(creditDate, 'yyyy-MM-dd')).toBe('2026-08-31');
    expect(format(reviewDeadline, 'yyyy-MM-dd')).toBe('2026-08-29');
  });
});

describe('dateInMonth / clampPaydayDayOfMonth', () => {
  it('accepts 1–31 and clamps to month length', () => {
    expect(clampPaydayDayOfMonth(0)).toBe(1);
    expect(clampPaydayDayOfMonth(32)).toBe(31);
    expect(format(dateInMonth('2026-02', 31), 'yyyy-MM-dd')).toBe('2026-02-28');
    expect(format(dateInMonth('2026-08', 31), 'yyyy-MM-dd')).toBe('2026-08-31');
  });
});
