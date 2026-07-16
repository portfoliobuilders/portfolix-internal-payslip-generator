import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { authorisedSlipFilename } from '../format';
import {
  buildAuthorisedSalarySlipPdf,
  scheduledCreditDateFor,
} from '../authorised-export';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
} from '../payroll-cycle';
import { buildVectorPayslipPdf } from '../pdf-vector';
import { assertDocumentAllowed } from '../salary-payment';
import { generateAuthorisedPayslipNumber } from '../verification';
import type { AuthorisedSlipYtd, EntityInfo, SlipSnapshot } from '../types';

const entity: EntityInfo = {
  name: 'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
  legalLine: '',
  addressLines: ['Kochi, Kerala'],
  contact: 'payroll@portfolix.in',
  cin: 'U72900KL2024PTC123456',
  registeredAddress: 'Kochi, Kerala',
  phone: '+91 484 000 0000',
  payrollEmail: 'payroll@portfolix.in',
  signatoryName: 'Authorized Signatory',
  signatoryDesignation: 'HR & Payroll',
  signatureAssetPath: null,
  sealAssetPath: null,
  logoDataUrl: null,
};

function sampleSnapshot(overrides: Partial<SlipSnapshot> = {}): SlipSnapshot {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    employeeId: 'emp-1',
    monthYear: '2026-07',
    status: 'final',
    generatedAt: '2026-07-28T10:00:00.000Z',
    flexBalanceAfter: 0,
    inputs: {
      baseSalary: 40000,
      compensationAmount: 40000,
      flexBankBalanceBefore: 0,
      flexMinutesEarned: 0,
      lateMinutes: 0,
      absentDays: 0,
      halfDays: 0,
      fixedAllowance: 10000,
      otherDeductions: 0,
      tdsMonthly: 0,
      ptThisMonth: 0,
      variableLabel: '',
      variableEarned: 0,
      variablePaid: 0,
      deferredOpening: 0,
      committedPayoutDate: null,
      remarks: '',
    },
    computed: {
      perDayRate: 1600,
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
      empId: 'PX-2024-001',
      fullName: 'Tinu Rani A S',
      designation: 'Operations Lead',
      department: 'Ops',
      joiningDate: '2024-01-15',
      employeeAddress: '',
      panMasked: 'ABCDE****F',
      bankLast4: '1234',
      paymentMode: 'Bank Transfer',
      entityCode: 'PX',
      paymentType: 'salary',
      engagementType: 'regular_employee',
      employmentStatus: 'active',
      compensationAmount: 40000,
    },
    attendancePeriodStart: '2026-06-25',
    attendancePeriodEnd: '2026-07-24',
    revisionNumber: 1,
    ...overrides,
  };
}

