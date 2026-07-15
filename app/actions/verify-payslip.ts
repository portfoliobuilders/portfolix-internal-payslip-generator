'use server';

/**
 * Public authorised-slip verification lookup.
 * Returns only controlled public fields — never PAN, bank, UTR, evidence, or audit.
 */

import { createClient } from '@/utils/supabase/server';
import {
  mapDocumentStatusToPublic,
  maskEmployeeId,
  privacyControlledName,
  type PublicVerificationPayload,
} from '@/lib/verification';
import { LEGAL_COMPANY_NAME_CANONICAL } from '@/lib/constants/company';
import type { EntityCode, EntityInfo } from '@/lib/types';
import { fetchSettings } from '@/app/actions/settings';

export type VerifyResult =
  | { ok: true; data: PublicVerificationPayload }
  | { ok: false; error: string; code: string };

export async function fetchPublicPayslipVerification(
  publicVerificationId: string,
): Promise<VerifyResult> {
  const id = publicVerificationId?.trim();
  if (!id || id.length < 16) {
    return { ok: false, error: 'Invalid verification identifier.', code: 'INVALID_ID' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payroll_slips')
      .select(
        'id, month_year, salary_month, details_json, authorised_document_status, authorised_document_number, revision_number, public_verification_id, verification_fingerprint, actual_credit_date, generated_at:details_json',
      )
      .eq('public_verification_id', id)
      .maybeSingle();

    if (error) {
      // Column may not exist until migration 012 — degrade gracefully
      return { ok: false, error: 'Verification service unavailable.', code: 'UNAVAILABLE' };
    }
    if (!data) {
      return { ok: false, error: 'No authorised slip found for this verification ID.', code: 'NOT_FOUND' };
    }

    const details = (data as { details_json?: Record<string, unknown> }).details_json ?? {};
    const employee = (details.employee as Record<string, unknown> | undefined) ?? {};
    const computed = (details.computed as Record<string, unknown> | undefined) ?? {};
    const status = mapDocumentStatusToPublic(
      (data as { authorised_document_status?: string }).authorised_document_status,
    );

    let companyLegalName = LEGAL_COMPANY_NAME_CANONICAL;
    let logoUrl: string | null = null;
    try {
      const settingsResult = await fetchSettings();
      if (settingsResult.ok) {
        const entityCode = (employee.entityCode as EntityCode) ?? 'PX';
        const entity = settingsResult.data.entities[entityCode] as EntityInfo | undefined;
        if (entity?.name && !entity.name.includes('SET-IN-SETTINGS')) {
          companyLegalName = entity.name;
        }
        if (entity) {
          logoUrl =
            entity.logoDataUrl?.trim() ||
            `/logos/${entityCode === 'PX' ? 'portfolix-entreprise' : entityCode === 'PB' ? 'portfolio-builders' : entityCode === 'PT' ? 'portfolix-tech' : 'portfolix-hub'}.png`;
        }
      }
    } catch {
      // keep canonical defaults
    }

    const salaryMonth =
      (data as { salary_month?: string }).salary_month ??
      (data as { month_year?: string }).month_year ??
      String(details.monthYear ?? '');

    const netSalary = Number(computed.netPay ?? 0);
    const fullName = String(employee.fullName ?? '—');
    const empId = String(employee.empId ?? '');

    return {
      ok: true,
      data: {
        companyLegalName,
        companyLogoUrl: logoUrl,
        payslipNumber:
          (data as { authorised_document_number?: string | null }).authorised_document_number ??
          '—',
        employeeDisplayName: privacyControlledName(fullName),
        maskedEmployeeId: maskEmployeeId(empId),
        salaryMonth,
        actualCreditDate: (data as { actual_credit_date?: string | null }).actual_credit_date ?? null,
        netSalary,
        documentStatus: status,
        revisionNumber: Number((data as { revision_number?: number }).revision_number ?? 1),
        issueDate: String(details.generatedAt ?? new Date().toISOString()),
        verificationFingerprint:
          (data as { verification_fingerprint?: string | null }).verification_fingerprint ?? '—',
        publicVerificationId: id,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Verification failed.',
      code: 'ERROR',
    };
  }
}
