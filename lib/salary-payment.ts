/**
 * Salary-payment tracking & reconciliation engine (Phase 2 extension).
 *
 * Pure domain logic — no Supabase / Next imports.
 * FINAL payroll ≠ PAID. Payment status is derived from settled transactions
 * and due dates; manual PAID is blocked unless amounts reconcile exactly.
 */

import { formatISO, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import { fromPaise, moneyEquals, roundRupees, subPaise, toPaise } from './money';
import { payrollCycleDates } from './format';
import type {
  ActorContext,
  DocumentKind,
  DocumentLifecycleStatus,
  PaymentAuditEvent,
  PaymentHoldOrDeferral,
  PaymentHoldReasonCategory,
  PaymentTransactionStatus,
  SalaryPaymentObligation,
  SalaryPaymentStatus,
  SalaryPaymentTransaction,
  TimelinessIndicator,
} from './salary-payment-types';

export * from './salary-payment-types';

const SETTLED_STATUSES: ReadonlySet<PaymentTransactionStatus> = new Set([
  'SETTLED',
  'CONFIRMED',
]);

export function generatePaymentId(_prefix = 'pay'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4-ish for non-crypto test/runtime envs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Applicable due date for overdue / timeliness (revised → committed → statutory). */
export function applicableDueDate(obligation: Pick<
  SalaryPaymentObligation,
  'revisedExpectedDate' | 'companyCommittedDate' | 'originalStatutoryDueDate'
>): string {
  return (
    obligation.revisedExpectedDate ??
    obligation.companyCommittedDate ??
    obligation.originalStatutoryDueDate
  );
}

/**
 * confirmed_paid_amount = sum of SETTLED/CONFIRMED excluding reversed.
 * Reversal txs (status REVERSED that reverse another) reduce the pool by
 * excluding the original settled row (status flipped to REVERSED).
 */
export function computeConfirmedPaidAmount(
  transactions: SalaryPaymentTransaction[],
): number {
  let paise = 0;
  for (const tx of transactions) {
    if (SETTLED_STATUSES.has(tx.transactionStatus)) {
      paise += toPaise(tx.amount) as number;
    }
  }
  return roundRupees(fromPaise(paise));
}

export function computeOutstandingAmount(
  netSalaryPayable: number,
  confirmedPaidAmount: number,
): number {
  const outstanding = subPaise(toPaise(netSalaryPayable), toPaise(confirmedPaidAmount));
  return roundRupees(fromPaise(Math.max(0, outstanding as number)));
}

export function isTransactionConfirmed(tx: SalaryPaymentTransaction): boolean {
  return SETTLED_STATUSES.has(tx.transactionStatus);
}

export function detectDuplicateBankReference(
  transactions: SalaryPaymentTransaction[],
  bankTransactionReference: string | null | undefined,
  excludeTransactionId?: string,
): boolean {
  const ref = bankTransactionReference?.trim();
  if (!ref) return false;
  const normalised = ref.toUpperCase();
  return transactions.some(
    (tx) =>
      tx.id !== excludeTransactionId &&
      tx.transactionStatus !== 'CANCELLED' &&
      tx.bankTransactionReference?.trim().toUpperCase() === normalised,
  );
}

export function deriveTimeliness(
  obligation: Pick<
    SalaryPaymentObligation,
    | 'outstandingAmount'
    | 'actualFinalCreditDate'
    | 'originalStatutoryDueDate'
    | 'companyCommittedDate'
    | 'revisedExpectedDate'
  >,
): TimelinessIndicator {
  if (obligation.outstandingAmount > 0 || !obligation.actualFinalCreditDate) {
    return obligation.outstandingAmount > 0 ? 'NOT_YET_PAID' : 'N/A';
  }
  // Paid-late uses original statutory due date (company commitment may be earlier,
  // but "late vs statute" is measured against original due).
  const due = startOfDay(parseISO(obligation.originalStatutoryDueDate));
  const credited = startOfDay(parseISO(obligation.actualFinalCreditDate));
  if (isAfter(credited, due)) return 'PAID_LATE';
  return 'PAID_ON_TIME';
}

export interface DerivePaymentStatusInput {
  netSalaryPayable: number;
  confirmedPaidAmount: number;
  outstandingAmount: number;
  transactions: SalaryPaymentTransaction[];
  activeHold: PaymentHoldOrDeferral | null;
  /** ISO date string yyyy-MM-dd or full ISO; compared at day precision. */
  now: Date;
  applicableDueDate: string;
  /** Explicit UNDER_RECONCILIATION flag (manual or system). */
  underReconciliation?: boolean;
  cancelled?: boolean;
}

/**
 * Server-side payment status derivation.
 * PAID only when outstanding is zero (settled txs reconcile with net payable).
 * Manual PAID without exact reconcile is rejected elsewhere.
 */
export function derivePaymentStatus(input: DerivePaymentStatusInput & {
  exceptionKind?: 'NO_SALARY_DUE' | 'SALARY_WAIVED' | null;
}): SalaryPaymentStatus {
  if (input.cancelled) return 'CANCELLED';

  if (input.exceptionKind === 'NO_SALARY_DUE') return 'NO_SALARY_DUE';
  if (input.exceptionKind === 'SALARY_WAIVED') return 'SALARY_WAIVED';

  if (input.activeHold?.active) {
    return input.activeHold.kind === 'PAYMENT_DEFERRED' ? 'PAYMENT_DEFERRED' : 'ON_HOLD';
  }

  if (input.underReconciliation) return 'UNDER_RECONCILIATION';

  if (
    input.outstandingAmount === 0 &&
    moneyEquals(input.confirmedPaidAmount, input.netSalaryPayable)
  ) {
    return 'PAID';
  }

  const nonReversed = input.transactions.filter((t) => t.transactionStatus !== 'CANCELLED');
  const allReversed =
    nonReversed.length > 0 &&
    nonReversed.every((t) => t.transactionStatus === 'REVERSED') &&
    input.confirmedPaidAmount === 0;
  if (allReversed) return 'REVERSED';

  const latest = [...nonReversed].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];

  if (
    latest &&
    input.confirmedPaidAmount === 0 &&
    (latest.transactionStatus === 'FAILED' || latest.transactionStatus === 'REJECTED_BY_BANK')
  ) {
    return latest.transactionStatus === 'REJECTED_BY_BANK' ? 'REJECTED_BY_BANK' : 'FAILED';
  }

  const due = startOfDay(parseISO(input.applicableDueDate));
  const today = startOfDay(input.now);
  const pastDue = isAfter(today, due) && input.outstandingAmount > 0;

  if (pastDue) return 'OVERDUE';

  if (input.confirmedPaidAmount > 0 && input.outstandingAmount > 0) {
    return 'PARTIALLY_PAID';
  }

  if (
    nonReversed.some(
      (t) =>
        t.transactionStatus === 'INITIATED' ||
        t.transactionStatus === 'PROCESSING',
    )
  ) {
    return 'PROCESSING';
  }

  if (nonReversed.some((t) => t.transactionStatus === 'SETTLED' || t.transactionStatus === 'CONFIRMED')) {
    // Settled but not matching net (edge) → under reconciliation
    if (input.outstandingAmount > 0 || input.confirmedPaidAmount > input.netSalaryPayable) {
      return 'UNDER_RECONCILIATION';
    }
  }

  if (nonReversed.length === 0 && !pastDue) {
    // Distinguish scheduled vs not: caller may pass SCHEDULED via companyCommittedDate presence —
    // default NOT_SCHEDULED unless committed/revised date exists and no txs yet.
    return 'NOT_SCHEDULED';
  }

  return 'NOT_SCHEDULED';
}

/** When an expected date exists and no txs, surface SCHEDULED instead of NOT_SCHEDULED. */
export function refineScheduledStatus(
  status: SalaryPaymentStatus,
  hasScheduleDate: boolean,
  hasAnyTransaction: boolean,
): SalaryPaymentStatus {
  if (status === 'NOT_SCHEDULED' && hasScheduleDate && !hasAnyTransaction) {
    return 'SCHEDULED';
  }
  return status;
}

export function deriveDocumentStatus(input: {
  payrollWorkflowStatus: string;
  paymentStatus: SalaryPaymentStatus;
  outstandingAmount: number;
  confirmedPaidAmount: number;
  authorisedIssued?: boolean;
}): DocumentLifecycleStatus {
  const payrollFinal =
    input.payrollWorkflowStatus === 'FINAL' ||
    input.payrollWorkflowStatus === 'FINALISED' ||
    input.payrollWorkflowStatus === 'PAID' ||
    input.payrollWorkflowStatus === 'PAYMENT_PENDING';

  if (!payrollFinal) return 'NOT_READY';

  const blockedPaymentStatuses: SalaryPaymentStatus[] = [
    'NO_SALARY_DUE',
    'SALARY_WAIVED',
    'PAYMENT_DEFERRED',
    'ON_HOLD',
    'PARTIALLY_PAID',
    'NOT_SCHEDULED',
    'SCHEDULED',
    'PROCESSING',
    'OVERDUE',
    'FAILED',
    'REJECTED_BY_BANK',
    'REVERSED',
    'UNDER_RECONCILIATION',
    'CANCELLED',
  ];

  if (blockedPaymentStatuses.includes(input.paymentStatus)) {
    if (input.confirmedPaidAmount > 0 && input.outstandingAmount > 0) {
      return 'PARTIAL_ADVICE_ALLOWED';
    }
    if (input.outstandingAmount > 0 && input.paymentStatus !== 'NO_SALARY_DUE' && input.paymentStatus !== 'SALARY_WAIVED') {
      return 'OUTSTANDING_STATEMENT_ALLOWED';
    }
    return 'AUTHORISED_BLOCKED';
  }

  if (input.authorisedIssued && input.paymentStatus === 'PAID' && input.outstandingAmount === 0) {
    return 'AUTHORISED_ISSUED';
  }

  if (input.paymentStatus === 'PAID' && input.outstandingAmount === 0) {
    return 'AUTHORISED_ELIGIBLE';
  }

  if (input.confirmedPaidAmount > 0 && input.outstandingAmount > 0) {
    return 'PARTIAL_ADVICE_ALLOWED';
  }

  if (input.outstandingAmount > 0) {
    return 'OUTSTANDING_STATEMENT_ALLOWED';
  }

  return 'AUTHORISED_BLOCKED';
}

const AUTHORISED_BLOCKED_PAYMENT: ReadonlySet<SalaryPaymentStatus> = new Set([
  'NOT_SCHEDULED',
  'SCHEDULED',
  'PROCESSING',
  'PARTIALLY_PAID',
  'ON_HOLD',
  'PAYMENT_DEFERRED',
  'OVERDUE',
  'FAILED',
  'REJECTED_BY_BANK',
  'REVERSED',
  'UNDER_RECONCILIATION',
  'SALARY_WAIVED',
  'NO_SALARY_DUE',
  'CANCELLED',
]);

export function assertDocumentAllowed(
  kind: DocumentKind,
  documentStatus: DocumentLifecycleStatus,
  paymentStatus: SalaryPaymentStatus,
  outstandingAmount: number,
): { ok: true } | { ok: false; error: string; code: string } {
  switch (kind) {
    case 'INTERNAL_PAY_SLIP':
      if (documentStatus === 'NOT_READY') {
        return {
          ok: false,
          error: 'Internal pay slip is not available until payroll is calculated.',
          code: 'DOCUMENT_NOT_READY',
        };
      }
      return { ok: true };

    case 'AUTHORISED_SALARY_SLIP': {
      if (
        paymentStatus === 'NO_SALARY_DUE' ||
        paymentStatus === 'SALARY_WAIVED' ||
        paymentStatus === 'PAYMENT_DEFERRED' ||
        paymentStatus === 'ON_HOLD' ||
        paymentStatus === 'PARTIALLY_PAID' ||
        paymentStatus === 'NOT_SCHEDULED' ||
        paymentStatus === 'SCHEDULED' ||
        paymentStatus === 'PROCESSING' ||
        paymentStatus === 'OVERDUE' ||
        paymentStatus === 'FAILED' ||
        paymentStatus === 'REJECTED_BY_BANK' ||
        paymentStatus === 'REVERSED' ||
        paymentStatus === 'UNDER_RECONCILIATION' ||
        paymentStatus === 'CANCELLED'
      ) {
        return {
          ok: false,
          error:
            'Authorised salary slip is blocked until payroll is PAID and fully reconciled (no outstanding balance).',
          code: 'AUTHORISED_BLOCKED_OUTSTANDING',
        };
      }
      if (paymentStatus !== 'PAID' || outstandingAmount > 0) {
        return {
          ok: false,
          error:
            'Authorised salary slip is blocked until payroll is fully PAID, confirmed paid equals net salary, and outstanding is zero.',
          code: 'AUTHORISED_BLOCKED_OUTSTANDING',
        };
      }
      if (paymentStatus !== 'PAID') {
        return {
          ok: false,
          error: 'Authorised salary slip requires payment status PAID.',
          code: 'AUTHORISED_BLOCKED_NOT_PAID',
        };
      }
      if (
        documentStatus !== 'AUTHORISED_ELIGIBLE' &&
        documentStatus !== 'AUTHORISED_ISSUED'
      ) {
        return {
          ok: false,
          error: 'Authorised salary slip is not eligible for this payroll.',
          code: 'AUTHORISED_NOT_ELIGIBLE',
        };
      }
      return { ok: true };
    }

    case 'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID':
      if (paymentStatus !== 'PARTIALLY_PAID' && !(outstandingAmount > 0 && paymentStatus !== 'PAID')) {
        return {
          ok: false,
          error: 'Partial payment advice is only available when salary is partially paid.',
          code: 'PARTIAL_ADVICE_NOT_APPLICABLE',
        };
      }
      return { ok: true };

    case 'OUTSTANDING_SALARY_STATEMENT':
      if (outstandingAmount <= 0 && paymentStatus !== 'ON_HOLD') {
        return {
          ok: false,
          error: 'Outstanding salary statement requires a remaining balance.',
          code: 'OUTSTANDING_STATEMENT_NOT_APPLICABLE',
        };
      }
      return { ok: true };

    case 'NO_SALARY_DRAWN_STATEMENT':
      if (paymentStatus !== 'NO_SALARY_DUE') {
        return {
          ok: false,
          error: 'No-salary statement requires payment status NO_SALARY_DUE.',
          code: 'NO_SALARY_STATEMENT_NOT_APPLICABLE',
        };
      }
      return { ok: true };

    case 'SALARY_WAIVER_RECORD':
      if (paymentStatus !== 'SALARY_WAIVED') {
        return {
          ok: false,
          error: 'Salary waiver record requires payment status SALARY_WAIVED.',
          code: 'WAIVER_RECORD_NOT_APPLICABLE',
        };
      }
      return { ok: true };

    case 'DEFERRED_SALARY_STATEMENT':
      if (paymentStatus !== 'PAYMENT_DEFERRED') {
        return {
          ok: false,
          error: 'Deferred salary statement requires payment status PAYMENT_DEFERRED.',
          code: 'DEFERRED_STATEMENT_NOT_APPLICABLE',
        };
      }
      return { ok: true };

    default:
      return { ok: false, error: 'Unknown document kind.', code: 'UNKNOWN_DOCUMENT' };
  }
}

export function partialDocumentTitle(
  kind:
    | 'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID'
    | 'OUTSTANDING_SALARY_STATEMENT'
    | 'DEFERRED_SALARY_STATEMENT'
    | 'NO_SALARY_DRAWN_STATEMENT'
    | 'SALARY_WAIVER_RECORD',
): string {
  switch (kind) {
    case 'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID':
      return 'SALARY PAYMENT ADVICE — PARTIALLY PAID';
    case 'OUTSTANDING_SALARY_STATEMENT':
      return 'OUTSTANDING SALARY STATEMENT';
    case 'DEFERRED_SALARY_STATEMENT':
      return 'DEFERRED SALARY STATEMENT';
    case 'NO_SALARY_DRAWN_STATEMENT':
      return 'NO SALARY DRAWN STATEMENT';
    case 'SALARY_WAIVER_RECORD':
      return 'SALARY WAIVER RECORD';
    default:
      return 'SALARY STATEMENT';
  }
}

export function assertMakerChecker(
  createdBy: string,
  confirmer: ActorContext,
  overrideReason?: string | null,
): { ok: true; emergencyOverride: boolean } | { ok: false; error: string; code: string } {
  if (createdBy !== confirmer.userId) {
    return { ok: true, emergencyOverride: false };
  }
  if (!confirmer.emergencyOverridePermission) {
    return {
      ok: false,
      error:
        'Same user cannot record and confirm a payment (maker-checker). Emergency override permission required.',
      code: 'MAKER_CHECKER_SAME_USER',
    };
  }
  if (!overrideReason?.trim()) {
    return {
      ok: false,
      error: 'Emergency maker-checker override requires a reason.',
      code: 'OVERRIDE_REASON_REQUIRED',
    };
  }
  return { ok: true, emergencyOverride: true };
}

export function assertManualPaidAllowed(
  netSalaryPayable: number,
  confirmedPaidAmount: number,
): { ok: true } | { ok: false; error: string; code: string } {
  if (!moneyEquals(netSalaryPayable, confirmedPaidAmount) || confirmedPaidAmount <= 0) {
    return {
      ok: false,
      error:
        'Cannot set PAID manually unless settled transactions reconcile exactly with net salary payable.',
      code: 'MANUAL_PAID_NOT_RECONCILED',
    };
  }
  return { ok: true };
}

export function assertPaymentAmountAllowed(
  amount: number,
  outstandingAmount: number,
): { ok: true } | { ok: false; error: string; code: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Payment amount must be a positive number.', code: 'INVALID_AMOUNT' };
  }
  if (toPaise(amount) > toPaise(outstandingAmount)) {
    return {
      ok: false,
      error: `Payment amount (₹${roundRupees(amount)}) exceeds outstanding amount (₹${roundRupees(outstandingAmount)}).`,
      code: 'AMOUNT_EXCEEDS_OUTSTANDING',
    };
  }
  return { ok: true };
}

