/**
 * Display formatting helpers. Formatting only — all payroll math lives
 * in lib/payroll-calc.ts.
 */

import { format, parse, parseISO, isValid } from 'date-fns';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,00,000.00 — Indian digit grouping, always 2 dp. */
export function formatINR(amount: number): string {
  return `₹${inrFormatter.format(amount)}`;
}

/** Indian grouping without the rupee sign (for tables where ₹ is in the header). */
export function formatAmount(amount: number): string {
  return inrFormatter.format(amount);
}

/** All dates render as DD MMM yyyy (e.g. 05 Jul 2026). */
export function formatDate(isoDate: string | Date): string {
  const d = typeof isoDate === 'string' ? parseISO(isoDate) : isoDate;
  if (!isValid(d)) return '—';
  return format(d, 'dd MMM yyyy');
}

/** '2026-07' → 'July 2026'. */
export function formatMonthYear(monthYear: string): string {
  const d = parse(monthYear, 'yyyy-MM', new Date());
  if (!isValid(d)) return monthYear;
  return format(d, 'MMMM yyyy');
}

/** '2026-07' + day-of-month → Date within that month (day clamped to month length). */
export function dateInMonth(monthYear: string, dayOfMonth: number): Date {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dayOfMonth, daysInMonth));
}

/**
 * Payroll cycle dates for a slip month. Salary credits on payday of the
 * FOLLOWING month; review queries close 2 days before payday (T−2).
 */
export function payrollCycleDates(
  monthYear: string,
  paydayDayOfMonth: number,
): { creditDate: Date; reviewDeadline: Date } {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const nextMonthYear = format(nextMonth, 'yyyy-MM');
  const creditDate = dateInMonth(nextMonthYear, paydayDayOfMonth);
  const reviewDeadline = dateInMonth(nextMonthYear, paydayDayOfMonth - 2);
  return { creditDate, reviewDeadline };
}

/** Minutes → 'Xh Ym' compact display. */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** PDF filename per spec: PX_PaySlip_YYYY-MM_<EMPID>[_DRAFT].pdf */
export function slipFilename(monthYear: string, empId: string, isDraft: boolean): string {
  const safeEmpId = empId.replace(/[^A-Za-z0-9-]/g, '');
  return `PX_PaySlip_${monthYear}_${safeEmpId}${isDraft ? '_DRAFT' : ''}.pdf`;
}
