/**
 * Authorised slip public verification helpers.
 * Uses cryptographically unpredictable verification IDs — never sequential.
 */

import { createHash, randomBytes } from 'crypto';

export type PublicVerificationStatus = 'VALID' | 'SUPERSEDED' | 'REVOKED' | 'CANCELLED';

export interface PublicVerificationPayload {
  companyLegalName: string;
  companyLogoUrl: string | null;
  payslipNumber: string;
  employeeDisplayName: string;
  maskedEmployeeId: string;
  salaryMonth: string;
  actualCreditDate: string | null;
  netSalary: number;
  documentStatus: PublicVerificationStatus;
  revisionNumber: number;
  issueDate: string;
  verificationFingerprint: string;
  publicVerificationId: string;
}

/** Unpredictable public verification id (URL-safe). ~32 chars, unguessable. */
export function generatePublicVerificationId(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Canonical authorised payslip number — ONE scheme for header, filename, and log.
 * Format: ASL-<EMPID>-<YYYY-MM>
 * Revision is stored/displayed separately; it increments only on supersede.
 */
export function generateAuthorisedPayslipNumber(
  empId: string,
  monthYear: string,
): string {
  const safeEmp = empId.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return `ASL-${safeEmp}-${monthYear}`;
}

export function computeVerificationFingerprint(parts: {
  payslipNumber: string;
  employeeId: string;
  salaryMonth: string;
  netSalary: number;
  revisionNumber: number;
  actualCreditDate: string | null;
}): string {
  const payload = [
    parts.payslipNumber,
    parts.employeeId,
    parts.salaryMonth,
    parts.netSalary.toFixed(2),
    String(parts.revisionNumber),
    parts.actualCreditDate ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Fingerprint used when issuing authorised documents (document-number keyed).
 * Retained alongside computeVerificationFingerprint for callers that already
 * include the public verification id in the hash payload.
 */
export function buildVerificationFingerprint(input: {
  documentNumber: string;
  publicVerificationId: string;
  salaryMonth: string;
  netSalary: number;
  actualCreditDate: string | null;
  revisionNumber: number;
}): string {
  const payload = [
    input.documentNumber,
    input.publicVerificationId,
    input.salaryMonth,
    input.netSalary.toFixed(2),
    input.actualCreditDate ?? '',
    String(input.revisionNumber),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function maskEmployeeId(empId: string): string {
  if (!empId || empId.length < 4) return '····';
  return `${empId.slice(0, 2)}····${empId.slice(-2)}`;
}

export function privacyControlledName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last.charAt(0)}.`;
}

export function mapDocumentStatusToPublic(
  status: string | null | undefined,
): PublicVerificationStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'ISSUED':
    case 'VALID':
      return 'VALID';
    case 'SUPERSEDED':
      return 'SUPERSEDED';
    case 'REVOKED':
      return 'REVOKED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'VALID';
  }
}

export function buildVerificationUrl(
  verificationDomain: string,
  publicVerificationId: string,
): string {
  const domain = verificationDomain.replace(/\/$/, '');
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  return `${base}/verify/payslip/${publicVerificationId}`;
}

/**
 * Authorised slip generation gates (server-side checklist).
 */
export function assertAuthorisedSlipReady(input: {
  attendanceCycleEnded: boolean;
  payrollFinalised: boolean;
  attendanceLocked: boolean;
  salaryReconciles: boolean;
  ytdReconciles: boolean;
  paymentStatus: string;
  confirmedPaidAmount: number;
  netSalary: number;
  outstandingAmount: number;
  actualCreditDate: string | null;
  employerIdentityConfirmed: boolean;
  documentNumber: string | null;
  verificationId: string | null;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (!input.attendanceCycleEnded) {
    return { ok: false, error: 'Attendance cycle has not ended.', code: 'CYCLE_NOT_ENDED' };
  }
  if (!input.payrollFinalised) {
    return { ok: false, error: 'Payroll is not finalised.', code: 'NOT_FINALISED' };
  }
  if (!input.attendanceLocked) {
    return { ok: false, error: 'Attendance is not locked.', code: 'ATTENDANCE_UNLOCKED' };
  }
  if (!input.salaryReconciles) {
    return { ok: false, error: 'Salary calculations do not reconcile.', code: 'SALARY_MISMATCH' };
  }
  if (!input.ytdReconciles) {
    return { ok: false, error: 'YTD values do not reconcile.', code: 'YTD_MISMATCH' };
  }
  if (input.paymentStatus !== 'PAID') {
    return {
      ok: false,
      error: 'Authorised slip requires payment status PAID.',
      code: 'NOT_PAID',
    };
  }
  if (input.outstandingAmount !== 0) {
    return { ok: false, error: 'Outstanding balance must be zero.', code: 'OUTSTANDING' };
  }
  if (Math.abs(input.confirmedPaidAmount - input.netSalary) > 0.009) {
    return {
      ok: false,
      error: 'Confirmed paid amount must equal payroll net salary.',
      code: 'PAID_AMOUNT_MISMATCH',
    };
  }
  if (!input.actualCreditDate) {
    return { ok: false, error: 'Actual salary-credit date is required.', code: 'NO_CREDIT_DATE' };
  }
  if (!input.employerIdentityConfirmed) {
    return { ok: false, error: 'Employer identity is not confirmed.', code: 'IDENTITY' };
  }
  if (!input.documentNumber) {
    return { ok: false, error: 'Document number is required.', code: 'NO_DOC_NUMBER' };
  }
  if (!input.verificationId) {
    return { ok: false, error: 'Verification ID is required.', code: 'NO_VERIFICATION_ID' };
  }
  return { ok: true };
}
