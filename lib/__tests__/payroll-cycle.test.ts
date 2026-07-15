import { describe, expect, it } from 'vitest';
import {
  computeAttendancePeriod,
  formatAttendanceCycleRange,
  periodsAreContiguous,
  periodsOverlap,
  validateAttendancePeriod,
} from '../payroll-cycle';

describe('payroll cycle — PREVIOUS_25_TO_CURRENT_24', () => {
  it('July 2026 salary → 25 June 2026 to 24 July 2026', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    expect(period.attendancePeriodStart).toBe('2026-06-25');
    expect(period.attendancePeriodEnd).toBe('2026-07-24');
    expect(formatAttendanceCycleRange(period.attendancePeriodStart, period.attendancePeriodEnd)).toBe(
      '25 Jun 2026 – 24 Jul 2026',
    );
  });

  it('June 2026 salary → 25 May 2026 to 24 June 2026', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-06',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    expect(period.attendancePeriodStart).toBe('2026-05-25');
    expect(period.attendancePeriodEnd).toBe('2026-06-24');
  });

  it('August 2026 salary → 25 July 2026 to 24 August 2026', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-08',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    expect(period.attendancePeriodStart).toBe('2026-07-25');
    expect(period.attendancePeriodEnd).toBe('2026-08-24');
  });

  it('no overlap and no gap with next period', () => {
    const june = computeAttendancePeriod({
      salaryMonth: '2026-06',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const july = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    expect(
      periodsOverlap(
        june.attendancePeriodStart,
        june.attendancePeriodEnd,
        july.attendancePeriodStart,
        july.attendancePeriodEnd,
      ),
    ).toBe(false);
    expect(
      periodsAreContiguous(june.attendancePeriodEnd, july.attendancePeriodStart),
    ).toBe(true);
  });
});

describe('payroll cycle — calendar month opt-in', () => {
  it('uses 01–last only for CALENDAR_MONTH', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'CALENDAR_MONTH',
    });
    expect(period.attendancePeriodStart).toBe('2026-07-01');
    expect(period.attendancePeriodEnd).toBe('2026-07-31');
  });
});

describe('payroll cycle validation', () => {
  it('blocks finalisation before cycle end', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const issues = validateAttendancePeriod({
      period,
      finalising: true,
      now: new Date('2026-07-15T12:00:00Z'),
    });
    expect(issues.some((i) => i.code === 'FINALISE_BEFORE_CYCLE_END')).toBe(true);
  });

  it('detects overlap with prior period', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const issues = validateAttendancePeriod({
      period,
      previousPeriodEnd: '2026-06-30',
      finalising: false,
    });
    expect(issues.some((i) => i.code === 'ATTENDANCE_OVERLAP')).toBe(true);
  });

  it('manual override with empty reason errors', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'CUSTOM_FIXED_CYCLE',
      customStartDay: 20,
      customEndDay: 19,
      overrideStart: '2026-06-20',
      overrideEnd: '2026-07-19',
    });
    const issues = validateAttendancePeriod({
      period,
      overrideReason: '   ',
      finalising: false,
    });
    expect(issues.some((i) => i.code === 'OVERRIDE_REASON_REQUIRED')).toBe(true);
  });
});
