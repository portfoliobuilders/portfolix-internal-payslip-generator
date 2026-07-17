'use server';

import { requirePayrollAdmin } from '@/lib/auth';


/**
 * Salary-payment obligation + transaction server actions.
 * Domain rules live in lib/salary-payment.ts — this file persists them.
 */

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/app/actions/payroll';
import {
  assertDocumentAllowed,
  buildAuditEvent,
  buildInitiatedTransaction,
  confirmTransaction,
  createObligationFromFinalPayroll,
  markTransactionFailed,
  placeHoldOrDeferral,
  refreshObligationTotals,
  rescheduleExpectedPayment,
  reverseConfirmedTransaction,
  type ActorContext,
  type DocumentKind,
  type PaymentHoldOrDeferral,
  type PaymentHoldReasonCategory,
  type PaymentAuditEvent,
  type SalaryPaymentObligation,
  type SalaryPaymentTransaction,
} from '@/lib/salary-payment';
import { createClient } from '@/utils/supabase/server';

function revalidatePaymentViews() {
  revalidatePath('/history');
  revalidatePath('/generator');
}

// ── Row mappers ──────────────────────────────────────────────────────────────

interface ObligationRow {
  id: string;
  payroll_record_id: string;
  employee_id: string;
  month_year: string;
  net_salary_payable: number;
  payment_status: SalaryPaymentObligation['paymentStatus'];
  document_status: SalaryPaymentObligation['documentStatus'];
  original_statutory_due_date: string;
  original_due_date?: string | null;
  company_committed_date: string | null;
  scheduled_payment_date?: string | null;
  revised_expected_date: string | null;
  actual_final_credit_date: string | null;
  transfer_initiated_at?: string | null;
  processed_at?: string | null;
  final_settlement_date?: string | null;
  overdue_event_at: string | null;
  confirmed_paid_amount: number;
  outstanding_amount: number;
  last_payment_date: string | null;
  timeliness: SalaryPaymentObligation['timeliness'];
  exception_kind?: SalaryPaymentObligation['exceptionKind'];
  exception_reason?: string | null;
  exception_approval_reference?: string | null;
  exception_approved_by?: string | null;
  exception_approved_at?: string | null;
  exception_evidence_path?: string | null;
  tax_accounting_review_status?: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionRow {
  id: string;
  obligation_id: string;
  payroll_record_id: string;
  amount: number;
  payment_mode: string;
  initiated_at: string;
  processed_at: string | null;
  credited_at: string | null;
  source_bank_account_ref: string | null;
  masked_destination_account: string | null;
  bank_transaction_reference: string | null;
  transaction_status: SalaryPaymentTransaction['transactionStatus'];
  remarks: string | null;
  supporting_evidence_path: string | null;
  evidence_sha256: string | null;
  created_by: string;
  confirmed_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  reversal_of_transaction_id: string | null;
  reversal_reason: string | null;
  cancelled_at: string | null;
}

interface HoldRow {
  id: string;
  obligation_id: string;
  kind: 'ON_HOLD' | 'PAYMENT_DEFERRED';
  reason_category: PaymentHoldReasonCategory;
  detailed_explanation: string;
  amount_affected: number;
  revised_expected_date: string;
  approving_user: string;
  approval_timestamp: string;
  employee_notification_timestamp: string | null;
  evidence_path: string | null;
  compliance_review_flag: boolean;
  active: boolean;
  released_at: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  obligation_id: string;
  transaction_id: string | null;
  action: string;
  actor_user_id: string;
  reason: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  emergency_override: boolean;
  created_at: string;
}

function rowToObligation(row: ObligationRow): SalaryPaymentObligation {
  return {
    id: row.id,
    payrollRecordId: row.payroll_record_id,
    employeeId: row.employee_id,
    monthYear: row.month_year,
    netSalaryPayable: Number(row.net_salary_payable),
    paymentStatus: row.payment_status,
    documentStatus: row.document_status,
    originalStatutoryDueDate: row.original_statutory_due_date,
    originalDueDate: row.original_due_date ?? row.original_statutory_due_date,
    companyCommittedDate: row.company_committed_date,
    scheduledPaymentDate: row.scheduled_payment_date ?? row.company_committed_date,
    revisedExpectedDate: row.revised_expected_date,
    actualFinalCreditDate: row.actual_final_credit_date,
    transferInitiatedAt: row.transfer_initiated_at ?? null,
    processedAt: row.processed_at ?? null,
    finalSettlementDate: row.final_settlement_date ?? null,
    overdueEventAt: row.overdue_event_at,
    confirmedPaidAmount: Number(row.confirmed_paid_amount),
    outstandingAmount: Number(row.outstanding_amount),
    lastPaymentDate: row.last_payment_date,
    timeliness: row.timeliness,
    exceptionKind: row.exception_kind ?? null,
    exceptionReason: row.exception_reason ?? null,
    exceptionApprovalReference: row.exception_approval_reference ?? null,
    exceptionApprovedBy: row.exception_approved_by ?? null,
    exceptionApprovedAt: row.exception_approved_at ?? null,
    exceptionEvidencePath: row.exception_evidence_path ?? null,
    taxAccountingReviewStatus: row.tax_accounting_review_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function obligationToRow(o: SalaryPaymentObligation): ObligationRow {
  return {
    id: o.id,
    payroll_record_id: o.payrollRecordId,
    employee_id: o.employeeId,
    month_year: o.monthYear,
    net_salary_payable: o.netSalaryPayable,
    payment_status: o.paymentStatus,
    document_status: o.documentStatus,
    original_statutory_due_date: o.originalStatutoryDueDate,
    original_due_date: o.originalDueDate ?? o.originalStatutoryDueDate,
    company_committed_date: o.companyCommittedDate,
    scheduled_payment_date: o.scheduledPaymentDate ?? o.companyCommittedDate,
    revised_expected_date: o.revisedExpectedDate,
    actual_final_credit_date: o.actualFinalCreditDate,
    transfer_initiated_at: o.transferInitiatedAt ?? null,
    processed_at: o.processedAt ?? null,
    final_settlement_date: o.finalSettlementDate ?? null,
    overdue_event_at: o.overdueEventAt,
    confirmed_paid_amount: o.confirmedPaidAmount,
    outstanding_amount: o.outstandingAmount,
    last_payment_date: o.lastPaymentDate,
    timeliness: o.timeliness,
    exception_kind: o.exceptionKind ?? null,
    exception_reason: o.exceptionReason ?? null,
    exception_approval_reference: o.exceptionApprovalReference ?? null,
    exception_approved_by: o.exceptionApprovedBy ?? null,
    exception_approved_at: o.exceptionApprovedAt ?? null,
    exception_evidence_path: o.exceptionEvidencePath ?? null,
    tax_accounting_review_status: o.taxAccountingReviewStatus ?? null,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function rowToTransaction(row: TransactionRow): SalaryPaymentTransaction {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    payrollRecordId: row.payroll_record_id,
    amount: Number(row.amount),
    paymentMode: row.payment_mode,
    initiatedAt: row.initiated_at,
    processedAt: row.processed_at,
    creditedAt: row.credited_at,
    sourceBankAccountRef: row.source_bank_account_ref,
    maskedDestinationAccount: row.masked_destination_account,
    bankTransactionReference: row.bank_transaction_reference,
    transactionStatus: row.transaction_status,
    remarks: row.remarks,
    supportingEvidencePath: row.supporting_evidence_path,
    evidenceSha256: row.evidence_sha256,
    createdBy: row.created_by,
    confirmedBy: row.confirmed_by,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    reversalOfTransactionId: row.reversal_of_transaction_id,
    reversalReason: row.reversal_reason,
    cancelledAt: row.cancelled_at,
  };
}

function transactionToRow(t: SalaryPaymentTransaction): TransactionRow {
  return {
    id: t.id,
    obligation_id: t.obligationId,
    payroll_record_id: t.payrollRecordId,
    amount: t.amount,
    payment_mode: t.paymentMode,
    initiated_at: t.initiatedAt,
    processed_at: t.processedAt,
    credited_at: t.creditedAt,
    source_bank_account_ref: t.sourceBankAccountRef,
    masked_destination_account: t.maskedDestinationAccount,
    bank_transaction_reference: t.bankTransactionReference,
    transaction_status: t.transactionStatus,
    remarks: t.remarks,
    supporting_evidence_path: t.supportingEvidencePath,
    evidence_sha256: t.evidenceSha256,
    created_by: t.createdBy,
    confirmed_by: t.confirmedBy,
    created_at: t.createdAt,
    confirmed_at: t.confirmedAt,
    reversal_of_transaction_id: t.reversalOfTransactionId,
    reversal_reason: t.reversalReason,
    cancelled_at: t.cancelledAt,
  };
}

function rowToHold(row: HoldRow): PaymentHoldOrDeferral {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    kind: row.kind,
    reasonCategory: row.reason_category,
    detailedExplanation: row.detailed_explanation,
    amountAffected: Number(row.amount_affected),
    revisedExpectedDate: row.revised_expected_date,
    approvingUser: row.approving_user,
    approvalTimestamp: row.approval_timestamp,
    employeeNotificationTimestamp: row.employee_notification_timestamp,
    evidencePath: row.evidence_path,
    complianceReviewFlag: row.compliance_review_flag,
    active: row.active,
    releasedAt: row.released_at,
    createdAt: row.created_at,
  };
}

function rowToAudit(row: AuditRow): PaymentAuditEvent {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    transactionId: row.transaction_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    reason: row.reason,
    previousValues: row.previous_values,
    newValues: row.new_values,
    emergencyOverride: row.emergency_override,
    createdAt: row.created_at,
  };
}

async function persistObligation(obligation: SalaryPaymentObligation) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('salary_payment_obligations')
    .upsert(obligationToRow(obligation), { onConflict: 'id' });
  return error;
}

async function appendAudit(event: PaymentAuditEvent) {
  const supabase = await createClient();
  await supabase.from('salary_payment_audit_events').insert({
    id: event.id,
    obligation_id: event.obligationId,
    transaction_id: event.transactionId,
    action: event.action,
    actor_user_id: event.actorUserId,
    reason: event.reason,
    previous_values: event.previousValues,
    new_values: event.newValues,
    emergency_override: event.emergencyOverride,
    created_at: event.createdAt,
  });
}

async function loadLedgerBundle(payrollRecordId: string): Promise<
  ActionResult<{
    obligation: SalaryPaymentObligation;
    transactions: SalaryPaymentTransaction[];
    holds: PaymentHoldOrDeferral[];
    auditTimeline: PaymentAuditEvent[];
  }>
> {
  try {
    const supabase = await createClient();
    const { data: oblRow, error: oblErr } = await supabase
      .from('salary_payment_obligations')
      .select('*')
      .eq('payroll_record_id', payrollRecordId)
      .maybeSingle();

    if (oblErr) return { ok: false, error: oblErr.message };
    if (!oblRow) return { ok: false, error: 'No payment obligation for this payroll record.' };

    const obligation = rowToObligation(oblRow as ObligationRow);

    const [{ data: txs }, { data: holds }, { data: audit }] = await Promise.all([
      supabase
        .from('salary_payment_transactions')
        .select('*')
        .eq('obligation_id', obligation.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('salary_payment_holds')
        .select('*')
        .eq('obligation_id', obligation.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('salary_payment_audit_events')
        .select('*')
        .eq('obligation_id', obligation.id)
        .order('created_at', { ascending: true }),
    ]);

    return {
      ok: true,
      data: {
        obligation,
        transactions: ((txs ?? []) as TransactionRow[]).map(rowToTransaction),
        holds: ((holds ?? []) as HoldRow[]).map(rowToHold),
        auditTimeline: ((audit ?? []) as AuditRow[]).map(rowToAudit),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load payment ledger.',
    };
  }
}

async function syncObligationTotals(
  obligation: SalaryPaymentObligation,
  transactions: SalaryPaymentTransaction[],
  holds: PaymentHoldOrDeferral[],
) {
  const refreshed = refreshObligationTotals(obligation, transactions, holds, {
    payrollWorkflowStatus: 'FINAL',
  });
  const err = await persistObligation(refreshed);
  if (err) return { ok: false as const, error: err.message };

  // Mirror payment status onto payroll_slips when column exists (best-effort).
  try {
    const supabase = await createClient();
    await supabase
      .from('payroll_slips')
      .update({
        payment_status: refreshed.paymentStatus,
        salary_credit_date: refreshed.actualFinalCreditDate,
        expected_payment_date:
          refreshed.revisedExpectedDate ?? refreshed.companyCommittedDate,
      })
      .eq('id', refreshed.payrollRecordId);
  } catch {
    // Column may be absent before Phase 2 migrations.
  }

  return { ok: true as const, data: refreshed };
}

// ── Public actions ───────────────────────────────────────────────────────────

/** Create parent obligation when payroll is finalised. Idempotent per payroll_record_id. */
export async function ensureSalaryPaymentObligation(input: {
  payrollRecordId: string;
  employeeId: string;
  monthYear: string;
  netSalaryPayable: number;
  paydayDayOfMonth: number;
  originalDueDate?: string | null;
  scheduledPaymentDate?: string | null;
  companyCommittedDate?: string | null;
  actorUserId?: string;
}): Promise<ActionResult<SalaryPaymentObligation>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('salary_payment_obligations')
      .select('*')
      .eq('payroll_record_id', input.payrollRecordId)
      .maybeSingle();

    if (existing) {
      return { ok: true, data: rowToObligation(existing as ObligationRow) };
    }

    const obligation = createObligationFromFinalPayroll({
      payrollRecordId: input.payrollRecordId,
      employeeId: input.employeeId,
      monthYear: input.monthYear,
      netSalaryPayable: input.netSalaryPayable,
      paydayDayOfMonth: input.paydayDayOfMonth,
      originalDueDate: input.originalDueDate,
      scheduledPaymentDate:
        input.scheduledPaymentDate ?? input.companyCommittedDate,
      companyCommittedDate: input.companyCommittedDate,
    });

    const { error } = await supabase
      .from('salary_payment_obligations')
      .insert(obligationToRow(obligation));

    if (error) return { ok: false, error: error.message };

    await appendAudit(
      buildAuditEvent({
        obligationId: obligation.id,
        action: 'OBLIGATION_CREATED',
        actorUserId: input.actorUserId ?? 'system',
        newValues: {
          netSalaryPayable: obligation.netSalaryPayable,
          originalStatutoryDueDate: obligation.originalStatutoryDueDate,
          paymentStatus: obligation.paymentStatus,
        },
      }),
    );

    revalidatePaymentViews();
    return { ok: true, data: obligation };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create payment obligation.',
    };
  }
}

export async function fetchPaymentLedger(
  payrollRecordId: string,
): Promise<
  ActionResult<{
    obligation: SalaryPaymentObligation;
    transactions: SalaryPaymentTransaction[];
    holds: PaymentHoldOrDeferral[];
    auditTimeline: PaymentAuditEvent[];
    payrollStatus: string;
  }>
> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  let bundle = await loadLedgerBundle(payrollRecordId);
  if (!bundle.ok) {
    // Backfill obligation for older final slips that pre-date the payment module.
    const ensured = await ensureObligationForExistingSlip(payrollRecordId);
    if (!ensured.ok) return { ok: false, error: bundle.error };
    bundle = await loadLedgerBundle(payrollRecordId);
    if (!bundle.ok) return bundle;
  }

