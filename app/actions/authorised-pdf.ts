'use server';

/**
 * Server-side AUTHORISED SALARY SLIP PDF generation.
 * Loads private signature/seal bytes via service role, embeds into pdf-lib,
 * and stores an immutable issued PDF for historical re-download.
 * Uses Node APIs (Buffer, crypto, pdf-lib) — not Edge-compatible.
 */

import { createHash } from 'node:crypto';
import { assertAuthorisedSlipPaymentGate } from '@/app/actions/salary-payment';
import { fetchAuthorisedSlipYtd } from '@/app/actions/payroll';
import {
  attachIssuedPdfArtifact,
  fetchIssuedAuthorisedPdf,
  issueAuthorisedSalarySlipDocument,
} from '@/app/actions/issued-documents';
import {
  CompanyAssetLoadError,
  loadPrivateCompanyImage,
  logAssetFailure,
  type LoadedImageAsset,
} from '@/lib/documents/load-company-asset';
import { authorisedSlipFilename } from '@/lib/format';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
} from '@/lib/payroll-cycle';
import { buildBankReadyAuthorisedPdf } from '@/lib/authorised-pdf-layout';
import {
  assertExtractedTextClean,
  companyIdentityGate,
  resolvePayableDays,
  validateAuthorisedChronology,
} from '@/lib/authorised-slip-policy';
import { buildVerificationQrPng } from '@/lib/qr-png';
import { signatoryIncompleteReason } from '@/lib/settings-defaults';
import type { EntityInfo, SlipSnapshot } from '@/lib/types';
import {
  createServiceRoleClient,
  isSignatoryStorageConfigured,
  SIGNATORY_SECRET_MISSING_MESSAGE,
} from '@/utils/supabase/service-role';
import { ISSUED_DOCUMENTS_BUCKET } from '@/lib/signatory-assets';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface AuthorisedPdfGenerationResult {
  documentNumber: string;
  publicVerificationId: string;
  verificationUrl: string;
  filename: string;
  sizeBytes: number;
  /** Base64 PDF for client download — never a storage URL. */
  pdfBase64: string;
  reusedImmutablePdf: boolean;
  embedded: { signature: boolean; seal: boolean };
}

