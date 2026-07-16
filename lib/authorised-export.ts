/**
 * Shared AUTHORISED SALARY SLIP path — ONE pdf-lib producer for preview,
 * download, print, and History bank copy. Never fabricates payment data.
 */

import { issueAuthorisedSalarySlipDocument } from '@/app/actions/issued-documents';
import { assertAuthorisedSlipPaymentGate } from '@/app/actions/salary-payment';
import { downloadPdfBytes } from '@/lib/download-pdf';
import { authorisedSlipFilename, dateInMonth } from '@/lib/format';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
} from '@/lib/payroll-cycle';
import { lopCalculationBasisDisplayText } from '@/lib/calculation-method';
import { buildVectorPayslipPdf } from '@/lib/pdf-vector';
import { computeAuthorisedYtd } from '@/lib/authorised-slip';
import type { AuthorisedSlipYtd, EntityInfo, Settings, SlipSnapshot } from '@/lib/types';
import { format, parse } from 'date-fns';

export interface AuthorisedPdfBundle {
  bytes: Uint8Array;
  documentNumber: string;
  publicVerificationId: string;
  verificationUrl: string;
  revisionNumber: number;
  filename: string;
  sizeBytes: number;
  /** True when a payment-ledger credit date is present. */
  hasActualCredit: boolean;
  actualCreditDate: string | null;
  scheduledCreditDate: string | null;
  paymentStatus: string | null;
  confirmedPaidAmount: number | null;
  outstandingAmount: number | null;
  issueDate: string;
  extractedText: string;
}

function resolveAttendance(snapshot: SlipSnapshot): {
  start: string;
  end: string;
} {
  if (snapshot.attendancePeriodStart && snapshot.attendancePeriodEnd) {
    return {
      start: snapshot.attendancePeriodStart,
      end: snapshot.attendancePeriodEnd,
    };
  }
  const period = computeAttendancePeriod({
    salaryMonth: snapshot.salaryMonth ?? snapshot.monthYear,
    method: DEFAULT_PAYROLL_CYCLE_METHOD,
  });
  return {
    start: period.attendancePeriodStart,
    end: period.attendancePeriodEnd,
  };
}

function verificationBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://portfolix-internal-payslip-generato.vercel.app';
}

/** Payday of the following month — scheduled credit, never "today". */
export function scheduledCreditDateFor(
  monthYear: string,
  paydayDayOfMonth: number,
): string {
  const base = parse(monthYear, 'yyyy-MM', new Date());
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const credit = dateInMonth(nextKey, paydayDayOfMonth);
  return format(credit, 'yyyy-MM-dd');
}

async function fetchBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function logoPublicPath(entityCode: string): string {
  const map: Record<string, string> = {
    PX: '/logos/portfolix-entreprise.png',
    PB: '/logos/portfolio-builders.png',
    PT: '/logos/portfolix-tech.png',
    PH: '/logos/portfolix-hub.png',
  };
  return map[entityCode] ?? '/logos/portfolix-entreprise.png';
}

/**
 * Build the canonical authorised PDF bytes (no download side-effect).
 * Payment band / actual-credit lines render only from ledger data.
 */
export async function buildAuthorisedSalarySlipPdf(input: {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  ytd: AuthorisedSlipYtd;
  paydayDayOfMonth: number;
  signatureUrl?: string | null;
  sealUrl?: string | null;
  /** When false, skip registry write (tests). Default true. */
  registerDocument?: boolean;
  history?: SlipSnapshot[];
}): Promise<
  | { ok: true; data: AuthorisedPdfBundle }
  | { ok: false; error: string }