  // Refresh overdue flags on read
  const synced = await syncObligationTotals(
    bundle.data.obligation,
    bundle.data.transactions,
    bundle.data.holds,
  );
  if (!synced.ok) return synced;

  return {
    ok: true,
    data: {
      obligation: synced.data,
      transactions: bundle.data.transactions,
      holds: bundle.data.holds,
      auditTimeline: bundle.data.auditTimeline,
      payrollStatus: 'FINAL',
    },
  };
}

/** Create obligation rows for final payrolls that do not yet have one. */
async function ensureObligationForExistingSlip(
  payrollRecordId: string,
): Promise<ActionResult<SalaryPaymentObligation>> {
  try {
    const supabase = await createClient();
    const { data: slipRow, error } = await supabase
      .from('payroll_slips')
      .select('id, employee_id, month_year, status, details_json')
      .eq('id', payrollRecordId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!slipRow) return { ok: false, error: 'Payroll slip not found.' };

    const status = String((slipRow as { status?: string }).status ?? '').toLowerCase();
    if (status !== 'final') {
      return { ok: false, error: 'Payment ledger is only available for finalised payroll.' };
    }

    const details = (slipRow as { details_json?: Record<string, unknown> }).details_json ?? {};
    const computed = (details.computed ?? {}) as { netPay?: number };
    const employee = (details.employee ?? {}) as { id?: string };
    const netPay = Number(computed.netPay ?? 0);
    const employeeId =
      employee.id ||
      String((slipRow as { employee_id?: string }).employee_id ?? '');
    const monthYear = String((slipRow as { month_year?: string }).month_year ?? '');

    let paydayDayOfMonth = 5;
    try {
      const { fetchSettings } = await import('@/app/actions/settings');
      const settingsResult = await fetchSettings();
      if (settingsResult.ok) paydayDayOfMonth = settingsResult.data.paydayDayOfMonth ?? 5;
    } catch {
      // fall back to default payday
    }

    return ensureSalaryPaymentObligation({
      payrollRecordId,
      employeeId,
      monthYear,
      netSalaryPayable: netPay,
      paydayDayOfMonth,
      actorUserId: 'system-backfill',
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to backfill payment obligation.',
    };
  }
}

export async function fetchPaymentObligationsForHistory(): Promise<
  ActionResult<SalaryPaymentObligation[]>
> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();

    // Backfill missing obligations for existing FINAL slips so History is live
    // without requiring a re-finalisation.
    const { data: finalSlips } = await supabase
      .from('payroll_slips')
      .select('id, employee_id, month_year, status, details_json')
      .eq('status', 'final');

    const { data: existingObl, error: existingErr } = await supabase
      .from('salary_payment_obligations')
      .select('payroll_record_id');

    if (existingErr) {
      if (/does not exist|schema cache/i.test(existingErr.message)) {
        return { ok: true, data: [] };
      }
      return { ok: false, error: existingErr.message };
    }

    const have = new Set(
      ((existingObl ?? []) as Array<{ payroll_record_id: string }>).map(
        (r) => r.payroll_record_id,
      ),
    );

    let paydayDayOfMonth = 5;
    try {
      const { fetchSettings } = await import('@/app/actions/settings');
      const settingsResult = await fetchSettings();
      if (settingsResult.ok) paydayDayOfMonth = settingsResult.data.paydayDayOfMonth ?? 5;
    } catch {
      // default
    }

    for (const slip of (finalSlips ?? []) as Array<{
      id: string;
      employee_id: string | null;
      month_year: string;
      details_json?: Record<string, unknown>;
    }>) {
      if (have.has(slip.id)) continue;
      const details = slip.details_json ?? {};
      const computed = (details.computed ?? {}) as { netPay?: number };
      const employee = (details.employee ?? {}) as { id?: string };
      const netPay = Number(computed.netPay ?? 0);
      if (!Number.isFinite(netPay) || netPay < 0) continue;
      await ensureSalaryPaymentObligation({
        payrollRecordId: slip.id,
        employeeId: employee.id || slip.employee_id || '',
        monthYear: slip.month_year,
        netSalaryPayable: netPay,
        paydayDayOfMonth,
        actorUserId: 'system-backfill',
      });
    }

    const { data, error } = await supabase
      .from('salary_payment_obligations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { ok: true, data: [] };
      }
      return { ok: false, error: error.message };
    }

    const obligations = ((data ?? []) as ObligationRow[]).map(rowToObligation);
    // Do not recompute without transactions — trust stored confirmed/outstanding columns.
    // Overdue display is refreshed when the ledger is opened.
    return { ok: true, data: obligations };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch payment obligations.',
    };
  }
}

