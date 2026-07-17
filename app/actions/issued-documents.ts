'use server';

import { requirePayrollAdmin } from '@/lib/auth';


import {
  createServiceRoleClient,
  SIGNATORY_SECRET_MISSING_MESSAGE,
} from '@/utils/supabase/service-role';
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

function requireServiceClient(): ActionResult<
  NonNullable<ReturnType<typeof createServiceRoleClient>>
> {
  const client = createServiceRoleClient();
  if (!client) {
    return {
      ok: false,
      error:
        SIGNATORY_SECRET_MISSING_MESSAGE +
        ' Authorised slip registry requires SUPABASE_SECRET_KEY.',
    };
  }
  return { ok: true, data: client };
}

/**
 * Register an issued AUTHORISED salary slip with a secure verification ID.
 * Reprints reuse the existing ISSUED document for this payroll_record_id.
 * On payroll supersede (new slip id, same ASL number): mark prior ISSUED as
 * SUPERSEDED and insert a new ISSUED row with revision_number + 1.
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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const service = requireServiceClient();
    if (!service.ok) return service;
    const supabase = service.data;

    const documentNumber = generateAuthorisedPayslipNumber(
      input.snapshot.employee.empId,
      input.snapshot.monthYear,
    );
    const issueDate =
      input.issueDate ?? input.snapshot.generatedAt.slice(0, 10);

    // 1) Reuse active ISSUED for this exact payroll slip (reprint).
    const { data: existingForSlip } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('payroll_record_id', input.snapshot.id)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    if (existingForSlip) {
      const publicVerificationId = String(existingForSlip.public_verification_id);
      return {
        ok: true,
        data: {
          documentNumber: String(existingForSlip.document_number),
          publicVerificationId,
          verificationUrl: buildVerificationUrl(
            input.verificationBaseUrl,
            publicVerificationId,
          ),
          verificationFingerprint: existingForSlip.verification_fingerprint
            ? String(existingForSlip.verification_fingerprint)
            : '',
          revisionNumber: Number(existingForSlip.revision_number ?? 1),
          reused: true,
          issueDate: String(existingForSlip.issue_date ?? issueDate),
        },
      };
    }

    // 2) Supersede any other active ISSUED row that already holds this ASL number
    //    (prior final for same employee+month after payroll supersede).
    const { data: priorActive } = await supabase
      .from('payroll_issued_documents')
      .select('id, revision_number, public_verification_id')
      .eq('document_number', documentNumber)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    let revisionNumber = input.revisionNumber ?? input.snapshot.revisionNumber ?? 1;
    let supersedesDocumentId: string | null = null;

    if (priorActive) {
      supersedesDocumentId = String(priorActive.id);
      revisionNumber = Math.max(
        Number(priorActive.revision_number ?? 1) + 1,
        revisionNumber,
      );
      const { error: supersedeError } = await supabase
        .from('payroll_issued_documents')
        .update({
          document_status: 'SUPERSEDED',
          correction_reason: 'Superseded by newer authorised salary slip revision.',
        })
        .eq('id', priorActive.id)
        .eq('document_status', 'ISSUED');
      if (supersedeError) return { ok: false, error: supersedeError.message };
    }

    const publicVerificationId = generatePublicVerificationId();
    const fingerprint = buildVerificationFingerprint({
      documentNumber,
      publicVerificationId,
      salaryMonth: input.snapshot.monthYear,
      netSalary: input.netSalary,
      actualCreditDate: input.actualCreditDate,
      revisionNumber,
    });

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
      supersedes_document_id: supersedesDocumentId,
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