const ytd: AuthorisedSlipYtd = {
  basic: 40000,
  fixedAllowance: 10000,
  variablePaid: 0,
  grossEarnings: 50000,
  lopDeduction: 0,
  professionalTax: 0,
  tds: 0,
  otherDeductions: 0,
  totalDeductions: 0,
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('authorised export wiring helpers', () => {
  it('filename uses monthYear + empId + persisted document number', () => {
    const doc = generateAuthorisedPayslipNumber('PX-2024-001', '2026-07');
    const name = authorisedSlipFilename('2026-07', 'PX-2024-001', doc);
    expect(name).toContain('2026-07');
    expect(name).toContain('PX-2024-001');
    expect(name).toContain('ASL-PX-2024-001-2026-07');
    expect(name).not.toMatch(/^PX_AuthorisedSalarySlip_PX_/);
  });

  it('canonical payslip number is ASL-<EMPID>-<YYYY-MM>', () => {
    expect(generateAuthorisedPayslipNumber('PX-2024-001', '2026-07')).toBe(
      'ASL-PX-2024-001-2026-07',
    );
  });

  it('scheduled credit is payday of the following month', () => {
    expect(scheduledCreditDateFor('2026-07', 5)).toBe('2026-08-05');
  });

  it('default attendance cycle is used when snapshot lacks period fields', () => {
    const period = computeAttendancePeriod({
      salaryMonth: '2026-07',
      method: DEFAULT_PAYROLL_CYCLE_METHOD,
    });
    expect(period.attendancePeriodStart).toBe('2026-06-25');
    expect(period.attendancePeriodEnd).toBe('2026-07-24');
  });

  it('authorised gate rejects unpaid statuses for bank-issued eligibility', () => {
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

  it('full authorised PDF includes letterhead, tables, ₹, words, scheduled credit', async () => {
    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: entity.name,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'ASL-PX-2024-001-2026-07',
      paymentStatus: 'Scheduled',
      verificationId: 'b'.repeat(32),
      verificationUrl: 'https://example.com/verify/payslip/' + 'b'.repeat(32),
      actualCreditDate: null,
      scheduledCreditDate: '2026-08-05',
      issueDate: '2026-07-28',
      payrollFinalisedDate: '2026-07-28T10:00:00.000Z',
      snapshot: sampleSnapshot(),
      entity,
      ytd,
      revisionNumber: 1,
      showPaymentBand: false,
    });

    expect(result.extractedText).toContain('PORTFOLIX ENTREPRISE PRIVATE LIMITED');
    expect(result.extractedText).toContain('Kochi, Kerala');
    expect(result.extractedText).toContain('ASL-PX-2024-001-2026-07');
    expect(result.extractedText).toContain('EARNINGS');
    expect(result.extractedText).toContain('DEDUCTIONS');
    expect(result.extractedText).toContain('₹50,000.00');
    expect(result.extractedText).toContain('Rupees Fifty Thousand Only');
    expect(result.extractedText).toContain('Scheduled credit: 05 Aug 2026');
    expect(result.extractedText).not.toContain('Actual salary-credit date');
    expect(result.extractedText).toContain('Verification ID');
    expect(result.sizeBytes).toBeLessThan(1_000_000);
  });

  it('paid ledger shows actual credit + payment band', async () => {
    const result = await buildVectorPayslipPdf({
      documentType: 'AUTHORISED_SALARY_SLIP',
      legalCompanyName: entity.name,
      employeeName: 'Tinu Rani A S',
      employeeId: 'PX-2024-001',
      salaryMonth: '2026-07',
      attendancePeriodStart: '2026-06-25',
      attendancePeriodEnd: '2026-07-24',
      netSalary: 50000,
      documentNumber: 'ASL-PX-2024-001-2026-07',
      paymentStatus: 'Paid',
      verificationId: 'c'.repeat(32),
      verificationUrl: 'https://example.com/verify/payslip/' + 'c'.repeat(32),
      actualCreditDate: '2026-08-05',
      issueDate: '2026-07-28',
      payrollFinalisedDate: '2026-07-28T10:00:00.000Z',
      snapshot: sampleSnapshot({ actualCreditDate: '2026-08-05' }),
      entity,
      ytd,
      revisionNumber: 1,
      showPaymentBand: true,
      confirmedPaidAmount: 50000,
      outstandingAmount: 0,
    });

    expect(result.extractedText).toContain('Actual salary-credit date: 05 Aug 2026');
    expect(result.extractedText).toContain('Payment status Paid');
    expect(result.extractedText).toContain('Confirmed paid ₹50,000.00');
  });

  it('same inputs produce identical PDF byte hashes (preview === download)', async () => {
    const snap = sampleSnapshot();
    const a = await buildAuthorisedSalarySlipPdf({
      snapshot: snap,
      entity,
      ytd,
      paydayDayOfMonth: 5,
      registerDocument: false,
    });
    const b = await buildAuthorisedSalarySlipPdf({
      snapshot: snap,
      entity,
      ytd,
      paydayDayOfMonth: 5,
      registerDocument: false,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(sha256(a.data.bytes)).toBe(sha256(b.data.bytes));
    expect(a.data.documentNumber).toBe('ASL-PX-2024-001-2026-07');
    expect(a.data.filename).toContain(a.data.documentNumber);
    expect(a.data.extractedText).toContain('Scheduled credit');
  });
});