export async function recordSalaryPayment(input: {
  payrollRecordId: string;
  amount: number;
  paymentMode: string;
  createdBy: string;
  initiatedAt?: string;
  processedAt?: string | null;
  creditedAt?: string | null;
  sourceBankAccountRef?: string | null;
  maskedDestinationAccount?: string | null;
  bankTransactionReference?: string | null;
  remarks?: string | null;
  supportingEvidencePath?: string | null;
  evidenceSha256?: string | null;
}): Promise<ActionResult<SalaryPaymentTransaction>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;

  const built = buildInitiatedTransaction({
    obligation: bundle.data.obligation,
    amount: input.amount,
    paymentMode: input.paymentMode,
    createdBy: input.createdBy,
    initiatedAt: input.initiatedAt,
    processedAt: input.processedAt,
    creditedAt: input.creditedAt,
    sourceBankAccountRef: input.sourceBankAccountRef,
    maskedDestinationAccount: input.maskedDestinationAccount,
    bankTransactionReference: input.bankTransactionReference,
    remarks: input.remarks,
    supportingEvidencePath: input.supportingEvidencePath,
    evidenceSha256: input.evidenceSha256,
    existingTransactions: bundle.data.transactions,
  });
  if (!built.ok) return { ok: false, error: built.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('salary_payment_transactions')
    .insert(transactionToRow(built.transaction));
  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return { ok: false, error: 'Duplicate bank transaction reference (UTR) is not permitted.' };
    }
    return { ok: false, error: error.message };
  }

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      transactionId: built.transaction.id,
      action: 'PAYMENT_RECORDED',
      actorUserId: input.createdBy,
      newValues: { amount: built.transaction.amount, status: 'INITIATED' },
    }),
  );

  await syncObligationTotals(
    bundle.data.obligation,
    [...bundle.data.transactions, built.transaction],
    bundle.data.holds,
  );

  revalidatePaymentViews();
  return { ok: true, data: built.transaction };
}

