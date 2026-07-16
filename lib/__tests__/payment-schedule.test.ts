/**
 * Employee payment schedule resolution tests.
 */

import { describe, expect, it } from 'vitest';
import {
  computePaymentDates,
  EXAMPLE_EXECUTIVE_SCHEDULE_SEEDS,
  reviseExpectedPaymentDate,
  resolvePreferredPaymentDay,
} from '../payment-schedule';

describe('payment schedules', () => {
  it('standard 5th-day payment for July salary → 05 Aug 2026', () => {
    const dates = computePaymentDates({
      salaryMonth: '2026-07',
      companyDefaultPayday: 5,
    });
    expect(dates.originalDueDate).toBe('2026-08-05');
    expect(dates.scheduledPaymentDate).toBe('2026-08-05');
    expect(dates.revisedExpectedPaymentDate).toBeNull();
  });

  it('CEO 1st-day schedule (configurable, not designation-hardcoded)', () => {
    const dates = computePaymentDates({
      salaryMonth: '2026-07',
      employeeSchedule: EXAMPLE_EXECUTIVE_SCHEDULE_SEEDS.CEO,
      companyDefaultPayday: 5,
    });
    expect(dates.originalDueDate).toBe('2026-08-01');
    expect(dates.paymentScheduleType).toBe('BOARD_APPROVED_EXECUTIVE_SCHEDULE');
  });

  it('CTO 3rd-day schedule', () => {
    const dates = computePaymentDates({
      salaryMonth: '2026-07',
      employeeSchedule: EXAMPLE_EXECUTIVE_SCHEDULE_SEEDS.CTO,
    });
    expect(dates.originalDueDate).toBe('2026-08-03');
  });

  it('COO 5th-day schedule', () => {
    const dates = computePaymentDates({
      salaryMonth: '2026-07',
      employeeSchedule: EXAMPLE_EXECUTIVE_SCHEDULE_SEEDS.COO,
    });
    expect(dates.originalDueDate).toBe('2026-08-05');
  });

  it('per-payroll manual change', () => {
    const resolved = resolvePreferredPaymentDay({
      employeeSchedule: {
        paymentScheduleType: 'MANUAL_PER_PAYROLL',
        preferredPaymentDay: 5,
      },
      manualPaydayDay: 10,
      companyDefaultPayday: 5,
    });
    expect(resolved.day).toBe(10);
    expect(resolved.scheduleType).toBe('MANUAL_PER_PAYROLL');
  });

  it('revised expected date preserves original due date', () => {
    const dates = computePaymentDates({
      salaryMonth: '2026-07',
      companyDefaultPayday: 3,
    });
    expect(dates.originalDueDate).toBe('2026-08-03');

    const revised = reviseExpectedPaymentDate({
      originalDueDate: dates.originalDueDate,
      revisedExpectedPaymentDate: '2026-08-05',
      reason: 'Bank holiday delay',
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.originalDueDate).toBe('2026-08-03');
    expect(revised.revisedExpectedPaymentDate).toBe('2026-08-05');
  });

  it('revise without reason is rejected', () => {
    const revised = reviseExpectedPaymentDate({
      originalDueDate: '2026-08-05',
      revisedExpectedPaymentDate: '2026-08-10',
      reason: '  ',
    });
    expect(revised.ok).toBe(false);
  });
});