> {
  const attendance = resolveAttendance(input.snapshot);
  const scheduledCreditDate = scheduledCreditDateFor(
    input.snapshot.monthYear,
    input.paydayDayOfMonth,
  );

  // Soft payment lookup — never invent Paid / credit dates.
  let actualCreditDate: string | null =
    input.snapshot.actualCreditDate?.slice(0, 10) ?? null;
  let confirmedPaidAmount: number | null =
    input.snapshot.confirmedPaidAmount ?? null;
  let outstandingAmount: number | null =
    input.snapshot.outstandingAmount ?? null;
  let paymentStatus: string | null = input.snapshot.paymentStatus ?? null;
  let obligationId: string | null = null;
  let netSalary = input.snapshot.computed.netPay;

  const paymentGate = await assertAuthorisedSlipPaymentGate(input.snapshot.id);
  if (paymentGate.ok) {
    actualCreditDate = paymentGate.data.actualCreditDate;
    confirmedPaidAmount = paymentGate.data.confirmedPaidAmount;
    outstandingAmount = paymentGate.data.outstandingAmount;
    paymentStatus = paymentGate.data.paymentStatus;
    obligationId = paymentGate.data.obligationId;
    netSalary = paymentGate.data.netSalaryPayable;
  }

  const hasActualCredit = Boolean(actualCreditDate);
  const showPaymentBand = hasActualCredit && paymentStatus != null;
  const revisionNumber = input.snapshot.revisionNumber ?? 1;
  const issueDate = (
    input.snapshot.generatedAt || '2020-01-01T00:00:00.000Z'
  ).slice(0, 10);

  let documentNumber: string;
  let publicVerificationId: string;
  let verificationUrl: string;
  let resolvedRevision = revisionNumber;

  {
    const {
      generateAuthorisedPayslipNumber,
      generatePublicVerificationId,
      buildVerificationUrl,
    } = await import('@/lib/verification');

    documentNumber = generateAuthorisedPayslipNumber(
      input.snapshot.employee.empId,
      input.snapshot.monthYear,
    );
    // Deterministic offline id (UUID hex) so preview/download hashes match when
    // the registry is unavailable; production path overwrites with randomBytes id.
    publicVerificationId =
      input.snapshot.id.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
    verificationUrl = buildVerificationUrl(verificationBaseUrl(), publicVerificationId);

    if (input.registerDocument !== false) {
      const issued = await issueAuthorisedSalarySlipDocument({
        snapshot: {
          ...input.snapshot,
          attendancePeriodStart: attendance.start,
          attendancePeriodEnd: attendance.end,
        },
        obligationId,
        netSalary,
        actualCreditDate,
        legalCompanyName: input.entity.name,
        cin: input.entity.cin,
        signatoryName: input.entity.signatoryName,
        signatoryDesignation: input.entity.signatoryDesignation,
        verificationBaseUrl: verificationBaseUrl(),
        issuedBy: 'hr-export',
        revisionNumber,
        issueDate,
      });
      if (issued.ok) {
        documentNumber = issued.data.documentNumber;
        publicVerificationId = issued.data.publicVerificationId;
        verificationUrl = issued.data.verificationUrl;
        resolvedRevision = issued.data.revisionNumber;
      }
      // Registry failure (e.g. missing Supabase) still yields a local PDF for preview;
      // download logging may fail separately — never invent payment facts.
    } else {
      // Explicit test/offline path — keep deterministic id; avoid unused import lint.
      void generatePublicVerificationId;
    }
  }

  const [signatureBytes, sealBytes, logoBytes] = await Promise.all([
    fetchBytes(input.signatureUrl),
    fetchBytes(input.sealUrl),
    input.entity.logoDataUrl
      ? fetchBytes(input.entity.logoDataUrl)
      : fetchBytes(logoPublicPath(input.snapshot.employee.entityCode)),
  ]);

  const ytd =
    input.ytd ??
    computeAuthorisedYtd(
      input.history ?? [input.snapshot],
      input.snapshot.employeeId,
      input.snapshot.monthYear,
    );

  const pdf = await buildVectorPayslipPdf({
    documentType: 'AUTHORISED_SALARY_SLIP',
    legalCompanyName: input.entity.name,
    employeeName: input.snapshot.employee.fullName,
    employeeId: input.snapshot.employee.empId,
    salaryMonth: input.snapshot.monthYear,
    attendancePeriodStart: attendance.start,
    attendancePeriodEnd: attendance.end,
    netSalary,
    documentNumber,
    paymentStatus: showPaymentBand
      ? paymentStatus === 'PAID'
        ? 'Paid'
        : paymentStatus ?? 'Scheduled'
      : 'Scheduled',
    verificationId: publicVerificationId,
    verificationUrl,
    actualCreditDate,
    scheduledCreditDate,
    confirmedPaidAmount: showPaymentBand ? confirmedPaidAmount : null,
    outstandingAmount: showPaymentBand ? outstandingAmount : null,
    showPaymentBand,
    cin: input.entity.cin,
    issueDate,
    payrollFinalisedDate: input.snapshot.generatedAt,
    snapshot: input.snapshot,
    entity: input.entity,
    ytd,
    revisionNumber: resolvedRevision,
    paymentMode: input.snapshot.employee.paymentMode,
    signatureBytes,
    sealBytes,
    logoBytes,
    lopDivisorLabel:
      input.snapshot.calculationMethodLabel ??
      lopCalculationBasisDisplayText(
        input.snapshot.calculationMethodCode ?? 'FIXED_25_DAY_DIVISOR',
      ),
  });

  const filename = authorisedSlipFilename(
    input.snapshot.monthYear,
    input.snapshot.employee.empId,
    documentNumber,
  );

  return {
    ok: true,
    data: {
      bytes: pdf.bytes,
      documentNumber,
      publicVerificationId,
      verificationUrl,
      revisionNumber: resolvedRevision,
      filename,
      sizeBytes: pdf.sizeBytes,
      hasActualCredit,
      actualCreditDate,
      scheduledCreditDate,
      paymentStatus: showPaymentBand ? paymentStatus : null,
      confirmedPaidAmount: showPaymentBand ? confirmedPaidAmount : null,
      outstandingAmount: showPaymentBand ? outstandingAmount : null,
      issueDate,
      extractedText: pdf.extractedText,
    },
  };
}

/**
 * Gate-tolerant download: builds the same PDF blob used for preview.
 */
export async function exportAuthorisedSalarySlipPdf(input: {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  ytd: AuthorisedSlipYtd;
  paydayDayOfMonth: number;
  signatureUrl?: string | null;
  sealUrl?: string | null;
  /** Optional pre-built bundle — download MUST use the same bytes as preview. */
  bundle?: AuthorisedPdfBundle | null;
}): Promise<
  | { ok: true; data: AuthorisedPdfBundle }
  | { ok: false; error: string }
> {
  if (input.bundle) {
    downloadPdfBytes(input.bundle.bytes, input.bundle.filename);
    return { ok: true, data: input.bundle };
  }

  const built = await buildAuthorisedSalarySlipPdf({
    snapshot: input.snapshot,
    entity: input.entity,
    ytd: input.ytd,
    paydayDayOfMonth: input.paydayDayOfMonth,
    signatureUrl: input.signatureUrl,
    sealUrl: input.sealUrl,
  });
  if (!built.ok) return built;
  downloadPdfBytes(built.data.bytes, built.data.filename);
  return built;
}

/** Settings helper for callers that already hold full settings. */
export function paydayFromSettings(settings: Settings): number {
  return settings.paydayDayOfMonth;
}
