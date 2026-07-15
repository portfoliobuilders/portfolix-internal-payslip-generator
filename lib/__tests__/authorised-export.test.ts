import { describe, expect, it } from 'vitest';
import { authorisedSlipFilename } from '../format';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
} from '../payroll-cycle';
import { buildVectorPayslipPdf } from '../pdf-vector';
import { assertDocumentAllowed } from '../salary-payment';

describe('authorised export wiring helpers', () => {
  it('filename uses monthYear + empId (not entity code as month)', () => {
    const name = authorisedSlipFilename('2026-07', 'PX-2024-001', 'PX-AUTH-2026-07-PX-2024-001-R1');
    expect(name).toContain('2026-07');
    expect(name).toContain('PX-2024-001');
    expect(name).not.toMatch(/^PX_AuthorisedSalarySlip_PX_/);
  });

  it('default attendance cycle is used when snapshot lacks period fields', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: DEFAULT_PAYROLL_CYCLE_METHOD,
    });
    expect(period.attendancePeriodStart).toBe('2026-06-25');
    expect(period.attendancePeriodEnd).toBe('2026-07-24');
  });

  it('authorised gate rejects unpaid statuses', () => {
    expect(
      assertDocumentAllowed(
        'AUTHORISED_SALARY_SLIP',
        'AUTHORISED_BLOCKED',
        'PARTIALLY_PAID',
        30000,
      ).ok,
    ).toBe(false);
    expect(
      assertDocumentAllowed('AUTHORISED_SALARY_SLIP', 'AUTHORISED_ELIGIBLE', 'PAID', 0).ok,
    ).toBe(true);
  });

  it('vector authorised PDF includes verification id and legal name', async () => {
    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: 'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'PX-AUTH-2026-07-001',
      paymentStatus: 'Paid',
      verificationId: 'b'.repeat(64),
      verificationUrl: 'https://example.com/verify/payslip/' + 'b'.repeat(64),
      actualCreditDate: '2026-08-05',
    });
    expect(result.extractedText).toContain('PORTFOLIX ENTREPRISE PRIVATE LIMITED');
    expect(result.extractedText).toContain('b'.repeat(64));
    expect(result.extractedText).toContain('AUTHORISED SALARY SLIP');
  });
});
