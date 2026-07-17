import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { buildBankReadyAuthorisedPdf } from '../authorised-pdf-layout';
import {
  assertExtractedTextClean,
  companyIdentityGate,
  resolvePayableDays,
  validateAuthorisedChronology,
} from '../authorised-slip-policy';
import { formatRegisteredAddress, wrapRegisteredAddress } from '../company-address';
import { buildVerificationQrPng } from '../qr-png';
import type { AuthorisedSlipYtd, EntityInfo, SlipSnapshot } from '../types';

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);

const snapshot: SlipSnapshot = {
  id: 'slip-1',
  employeeId: 'employee-1',
  monthYear: '2026-04',
  status: 'final',
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
    compensationAmount: 50000,
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
  flexBalanceAfter: 0,
  generatedAt: '2026-04-26T10:00:00.000Z',
  attendancePeriodStart: '2026-03-25',
  attendancePeriodEnd: '2026-04-24',
  payrollDivisor: 25,
  employee: {
    fullName: 'Tinu Rani A S',
    empId: 'PX-OPS-2512-005',
    entityCode: 'PX',
    department: 'Operations',
    designation: 'Senior Operations and Client Delivery Specialist',
    joiningDate: '2024-01-15',
    employeeAddress: '',
    paymentMode: 'Bank Transfer',
    engagementType: 'regular_employee',
    employmentStatus: 'active',
    paymentType: 'salary',
    compensationAmount: 50000,
    bankName: 'HDFC Bank',
    bankDetailsVerified: true,
    bankLast4: '5931',
    panMasked: 'ABXXXXXX1F',
  },
};

const ytd: AuthorisedSlipYtd = {
  basic: 50000,
  fixedAllowance: 0,
  variablePaid: 0,
  grossEarnings: 50000,
  lopDeduction: 0,
  professionalTax: 0,
  tds: 0,
  otherDeductions: 0,
  totalDeductions: 0,
};

const entity: EntityInfo = {
  name: 'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
  legalLine: '',
  addressLines: [],
  contact: '7994721792',
  logoDataUrl: null,
  cin: 'U72900KL2024PTC123456',
  registeredAddress:
    '1st Floor,, Portfolix Hub,  43/3906 B2, Puthiya Road, Thammanam P.O., Kochi, Ernakulam, Kerala – 682032, India.',
  phone: '7994721792',
  payrollEmail: 'payroll@portfolixentreprise.com',
  signatoryName: 'Athul Anil',
  signatoryDesignation: 'Director',
  signatureAssetPath: 'px/signatures/sig.png',
  sealAssetPath: 'px/seals/seal.png',
};

describe('authorised bank-readiness policy', () => {
  it('formats legal address without truncation or duplicate punctuation', () => {
    const formatted = formatRegisteredAddress(entity.registeredAddress);
    expect(formatted).not.toContain(',,');
    expect(formatted).not.toContain('...');
    expect(wrapRegisteredAddress(formatted).join(' ')).toContain('Kerala – 682032');
  });

  it('enforces chronology and derives payable days', () => {
    expect(resolvePayableDays(snapshot)).toBe(25);
    expect(
      validateAuthorisedChronology({
        attendancePeriodEnd: '2026-04-24',
        payrollFinalisedAt: '2026-04-26',
        actualCreditDate: '2026-05-03',
        issueDate: '2026-07-17',
        today: '2026-07-17',
      }).ok,
    ).toBe(true);
    expect(
      validateAuthorisedChronology({
        attendancePeriodEnd: '2026-04-24',
        payrollFinalisedAt: '2026-04-20',
        actualCreditDate: '2026-05-03',
        issueDate: '2026-07-17',
      }).ok,
    ).toBe(false);
  });

  it('blocks generic signatory and placeholders', () => {
    expect(companyIdentityGate(entity)).toBeNull();
    expect(
      companyIdentityGate({ ...entity, signatoryName: 'Authorized Signatory' }),
    ).toContain('real person');
    expect(companyIdentityGate({ ...entity, cin: 'SET-IN-SETTINGS' })).toContain('CIN');
  });
});

describe('bank-ready authorised PDF', () => {
  it('is one-page A4, searchable, aligned, embedded and clean', async () => {
    const verificationUrl = 'https://payroll.portfolixentreprise.com/verify/payslip/ver_secure_123';
    const qrPng = await buildVerificationQrPng(verificationUrl);
    const result = await buildBankReadyAuthorisedPdf({
      legalCompanyName: entity.name,
      cin: entity.cin,
      registeredAddress: entity.registeredAddress,
      payrollEmail: entity.payrollEmail,
      verificationPhone: entity.phone,
      employeeName: snapshot.employee.fullName,
      employeeId: snapshot.employee.empId,
      salaryMonth: snapshot.monthYear,
      attendancePeriodStart: '2026-03-25',
      attendancePeriodEnd: '2026-04-24',
      payrollFinalisedAt: '2026-04-26',
      issueDate: '2026-07-17',
      netSalary: 50000,
      documentNumber: 'ASL-PX-OPS-2512-005-2026-04',
      revisionNumber: 1,
      actualCreditDate: '2026-05-03',
      confirmedPaidAmount: 50000,
      outstandingAmount: 0,
      paymentMode: 'Bank Transfer',
      bankName: 'HDFC Bank',
      bankLast4: '5931',
      payableDays: 25,
      lopDays: 0,
      department: 'Operations',
      designation: snapshot.employee.designation,
      joiningDate: snapshot.employee.joiningDate,
      panMasked: snapshot.employee.panMasked,
      verificationId: 'ver_secure_123',
      verificationUrl,
      signatoryName: 'Athul Anil',
      signatoryDesignation: 'Director',
      snapshot,
      ytd,
      qrPng,
      assets: {
        signature: {
          bytes: PNG,
          mimeType: 'image/png',
          storagePath: 'signature.png',
          contentHash: 'sig',
        },
        seal: {
          bytes: PNG,
          mimeType: 'image/png',
          storagePath: 'seal.png',
          contentHash: 'seal',
        },
      },
    });

    const loaded = await PDFDocument.load(result.bytes);
    if (process.env.WRITE_AUTHORISED_SAMPLE === '1') {
      await mkdir('artifacts', { recursive: true });
      await writeFile('artifacts/authorised-salary-slip-sample.pdf', result.bytes);
    }
    expect(loaded.getPageCount()).toBe(1);
    const size = loaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(595.28, 1);
    expect(size.height).toBeCloseTo(841.89, 1);
    expect(result.bytes.byteLength).toBeLessThan(1_000_000);
    expect(result.extractedText).toContain('₹50,000.00');
    expect(result.extractedText).toContain('HDFC Bank');
    expect(result.extractedText).toContain('Payable Days');
    expect(result.extractedText).toContain('Actual Credit Date');
    expect(result.extractedText).not.toContain('ABCD1234E');
    expect(result.embedded).toEqual({ signature: true, seal: true });
    expect(assertExtractedTextClean(result.extractedText).ok).toBe(true);

    // PDF coordinates increase upward: divider must remain above title bounds.
    expect(result.geometry.headerDividerY).toBeGreaterThan(result.geometry.titleTopY);
    expect(result.geometry.titleTopY).toBeGreaterThan(result.geometry.titleBottomY);
    expect(result.geometry.headerDividerY - result.geometry.titleTopY).toBeGreaterThanOrEqual(10);
  });
});
