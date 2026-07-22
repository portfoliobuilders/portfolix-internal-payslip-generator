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
import {
  authorisedDocumentNumber,
  legacyAuthorisedDocumentNumber,
} from '@/lib/payroll-lifecycle';
import { toUserFacingDbError } from '@/lib/supabase-errors';
import { resolveSessionActor } from '@/lib/session-actor';

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

type IssuedDocRow = {
  id: string;
  document_number: string;
  public_verification_id: string;
  verification_fingerprint: string | null;
  revision_number: number | null;
  pdf_storage_path: string | null;
  document_status: string;
  payroll_record_id: string;
  salary_month: string | null;
};

function toIssuedResult(
  row: IssuedDocRow,
  verificationBaseUrl: string,
  reused: boolean,
): IssuedAuthorisedDocument {
  const publicVerificationId = String(row.public_verification_id);
  return {
    documentNumber: String(row.document_number),
    publicVerificationId,
    verificationUrl: buildVerificationUrl(verificationBaseUrl, publicVerificationId),
    verificationFingerprint: row.verification_fingerprint
      ? String(row.verification_fingerprint)
      : '',
    revisionNumber: Number(row.revision_number ?? 1),
    reused,
    pdfStoragePath: row.pdf_storage_path ? String(row.pdf_storage_path) : null,
  };
}

