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
import {
  assertNoSettingsPlaceholders,
  signatoryIncompleteReason,
} from '@/lib/settings-defaults';
import type { EntityInfo, Settings, SlipSnapshot } from '@/lib/types';
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

/**
 * Vercel *preview* hosts only (git-branch / deployment URLs).
 * Stable production `{project}.vercel.app` is allowed until a custom domain is set.
 * Live-print defect: QR pointed at …-git-8ac69a-….vercel.app which dies with the branch.
 */
export function isVercelPreviewAppUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (!host.endsWith('.vercel.app')) return false;
  // Branch previews always contain -git-
  if (host.includes('-git-')) return true;
  // Deployment previews: {project}-{deploymentId}-{team}.vercel.app
  // deploymentId is typically a long alphanumeric token (not a normal project-name word).
  const sub = host.slice(0, -'.vercel.app'.length);
  return /-[a-z0-9]{10,}-[a-z0-9-]+$/i.test(sub);
}

/**
 * Resolve the canonical app URL for QR / verification links.
 * Order: NEXT_PUBLIC_APP_URL → optional settings override.
 * Fail closed when unset — never invent a host (wrong QR / verify URLs).
 * Never use window.location.origin (preview deployments produce non-stable URLs).
 */
export function resolveCanonicalAppUrl(
  settingsOverride?: string | null,
): { ok: true; url: string } | { ok: false; error: string } {
  const fromEnv =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_URL : undefined) ?? '';
  const raw = (fromEnv || settingsOverride || '').trim();
  const url = raw.replace(/\/$/, '');
  if (!url) {
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_APP_URL is not set. Set it to your production domain (e.g. https://pay.yourcompany.com) before generating authorised slips.',
    };
  }
  if (isVercelPreviewAppUrl(url)) {
    return {
      ok: false,
      error: `Canonical app URL points at a Vercel preview host (${url}). Set NEXT_PUBLIC_APP_URL to your stable production domain — preview URLs expire and break QR verification.`,
    };
  }
  return { ok: true, url };
}

function verificationBaseUrl(): string {
  const resolved = resolveCanonicalAppUrl();
  if (resolved.ok) return resolved.url;
  throw new Error(resolved.error);
}

/** Deterministic host for unit tests that skip production guards. */
const TEST_VERIFICATION_BASE_URL = 'https://pay.example.test';

function resolveVerificationBaseUrl(skipGuards: boolean | undefined): string {
  if (skipGuards) {
    const resolved = resolveCanonicalAppUrl();
    return resolved.ok ? resolved.url : TEST_VERIFICATION_BASE_URL;
  }
  return verificationBaseUrl();
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
  paydayDayOfMonth: number;
  signatureUrl?: string | null;
  sealUrl?: string | null;
  /** When false, skip registry write (tests). Default true. */
  registerDocument?: boolean;
  /**
   * When true, skip guard checks (unit tests that do not inject real settings).
   * NEVER set this in production paths.
   */
  _skipGuards?: boolean;
}): Promise<
  | { ok: true; data: AuthorisedPdfBundle }
  | { ok: false; error: string }
> {
  // ---- Guards — fail-closed before touching registry or building PDF ----
  if (!input._skipGuards) {
    const placeholderError = assertNoSettingsPlaceholders(input.entity);
    if (placeholderError) return { ok: false, error: placeholderError };

    const sigError = signatoryIncompleteReason(input.entity);
    if (sigError) return { ok: false, error: sigError };

    const canonicalUrl = resolveCanonicalAppUrl();
    if (!canonicalUrl.ok) return { ok: false, error: canonicalUrl.error };
  }

  const attendance = resolveAttendance(input.snapshot);
  const scheduledCreditDate = scheduledCreditDateFor(
    input.snapshot.monthYear,
    input.paydayDayOfMonth,
  );

  // Payment facts ONLY from the payment ledger gate — never snapshot soft fields.
  // Face amount is always the immutable FINAL snapshot net (fingerprint uses the same).
  const netSalary = input.snapshot.computed.netPay;

  let actualCreditDate: string | null = null;
  let confirmedPaidAmount: number | null = null;
  let outstandingAmount: number | null = null;
  let paymentStatus: string | null = null;
  let obligationId: string | null = null;

  // Fail closed for every production path (registerDocument defaults to true).
  // Tests may set registerDocument: false to exercise PDF layout without a ledger.
  if (input.registerDocument !== false) {
    const paymentGate = await assertAuthorisedSlipPaymentGate(input.snapshot.id);
    if (!paymentGate.ok) {
      return { ok: false, error: paymentGate.error };
    }
    actualCreditDate = paymentGate.data.actualCreditDate;
    confirmedPaidAmount = paymentGate.data.confirmedPaidAmount;
    outstandingAmount = paymentGate.data.outstandingAmount;
    paymentStatus = paymentGate.data.paymentStatus;
    obligationId = paymentGate.data.obligationId;
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

  const {
    generateAuthorisedPayslipNumber,
    generatePublicVerificationId,
    buildVerificationUrl,
  } = await import('@/lib/verification');

  documentNumber = generateAuthorisedPayslipNumber(
    input.snapshot.employee.empId,
    input.snapshot.monthYear,
  );

  if (input.registerDocument !== false) {
    // Fail closed: no silent "issued" PDF with a dead verification URL.
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
      verificationBaseUrl: resolveVerificationBaseUrl(input._skipGuards),
      issuedBy: 'hr-export',
      revisionNumber,
      issueDate,
    });
    if (!issued.ok) return { ok: false, error: issued.error };
    documentNumber = issued.data.documentNumber;
    publicVerificationId = issued.data.publicVerificationId;
    verificationUrl = issued.data.verificationUrl;
    resolvedRevision = issued.data.revisionNumber;
  } else {
    // Explicit test path — deterministic id so preview/download hashes match.
    publicVerificationId =
      input.snapshot.id.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
    verificationUrl = buildVerificationUrl(
      resolveVerificationBaseUrl(input._skipGuards),
      publicVerificationId,
    );
    void generatePublicVerificationId;
  }

  const [signatureBytes, sealBytes, logoBytes] = await Promise.all([
    fetchBytes(input.signatureUrl),
    fetchBytes(input.sealUrl),
    input.entity.logoDataUrl
      ? fetchBytes(input.entity.logoDataUrl)
      : fetchBytes(logoPublicPath(input.snapshot.employee.entityCode)),
  ]);

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
