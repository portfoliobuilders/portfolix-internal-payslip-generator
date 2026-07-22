'use server';

/**
 * Public authorised-slip verification lookup.
 * Service-role only — never exposes PAN, bank, UTR, net salary, or fingerprint.
 */

import {
  createServiceRoleClient,
  SIGNATORY_SECRET_MISSING_MESSAGE,
} from '@/utils/supabase/service-role';
import {
  mapDocumentStatusToPublic,
  privacyControlledName,
  type PublicVerificationStatus,
} from '@/lib/verification';

/** Minimal public payload — banks verify status, not full payroll. */
export interface PublicPayslipVerification {
  status: PublicVerificationStatus;
  companyLegalName: string;
  payslipNumber: string;
  employeeDisplayName: string;
  salaryMonth: string;
  documentStatus: string;
  revisionNumber: number;
  issueDate: string | null;
}

export type VerificationResult =
  | { ok: true; data: PublicPayslipVerification }
  | { ok: false; error: string; status: PublicVerificationStatus | 'NOT_FOUND' };

/**
 * Public verification lookup — returns only controlled fields.
 * Never exposes PAN, bank, UTR, evidence, audit, residential address,
 * net salary, credit date, masked employee id, or fingerprint.
 */
export async function fetchPublicPayslipVerification(
  publicVerificationId: string,
): Promise<VerificationResult> {
  try {
    if (!publicVerificationId || publicVerificationId.length < 32) {
      return { ok: false, error: 'Invalid verification identifier.', status: 'NOT_FOUND' };
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return {
        ok: false,
        error: SIGNATORY_SECRET_MISSING_MESSAGE,
        status: 'NOT_FOUND',
      };
    }

    const { data, error } = await supabase
      .from('payroll_issued_documents')
      .select(
        'document_number, document_status, revision_number, issue_date, salary_month, snapshot_json, public_verification_id',
      )
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
        payslipNumber: String(data.document_number),
        employeeDisplayName: privacyControlledName(String(employee.fullName ?? 'Employee')),
        salaryMonth: String(data.salary_month),
        documentStatus: String(data.document_status),
        revisionNumber: Number(data.revision_number ?? 1),
        issueDate: data.issue_date ? String(data.issue_date) : null,
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
