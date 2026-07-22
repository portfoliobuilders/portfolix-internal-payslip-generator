/**
 * Tests for private company asset helpers and authorised PDF embedding.
 */

import { describe, expect, it } from 'vitest';
import {
  imageBytesToDataUri,
  safeBasename,
} from '../documents/load-company-asset';
import {
  assertImageDimensionsWithinLimit,
  signatoryAssetPath,
  validateSignatoryAssetFile,
} from '../signatory-assets';
import { buildVectorPayslipPdf } from '../pdf-vector';
import { signatoryIncompleteReason } from '../settings-defaults';
import type { EntityInfo, SlipSnapshot } from '../types';
import { LEGAL_COMPANY_NAME_CANONICAL } from '../constants/company';

/** Minimal 1×1 transparent PNG */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

/** Second 1×1 PNG for seal (same bytes OK — different storage path). */
const PNG_SEAL = PNG_1X1;

function baseEntity(overrides: Partial<EntityInfo> = {}): EntityInfo {
  return {
    name: LEGAL_COMPANY_NAME_CANONICAL,
    legalLine: '',
    addressLines: ['Kochi'],
    contact: 'payroll@portfolix.tech',
    logoDataUrl: null,
    cin: 'U72900KL2024PTC123456',
    registeredAddress: 'Kochi, Kerala',
    phone: '+91 00000 00000',
    payrollEmail: 'payroll@portfolix.tech',
    signatoryName: 'Test Signatory',
    signatoryDesignation: 'Director',
    signatureAssetPath: 'px/signatures/test-sig.png',
    sealAssetPath: 'px/seals/test-seal.png',
    ...overrides,
  };
}

function sampleSnapshot(overrides: Partial<SlipSnapshot> = {}): SlipSnapshot {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    employeeId: 'emp-1',
    monthYear: '2026-07',
    status: 'final',
    generatedAt: '2026-07-28T10:00:00.000Z',
    flexBalanceAfter: 0,
    inputs: {
      absentDays: 0,
      halfDays: 0,
      lateMinutes: 0,
      flexMinutesEarned: 0,
      fixedAllowance: 0,
      otherDeductions: 0,
      tdsMonthly: 0,
      ptThisMonth: 0,
      variableLabel: '',
      variableEarned: 0,
      variablePaid: 0,
      deferredOpening: 0,
      committedPayoutDate: null,
      remarks: '',
      flexBankBalanceBefore: 0,
      baseSalary: 50000,
    },
    computed: {
      perDayRate: 2000,
      flexAvailable: 0,
      unpaidLateMinutes: 0,
      flexOffsetMinutes: 0,
      lopFromLateness: 0,
      lopDays: 0,
      lopDeduction: 0,
      otherDeductions: 0,
      tds: 0,
      pt: 0,
      totalDeductions: 0,
      grossFixed: 50000,
      variableEarned: 0,
      variablePaid: 0,
      variableDeferred: 0,
      deferredOpening: 0,
      deferredClosing: 0,
      committedPayoutDate: null,
      netPay: 50000,
      netPayWords: 'Rupees Fifty Thousand Only',
    },
    employee: {
      fullName: 'Tinu Rani A S',
      empId: 'PX-2024-001',
      entityCode: 'PX',
      department: 'Ops',
      designation: 'Operations Lead',
      joiningDate: '2024-01-15',
      employeeAddress: '',
      paymentMode: 'Bank Transfer',
      engagementType: 'regular_employee',
      employmentStatus: 'active',
      paymentType: 'salary',
      bankName: 'HDFC Bank',
      bankAccountNumber: '50100123456789',
      bankLast4: '6789',
      panMasked: 'ABXXXXXX1F',
    },
    attendancePeriodStart: '2026-06-25',
    attendancePeriodEnd: '2026-07-24',
    revisionNumber: 1,
    ...overrides,
  };
}

describe('signatory asset validation', () => {
  it('accepts PNG and JPEG', () => {
    expect(() =>
      validateSignatoryAssetFile({ type: 'image/png', size: 1000, name: 'sig.png' }),
    ).not.toThrow();
    expect(() =>
      validateSignatoryAssetFile({ type: 'image/jpeg', size: 1000, name: 'sig.jpg' }),
    ).not.toThrow();
  });

  it('rejects WebP, SVG, and oversized files', () => {
    expect(() =>
      validateSignatoryAssetFile({ type: 'image/webp', size: 100, name: 'a.webp' }),
    ).toThrow(/WebP/i);
    expect(() =>
      validateSignatoryAssetFile({ type: 'image/svg+xml', size: 100, name: 'a.svg' }),
    ).toThrow(/SVG/i);
    expect(() =>
      validateSignatoryAssetFile({ type: 'image/png', size: 3 * 1024 * 1024, name: 'big.png' }),
    ).toThrow(/2 MB/i);
  });

  it('creates versioned storage paths (never fixed overwrite names)', () => {
    const a = signatoryAssetPath('PX', 'signature', 'png');
    const b = signatoryAssetPath('PX', 'seal', 'png');
    expect(a).toMatch(/^px\/signatures\/.+\.png$/);
    expect(b).toMatch(/^px\/seals\/.+\.png$/);
    expect(a).not.toBe(b);
  });

  it('accepts small PNG dimensions', () => {
    expect(() => assertImageDimensionsWithinLimit(PNG_1X1, 'image/png')).not.toThrow();
  });
});

describe('load-company-asset helpers', () => {
  it('safeBasename never exposes full path segments beyond the file', () => {
    expect(safeBasename('px/signatures/abc-123.png')).toBe('abc-123.png');
    expect(safeBasename(null)).toBe('(none)');
  });

  it('imageBytesToDataUri builds a PNG data URI', () => {
    const uri = imageBytesToDataUri(PNG_1X1, 'image/png');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri.length).toBeGreaterThan(30);
  });
});

describe('signatoryIncompleteReason gates', () => {
  it('blocks when signature path missing', () => {
    const reason = signatoryIncompleteReason(
      baseEntity({ signatureAssetPath: null }),
    );
    expect(reason).toContain('signature image');
  });

  it('blocks when seal path missing under SIGNATURE_AND_SEAL', () => {
    const reason = signatoryIncompleteReason(baseEntity({ sealAssetPath: null }));
    expect(reason).toContain('company seal image');
  });

});

describe('authorised PDF embedding', () => {
  it('accepts signature and seal bytes and includes signatory text', async () => {
    const entity = baseEntity();
    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: LEGAL_COMPANY_NAME_CANONICAL,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'ASL-PX-2024-001-2026-07',
      paymentStatus: 'Paid',
      verificationId: 'ver_test_token_abc',
      verificationUrl: 'https://example.com/verify/ver_test_token_abc',
      actualCreditDate: '2026-08-05',
      issueDate: '2026-08-05',
      snapshot: sampleSnapshot(),
      entity,
      signatureBytes: PNG_1X1,
      sealBytes: PNG_SEAL,
      showPaymentBand: true,
      confirmedPaidAmount: 50000,
      outstandingAmount: 0,
    });

    expect(result.extractedText).toContain('Test Signatory');
    expect(result.extractedText).toContain('Director');
    expect(result.extractedText).toContain('AUTHORISED SALARY SLIP');
    expect(result.sizeBytes).toBeGreaterThan(500);
    expect(result.sizeBytes).toBeLessThan(1_000_000);
    // PDF magic
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('%PDF');
  });
});
