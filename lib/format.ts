/**
 * Display formatting helpers. Formatting only — all payroll math lives
 * in lib/payroll-calc.ts. Attendance-cycle math lives in lib/payroll-cycle.ts.
 */

import {
  endOfMonth,
  format,
  parse,
  parseISO,
  isValid,
  startOfMonth,
  subDays,
} from 'date-fns';
import {
  computeAttendancePeriod,
  formatAttendanceCycle,
  DEFAULT_PAYROLL_CYCLE_METHOD,
  type PayrollCycleMethod,
} from './payroll-cycle';

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

/** Date + local time for generation stamps (e.g. 15 Jul 2026, 14:30). */
export function formatDateTime(isoDate: string | Date): string {
  const d = typeof isoDate === 'string' ? parseISO(isoDate) : isoDate;
  if (!isValid(d)) return '—';
  return format(d, 'dd MMM yyyy, HH:mm');
}

/** Verification "checked at" stamp in Asia/Kolkata with an IST label. */
export function formatCheckedAtIst(isoDate: string | Date = new Date()): string {
  const d = typeof isoDate === 'string' ? parseISO(isoDate) : isoDate;
  if (!isValid(d)) return '—';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  // en-GB yields "19 Jul 2026, 16:20" (comma may vary by runtime)
  return `${formatted.replace(',', '')} IST`;
}

/** '2026-07' → 'July 2026'. */
export function formatMonthYear(monthYear: string): string {
  const d = parse(monthYear, 'yyyy-MM', new Date());
  if (!isValid(d)) return monthYear;
  return format(d, 'MMMM yyyy');
}

/** Clamp a configured payday to 1–31 (actual calendar day may be shorter — see dateInMonth). */
export function clampPaydayDayOfMonth(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

/** '2026-07' + day-of-month → Date within that month (day clamped to month length). */
export function dateInMonth(monthYear: string, dayOfMonth: number): Date {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = clampPaydayDayOfMonth(dayOfMonth);
  return new Date(year, month, Math.min(day, daysInMonth));
}

/**
 * Shared payment-calendar derivation for a slip month.
 * Salary credits on payday of the FOLLOWING month (29/30/31 clamp to that month's last day).
 * Review / draft / publish offsets use real calendar arithmetic from creditDate
 * (e.g. reviewDeadline = creditDate − 2 days, rolling into the prior month when needed).
 * This is NOT the attendance cycle — see computeAttendancePeriod.
 */
export function payrollCycleDates(
  monthYear: string,
  paydayDayOfMonth: number,
): { creditDate: Date; reviewDeadline: Date } {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const nextMonthYear = format(nextMonth, 'yyyy-MM');
  const creditDate = dateInMonth(nextMonthYear, paydayDayOfMonth);
  const reviewDeadline = subDays(creditDate, 2);
  return { creditDate, reviewDeadline };
}

/**
 * @deprecated Prefer computeAttendancePeriod + formatAttendanceCycle.
 * Calendar-month range only — do not use as default Portfolix attendance cycle.
 */
export function formatPayPeriodRange(monthYear: string): string {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  if (!isValid(base)) return monthYear;
  const start = startOfMonth(base);
  const end = endOfMonth(base);
  return `${format(start, 'dd MMM yyyy')} – ${format(end, 'dd MMM yyyy')}`;
}

/** Attendance cycle display using server-side cycle method (default 25→24). */
export function formatSalaryAttendanceCycle(
  salaryMonth: string,
  method: PayrollCycleMethod = DEFAULT_PAYROLL_CYCLE_METHOD,
  stored?: { start?: string | null; end?: string | null },
): string {
  if (stored?.start && stored?.end) {
    return formatAttendanceCycle({
      attendancePeriodStart: stored.start,
      attendancePeriodEnd: stored.end,
    });
  }
  const period = computeAttendancePeriod({ salaryMonth, method });
  return formatAttendanceCycle(period);
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

/** The current month as a 'YYYY-MM' key. */
export function currentMonthKey(): string {
  return format(new Date(), 'yyyy-MM');
}

/** "03 Jul 2026 · 6:00 PM" style string for the review deadline. */
export function formatQueryDeadline(
  deadline: Date,
  timeLabel: string = '6:00 PM',
): string {
  return `${formatDate(deadline)} · ${timeLabel}`;
}

/** PDF filename per spec: PX_PaySlip_YYYY-MM_<EMPID>[_DRAFT].pdf */
export function slipFilename(
  monthYear: string,
  empId: string,
  isDraft: boolean,
  prefix = 'PaymentStatement',
): string {
  const safeEmpId = empId.replace(/[^A-Za-z0-9-]/g, '');
  return `PX_${prefix}_${monthYear}_${safeEmpId}${isDraft ? '_DRAFT' : ''}.pdf`;
}

/**
 * Authorised bank-copy filename — includes the persisted payslip number so
 * header, filename, and authorised_slip_log share one reference.
 */
export function authorisedSlipFilename(
  monthYear: string,
  empId: string,
  documentNumber: string,
): string {
  const safeEmpId = empId.replace(/[^A-Za-z0-9-]/g, '');
  const safeDoc = documentNumber.replace(/[^A-Za-z0-9-]/g, '');
  return `PX_AuthorisedSalarySlip_${monthYear}_${safeEmpId}_${safeDoc}.pdf`;
}