function resolveAttendance(snapshot: SlipSnapshot): { start: string; end: string } {
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

async function loadSignatoryAssets(
  entity: EntityInfo,
  issueDate: string,
): Promise<
  | { ok: true; signature: LoadedImageAsset | null; seal: LoadedImageAsset | null }
  | { ok: false; error: string }
> {
  const mode = entity.authorisationMode ?? 'SIGNATURE_AND_SEAL';
  const incomplete = signatoryIncompleteReason(entity, issueDate);
  if (incomplete) return { ok: false, error: incomplete };

  if (mode === 'COMPUTER_GENERATED_VERIFICATION') {
    return { ok: true, signature: null, seal: null };
  }

  if (mode !== 'SIGNATURE_AND_SEAL') {
    return {
      ok: false,
      error:
        'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.',
    };
  }

  if (!isSignatoryStorageConfigured()) {
    return { ok: false, error: SIGNATORY_SECRET_MISSING_MESSAGE };
  }

  try {
    const [signature, seal] = await Promise.all([
      loadPrivateCompanyImage(entity.signatureAssetPath!, {
        assetType: 'signature',
        documentType: 'AUTHORISED_SALARY_SLIP',
        companyId: entity.name,
      }),
      loadPrivateCompanyImage(entity.sealAssetPath!, {
        assetType: 'seal',
        documentType: 'AUTHORISED_SALARY_SLIP',
        companyId: entity.name,
      }),
    ]);
    return { ok: true, signature, seal };
  } catch (err) {
    if (err instanceof CompanyAssetLoadError) {
      return {
        ok: false,
        error:
          'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.',
      };
    }
    logAssetFailure({
      documentType: 'AUTHORISED_SALARY_SLIP',
      companyId: entity.name,
      assetType: 'signature_or_seal',
      storagePath: entity.signatureAssetPath,
      category: 'STORAGE_OBJECT_NOT_FOUND',
      detail: err instanceof Error ? err.message : 'unknown',
    });
    return {
      ok: false,
      error:
        'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.',
    };
  }
}

async function storeImmutablePdf(input: {
  documentNumber: string;
  bytes: Uint8Array;
}): Promise<string | null> {
  const client = createServiceRoleClient();
  if (!client) return null;
  const path = `authorised/${input.documentNumber}.pdf`;
  const { error } = await client.storage.from(ISSUED_DOCUMENTS_BUCKET).upload(path, input.bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    // If object already exists (reprint race), keep existing path
    if (/already exists|Duplicate/i.test(error.message)) return path;
    console.error(
      JSON.stringify({
        event: 'issued_pdf_upload_failed',
        pathBasename: path.split('/').pop(),
        detail: error.message,
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }
  return path;
}

/**
 * Gate → load private assets → issue/reuse → build PDF with embedded images →
 * persist immutable PDF → return base64 for download.
 */
export async function generateAuthorisedSalarySlipPdfAction(input: {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  verificationBaseUrl: string;
}): Promise<ActionResult<AuthorisedPdfGenerationResult>> {
  try {
    const paymentGate = await assertAuthorisedSlipPaymentGate(input.snapshot.id);
    if (!paymentGate.ok) return { ok: false, error: paymentGate.error };

    const issueDate = new Date().toISOString().slice(0, 10);
    const attendance = resolveAttendance(input.snapshot);
    if (input.snapshot.status !== 'final') {
      return { ok: false, error: 'Payroll is not finalised.' };
    }
    const identityError = companyIdentityGate(input.entity);
    if (identityError) return { ok: false, error: identityError };
    if (!input.snapshot.employee.bankName?.trim()) {
      return { ok: false, error: 'Bank name is required for an authorised salary slip.' };
    }
    if (input.snapshot.employee.bankDetailsVerified !== true) {
      return { ok: false, error: 'Employee bank details must be verified by HR before issuance.' };
    }
    if (!/^\d{4}$/.test(input.snapshot.employee.bankLast4)) {
      return { ok: false, error: 'Verified masked bank account is required.' };
    }
    const payableDays = resolvePayableDays(input.snapshot);
    if (payableDays == null) {
      return { ok: false, error: 'Payable days could not be derived from the final payroll record.' };
    }
    const chronology = validateAuthorisedChronology({
      attendancePeriodEnd: attendance.end,
      payrollFinalisedAt: input.snapshot.generatedAt,
      issueDate,
      actualCreditDate: paymentGate.data.actualCreditDate,
    });
    if (!chronology.ok) return { ok: false, error: chronology.error };
    const ytdResult = await fetchAuthorisedSlipYtd(
      input.snapshot.employeeId,
      input.snapshot.monthYear,
    );
    if (!ytdResult.ok || !ytdResult.data) {
      return {
        ok: false,
        error: ytdResult.ok ? 'YTD could not be reconciled.' : ytdResult.error,
      };
    }

    const issued = await issueAuthorisedSalarySlipDocument({
      snapshot: {
        ...input.snapshot,
        attendancePeriodStart: attendance.start,
        attendancePeriodEnd: attendance.end,
      },
      obligationId: paymentGate.data.obligationId,
      netSalary: paymentGate.data.netSalaryPayable,
      actualCreditDate: paymentGate.data.actualCreditDate,
      legalCompanyName: input.entity.name,
      cin: input.entity.cin,
      signatoryName: input.entity.signatoryName,
      signatoryDesignation: input.entity.signatoryDesignation,
      verificationBaseUrl: input.verificationBaseUrl,
      issuedBy: 'hr-export',
      signatureAssetPath: input.entity.signatureAssetPath,
      sealAssetPath: input.entity.sealAssetPath,
      authorisationMode: input.entity.authorisationMode ?? 'SIGNATURE_AND_SEAL',
    });
    if (!issued.ok) return { ok: false, error: issued.error };

    const filename = authorisedSlipFilename(
      input.snapshot.monthYear,
      input.snapshot.employee.empId,
      issued.data.documentNumber,
    );

    // Historical re-download: return frozen PDF when available
    if (issued.data.reused) {
      const stored = await fetchIssuedAuthorisedPdf(issued.data.documentNumber);
      if (stored.ok && stored.data.pdfBytes) {
        return {
          ok: true,
          data: {
            documentNumber: issued.data.documentNumber,
            publicVerificationId: issued.data.publicVerificationId,
            verificationUrl: issued.data.verificationUrl,
            filename,
            sizeBytes: stored.data.pdfBytes.byteLength,
            pdfBase64: Buffer.from(stored.data.pdfBytes).toString('base64'),
            reusedImmutablePdf: true,
            embedded: { signature: true, seal: true },
          },
        };
      }
    }

    const assetsResult = await loadSignatoryAssets(input.entity, issueDate);
    if (!assetsResult.ok) return assetsResult;

    const mode = input.entity.authorisationMode ?? 'SIGNATURE_AND_SEAL';
    const drawSignatoryBlock = mode === 'SIGNATURE_AND_SEAL';

    const qrPng = await buildVerificationQrPng(issued.data.verificationUrl);
    const pdf = await buildBankReadyAuthorisedPdf({
      legalCompanyName: input.entity.name,
      cin: input.entity.cin,
      registeredAddress: input.entity.registeredAddress,
      payrollEmail: input.entity.payrollEmail,
      verificationPhone: input.entity.phone,
      employeeName: input.snapshot.employee.fullName,
      employeeId: input.snapshot.employee.empId,
      salaryMonth: input.snapshot.monthYear,
      attendancePeriodStart: attendance.start,
      attendancePeriodEnd: attendance.end,
      payrollFinalisedAt: input.snapshot.generatedAt,
      issueDate,
      netSalary: paymentGate.data.netSalaryPayable,
      documentNumber: issued.data.documentNumber,
      revisionNumber: issued.data.revisionNumber,
      verificationId: issued.data.publicVerificationId,
      verificationUrl: issued.data.verificationUrl,
      actualCreditDate: paymentGate.data.actualCreditDate,
      confirmedPaidAmount: paymentGate.data.confirmedPaidAmount,
      outstandingAmount: paymentGate.data.outstandingAmount,
      paymentMode: input.snapshot.employee.paymentMode,
      bankName: input.snapshot.employee.bankName,
      bankLast4: input.snapshot.employee.bankLast4,
      ifsc: input.snapshot.employee.ifsc,
      payableDays,
      lopDays: input.snapshot.computed.lopDays,
      department: input.snapshot.employee.department,
      designation: input.snapshot.employee.designation,
      joiningDate: input.snapshot.employee.joiningDate,
      panMasked: input.snapshot.employee.panMasked,
      signatoryName: input.entity.signatoryName,
      signatoryDesignation: input.entity.signatoryDesignation,
      snapshot: input.snapshot,
      ytd: ytdResult.data,
      qrPng,
      assets: {
        signature: assetsResult.signature,
        seal: assetsResult.seal,
      },
    });

    if (drawSignatoryBlock && (!pdf.embedded.signature || !pdf.embedded.seal)) {
      logAssetFailure({
        documentType: 'AUTHORISED_SALARY_SLIP',
        companyId: input.entity.name,
        assetType: !pdf.embedded.signature ? 'signature' : 'seal',
        storagePath: !pdf.embedded.signature
          ? input.entity.signatureAssetPath
          : input.entity.sealAssetPath,
        category: 'PDF_EMBED_FAILED',
      });
      return {
        ok: false,
        error:
          'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.',
      };
    }
    const cleanText = assertExtractedTextClean(pdf.extractedText);
    if (!cleanText.ok) {
      return {
        ok: false,
        error: `Authorised PDF contains forbidden content: ${cleanText.found.join(', ')}.`,
      };
    }
    if (pdf.bytes.byteLength > 1_000_000) {
      return { ok: false, error: 'Authorised PDF exceeds the 1 MB size limit.' };
    }

    const contentHash = createHash('sha256').update(pdf.bytes).digest('hex');
    const pdfPath = await storeImmutablePdf({
      documentNumber: issued.data.documentNumber,
      bytes: pdf.bytes,
    });

    await attachIssuedPdfArtifact({
      documentNumber: issued.data.documentNumber,
      pdfStoragePath: pdfPath,
      contentHash,
      signatureAssetPath: assetsResult.signature?.storagePath ?? input.entity.signatureAssetPath,
      sealAssetPath: assetsResult.seal?.storagePath ?? input.entity.sealAssetPath,
      signatureAssetHash: assetsResult.signature?.contentHash ?? null,
      sealAssetHash: assetsResult.seal?.contentHash ?? null,
      authorisationMode: mode,
    });

    return {
      ok: true,
      data: {
        documentNumber: issued.data.documentNumber,
        publicVerificationId: issued.data.publicVerificationId,
        verificationUrl: issued.data.verificationUrl,
        filename,
        sizeBytes: pdf.bytes.byteLength,
        pdfBase64: Buffer.from(pdf.bytes).toString('base64'),
        reusedImmutablePdf: false,
        embedded: pdf.embedded,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to generate authorised PDF.',
    };
  }
}
