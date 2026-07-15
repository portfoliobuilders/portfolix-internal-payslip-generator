import { describe, expect, it } from 'vitest';
import {
  assertVectorPdfTextContains,
  buildVectorPayslipPdf,
} from '../pdf-vector';

describe('vector / text PDF', () => {
  it('builds authorised slip under size limit with extractable fields', async () => {
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
      verificationId: 'a'.repeat(64),
      verificationUrl: 'https://verify.example/verify/payslip/' + 'a'.repeat(64),
      actualCreditDate: '2026-08-05',
      cin: 'U12345KA2024PTC000000',
      issueDate: '2026-08-06',
    });

    expect(result.sizeBytes).toBeLessThan(1024 * 1024);
    expect(result.sizeBytes).toBeLessThan(500 * 1024);
    expect(result.bytes.byteLength).toBeGreaterThan(100);

    const check = assertVectorPdfTextContains(result.extractedText, [
      'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
      'Tinu Rani A S',
      'July 2026',
      '25 Jun 2026 – 24 Jul 2026',
      '₹50,000.00',
      'AUTHORISED SALARY SLIP',
      'PX-AUTH-2026-07-001',
      'Paid',
      'a'.repeat(64),
    ]);
    expect(check).toEqual({ ok: true });
  });

  it('builds internal slip without claiming digital signature', async () => {
    const result = await buildVectorPayslipPdf({
      documentType: 'INTERNAL_PAY_SLIP',
      legalCompanyName: 'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'PX-INT-2026-07-001',
      paymentStatus: 'Scheduled',
      expectedPaymentDate: '2026-08-05',
      lopDivisorLabel: 'LOP Calculation Basis: Fixed 25-day divisor',
    });
    expect(result.extractedText).toContain('INTERNAL PAY SLIP');
    expect(result.extractedText).not.toContain('Digitally signed');
  });
});
