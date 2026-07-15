/**
 * Salary exception handling — NO_SALARY_DUE, SALARY_WAIVED, SALARY_DEFERRED,
 * PAYMENT_ON_HOLD, PARTIALLY_PAID statement eligibility.
 *
 * These situations are NEVER equivalent to each other or to PAID.
 */

export type SalaryExceptionKind =
  | 'NO_SALARY_DUE'
  | 'SALARY_WAIVED'
  | 'SALARY_DEFERRED'
  | 'PAYMENT_ON_HOLD'
  | 'PARTIALLY_PAID';

export type ExceptionDocumentKind =
  | 'NO_SALARY_DRAWN_STATEMENT'
  | 'SALARY_WAIVER_RECORD'
  | 'DEFERRED_SALARY_STATEMENT'
  | 'OUTSTANDING_SALARY_STATEMENT'
  | 'PARTIAL_SALARY_PAYMENT_ADVICE';

export interface SalaryExceptionRecord {
  id: string;
  payrollRecordId: string | null;
  employeeId: string;
  salaryMonth: string;
  exceptionKind: SalaryExceptionKind;
  reason: string;
  approvalBasis: string | null;
  approvingAuthority: string | null;
  amountWaived: number | null;
  amountDeferred: number | null;
  originalAmountDue: number | null;
  originalDueDate: string | null;
  revisedExpectedDate: string | null;
  dateApproved: string | null;
  taxAccountingReviewStatus: string | null;
  employeeAcknowledgementAt: string | null;
  evidencePath: string | null;
  evidenceSha256: string | null;
  supportingDocumentPath: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function exceptionDocumentTitle(kind: ExceptionDocumentKind): string {
  switch (kind) {
    case 'NO_SALARY_DRAWN_STATEMENT':
      return 'NO SALARY DRAWN STATEMENT';
    case 'SALARY_WAIVER_RECORD':
      return 'SALARY WAIVER RECORD';
    case 'DEFERRED_SALARY_STATEMENT':
      return 'DEFERRED SALARY STATEMENT';
    case 'OUTSTANDING_SALARY_STATEMENT':
      return 'OUTSTANDING SALARY STATEMENT';
    case 'PARTIAL_SALARY_PAYMENT_ADVICE':
      return 'SALARY PAYMENT ADVICE — PARTIALLY PAID';
    default:
      return 'SALARY EXCEPTION STATEMENT';
  }
}

export function documentKindForException(
  kind: SalaryExceptionKind,
): ExceptionDocumentKind {
  switch (kind) {
    case 'NO_SALARY_DUE':
      return 'NO_SALARY_DRAWN_STATEMENT';
    case 'SALARY_WAIVED':
      return 'SALARY_WAIVER_RECORD';
    case 'SALARY_DEFERRED':
      return 'DEFERRED_SALARY_STATEMENT';
    case 'PAYMENT_ON_HOLD':
      return 'OUTSTANDING_SALARY_STATEMENT';
    case 'PARTIALLY_PAID':
      return 'PARTIAL_SALARY_PAYMENT_ADVICE';
  }
}

export function assertNoSalaryDue(input: {
  reason: string;
  approvalBasis: string;
  salaryMonth: string;
  approvingAuthority: string;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (!input.reason.trim()) {
    return { ok: false, error: 'NO_SALARY_DUE requires a reason.', code: 'REASON_REQUIRED' };
  }
  if (!input.approvalBasis.trim()) {
    return { ok: false, error: 'NO_SALARY_DUE requires an approval basis.', code: 'APPROVAL_BASIS_REQUIRED' };
  }
  if (!input.salaryMonth) {
    return { ok: false, error: 'Effective payroll month is required.', code: 'MONTH_REQUIRED' };
  }
  if (!input.approvingAuthority.trim()) {
    return { ok: false, error: 'Approving authority is required.', code: 'AUTHORITY_REQUIRED' };
  }
  return { ok: true };
}

export function assertSalaryWaived(input: {
  reason: string;
  amountWaived: number;
  dateApproved: string;
  approvingAuthority: string;
  taxAccountingReviewStatus: string;
  evidencePath?: string | null;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (!input.reason.trim()) {
    return { ok: false, error: 'SALARY_WAIVED requires a written waiver reason.', code: 'REASON_REQUIRED' };
  }
  if (!(input.amountWaived > 0)) {
    return { ok: false, error: 'Amount waived must be positive.', code: 'AMOUNT_REQUIRED' };
  }
  if (!input.dateApproved) {
    return { ok: false, error: 'Waiver approval date is required.', code: 'DATE_REQUIRED' };
  }
  if (!input.approvingAuthority.trim()) {
    return {
      ok: false,
      error: 'Board/director approval authority is required for salary waiver.',
      code: 'AUTHORITY_REQUIRED',
    };
  }
  if (!input.taxAccountingReviewStatus.trim()) {
    return {
      ok: false,
      error: 'Tax/accounting review status is required for salary waiver.',
      code: 'TAX_REVIEW_REQUIRED',
    };
  }
  return { ok: true };
}

export function assertSalaryDeferred(input: {
  originalAmountDue: number;
  originalDueDate: string;
  revisedExpectedDate: string;
  reason: string;
  approval: string;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (!(input.originalAmountDue > 0)) {
    return { ok: false, error: 'Original amount due is required.', code: 'AMOUNT_REQUIRED' };
  }
  if (!input.originalDueDate) {
    return { ok: false, error: 'Original due date is required.', code: 'ORIGINAL_DUE_REQUIRED' };
  }
  if (!input.revisedExpectedDate) {
    return { ok: false, error: 'Revised expected date is required.', code: 'REVISED_DATE_REQUIRED' };
  }
  if (input.revisedExpectedDate === input.originalDueDate) {
    return {
      ok: false,
      error: 'Revised expected date must differ from original due date for a deferral.',
      code: 'REVISED_SAME_AS_ORIGINAL',
    };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'Deferral reason is required.', code: 'REASON_REQUIRED' };
  }
  if (!input.approval.trim()) {
    return { ok: false, error: 'Deferral approval is required.', code: 'APPROVAL_REQUIRED' };
  }
  return { ok: true };
}

/**
 * Authorised bank salary slip must NEVER be issued for these payment statuses.
 */
export const AUTHORISED_SLIP_BLOCKED_PAYMENT_STATUSES = new Set([
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

export function isAuthorisedSlipPaymentBlocked(paymentStatus: string): boolean {
  return AUTHORISED_SLIP_BLOCKED_PAYMENT_STATUSES.has(paymentStatus);
}

/** Footer disclaimer for exception / unpaid statements — never claim credited. */
export const EXCEPTION_DOCUMENT_DISCLAIMER =
  'This statement does not certify that salary was credited to the employee. ' +
  'It must not be presented as a paid authorised salary slip.';
