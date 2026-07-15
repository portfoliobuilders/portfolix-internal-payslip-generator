'use server';

import { createClient } from '@/utils/supabase/server';
import {
  mapDocumentStatusToPublic,
  maskEmployeeId,
  privacyControlledName,
  type PublicVerificationStatus,
} from '@/lib/verification';

export interface PublicPayslipVerification {
  status: PublicVerificationStatus;
  companyLegalName: string;
  companyLogoUrl: string | null;
  payslipNumber: string;
  employeeDisplayName: string;
  maskedEmployeeId: string;
  salaryMonth: string;
  actualCreditDate: string | null;
  netSalary: number | null;
  documentStatus: string;
  revisionNumber: number;
  issueDate: string | null;
  verificationFingerprint: string | null;
}

export type VerificationResult =
  | { ok: true; data: PublicPayslipVerification }
  | { ok: false; error: string; status: PublicVerificationStatus | 'NOT_FOUND' };

/**
 * Public verification lookup — returns only controlled fields.
 * Never exposes PAN, bank, UTR, evidence, audit, or residential address.
 */
export async function fetchPublicPayslipVerification(
  publicVerificationId: string,
): Promise<VerificationResult> {
  try {
    if (!publicVerificationId || publicVerificationId.length < 32) {
      return { ok: false, error: 'Invalid verification identifier.', status: 'NOT_FOUND' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('public_verification_id', publicVerificationId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message, status: 'NOT_FOUND' };
    if (!data) {
      return { ok: false, error: 'No document found for this verification ID.', status: 'NOT_FOUND' };
    }

    const snapshot = (data.snapshot_json ?? {}) as Record<string, unknown>;
    const employee = (snapshot.employee ?? {}) as Record<string, unknown>;
    const company = (snapshot.company ?? {}) as Record<string, unknown>;

    const publicStatus = mapDocumentStatusToPublic(String(data.document_status));

    return {
      ok: true,
      data: {
        status: publicStatus,
        companyLegalName: String(
          company.legalName ?? 'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
        ),
        companyLogoUrl: null, // signed URL resolved separately when needed — never raw permanent storage URL
        payslipNumber: String(data.document_number),
        employeeDisplayName: privacyControlledName(String(employee.fullName ?? 'Employee')),
        maskedEmployeeId: maskEmployeeId(String(employee.empId ?? '****')),
        salaryMonth: String(data.salary_month),
        actualCreditDate: data.actual_credit_date
          ? String(data.actual_credit_date)
          : null,
        netSalary:
          data.net_salary != null ? Number(data.net_salary) : null,
        documentStatus: String(data.document_status),
        revisionNumber: Number(data.revision_number ?? 1),
        issueDate: data.issue_date ? String(data.issue_date) : null,
        verificationFingerprint: data.verification_fingerprint
          ? String(data.verification_fingerprint)
          : null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Verification failed.',
      status: 'NOT_FOUND',
    };
  }
}
