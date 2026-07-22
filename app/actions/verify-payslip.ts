'use server';

/**
 * Public authorised-slip verification lookup.
 * Resolves payroll_issued_documents by secure token; returns controlled fields only.
 * Logs one verification_hits row per successful resolution (fire-and-forget).
 */

import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { coarseUserAgent } from '@/lib/coarse-user-agent';
import { financialYearLabel } from '@/lib/authorised-slip-policy';
import { formatAttendanceCycleRange } from '@/lib/payroll-cycle';
import { formatSalaryAttendanceCycle } from '@/lib/format';
import {
  mapDocumentStatusToPublic,
  maskEmployeeId,
  type PublicVerificationPayload,
} from '@/lib/verification';
import { LEGAL_COMPANY_NAME_CANONICAL } from '@/lib/constants/company';

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

  const checkedAtIso = new Date().toISOString();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payroll_issued_documents')
      .select(
        'id, document_number, document_status, revision_number, salary_month, attendance_period_start, attendance_period_end, actual_credit_date, issue_date, issued_at, net_salary, verification_fingerprint, public_verification_id, snapshot_json, payroll_record_id',
      )
      .eq('public_verification_id', id)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP')
      .maybeSingle();

    if (error) {
      return { ok: false, error: 'Verification service unavailable.', code: 'UNAVAILABLE' };
    }
    if (!data) {
      return {
        ok: false,
        error: 'No authorised slip found for this verification ID.',
        code: 'NOT_FOUND',
      };
    }

    const row = data as {
      id: string;
      document_number: string;
      document_status: string;
      revision_number: number | null;
      salary_month: string;
      attendance_period_start: string | null;
      attendance_period_end: string | null;
      actual_credit_date: string | null;
      issue_date: string | null;
      issued_at: string | null;
      net_salary: number | null;
      verification_fingerprint: string | null;
      public_verification_id: string;
      snapshot_json: Record<string, unknown> | null;
      payroll_record_id: string;
    };

    const snapshot = (row.snapshot_json ?? {}) as Record<string, unknown>;
    const employee = (snapshot.employee ?? {}) as Record<string, unknown>;
    const company = (snapshot.company ?? {}) as Record<string, unknown>;

    const salaryMonth = String(row.salary_month ?? '');
    const attendanceStart = row.attendance_period_start
      ? String(row.attendance_period_start)
      : null;
    const attendanceEnd = row.attendance_period_end
      ? String(row.attendance_period_end)
      : null;
    const attendanceCycle =
      attendanceStart && attendanceEnd
        ? formatAttendanceCycleRange(attendanceStart, attendanceEnd)
        : salaryMonth
          ? formatSalaryAttendanceCycle(salaryMonth)
          : '—';

    const fullName = String(employee.fullName ?? '—').trim() || '—';
    const empId = String(employee.empId ?? '');
    const companyLegalName = String(
      company.legalName ?? LEGAL_COMPANY_NAME_CANONICAL,
    );
    const companyCin = company.cin ? String(company.cin) : null;

    // Local logo path only — never a third-party or signed storage URL on this page.
    const entityCode = String(employee.entityCode ?? 'PX');
    const companyLogoUrl = `/logos/${
      entityCode === 'PB'
        ? 'portfolio-builders'
        : entityCode === 'PT'
          ? 'portfolix-tech'
          : entityCode === 'PH'
            ? 'portfolix-hub'
            : 'portfolix-entreprise'
    }.png`;

    const issuedDocumentId = String(row.id);
    const status = mapDocumentStatusToPublic(String(row.document_status));

    // Fire-and-forget: logging failure must never affect the clerk's page.
    void logVerificationHit(issuedDocumentId).catch(() => undefined);

    return {
      ok: true,
      data: {
        companyLegalName,
        companyCin,
        companyLogoUrl,
        payslipNumber: String(row.document_number ?? '—'),
        employeeDisplayName: fullName,
        maskedEmployeeId: maskEmployeeId(empId),
        salaryMonth,
        financialYear: salaryMonth ? `FY ${financialYearLabel(salaryMonth)}` : '—',
        attendanceCycle,
        payrollFinalisedAt: (() => {
          const fromSnap = snapshot.payrollFinalisedAt;
          if (typeof fromSnap === 'string' && fromSnap.trim()) return fromSnap.trim().slice(0, 10);
          return null;
        })(),
        actualCreditDate: row.actual_credit_date ? String(row.actual_credit_date) : null,
        netSalary: row.net_salary != null ? Number(row.net_salary) : null,
        documentStatus: status,
        revisionNumber: Number(row.revision_number ?? 1),
        issueDate: row.issue_date ? String(row.issue_date) : null,
        verificationFingerprint: row.verification_fingerprint
          ? String(row.verification_fingerprint)
          : null,
        publicVerificationId: id,
        issuedDocumentId,
        checkedAtIso,
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

async function logVerificationHit(issuedDocumentId: string): Promise<void> {
  try {
    const hdrs = headers();
    const ua = coarseUserAgent(hdrs.get('user-agent'));
    const supabase = await createClient();
    await supabase.from('verification_hits').insert({
      issued_document_id: issuedDocumentId,
      coarse_user_agent: ua,
    });
  } catch {
    // Swallow — public verify must never fail because of logging.
  }
}