export async function confirmSalaryPayment(input: {
  payrollRecordId: string;
  transactionId: string;
  confirmer: ActorContext;
  overrideReason?: string | null;
  creditedAt?: string | null;
}): Promise<ActionResult<SalaryPaymentTransaction>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;

  const tx = bundle.data.transactions.find((t) => t.id === input.transactionId);
  if (!tx) return { ok: false, error: 'Transaction not found.' };

  const result = confirmTransaction({
    transaction: tx,
    confirmer: input.confirmer,
    overrideReason: input.overrideReason,
    creditedAt: input.creditedAt,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('salary_payment_transactions')
    .update(transactionToRow(result.transaction))
    .eq('id', result.transaction.id);
  if (error) return { ok: false, error: error.message };

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      transactionId: result.transaction.id,
      action: result.auditAction,
      actorUserId: input.confirmer.userId,
      reason: input.overrideReason ?? null,
      emergencyOverride: result.emergencyOverride,
      newValues: { status: 'CONFIRMED' },
    }),
  );

  const txs = bundle.data.transactions.map((t) =>
    t.id === result.transaction.id ? result.transaction : t,
  );
  await syncObligationTotals(bundle.data.obligation, txs, bundle.data.holds);
  revalidatePaymentViews();
  return { ok: true, data: result.transaction };
}