/**
 * Register an issued AUTHORISED salary slip with a secure verification ID.
 *
 * Idempotency:
 * 1. If an ISSUED doc already exists for this payroll_record_id → return it.
 * 2. If an ISSUED doc exists for the same employee+month on a prior (superseded)
 *    final → mark it SUPERSEDED and issue Rev N+1 for the current final.
 * 3. Unique document_number is the last-line guard; on collision, reopen existing.
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
    if (input.snapshot.status !== 'final') {
      return {
        ok: false,
        error: 'Bank copy can only be issued for the active final payroll record.',
      };
    }

    const supabase = await createClient();
    const actor = await resolveSessionActor();
    const issuedBy =
      input.issuedBy && input.issuedBy !== 'system' && input.issuedBy !== 'hr-export'
        ? input.issuedBy
        : actor.ok
          ? actor.actor.userId
          : 'system';

    // 1) Same final → reprint
    const { data: existingForFinal } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('payroll_record_id', input.snapshot.id)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    if (existingForFinal) {
      return {
        ok: true,
        data: toIssuedResult(existingForFinal as IssuedDocRow, input.verificationBaseUrl, true),
      };
    }

    // 2) Prior ISSUED for same employee+month (superseded final) → Rev N+1
    //    Document numbers must be unique across ALL statuses (UNIQUE constraint),
    //    so each revision gets a distinct PX-AUTH-…-Rn id. Legacy ASL-* rows are
    //    included so supersede does not collide with historical numbers.
    const empId = input.snapshot.employee.empId;
    const monthYear = input.snapshot.monthYear;
    const legacyAslNumber = legacyAuthorisedDocumentNumber(empId, monthYear);

    let maxRevision = 0;
    const priorById = new Map<string, IssuedDocRow>();

    const { data: schemeRows } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .like('document_number', `PX-AUTH-${monthYear}-${empId}-R%`)
      .in('document_status', ['ISSUED', 'SUPERSEDED']);

    for (const row of (schemeRows ?? []) as IssuedDocRow[]) {
      priorById.set(row.id, row);
      maxRevision = Math.max(maxRevision, Number(row.revision_number ?? 1));
    }

    const { data: legacyRows } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_number', legacyAslNumber)
      .in('document_status', ['ISSUED', 'SUPERSEDED']);

    for (const row of (legacyRows ?? []) as IssuedDocRow[]) {
      priorById.set(row.id, row);
      maxRevision = Math.max(maxRevision, Number(row.revision_number ?? 1));
    }

    // Also catch ISSUED rows for this salary month whose number embeds this empId
    // (covers ambiguous / mixed historical formats).
    const { data: monthIssuedRows } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .eq('salary_month', monthYear);

    for (const row of (monthIssuedRows ?? []) as IssuedDocRow[]) {
      const num = String(row.document_number ?? '');
      const matchesEmp =
        num.includes(`-${empId}-`) ||
        num.includes(`-${empId.toUpperCase()}-`) ||
        num === legacyAslNumber;
      if (!matchesEmp) continue;
      priorById.set(row.id, row);
      maxRevision = Math.max(maxRevision, Number(row.revision_number ?? 1));
    }

    const activePriors = [...priorById.values()].filter(
      (r) => r.document_status === 'ISSUED' && r.payroll_record_id !== input.snapshot.id,
    );

    for (const prior of activePriors) {
      await supabase
        .from('payroll_issued_documents')
        .update({ document_status: 'SUPERSEDED' })
        .eq('id', prior.id);

      await supabase.from('payroll_audit_logs').insert({
        action: 'AUTHORISED_DOCUMENT_SUPERSEDED',
        entity_type: 'payroll_issued_document',
        entity_id: prior.id,
        reason: `Superseded by new revision for final ${input.snapshot.id}`,
        actor_user_id: issuedBy,
        new_values: {
          document_status: 'SUPERSEDED',
          replaced_for_payroll_record_id: input.snapshot.id,
        },
      });
    }

    const priorToLink = activePriors[0] ?? null;
    const revisionNumber = maxRevision > 0 ? maxRevision + 1 : 1;
    const documentNumber = authorisedDocumentNumber(monthYear, empId, revisionNumber);
    const publicVerificationId = generatePublicVerificationId();
    const fingerprint = buildVerificationFingerprint({
      documentNumber,
      publicVerificationId,
      salaryMonth: monthYear,
      netSalary: input.netSalary,
      actualCreditDate: input.actualCreditDate,
      revisionNumber,
    });
    const issueDate = new Date().toISOString().slice(0, 10);

    const { data: inserted, error } = await supabase
      .from('payroll_issued_documents')
      .insert({
        payroll_record_id: input.snapshot.id,
        obligation_id: input.obligationId ?? null,
        document_type: 'AUTHORISED_SALARY_SLIP',
        document_number: documentNumber,
        revision_number: revisionNumber,
        document_status: 'ISSUED',
        public_verification_id: publicVerificationId,
        verification_fingerprint: fingerprint,
        salary_month: monthYear,
        attendance_period_start: input.snapshot.attendancePeriodStart ?? null,
        attendance_period_end: input.snapshot.attendancePeriodEnd ?? null,
        net_salary: input.netSalary,
        actual_credit_date: input.actualCreditDate,
        issue_date: issueDate,
        supersedes_document_id: priorToLink?.id ?? null,
        signatory_name: input.signatoryName ?? null,
        signatory_designation: input.signatoryDesignation ?? null,
        signature_asset_path: input.signatureAssetPath ?? null,
        seal_asset_path: input.sealAssetPath ?? null,
        authorisation_mode: input.authorisationMode ?? 'SIGNATURE_AND_SEAL',
        snapshot_json: {
          employee: {
            fullName: input.snapshot.employee.fullName,
            empId: input.snapshot.employee.empId,
            entityCode: input.snapshot.employee.entityCode,
          },
          company: {
            legalName: input.legalCompanyName,
            cin: input.cin ?? null,
          },
          payrollFinalisedAt: input.snapshot.generatedAt ?? null,
          signatory: {
            name: input.signatoryName ?? null,
            designation: input.signatoryDesignation ?? null,
            signatureAssetPath: input.signatureAssetPath ?? null,
            sealAssetPath: input.sealAssetPath ?? null,
          },
        },
        issued_by: issuedBy,
        issued_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      // Last-line guard: unique collision → reopen ISSUED doc; never reuse SUPERSEDED.
      if (
        error.code === '23505' ||
        /document_number|payroll_issued_documents_document_number/i.test(error.message)
      ) {
        const { data: raced } = await supabase
          .from('payroll_issued_documents')
          .select('*')
          .eq('payroll_record_id', input.snapshot.id)
          .eq('document_type', 'AUTHORISED_SALARY_SLIP')
          .eq('document_status', 'ISSUED')
          .maybeSingle();
        if (raced) {
          return {
            ok: true,
            data: toIssuedResult(raced as IssuedDocRow, input.verificationBaseUrl, true),
          };
        }
        const { data: collided } = await supabase
          .from('payroll_issued_documents')
          .select('*')
          .eq('document_number', documentNumber)
          .eq('document_type', 'AUTHORISED_SALARY_SLIP')
          .eq('document_status', 'ISSUED')
          .maybeSingle();
        if (collided) {
          return {
            ok: true,
            data: toIssuedResult(collided as IssuedDocRow, input.verificationBaseUrl, true),
          };
        }
        return {
          ok: false,
          error: toUserFacingDbError(
            error,
            "This month's bank copy already exists — refresh and open History to reprint.",
            'issued-documents',
          ),
        };
      }
      return {
        ok: false,
        error: toUserFacingDbError(error, 'Failed to register issued document.', 'issued-documents'),
      };
    }

    await supabase
      .from('payroll_slips')
      .update({ authorised_document_status: 'ISSUED' })
      .eq('id', input.snapshot.id);

    return {
      ok: true,
      data: toIssuedResult(
        (inserted ?? {
          document_number: documentNumber,
          public_verification_id: publicVerificationId,
          verification_fingerprint: fingerprint,
          revision_number: revisionNumber,
          pdf_storage_path: null,
          document_status: 'ISSUED',
          payroll_record_id: input.snapshot.id,
          salary_month: monthYear,
          id: '',
        }) as IssuedDocRow,
        input.verificationBaseUrl,
        false,
      ),
    };
  } catch (err) {
    console.error('[issued-documents]', err);
    return {
      ok: false,
      error: 'Failed to issue authorised document.',
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

    if (error) {
      return {
        ok: false,
        error: toUserFacingDbError(error, 'Failed to attach issued PDF.', 'issued-documents'),
      };
    }
    return { ok: true, data: { updated: true } };
  } catch (err) {
    console.error('[attachIssuedPdfArtifact]', err);
    return {
      ok: false,
      error: 'Failed to attach issued PDF artifact.',
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

    if (error) {
      return {
        ok: false,
        error: toUserFacingDbError(error, 'Failed to load issued PDF.', 'issued-documents'),
      };
    }
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
    console.error('[fetchIssuedAuthorisedPdf]', err);
    return {
      ok: false,
      error: 'Failed to fetch issued PDF.',
    };
  }
}

/**
 * Revoke an active ISSUED authorised document for a payroll record.
 * Unlocks Void on the underlying final. Document is kept (status REVOKED).
 */
