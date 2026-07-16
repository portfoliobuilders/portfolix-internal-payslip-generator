/**
 * Verification identifier + authorised gates.
 */

import { describe, expect, it } from 'vitest';
import {
  assertAuthorisedSlipReady,
  computeVerificationFingerprint,
  generatePublicVerificationId,
  maskEmployeeId,
  privacyControlledName,
} from '../verification';

describe('verification helpers', () => {
  it('generates unpredictable non-sequential verification ids', () => {
    const a = generatePublicVerificationId();
    const b = generatePublicVerificationId();
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(b.length).toBeGreaterThanOrEqual(20);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/^\d+$/);
  });

  it('masks employee id and privacy-controls name', () => {
    expect(maskEmployeeId('PX-2024-042')).toMatch(/^PX····42$/);
    expect(privacyControlledName('Tinu Rani A S')).toBe('Tinu S.');
  });

  it('fingerprint is stable for same inputs', () => {
    const args = {
      payslipNumber: 'ASL-1',
      employeeId: 'emp-1',
      salaryMonth: '2026-07',
      netSalary: 50000,
      revisionNumber: 1,
      actualCreditDate: '2026-08-05',
    };
    expect(computeVerificationFingerprint(args)).toBe(computeVerificationFingerprint(args));
  });

  it('authorised slip ready checklist blocks unpaid / waived', () => {
    const base = {
      attendanceCycleEnded: true,
      payrollFinalised: true,
      attendanceLocked: true,
      salaryReconciles: true,
      ytdReconciles: true,
      paymentStatus: 'PAID',
      confirmedPaidAmount: 50000,
      netSalary: 50000,
      outstandingAmount: 0,
      actualCreditDate: '2026-08-05',
      employerIdentityConfirmed: true,
      documentNumber: 'ASL-1',
      verificationId: 'ver_x',
    };
    expect(assertAuthorisedSlipReady(base).ok).toBe(true);
    expect(assertAuthorisedSlipReady({ ...base, paymentStatus: 'PARTIALLY_PAID' }).ok).toBe(false);
    expect(assertAuthorisedSlipReady({ ...base, paymentStatus: 'SALARY_WAIVED' }).ok).toBe(false);
    expect(assertAuthorisedSlipReady({ ...base, actualCreditDate: null }).ok).toBe(false);
  });
});
