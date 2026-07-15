/**
 * Public payslip verification helpers.
 * Verification IDs must be cryptographically unpredictable (not sequential).
 */

import { createHash, randomBytes } from 'crypto';

export function generatePublicVerificationId(): string {
  // 32 bytes → 64 hex chars; URL-safe enough for /verify/payslip/[id]
  return randomBytes(32).toString('hex');
}

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
  const trimmed = empId.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
}

export function privacyControlledName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return `${parts[0]![0] ?? '*'}***`;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last[0] ?? '*'}.`;
}

export type PublicVerificationStatus = 'VALID' | 'SUPERSEDED' | 'REVOKED' | 'CANCELLED';

export function mapDocumentStatusToPublic(
  status: string,
): PublicVerificationStatus {
  switch (status) {
    case 'ISSUED':
    case 'AUTHORISED_ISSUED':
      return 'VALID';
    case 'SUPERSEDED':
      return 'SUPERSEDED';
    case 'REVOKED':
      return 'REVOKED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'CANCELLED';
  }
}

export function buildVerificationUrl(
  baseUrl: string,
  publicVerificationId: string,
): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/verify/payslip/${publicVerificationId}`;
}
