/**
 * Payroll attendance-cycle tests — salary month ≠ attendance window.
 */

import { describe, expect, it } from 'vitest';
import {
  assertFinalisationAllowed,
  computeAttendancePeriod,
  formatAttendanceCycle,
  inclusiveAttendanceDayCount,
  july2026DefaultCycle,
  validateAttendancePeriod,
} from '../payroll-cycle';

describe('payroll cycle — PREVIOUS_25_TO_CURRENT_24', () => {
  it('July 2026 salary → 25 June 2026 to 24 July 2026', () => {
    const period = july2026DefaultCycle();
    expect(period.salaryMonth).toBe('2026-07');
    expect(period.attendancePeriodStart).toBe('2026-06-25');
    expect(period.attendancePeriodEnd).toBe('2026-07-24');
    expect(formatAttendanceCycle(period)).toBe('25 Jun 2026 – 24 Jul 2026');
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

  it('no overlap and no gap between consecutive months', () => {
    const june = computeAttendancePeriod({
      salaryMonth: '2026-06',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const july = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const august = computeAttendancePeriod({
      salaryMonth: '2026-08',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });

    expect(
      validateAttendancePeriod({ period: july, previousPeriod: june }),
    ).toEqual([]);
    expect(
      validateAttendancePeriod({ period: august, previousPeriod: july }),
    ).toEqual([]);
    expect(
      validateAttendancePeriod({
        period: july,
        previousPeriod: june,
        nextPeriod: august,
      }),
    ).toEqual([]);
  });

  it('detects overlap with prior period', () => {
    const july = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_25_TO_CURRENT_24',
    });
    const issues = validateAttendancePeriod({
      period: july,
      previousPeriod: {
        salaryMonth: '2026-06',
        attendancePeriodStart: '2026-05-25',
        attendancePeriodEnd: '2026-06-30', // overlaps into July cycle
      },
    });
    expect(issues.some((i) => i.code === 'ATTENDANCE_OVERLAP' || i.code === 'ATTENDANCE_GAP')).toBe(
      true,
    );
  });

  it('calendar-month employee uses 01–last', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'CALENDAR_MONTH',
    });
    expect(period.attendancePeriodStart).toBe('2026-07-01');
    expect(period.attendancePeriodEnd).toBe('2026-07-31');
  });

  it('manual override requires reason', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'CUSTOM_FIXED_CYCLE',
      customStart: '2026-06-20',
      customEnd: '2026-07-20',
    });
    const issues = validateAttendancePeriod({
      period,
      isManualOverride: true,
      overrideReason: null,
    });
    expect(issues.some((i) => i.code === 'OVERRIDE_REASON_REQUIRED')).toBe(true);

    const ok = validateAttendancePeriod({
      period,
      isManualOverride: true,
      overrideReason: 'Board-approved special cycle for joining month.',
    });
    expect(ok.some((i) => i.code === 'OVERRIDE_REASON_REQUIRED')).toBe(false);
  });

  it('finalisation before cycle end is blocked', () => {
    const period = july2026DefaultCycle();
    const before = assertFinalisationAllowed({
      attendancePeriodEnd: period.attendancePeriodEnd,
      now: new Date('2026-07-20T10:00:00Z'),
    });
    expect(before?.code).toBe('FINALISATION_BEFORE_CYCLE_END');

    const after = assertFinalisationAllowed({
      attendancePeriodEnd: period.attendancePeriodEnd,
      now: new Date('2026-07-24T10:00:00Z'),
    });
    expect(after).toBeNull();
  });

  it('PREVIOUS_24_TO_CURRENT_23 works', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: 'PREVIOUS_24_TO_CURRENT_23',
    });
    expect(period.attendancePeriodStart).toBe('2026-06-24');
    expect(period.attendancePeriodEnd).toBe('2026-07-23');
  });

  it('counts inclusive calendar days for attendance windows', () => {
    expect(inclusiveAttendanceDayCount('2026-06-25', '2026-07-24')).toBe(30);
    expect(inclusiveAttendanceDayCount('2026-05-20', '2026-06-19')).toBe(31);
  });
});
