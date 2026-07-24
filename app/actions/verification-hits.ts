'use server';

/**
 * Employer-side verification hit summaries for History.
 * Never imported by the public verify page.
 */

import { requirePayrollAdmin } from '@/lib/auth';
import { createClient } from '@/utils/supabase/server';
import { toUserFacingDbError } from '@/lib/supabase-errors';

export interface VerificationHitRow {
  id: string;
  hitAt: string;
  coarseUserAgent: string;
}

export interface VerificationHitSummary {
  issuedDocumentId: string;
  payrollRecordId: string;
  count: number;
  lastHitAt: string | null;
  hits: VerificationHitRow[];
}

export type VerificationHitsResult =
  | { ok: true; data: Record<string, VerificationHitSummary> }
  | { ok: false; error: string };

/**
 * Batch-load verification hit summaries keyed by payroll_record_id.
 * Requires payroll admin — public verify never calls this.
 */
export async function fetchVerificationHitSummaries(
  payrollRecordIds: string[],
): Promise<VerificationHitsResult> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;

  const ids = [...new Set(payrollRecordIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: true, data: {} };

  try {
    const supabase = await createClient();
    const { data: docs, error: docsError } = await supabase
      .from('payroll_issued_documents')
      .select('id, payroll_record_id')
      .in('payroll_record_id', ids)
      .eq('document_type', 'AUTHORISED_SALARY_SLIP');

    if (docsError) {
      return {
        ok: false,
        error: toUserFacingDbError(docsError, 'Failed to load issued documents.', 'verification-hits'),
      };
    }
    if (!docs || docs.length === 0) return { ok: true, data: {} };

    const docIds = docs.map((d) => String(d.id));
    const payrollByDoc = new Map(
      docs.map((d) => [String(d.id), String(d.payroll_record_id)]),
    );

    const { data: hits, error: hitsError } = await supabase
      .from('verification_hits')
      .select('id, issued_document_id, hit_at, coarse_user_agent')
      .in('issued_document_id', docIds)
      .order('hit_at', { ascending: false });

    if (hitsError) {
      return {
        ok: false,
        error: toUserFacingDbError(hitsError, 'Failed to load verification hits.', 'verification-hits'),
      };
    }

    const byPayroll: Record<string, VerificationHitSummary> = {};

    for (const doc of docs) {
      const payrollRecordId = String(doc.payroll_record_id);
      const issuedDocumentId = String(doc.id);
      if (!byPayroll[payrollRecordId]) {
        byPayroll[payrollRecordId] = {
          issuedDocumentId,
          payrollRecordId,
          count: 0,
          lastHitAt: null,
          hits: [],
        };
      }
    }

    for (const hit of hits ?? []) {
      const issuedDocumentId = String(hit.issued_document_id);
      const payrollRecordId = payrollByDoc.get(issuedDocumentId);
      if (!payrollRecordId) continue;
      const summary = byPayroll[payrollRecordId];
      if (!summary) continue;
      const row: VerificationHitRow = {
        id: String(hit.id),
        hitAt: String(hit.hit_at),
        coarseUserAgent: String(hit.coarse_user_agent ?? 'Unknown'),
      };
      summary.hits.push(row);
      summary.count += 1;
      if (!summary.lastHitAt || row.hitAt > summary.lastHitAt) {
        summary.lastHitAt = row.hitAt;
      }
    }

    return { ok: true, data: byPayroll };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load verification hits.',
    };
  }
}