export async function failSalaryPayment(input: {
  payrollRecordId: string;
  transactionId: string;
  actorUserId: string;
  reason: string;
  asRejectedByBank?: boolean;
}): Promise<ActionResult<SalaryPaymentTransaction>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;
  const tx = bundle.data.transactions.find((t) => t.id === input.transactionId);
  if (!tx) return { ok: false, error: 'Transaction not found.' };

  const result = markTransactionFailed({
    transaction: tx,
    actor: { userId: input.actorUserId, emergencyOverridePermission: false },
    reason: input.reason,
    asRejectedByBank: input.asRejectedByBank,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('salary_payment_transactions')
    .update(transactionToRow(result.transaction))
    .eq('id', result.transaction.id);
  if (error) return { ok: false, error: error.message };

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      transactionId: result.transaction.id,
      action: input.asRejectedByBank ? 'PAYMENT_REJECTED_BY_BANK' : 'PAYMENT_FAILED',
      actorUserId: input.actorUserId,
      reason: input.reason,
    }),
  );

  const txs = bundle.data.transactions.map((t) =>
    t.id === result.transaction.id ? result.transaction : t,
  );
  await syncObligationTotals(bundle.data.obligation, txs, bundle.data.holds);
  revalidatePaymentViews();
  return { ok: true, data: result.transaction };
}