export async function revokeAuthorisedDocument(input: {
  payrollRecordId: string;
  reason: string;
}): Promise<ActionResult<{ documentNumber: string }>> {
  try {
    const reason = input.reason?.trim();
    if (!reason) {
      return { ok: false, error: 'A reason is required to revoke an authorised document.' };
    }

    const actor = await resolveSessionActor();
    if (!actor.ok) return actor;

    const supabase = await createClient();
    const { data: doc, error } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('payroll_record_id', input.payrollRecordId)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: toUserFacingDbError(error, 'Failed to load authorised document.', 'revokeAuthorised'),
      };
    }
    if (!doc) {
      return { ok: false, error: 'No active authorised (bank copy) document found to revoke.' };
    }

    const { error: updError } = await supabase
      .from('payroll_issued_documents')
      .update({
        document_status: 'REVOKED',
        revoked_at: new Date().toISOString(),
        revoke_reason: reason,
      })
      .eq('id', (doc as IssuedDocRow).id);

    if (updError) {
      return {
        ok: false,
        error: toUserFacingDbError(updError, 'Failed to revoke authorised document.', 'revokeAuthorised'),
      };
    }

    await supabase
      .from('payroll_slips')
      .update({ authorised_document_status: 'REVOKED' })
      .eq('id', input.payrollRecordId);

    await supabase.from('payroll_audit_logs').insert({
      action: 'AUTHORISED_DOCUMENT_REVOKED',
      entity_type: 'payroll_issued_document',
      entity_id: (doc as IssuedDocRow).id,
      reason,
      actor_user_id: actor.actor.userId,
      new_values: {
        document_status: 'REVOKED',
        document_number: (doc as IssuedDocRow).document_number,
        payroll_record_id: input.payrollRecordId,
      },
    });

    return {
      ok: true,
      data: { documentNumber: String((doc as IssuedDocRow).document_number) },
    };
  } catch (err) {
    console.error('[revokeAuthorisedDocument]', err);
    return { ok: false, error: 'Failed to revoke authorised document.' };
  }
}

/** Active ISSUED authorised doc for a payroll record, if any. */
export async function fetchActiveAuthorisedDocument(
  payrollRecordId: string,
): Promise<ActionResult<IssuedAuthorisedDocument | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payroll_issued_documents')
      .select('*')
      .eq('payroll_record_id', payrollRecordId)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .eq('document_status', 'ISSUED')
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: toUserFacingDbError(error, 'Failed to load authorised document.', 'fetchActiveAuthorised'),
      };
    }
    if (!data) return { ok: true, data: null };
    return {
      ok: true,
      data: toIssuedResult(data as IssuedDocRow, '', false),
    };
  } catch (err) {
    console.error('[fetchActiveAuthorisedDocument]', err);
    return { ok: false, error: 'Failed to load authorised document.' };
  }
}
