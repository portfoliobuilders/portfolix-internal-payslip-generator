'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildVerificationFingerprint,
  buildVerificationUrl,
  generateAuthorisedPayslipNumber,
  generatePublicVerificationId,
} from '@/lib/verification';
import type { SlipSnapshot } from '@/lib/types';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface IssuedAuthorisedDocument {
  documentNumber: string;
  publicVerificationId: string;
  verificationUrl: string;
  verificationFingerprint: string;
  revisionNumber: number;
  reused: boolean;
  issueDate: string;
}

/**
 * Register an issued AUTHORISED salary slip with a secure verification ID.
 * Reprints reuse the existing ISSUED document (never invent a second active number).
 * Payslip number is generated ONCE via generateAuthorisedPayslipNumber and stored.
 */
export async function issueAuthorisedSalarySlipDocument(input: {
  snapshot: SlipSnapshot;
  obligationId?: string | null;
  netSalary: number;
  /** Ledger credit date only — null when scheduled. */
  actualCreditDate: string | null;
  legalCompanyName: string;
  cin?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  verificationBaseUrl: string;
  issuedBy?: string;
  revisionNumber?: number;
  /** Snapshot/log date — never wall-clock at render. */
  issueDate?: string;
}): Promise<ActionResult<IssuedAuthorisedDocument>> {
  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('payroll_record_id', input.snapshot.id)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    if (existing) {
      const publicVerificationId = String(existing.public_verification_id);
      return {
        ok: true,
        data: {
          documentNumber: String(existing.document_number),
          publicVerificationId,
          verificationUrl: buildVerificationUrl(
            input.verificationBaseUrl,
            publicVerificationId,
          ),
          verificationFingerprint: existing.verification_fingerprint
            ? String(existing.verification_fingerprint)
            : '',
          revisionNumber: Number(existing.revision_number ?? 1),
          reused: true,
          issueDate: String(
            existing.issue_date ??
              input.issueDate ??
              input.snapshot.generatedAt.slice(0, 10),
          ),
        },
      };
    }

    const publicVerificationId = generatePublicVerificationId();
    const revisionNumber =
      input.revisionNumber ?? input.snapshot.revisionNumber ?? 1;
    const documentNumber = generateAuthorisedPayslipNumber(
      input.snapshot.employee.empId,
      input.snapshot.monthYear,
    );
    const fingerprint = buildVerificationFingerprint({
      documentNumber,
      publicVerificationId,
      salaryMonth: input.snapshot.monthYear,
      netSalary: input.netSalary,
      actualCreditDate: input.actualCreditDate,
      revisionNumber,
    });
    const issueDate =
      input.issueDate ??
      input.snapshot.generatedAt.slice(0, 10);

    const { error } = await supabase.from('payroll_issued_documents').insert({
      payroll_record_id: input.snapshot.id,
      obligation_id: input.obligationId ?? null,
      document_type: 'AUTHORISED_SALARY_SLIP',
      document_number: documentNumber,
      revision_number: revisionNumber,
      document_status: 'ISSUED',
      public_verification_id: publicVerificationId,
      verification_fingerprint: fingerprint,
      salary_month: input.snapshot.monthYear,
      attendance_period_start: input.snapshot.attendancePeriodStart ?? null,
      attendance_period_end: input.snapshot.attendancePeriodEnd ?? null,
      net_salary: input.netSalary,
      actual_credit_date: input.actualCreditDate,
      issue_date: issueDate,
      signatory_name: input.signatoryName ?? null,
      signatory_designation: input.signatoryDesignation ?? null,
      snapshot_json: {
        employee: {
          fullName: input.snapshot.employee.fullName,
          empId: input.snapshot.employee.empId,
        },
        company: {
          legalName: input.legalCompanyName,
          cin: input.cin ?? null,
        },
      },
      issued_by: input.issuedBy ?? 'system',
      issued_at: input.snapshot.generatedAt,
    });

    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      data: {
        documentNumber,
        publicVerificationId,
        verificationUrl: buildVerificationUrl(
          input.verificationBaseUrl,
          publicVerificationId,
        ),
        verificationFingerprint: fingerprint,
        revisionNumber,
        reused: false,
        issueDate,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to issue authorised document.',
    };
  }
}