export async function reverseSalaryPayment(input: {
  payrollRecordId: string;
  transactionId: string;
  approver: ActorContext;
  reason: string;
}): Promise<ActionResult<{ original: SalaryPaymentTransaction; reversal: SalaryPaymentTransaction }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;
  const tx = bundle.data.transactions.find((t) => t.id === input.transactionId);
  if (!tx) return { ok: false, error: 'Transaction not found.' };

  const result = reverseConfirmedTransaction({
    original: tx,
    approver: input.approver,
    reason: input.reason,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from('salary_payment_transactions')
    .update(transactionToRow(result.original))
    .eq('id', result.original.id);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: insErr } = await supabase
    .from('salary_payment_transactions')
    .insert(transactionToRow(result.reversal));
  if (insErr) return { ok: false, error: insErr.message };

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      transactionId: result.reversal.id,
      action: 'PAYMENT_REVERSED',
      actorUserId: input.approver.userId,
      reason: input.reason,
      previousValues: { originalId: tx.id },
      newValues: { reversalId: result.reversal.id },
    }),
  );

  const txs = [
    ...bundle.data.transactions.map((t) =>
      t.id === result.original.id ? result.original : t,
    ),
    result.reversal,
  ];
  await syncObligationTotals(bundle.data.obligation, txs, bundle.data.holds);
  revalidatePaymentViews();
  return { ok: true, data: { original: result.original, reversal: result.reversal } };
}

