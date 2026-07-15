'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildVerificationFingerprint,
  buildVerificationUrl,
  generatePublicVerificationId,
} from '@/lib/verification';
import type { SlipSnapshot } from '@/lib/types';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Register an issued AUTHORISED salary slip with a secure verification ID.
 * Does not fabricate payment state — caller must pass PAID gate first.
 */
export async function issueAuthorisedSalarySlipDocument(input: {
  snapshot: SlipSnapshot;
  obligationId?: string | null;
  netSalary: number;
  actualCreditDate: string;
  legalCompanyName: string;
  cin?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  verificationBaseUrl: string;
  issuedBy?: string;
}): Promise<
  ActionResult<{
    documentNumber: string;
    publicVerificationId: string;
    verificationUrl: string;
    verificationFingerprint: string;
    revisionNumber: number;
  }>
> {
  try {
    if (!input.actualCreditDate) {
      return { ok: false, error: 'Actual salary-credit date is required for authorised slip issuance.' };
    }
    const supabase = await createClient();
    const publicVerificationId = generatePublicVerificationId();
    const revisionNumber = input.snapshot.revisionNumber ?? 1;
    const documentNumber = `PX-AUTH-${input.snapshot.monthYear}-${input.snapshot.employee.empId}-R${revisionNumber}`;
    const fingerprint = buildVerificationFingerprint({
      documentNumber,
      publicVerificationId,
      salaryMonth: input.snapshot.monthYear,
      netSalary: input.netSalary,
      actualCreditDate: input.actualCreditDate,
      revisionNumber,
    });
    const issueDate = new Date().toISOString().slice(0, 10);

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
      issued_at: new Date().toISOString(),
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
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to issue authorised document.',
    };
  }
}
