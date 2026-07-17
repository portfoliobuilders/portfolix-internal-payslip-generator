/**
 * Tests for private company asset helpers and authorised PDF embedding.
 */

import { createHash } from 'node:crypto';
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
import type { EntityInfo } from '../types';
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
    authorisationMode: 'SIGNATURE_AND_SEAL',
    authorityEffectiveFrom: null,
    authorityEffectiveTo: null,
    signatoryActive: true,
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
    expect(reason).toMatch(/incomplete/i);
  });

  it('blocks when seal path missing under SIGNATURE_AND_SEAL', () => {
    const reason = signatoryIncompleteReason(baseEntity({ sealAssetPath: null }));
    expect(reason).toMatch(/incomplete/i);
  });

  it('allows COMPUTER_GENERATED_VERIFICATION without visual assets', () => {
    const reason = signatoryIncompleteReason(
      baseEntity({
        authorisationMode: 'COMPUTER_GENERATED_VERIFICATION',
        signatureAssetPath: null,
        sealAssetPath: null,
      }),
    );
    expect(reason).toBeNull();
  });

  it('blocks outside authority effective dates', () => {
    const reason = signatoryIncompleteReason(
      baseEntity({
        authorityEffectiveFrom: '2026-01-01',
        authorityEffectiveTo: '2026-01-31',
      }),
      '2026-07-01',
    );
    expect(reason).toMatch(/incomplete/i);
  });
});

describe('authorised PDF embedding', () => {
  it('embeds signature and seal bytes and includes signatory text', async () => {
    const sigHash = createHash('sha256').update(PNG_1X1).digest('hex');
    const sealHash = createHash('sha256').update(PNG_SEAL).digest('hex');

    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: LEGAL_COMPANY_NAME_CANONICAL,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'PX-AUTH-2026-07-PX-2024-001-R1',
      paymentStatus: 'Paid',
      verificationId: 'ver_test_token_abc',
      verificationUrl: 'https://example.com/verify/ver_test_token_abc',
      actualCreditDate: '2026-08-05',
      issueDate: '2026-08-05',
      signatoryName: 'Test Signatory',
      signatoryDesignation: 'Director',
      drawSignatoryBlock: true,
      assets: {
        signature: {
          bytes: PNG_1X1,
          mimeType: 'image/png',
          contentHash: sigHash,
          storagePath: 'px/signatures/test.png',
          width: 1,
          height: 1,
        },
        seal: {
          bytes: PNG_SEAL,
          mimeType: 'image/png',
          contentHash: sealHash,
          storagePath: 'px/seals/test.png',
          width: 1,
          height: 1,
        },
      },
    });

    expect(result.embedded.signature).toBe(true);
    expect(result.embedded.seal).toBe(true);
    expect(result.extractedText).toContain('Test Signatory');
    expect(result.extractedText).toContain('Director');
    expect(result.extractedText).toContain('AUTHORISED SALARY SLIP');
    expect(result.sizeBytes).toBeGreaterThan(500);
    expect(result.sizeBytes).toBeLessThan(1_000_000);
    // PDF magic
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('%PDF');
  });

  it('does not draw blank signature placeholders in computer-generated mode', async () => {
    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: LEGAL_COMPANY_NAME_CANONICAL,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'PX-AUTH-CG-1',
      paymentStatus: 'Paid',
      verificationId: 'ver_cg',
      issueDate: '2026-08-05',
      drawSignatoryBlock: false,
      assets: null,
    });
    expect(result.embedded.signature).toBe(false);
    expect(result.embedded.seal).toBe(false);
  });
});