export async function putSalaryPaymentOnHold(input: {
  payrollRecordId: string;
  kind: 'ON_HOLD' | 'PAYMENT_DEFERRED';
  reasonCategory: PaymentHoldReasonCategory;
  detailedExplanation: string;
  amountAffected: number;
  revisedExpectedDate: string;
  approvingUser: string;
  employeeNotificationTimestamp?: string | null;
  evidencePath?: string | null;
  complianceReviewFlag: boolean;
}): Promise<ActionResult<PaymentHoldOrDeferral>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;

  const result = placeHoldOrDeferral({
    obligation: bundle.data.obligation,
    kind: input.kind,
    reasonCategory: input.reasonCategory,
    detailedExplanation: input.detailedExplanation,
    amountAffected: input.amountAffected,
    revisedExpectedDate: input.revisedExpectedDate,
    approvingUser: input.approvingUser,
    employeeNotificationTimestamp: input.employeeNotificationTimestamp,
    evidencePath: input.evidencePath,
    complianceReviewFlag: input.complianceReviewFlag,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createClient();
  // Release prior active holds
  await supabase
    .from('salary_payment_holds')
    .update({ active: false, released_at: new Date().toISOString() })
    .eq('obligation_id', bundle.data.obligation.id)
    .eq('active', true);

  const { error } = await supabase.from('salary_payment_holds').insert({
    id: result.hold.id,
    obligation_id: result.hold.obligationId,
    kind: result.hold.kind,
    reason_category: result.hold.reasonCategory,
    detailed_explanation: result.hold.detailedExplanation,
    amount_affected: result.hold.amountAffected,
    revised_expected_date: result.hold.revisedExpectedDate,
    approving_user: result.hold.approvingUser,
    approval_timestamp: result.hold.approvalTimestamp,
    employee_notification_timestamp: result.hold.employeeNotificationTimestamp,
    evidence_path: result.hold.evidencePath,
    compliance_review_flag: result.hold.complianceReviewFlag,
    active: true,
    created_at: result.hold.createdAt,
  });
  if (error) return { ok: false, error: error.message };

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      action: input.kind === 'PAYMENT_DEFERRED' ? 'PAYMENT_DEFERRED' : 'PAYMENT_ON_HOLD',
      actorUserId: input.approvingUser,
      reason: input.detailedExplanation,
      newValues: {
        revisedExpectedDate: input.revisedExpectedDate,
        reasonCategory: input.reasonCategory,
      },
    }),
  );

  const holds = [
    ...bundle.data.holds.map((h) => ({ ...h, active: false })),
    result.hold,
  ];
  await syncObligationTotals(result.obligation, bundle.data.transactions, holds);
  revalidatePaymentViews();
  return { ok: true, data: result.hold };
}