export function createObligationFromFinalPayroll(input: {
  id?: string;
  payrollRecordId: string;
  employeeId: string;
  monthYear: string;
  netSalaryPayable: number;
  paydayDayOfMonth: number;
  /** Prefer server-resolved schedule; falls back to paydayDayOfMonth. */
  originalDueDate?: string | null;
  scheduledPaymentDate?: string | null;
  companyCommittedDate?: string | null;
  exceptionKind?: 'NO_SALARY_DUE' | 'SALARY_WAIVED' | null;
  exceptionReason?: string | null;
  now?: Date;
}): SalaryPaymentObligation {
  const now = input.now ?? new Date();
  const { creditDate } = payrollCycleDates(input.monthYear, input.paydayDayOfMonth);
  const statutory =
    input.originalDueDate ?? formatISO(creditDate, { representation: 'date' });
  const committed =
    input.scheduledPaymentDate ?? input.companyCommittedDate ?? statutory;
  const confirmedPaidAmount = 0;
  const outstandingAmount =
    input.exceptionKind === 'NO_SALARY_DUE' || input.exceptionKind === 'SALARY_WAIVED'
      ? 0
      : roundRupees(input.netSalaryPayable);

  const paymentStatus: SalaryPaymentStatus =
    input.exceptionKind === 'NO_SALARY_DUE'
      ? 'NO_SALARY_DUE'
      : input.exceptionKind === 'SALARY_WAIVED'
        ? 'SALARY_WAIVED'
        : 'SCHEDULED';

  const base: SalaryPaymentObligation = {
    id: input.id ?? generatePaymentId('obl'),
    payrollRecordId: input.payrollRecordId,
    employeeId: input.employeeId,
    monthYear: input.monthYear,
    netSalaryPayable: roundRupees(input.netSalaryPayable),
    paymentStatus,
    documentStatus: 'INTERNAL_AVAILABLE',
    originalStatutoryDueDate: statutory,
    originalDueDate: statutory,
    companyCommittedDate: committed,
    scheduledPaymentDate: committed,
    revisedExpectedDate: null,
    actualFinalCreditDate: null,
    overdueEventAt: null,
    confirmedPaidAmount,
    outstandingAmount,
    lastPaymentDate: null,
    timeliness: input.exceptionKind ? 'N/A' : 'NOT_YET_PAID',
    exceptionKind: input.exceptionKind ?? null,
    exceptionReason: input.exceptionReason ?? null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  base.documentStatus = deriveDocumentStatus({
    payrollWorkflowStatus: 'FINAL',
    paymentStatus: base.paymentStatus,
    outstandingAmount,
    confirmedPaidAmount,
  });

  return base;
}

export function refreshObligationTotals(
  obligation: SalaryPaymentObligation,
  transactions: SalaryPaymentTransaction[],
  holds: PaymentHoldOrDeferral[],
  opts?: {
    now?: Date;
    underReconciliation?: boolean;
    cancelled?: boolean;
    authorisedIssued?: boolean;
    payrollWorkflowStatus?: string;
  },
): SalaryPaymentObligation {
  const now = opts?.now ?? new Date();
  const confirmedPaidAmount = computeConfirmedPaidAmount(transactions);
  const outstandingAmount = computeOutstandingAmount(
    obligation.netSalaryPayable,
    confirmedPaidAmount,
  );

  const activeHold = holds.find((h) => h.active) ?? null;
  const due = applicableDueDate(obligation);

  let paymentStatus = derivePaymentStatus({
    netSalaryPayable: obligation.netSalaryPayable,
    confirmedPaidAmount,
    outstandingAmount,
    transactions,
    activeHold,
    now,
    applicableDueDate: due,
    underReconciliation: opts?.underReconciliation,
    cancelled: opts?.cancelled,
    exceptionKind:
      obligation.exceptionKind === 'NO_SALARY_DUE' ||
      obligation.exceptionKind === 'SALARY_WAIVED'
        ? obligation.exceptionKind
        : null,
  });

  paymentStatus = refineScheduledStatus(
    paymentStatus,
    Boolean(
      obligation.companyCommittedDate ||
        obligation.scheduledPaymentDate ||
        obligation.revisedExpectedDate,
    ),
    transactions.some((t) => t.transactionStatus !== 'CANCELLED'),
  );

  let overdueEventAt = obligation.overdueEventAt;
  if (paymentStatus === 'OVERDUE' && !overdueEventAt) {
    overdueEventAt = now.toISOString();
  }
  // Never clear overdueEventAt on reschedule or status change away from OVERDUE briefly.

  const settledDates = transactions
    .filter((t) => isTransactionConfirmed(t) && t.creditedAt)
    .map((t) => t.creditedAt as string)
    .sort();
  const lastPaymentDate: string | null = settledDates.length
    ? (settledDates[settledDates.length - 1] ?? null)
    : null;

  let actualFinalCreditDate: string | null = obligation.actualFinalCreditDate;
  if (outstandingAmount === 0 && moneyEquals(confirmedPaidAmount, obligation.netSalaryPayable)) {
    actualFinalCreditDate = lastPaymentDate;
  } else if (outstandingAmount > 0) {
    actualFinalCreditDate = null;
  }

  const next: SalaryPaymentObligation = {
    ...obligation,
    confirmedPaidAmount,
    outstandingAmount,
    paymentStatus,
    overdueEventAt,
    lastPaymentDate,
    actualFinalCreditDate,
    updatedAt: now.toISOString(),
  };

  next.timeliness = deriveTimeliness(next);
  next.documentStatus = deriveDocumentStatus({
    payrollWorkflowStatus: opts?.payrollWorkflowStatus ?? 'FINAL',
    paymentStatus: next.paymentStatus,
    outstandingAmount,
    confirmedPaidAmount,
    authorisedIssued: opts?.authorisedIssued,
  });

  return next;
}

export function buildInitiatedTransaction(input: {
  id?: string;
  obligation: SalaryPaymentObligation;
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
  existingTransactions: SalaryPaymentTransaction[];
  now?: Date;
}):
  | { ok: true; transaction: SalaryPaymentTransaction }
  | { ok: false; error: string; code: string } {
  const amountCheck = assertPaymentAmountAllowed(
    input.amount,
    input.obligation.outstandingAmount,
  );
  if (!amountCheck.ok) return amountCheck;

  if (
    detectDuplicateBankReference(
      input.existingTransactions,
      input.bankTransactionReference,
    )
  ) {
    return {
      ok: false,
      error: 'Duplicate bank transaction reference (UTR) is not permitted.',
      code: 'DUPLICATE_TRANSACTION_REFERENCE',
    };
  }

  const now = input.now ?? new Date();
  const transaction: SalaryPaymentTransaction = {
    id: input.id ?? generatePaymentId('txn'),
    obligationId: input.obligation.id,
    payrollRecordId: input.obligation.payrollRecordId,
    amount: roundRupees(input.amount),
    paymentMode: input.paymentMode,
    initiatedAt: input.initiatedAt ?? now.toISOString(),
    processedAt: input.processedAt ?? null,
    creditedAt: input.creditedAt ?? null,
    sourceBankAccountRef: input.sourceBankAccountRef ?? null,
    maskedDestinationAccount: input.maskedDestinationAccount ?? null,
    bankTransactionReference: input.bankTransactionReference?.trim() || null,
    transactionStatus: 'INITIATED',
    remarks: input.remarks ?? null,
    supportingEvidencePath: input.supportingEvidencePath ?? null,
    evidenceSha256: input.evidenceSha256 ?? null,
    createdBy: input.createdBy,
    confirmedBy: null,
    createdAt: now.toISOString(),
    confirmedAt: null,
    reversalOfTransactionId: null,
    reversalReason: null,
    cancelledAt: null,
  };

  return { ok: true, transaction };
}

export function confirmTransaction(input: {
  transaction: SalaryPaymentTransaction;
  confirmer: ActorContext;
  overrideReason?: string | null;
  creditedAt?: string | null;
  processedAt?: string | null;
  now?: Date;
}):
  | {
      ok: true;
      transaction: SalaryPaymentTransaction;
      emergencyOverride: boolean;
      auditAction: string;
    }
  | { ok: false; error: string; code: string } {
  if (
    input.transaction.transactionStatus !== 'INITIATED' &&
    input.transaction.transactionStatus !== 'PROCESSING'
  ) {
    return {
      ok: false,
      error: `Cannot confirm transaction in status ${input.transaction.transactionStatus}.`,
      code: 'INVALID_CONFIRM_STATUS',
    };
  }

  const maker = assertMakerChecker(
    input.transaction.createdBy,
    input.confirmer,
    input.overrideReason,
  );
  if (!maker.ok) return maker;

  const now = input.now ?? new Date();
  const transaction: SalaryPaymentTransaction = {
    ...input.transaction,
    transactionStatus: 'CONFIRMED',
    confirmedBy: input.confirmer.userId,
    confirmedAt: now.toISOString(),
    processedAt: input.processedAt ?? input.transaction.processedAt ?? now.toISOString(),
    creditedAt: input.creditedAt ?? input.transaction.creditedAt ?? now.toISOString().slice(0, 10),
  };

  return {
    ok: true,
    transaction,
    emergencyOverride: maker.emergencyOverride,
    auditAction: maker.emergencyOverride
      ? 'PAYMENT_CONFIRMED_EMERGENCY_OVERRIDE'
      : 'PAYMENT_CONFIRMED',
  };
}

export function markTransactionFailed(input: {
  transaction: SalaryPaymentTransaction;
  actor: ActorContext;
  reason: string;
  asRejectedByBank?: boolean;
  now?: Date;
}):
  | { ok: true; transaction: SalaryPaymentTransaction }
  | { ok: false; error: string; code: string } {
  if (isTransactionConfirmed(input.transaction)) {
    return {
      ok: false,
      error: 'Confirmed transactions cannot be marked failed — reverse instead.',
      code: 'CONFIRMED_NOT_FAILABLE',
    };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Failure reason is required.', code: 'REASON_REQUIRED' };
  }
  const now = input.now ?? new Date();
  return {
    ok: true,
    transaction: {
      ...input.transaction,
      transactionStatus: input.asRejectedByBank ? 'REJECTED_BY_BANK' : 'FAILED',
      remarks: input.reason,
      processedAt: now.toISOString(),
    },
  };
}

/**
 * Never delete confirmed payments. Corrections = reversal + reason + approval + replacement.
 */
export function reverseConfirmedTransaction(input: {
  original: SalaryPaymentTransaction;
  approver: ActorContext;
  reason: string;
  now?: Date;
}):
  | {
      ok: true;
      original: SalaryPaymentTransaction;
      reversal: SalaryPaymentTransaction;
    }
  | { ok: false; error: string; code: string } {
  if (!isTransactionConfirmed(input.original)) {
    return {
      ok: false,
      error: 'Only confirmed/settled transactions can be reversed.',
      code: 'NOT_CONFIRMED',
    };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Reversal reason is required.', code: 'REVERSAL_REASON_REQUIRED' };
  }

  const now = input.now ?? new Date();
  const original: SalaryPaymentTransaction = {
    ...input.original,
    transactionStatus: 'REVERSED',
  };
  const reversal: SalaryPaymentTransaction = {
    id: generatePaymentId('txn'),
    obligationId: input.original.obligationId,
    payrollRecordId: input.original.payrollRecordId,
    amount: input.original.amount,
    paymentMode: input.original.paymentMode,
    initiatedAt: now.toISOString(),
    processedAt: now.toISOString(),
    creditedAt: null,
    sourceBankAccountRef: input.original.sourceBankAccountRef,
    maskedDestinationAccount: input.original.maskedDestinationAccount,
    bankTransactionReference: input.original.bankTransactionReference
      ? `REV-${input.original.bankTransactionReference}`
      : null,
    transactionStatus: 'REVERSED',
    remarks: `Reversal of ${input.original.id}`,
    supportingEvidencePath: null,
    evidenceSha256: null,
    createdBy: input.approver.userId,
    confirmedBy: input.approver.userId,
    createdAt: now.toISOString(),
    confirmedAt: now.toISOString(),
    reversalOfTransactionId: input.original.id,
    reversalReason: input.reason.trim(),
    cancelledAt: null,
  };

  return { ok: true, original, reversal };
}

export function placeHoldOrDeferral(input: {
  id?: string;
  obligation: SalaryPaymentObligation;
  kind: 'ON_HOLD' | 'PAYMENT_DEFERRED';
  reasonCategory: PaymentHoldReasonCategory;
  detailedExplanation: string;
  amountAffected: number;
  revisedExpectedDate: string;
  approvingUser: string;
  employeeNotificationTimestamp?: string | null;
  evidencePath?: string | null;
  complianceReviewFlag: boolean;
  now?: Date;
}):
  | {
      ok: true;
      hold: PaymentHoldOrDeferral;
      obligation: SalaryPaymentObligation;
    }
  | { ok: false; error: string; code: string } {
  if (!input.detailedExplanation.trim()) {
    return { ok: false, error: 'Detailed explanation is required.', code: 'EXPLANATION_REQUIRED' };
  }
  if (input.reasonCategory === 'OTHER' && input.detailedExplanation.trim().length < 10) {
    return {
      ok: false,
      error: 'OTHER hold reason requires a detailed explanation (at least 10 characters).',
      code: 'OTHER_EXPLANATION_REQUIRED',
    };
  }
  if (!input.revisedExpectedDate) {
    return {
      ok: false,
      error: 'Revised expected date is required for hold/deferral.',
      code: 'REVISED_DATE_REQUIRED',
    };
  }
  if (!input.approvingUser) {
    return { ok: false, error: 'Approving user is required.', code: 'APPROVER_REQUIRED' };
  }
  if (input.amountAffected <= 0) {
    return { ok: false, error: 'Amount affected must be positive.', code: 'INVALID_AMOUNT' };
  }

  const now = input.now ?? new Date();
  const hold: PaymentHoldOrDeferral = {
    id: input.id ?? generatePaymentId('hold'),
    obligationId: input.obligation.id,
    kind: input.kind,
    reasonCategory: input.reasonCategory,
    detailedExplanation: input.detailedExplanation.trim(),
    amountAffected: roundRupees(input.amountAffected),
    revisedExpectedDate: input.revisedExpectedDate,
    approvingUser: input.approvingUser,
    approvalTimestamp: now.toISOString(),
    employeeNotificationTimestamp: input.employeeNotificationTimestamp ?? null,
    evidencePath: input.evidencePath ?? null,
    complianceReviewFlag: input.complianceReviewFlag,
    active: true,
    releasedAt: null,
    createdAt: now.toISOString(),
  };

  // Reschedule writes revised expected only — never touches original statutory due or overdue event.
  const obligation: SalaryPaymentObligation = {
    ...input.obligation,
    revisedExpectedDate: input.revisedExpectedDate,
    paymentStatus: input.kind === 'PAYMENT_DEFERRED' ? 'PAYMENT_DEFERRED' : 'ON_HOLD',
    // Explicitly preserve original due:
    originalStatutoryDueDate: input.obligation.originalStatutoryDueDate,
    overdueEventAt: input.obligation.overdueEventAt,
    updatedAt: now.toISOString(),
  };

  return { ok: true, hold, obligation };
}

/**
 * Reschedule expected payment. Never overwrites originalStatutoryDueDate
 * and never clears overdueEventAt.
 */
export function rescheduleExpectedPayment(input: {
  obligation: SalaryPaymentObligation;
  revisedExpectedDate: string;
  actorUserId: string;
  reason: string;
  now?: Date;
}):
  | {
      ok: true;
      obligation: SalaryPaymentObligation;
      preservedOriginalDueDate: string;
      preservedOverdueEventAt: string | null;
    }
  | { ok: false; error: string; code: string } {
  if (!input.revisedExpectedDate) {
    return { ok: false, error: 'Revised expected date is required.', code: 'REVISED_DATE_REQUIRED' };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Reschedule reason is required.', code: 'REASON_REQUIRED' };
  }

  const original = input.obligation.originalStatutoryDueDate;
  const overdueEventAt = input.obligation.overdueEventAt;
  const now = input.now ?? new Date();

  const obligation: SalaryPaymentObligation = {
    ...input.obligation,
    revisedExpectedDate: input.revisedExpectedDate,
    // Explicitly preserve:
    originalStatutoryDueDate: original,
    overdueEventAt,
    updatedAt: now.toISOString(),
  };

  return {
    ok: true,
    obligation,
    preservedOriginalDueDate: original,
    preservedOverdueEventAt: overdueEventAt,
  };
}

export function buildAuditEvent(input: {
  id?: string;
  obligationId: string;
  transactionId?: string | null;
  action: string;
  actorUserId: string;
  reason?: string | null;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  emergencyOverride?: boolean;
  now?: Date;
}): PaymentAuditEvent {
  return {
    id: input.id ?? generatePaymentId('aud'),
    obligationId: input.obligationId,
    transactionId: input.transactionId ?? null,
    action: input.action,
    actorUserId: input.actorUserId,
    reason: input.reason ?? null,
    previousValues: input.previousValues ?? null,
    newValues: input.newValues ?? null,
    emergencyOverride: input.emergencyOverride ?? false,
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

/** In-memory ledger used by unit tests and as the action orchestration model. */
export class SalaryPaymentLedger {
  obligation: SalaryPaymentObligation;
  transactions: SalaryPaymentTransaction[] = [];
  holds: PaymentHoldOrDeferral[] = [];
  audit: PaymentAuditEvent[] = [];
  authorisedIssued = false;

  constructor(obligation: SalaryPaymentObligation) {
    this.obligation = obligation;
  }

  private refresh(now?: Date) {
    this.obligation = refreshObligationTotals(
      this.obligation,
      this.transactions,
      this.holds,
      {
        now,
        authorisedIssued: this.authorisedIssued,
        payrollWorkflowStatus: 'FINAL',
      },
    );
  }

  addPayment(
    input: Omit<
      Parameters<typeof buildInitiatedTransaction>[0],
      'obligation' | 'existingTransactions'
    >,
  ) {
    const result = buildInitiatedTransaction({
      ...input,
      obligation: this.obligation,
      existingTransactions: this.transactions,
    });
    if (!result.ok) return result;
    this.transactions.push(result.transaction);
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        transactionId: result.transaction.id,
        action: 'PAYMENT_RECORDED',
        actorUserId: input.createdBy,
        newValues: { amount: result.transaction.amount, status: 'INITIATED' },
        now: input.now,
      }),
    );
    this.refresh(input.now);
    return result;
  }

  confirm(
    transactionId: string,
    confirmer: ActorContext,
    opts?: { overrideReason?: string; creditedAt?: string; now?: Date },
  ) {
    const idx = this.transactions.findIndex((t) => t.id === transactionId);
    if (idx < 0) return { ok: false as const, error: 'Transaction not found.', code: 'NOT_FOUND' };
    const current = this.transactions[idx]!;
    const result = confirmTransaction({
      transaction: current,
      confirmer,
      overrideReason: opts?.overrideReason,
      creditedAt: opts?.creditedAt,
      now: opts?.now,
    });
    if (!result.ok) return result;
    this.transactions[idx] = result.transaction;
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        transactionId,
        action: result.auditAction,
        actorUserId: confirmer.userId,
        reason: opts?.overrideReason ?? null,
        emergencyOverride: result.emergencyOverride,
        newValues: { status: 'CONFIRMED' },
        now: opts?.now,
      }),
    );
    this.refresh(opts?.now);
    return result;
  }

  fail(
    transactionId: string,
    actor: ActorContext,
    reason: string,
    opts?: { asRejectedByBank?: boolean; now?: Date },
  ) {
    const idx = this.transactions.findIndex((t) => t.id === transactionId);
    if (idx < 0) return { ok: false as const, error: 'Transaction not found.', code: 'NOT_FOUND' };
    const current = this.transactions[idx]!;
    const result = markTransactionFailed({
      transaction: current,
      actor,
      reason,
      asRejectedByBank: opts?.asRejectedByBank,
      now: opts?.now,
    });
    if (!result.ok) return result;
    this.transactions[idx] = result.transaction;
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        transactionId,
        action: opts?.asRejectedByBank ? 'PAYMENT_REJECTED_BY_BANK' : 'PAYMENT_FAILED',
        actorUserId: actor.userId,
        reason,
        now: opts?.now,
      }),
    );
    this.refresh(opts?.now);
    return result;
  }

  reverse(transactionId: string, approver: ActorContext, reason: string, now?: Date) {
    const idx = this.transactions.findIndex((t) => t.id === transactionId);
    if (idx < 0) return { ok: false as const, error: 'Transaction not found.', code: 'NOT_FOUND' };
    const current = this.transactions[idx]!;
    const result = reverseConfirmedTransaction({
      original: current,
      approver,
      reason,
      now,
    });
    if (!result.ok) return result;
    this.transactions[idx] = result.original;
    this.transactions.push(result.reversal);
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        transactionId: result.reversal.id,
        action: 'PAYMENT_REVERSED',
        actorUserId: approver.userId,
        reason,
        previousValues: { originalId: transactionId },
        newValues: { reversalId: result.reversal.id },
        now,
      }),
    );
    this.refresh(now);
    return result;
  }

  hold(
    input: Omit<Parameters<typeof placeHoldOrDeferral>[0], 'obligation'>,
  ) {
    const result = placeHoldOrDeferral({ ...input, obligation: this.obligation });
    if (!result.ok) return result;
    // Deactivate prior holds
    this.holds = this.holds.map((h) =>
      h.active ? { ...h, active: false, releasedAt: (input.now ?? new Date()).toISOString() } : h,
    );
    this.holds.push(result.hold);
    this.obligation = result.obligation;
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        action: input.kind === 'PAYMENT_DEFERRED' ? 'PAYMENT_DEFERRED' : 'PAYMENT_ON_HOLD',
        actorUserId: input.approvingUser,
        reason: input.detailedExplanation,
        newValues: {
          revisedExpectedDate: input.revisedExpectedDate,
          reasonCategory: input.reasonCategory,
        },
        now: input.now,
      }),
    );
    this.refresh(input.now);
    return result;
  }

  reschedule(revisedExpectedDate: string, actorUserId: string, reason: string, now?: Date) {
    const result = rescheduleExpectedPayment({
      obligation: this.obligation,
      revisedExpectedDate,
      actorUserId,
      reason,
      now,
    });
    if (!result.ok) return result;
    this.obligation = result.obligation;
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        action: 'PAYMENT_RESCHEDULED',
        actorUserId,
        reason,
        previousValues: {
          originalStatutoryDueDate: result.preservedOriginalDueDate,
          overdueEventAt: result.preservedOverdueEventAt,
        },
        newValues: { revisedExpectedDate },
        now,
      }),
    );
    this.refresh(now);
    return result;
  }

  /**
   * No contractual salary due for the month — distinct from waiver / deferral / hold.
   * Does not fabricate a paid transfer.
   */
  markNoSalaryDue(input: {
    reason: string;
    approvalBasis: string;
    approvingAuthority: string;
    actorUserId: string;
    now?: Date;
  }) {
    if (!input.reason.trim() || !input.approvalBasis.trim() || !input.approvingAuthority.trim()) {
      return {
        ok: false as const,
        error: 'NO_SALARY_DUE requires reason, approval basis, and approving authority.',
        code: 'NO_SALARY_DUE_FIELDS_REQUIRED',
      };
    }
    if (this.obligation.confirmedPaidAmount > 0) {
      return {
        ok: false as const,
        error: 'Cannot mark NO_SALARY_DUE after confirmed payments exist.',
        code: 'NO_SALARY_DUE_AFTER_PAYMENT',
      };
    }
    const now = input.now ?? new Date();
    this.obligation = {
      ...this.obligation,
      exceptionKind: 'NO_SALARY_DUE',
      exceptionReason: input.reason.trim(),
      exceptionApprovalReference: input.approvalBasis.trim(),
      exceptionApprovedBy: input.approvingAuthority.trim(),
      exceptionApprovedAt: now.toISOString(),
      outstandingAmount: 0,
      paymentStatus: 'NO_SALARY_DUE',
      documentStatus: 'AUTHORISED_BLOCKED',
      timeliness: 'N/A',
      updatedAt: now.toISOString(),
    };
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        action: 'NO_SALARY_DUE_RECORDED',
        actorUserId: input.actorUserId,
        reason: input.reason,
        newValues: {
          approvalBasis: input.approvalBasis,
          approvingAuthority: input.approvingAuthority,
        },
        now,
      }),
    );
    return { ok: true as const, obligation: this.obligation };
  }

  /**
   * Salary was payable but formally waived. Never issues a paid authorised slip.
   */
  markSalaryWaived(input: {
    reason: string;
    amountWaived: number;
    approvingAuthority: string;
    dateApproved: string;
    taxAccountingReviewStatus: string;
    actorUserId: string;
    evidencePath?: string | null;
    now?: Date;
  }) {
    if (
      !input.reason.trim() ||
      !input.approvingAuthority.trim() ||
      !input.taxAccountingReviewStatus.trim()
    ) {
      return {
        ok: false as const,
        error:
          'SALARY_WAIVED requires written reason, approving authority, and tax/accounting review status.',
        code: 'SALARY_WAIVED_FIELDS_REQUIRED',
      };
    }
    if (!moneyEquals(input.amountWaived, this.obligation.netSalaryPayable)) {
      return {
        ok: false as const,
        error: 'Amount waived must equal the immutable net salary payable.',
        code: 'WAIVER_AMOUNT_MISMATCH',
      };
    }
    if (this.obligation.confirmedPaidAmount > 0) {
      return {
        ok: false as const,
        error: 'Cannot waive salary after confirmed payments exist — reverse first.',
        code: 'WAIVER_AFTER_PAYMENT',
      };
    }
    const now = input.now ?? new Date();
    this.obligation = {
      ...this.obligation,
      exceptionKind: 'SALARY_WAIVED',
      exceptionReason: input.reason.trim(),
      exceptionApprovedBy: input.approvingAuthority.trim(),
      exceptionApprovedAt: input.dateApproved,
      exceptionEvidencePath: input.evidencePath ?? null,
      taxAccountingReviewStatus: input.taxAccountingReviewStatus.trim(),
      outstandingAmount: 0,
      paymentStatus: 'SALARY_WAIVED',
      documentStatus: 'AUTHORISED_BLOCKED',
      timeliness: 'N/A',
      updatedAt: now.toISOString(),
    };
    this.audit.push(
      buildAuditEvent({
        obligationId: this.obligation.id,
        action: 'SALARY_WAIVED',
        actorUserId: input.actorUserId,
        reason: input.reason,
        newValues: {
          amountWaived: input.amountWaived,
          approvingAuthority: input.approvingAuthority,
          dateApproved: input.dateApproved,
          taxAccountingReviewStatus: input.taxAccountingReviewStatus,
        },
        now,
      }),
    );
    return { ok: true as const, obligation: this.obligation };
  }

  tryManualPaid(): { ok: true } | { ok: false; error: string; code: string } {
    return assertManualPaidAllowed(
      this.obligation.netSalaryPayable,
      this.obligation.confirmedPaidAmount,
    );
  }

  canIssueAuthorisedSlip() {
    return assertDocumentAllowed(
      'AUTHORISED_SALARY_SLIP',
      this.obligation.documentStatus,
      this.obligation.paymentStatus,
      this.obligation.outstandingAmount,
    );
  }
}

