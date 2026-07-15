import { describe, expect, it } from 'vitest';
import {
  resolvePaymentSchedule,
  reviseExpectedPaymentDate,
} from '../payment-schedule';

describe('payment schedules', () => {
  it('standard 5th-day payment of succeeding month', () => {
    const resolved = resolvePaymentSchedule({
      salaryMonth: '2026-07',
      companyDefaultPaymentDay: 5,
    });
    expect(resolved.originalDueDate).toBe('2026-08-05');
    expect(resolved.scheduledPaymentDate).toBe('2026-08-05');
    expect(resolved.source).toBe('company_default');
  });

  it('CEO 1st-day executive schedule via preferred day', () => {
    const resolved = resolvePaymentSchedule({
      salaryMonth: '2026-07',
      companyDefaultPaymentDay: 5,
      employeePreferredPaymentDay: 1,
      employeeScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
    });
    expect(resolved.originalDueDate).toBe('2026-08-01');
    expect(resolved.paymentScheduleType).toBe('BOARD_APPROVED_EXECUTIVE_SCHEDULE');
  });

  it('CTO 3rd-day schedule', () => {
    const resolved = resolvePaymentSchedule({
      salaryMonth: '2026-07',
      companyDefaultPaymentDay: 5,
      schedules: [
        {
          paymentScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
          preferredPaymentDay: 3,
          paymentScheduleEffectiveFrom: '2026-01-01',
          paymentScheduleNotes: 'CTO schedule',
        },
      ],
    });
    expect(resolved.originalDueDate).toBe('2026-08-03');
    expect(resolved.source).toBe('employee_schedule');
  });

  it('COO 5th-day schedule', () => {
    const resolved = resolvePaymentSchedule({
      salaryMonth: '2026-07',
      companyDefaultPaymentDay: 5,
      employeePreferredPaymentDay: 5,
      employeeScheduleType: 'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
    });
    expect(resolved.originalDueDate).toBe('2026-08-05');
  });

  it('per-payroll manual change', () => {
    const resolved = resolvePaymentSchedule({
      salaryMonth: '2026-07',
      companyDefaultPaymentDay: 5,
      employeeScheduleType: 'MANUAL_PER_PAYROLL',
      manualPaymentDay: 7,
    });
    expect(resolved.originalDueDate).toBe('2026-08-07');
    expect(resolved.source).toBe('manual_override');
  });

  it('revised expected date preserves original due date', () => {
    const revised = reviseExpectedPaymentDate({
      originalDueDate: '2026-08-03',
      revisedExpectedPaymentDate: '2026-08-05',
    });
    expect(revised.originalDueDate).toBe('2026-08-03');
    expect(revised.revisedExpectedPaymentDate).toBe('2026-08-05');
  });
});