export async function rescheduleSalaryPayment(input: {
  payrollRecordId: string;
  revisedExpectedDate: string;
  actorUserId: string;
  reason: string;
}): Promise<ActionResult<SalaryPaymentObligation>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(input.payrollRecordId);
  if (!bundle.ok) return bundle;

  const result = rescheduleExpectedPayment({
    obligation: bundle.data.obligation,
    revisedExpectedDate: input.revisedExpectedDate,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await appendAudit(
    buildAuditEvent({
      obligationId: bundle.data.obligation.id,
      action: 'PAYMENT_RESCHEDULED',
      actorUserId: input.actorUserId,
      reason: input.reason,
      previousValues: {
        originalStatutoryDueDate: result.preservedOriginalDueDate,
        overdueEventAt: result.preservedOverdueEventAt,
      },
      newValues: { revisedExpectedDate: input.revisedExpectedDate },
    }),
  );

  const synced = await syncObligationTotals(
    result.obligation,
    bundle.data.transactions,
    bundle.data.holds,
  );
  if (!synced.ok) return synced;
  revalidatePaymentViews();
  return { ok: true, data: synced.data };
}

/** Gate for AUTHORISED_SALARY_SLIP — blocked while outstanding exists. */
export async function assertAuthorisedSlipPaymentGate(
  payrollRecordId: string,
): Promise<
  ActionResult<{
    allowed: true;
    obligationId: string;
    actualCreditDate: string;
    confirmedPaidAmount: number;
    outstandingAmount: number;
    netSalaryPayable: number;
    paymentStatus: string;
  }>
> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(payrollRecordId);
  if (!bundle.ok) {
    // Soft: if no obligation table/row yet, block authorised slip for finals without payment proof
    return {
      ok: false,
      error:
        bundle.error.includes('No payment obligation')
          ? 'Authorised salary slip is blocked until payment obligation is PAID and fully reconciled.'
          : bundle.error,
    };
  }

  const obl = bundle.data.obligation;
  const gate = assertDocumentAllowed(
    'AUTHORISED_SALARY_SLIP',
    obl.documentStatus,
    obl.paymentStatus,
    obl.outstandingAmount,
  );
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!obl.actualFinalCreditDate) {
    return {
      ok: false,
      error:
        'Authorised salary slip requires a confirmed actual salary-credit date from settled payments.',
    };
  }

  return {
    ok: true,
    data: {
      allowed: true,
      obligationId: obl.id,
      actualCreditDate: obl.actualFinalCreditDate,
      confirmedPaidAmount: obl.confirmedPaidAmount,
      outstandingAmount: obl.outstandingAmount,
      netSalaryPayable: obl.netSalaryPayable,
      paymentStatus: obl.paymentStatus,
    },
  };
}

export async function checkDocumentAvailability(
  payrollRecordId: string,
  kind: DocumentKind,
): Promise<ActionResult<{ allowed: true; title?: string }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const bundle = await loadLedgerBundle(payrollRecordId);
  if (!bundle.ok) return { ok: false, error: bundle.error };

  const gate = assertDocumentAllowed(
    kind,
    bundle.data.obligation.documentStatus,
    bundle.data.obligation.paymentStatus,
    bundle.data.obligation.outstandingAmount,
  );
  if (!gate.ok) return { ok: false, error: gate.error };

  const title =
    kind === 'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID'
      ? 'SALARY PAYMENT ADVICE — PARTIALLY PAID'
      : kind === 'OUTSTANDING_SALARY_STATEMENT'
        ? 'OUTSTANDING SALARY STATEMENT'
        : undefined;

  return { ok: true, data: { allowed: true, title } };
}
