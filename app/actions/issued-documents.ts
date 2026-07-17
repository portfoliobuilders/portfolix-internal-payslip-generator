'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildVerificationFingerprint,
  buildVerificationUrl,
  generatePublicVerificationId,
} from '@/lib/verification';
import type { SlipSnapshot } from '@/lib/types';
import {
  createServiceRoleClient,
} from '@/utils/supabase/service-role';
import { ISSUED_DOCUMENTS_BUCKET } from '@/lib/signatory-assets';

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
  pdfStoragePath?: string | null;
}

/**
 * Register an issued AUTHORISED salary slip with a secure verification ID.
 * Does not fabricate payment state — caller must pass PAID gate first.
 * Reprints reuse the existing ISSUED document (never invent a second active authorised slip).
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
  signatureAssetPath?: string | null;
  sealAssetPath?: string | null;
  authorisationMode?: string | null;
}): Promise<ActionResult<IssuedAuthorisedDocument>> {
  try {
    if (!input.actualCreditDate) {
      return {
        ok: false,
        error: 'Actual salary-credit date is required for authorised slip issuance.',
      };
    }
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
          pdfStoragePath: existing.pdf_storage_path
            ? String(existing.pdf_storage_path)
            : null,
        },
      };
    }

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
      signature_asset_path: input.signatureAssetPath ?? null,
      seal_asset_path: input.sealAssetPath ?? null,
      authorisation_mode: input.authorisationMode ?? 'SIGNATURE_AND_SEAL',
      snapshot_json: {
        employee: {
          fullName: input.snapshot.employee.fullName,
          empId: input.snapshot.employee.empId,
        },
        company: {
          legalName: input.legalCompanyName,
          cin: input.cin ?? null,
        },
        signatory: {
          name: input.signatoryName ?? null,
          designation: input.signatoryDesignation ?? null,
          signatureAssetPath: input.signatureAssetPath ?? null,
          sealAssetPath: input.sealAssetPath ?? null,
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
        reused: false,
        pdfStoragePath: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to issue authorised document.',
    };
  }
}

/** Persist immutable PDF path + asset hashes after generation. */
export async function attachIssuedPdfArtifact(input: {
  documentNumber: string;
  pdfStoragePath: string | null;
  contentHash: string;
  signatureAssetPath?: string | null;
  sealAssetPath?: string | null;
  signatureAssetHash?: string | null;
  sealAssetHash?: string | null;
  authorisationMode?: string | null;
}): Promise<ActionResult<{ updated: true }>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('payroll_issued_documents')
      .update({
        pdf_storage_path: input.pdfStoragePath,
        content_hash: input.contentHash,
        signature_asset_path: input.signatureAssetPath ?? null,
        seal_asset_path: input.sealAssetPath ?? null,
        signature_asset_hash: input.signatureAssetHash ?? null,
        seal_asset_hash: input.sealAssetHash ?? null,
        authorisation_mode: input.authorisationMode ?? null,
      })
      .eq('document_number', input.documentNumber)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP');

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { updated: true } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to attach issued PDF artifact.',
    };
  }
}

/** Download the frozen issued PDF bytes (service role). Never returns a public URL. */
export async function fetchIssuedAuthorisedPdf(
  documentNumber: string,
): Promise<ActionResult<{ pdfBytes: Uint8Array | null; pdfStoragePath: string | null }>> {
  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from('payroll_issued_documents')
      .select('pdf_storage_path')
      .eq('document_number', documentNumber)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    const path = row?.pdf_storage_path ? String(row.pdf_storage_path) : null;
    if (!path) return { ok: true, data: { pdfBytes: null, pdfStoragePath: null } };

    const service = createServiceRoleClient();
    if (!service) {
      return { ok: true, data: { pdfBytes: null, pdfStoragePath: path } };
    }

    const { data: blob, error: dlError } = await service.storage
      .from(ISSUED_DOCUMENTS_BUCKET)
      .download(path);

    if (dlError || !blob) {
      return { ok: true, data: { pdfBytes: null, pdfStoragePath: path } };
    }

    const pdfBytes = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, data: { pdfBytes, pdfStoragePath: path } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch issued PDF.',
    };
  }
}