/** Unconfirmed (INITIATED/PROCESSING) must not count toward paid total. */
export function unconfirmedExcludedFromPaidTotal(
  transactions: SalaryPaymentTransaction[],
): boolean {
  const withUnconfirmed = computeConfirmedPaidAmount(transactions);
  const onlyConfirmed = computeConfirmedPaidAmount(
    transactions.filter((t) => isTransactionConfirmed(t)),
  );
  return moneyEquals(withUnconfirmed, onlyConfirmed);
}

export function isPastDue(dueDate: string, now: Date): boolean {
  return isAfter(startOfDay(now), startOfDay(parseISO(dueDate)));
}

export function isBeforeOrOnDue(creditDate: string, dueDate: string): boolean {
  return !isAfter(startOfDay(parseISO(creditDate)), startOfDay(parseISO(dueDate)));
}

export function assertImmutableAuditHistory(
  before: PaymentAuditEvent[],
  after: PaymentAuditEvent[],
): { ok: true } | { ok: false; error: string; code: string } {
  if (after.length < before.length) {
    return {
      ok: false,
      error: 'Audit history must be append-only; events were removed.',
      code: 'AUDIT_HISTORY_MUTATED',
    };
  }
  for (let i = 0; i < before.length; i++) {
    const prev = before[i];
    const next = after[i];
    if (!prev || !next || prev.id !== next.id || prev.action !== next.action) {
      return {
        ok: false,
        error: 'Prior audit events must never be altered.',
        code: 'AUDIT_HISTORY_MUTATED',
      };
    }
  }
  return { ok: true };
}

// Keep isBefore import used for clarity in potential date guards
void isBefore;
