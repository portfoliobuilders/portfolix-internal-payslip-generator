/**
 * Text/vector PDF extraction and size tests.
 */

import { describe, expect, it } from 'vitest';
import {
  buildAuthorisedSlipPdf,
  buildInternalSlipPdf,
  pdfWithinSizeLimit,
} from '../pdf-vector';
import { LEGAL_COMPANY_NAME_CANONICAL } from '../constants/company';

describe('vector PDF builders', () => {
  it('internal slip has extractable text and stays under size limit', () => {
    const result = buildInternalSlipPdf({
      legalCompanyName: LEGAL_COMPANY_NAME_CANONICAL,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      netSalary: 50000,
      documentType: 'INTERNAL PAY SLIP',
      documentNumber: 'INT-PX-2024-001-2026-07',
      paymentStatus: 'SCHEDULED',
      expectedOrCreditLabel: 'Expected payment date',
      expectedOrCreditDate: '05 Aug 2026',
    });

    expect(result.textContent).toContain(LEGAL_COMPANY_NAME_CANONICAL);
    expect(result.textContent).toContain('Tinu Rani A S');
    expect(result.textContent).toContain('July 2026');
    expect(result.textContent).toContain('25 Jun 2026');
    expect(result.textContent).toContain('24 Jul 2026');
    expect(result.textContent).toContain('₹50,000.00');
    expect(result.textContent).toContain('INTERNAL PAY SLIP');
    expect(result.textContent).toContain('INT-PX-2024-001-2026-07');
    expect(result.textContent).toContain('SCHEDULED');
    expect(pdfWithinSizeLimit(result.byteLength)).toBe(true);
    expect(result.byteLength).toBeLessThan(500_000);
  });

  it('authorised slip includes verification id and payment status Paid', () => {
    const result = buildAuthorisedSlipPdf({
      legalCompanyName: LEGAL_COMPANY_NAME_CANONICAL,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      netSalary: 50000,
      documentType: 'AUTHORISED SALARY SLIP',
      documentNumber: 'ASL-PX-2024-001-2026-07',
      paymentStatus: 'Paid',
      actualCreditDate: '05 Aug 2026',
      verificationId: 'ver_abc123XYZ789secureToken',
      cin: 'U72900KL2024PTC123456',
      designation: 'Operations Lead',
    });

    expect(result.textContent).toContain('AUTHORISED SALARY SLIP');
    expect(result.textContent).toContain(LEGAL_COMPANY_NAME_CANONICAL);
    expect(result.textContent).toContain('ver_abc123XYZ789secureToken');
    expect(result.textContent).toContain('Paid');
    expect(result.textContent).toContain('₹50,000.00');
    expect(pdfWithinSizeLimit(result.byteLength)).toBe(true);
  });
});
