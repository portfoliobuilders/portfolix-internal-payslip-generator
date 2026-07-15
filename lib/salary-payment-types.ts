/**
 * Salary-payment reconciliation types.
 * Three lifecycle dimensions stay independent:
 *   1. Payroll status (workflow) — FINAL ≠ paid
 *   2. Payment status — obligation + transactions
 *   3. Document status — what slips / advice may be issued
 */

/** Obligation-level payment lifecycle (parent). */
export type SalaryPaymentStatus =
  | 'NOT_SCHEDULED'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'FAILED'
  | 'REJECTED_BY_BANK'
  | 'ON_HOLD'
  | 'PAYMENT_DEFERRED'
  | 'OVERDUE'
  | 'REVERSED'
  | 'CANCELLED'
  | 'UNDER_RECONCILIATION';

/** Document lifecycle — independent of payroll FINAL and of payment PAID. */
export type DocumentLifecycleStatus =
  | 'NOT_READY'
  | 'INTERNAL_AVAILABLE'
  | 'PARTIAL_ADVICE_ALLOWED'
  | 'OUTSTANDING_STATEMENT_ALLOWED'
  | 'AUTHORISED_BLOCKED'
  | 'AUTHORISED_ELIGIBLE'
  | 'AUTHORISED_ISSUED';

/** Child payment transaction lifecycle. */
export type PaymentTransactionStatus =
  | 'INITIATED'
  | 'PROCESSING'
  | 'SETTLED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REJECTED_BY_BANK'
  | 'REVERSED'
  | 'CANCELLED';

export type PaymentHoldReasonCategory =
  | 'BANK_ISSUE'
  | 'COMPLIANCE_HOLD'
  | 'EMPLOYEE_REQUEST'
  | 'FUNDING_DELAY'
  | 'DISPUTE'
  | 'OTHER';

export type TimelinessIndicator = 'NOT_YET_PAID' | 'PAID_ON_TIME' | 'PAID_LATE' | 'N/A';

export type DocumentKind =
  | 'INTERNAL_PAY_SLIP'
  | 'AUTHORISED_SALARY_SLIP'
  | 'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID'
  | 'OUTSTANDING_SALARY_STATEMENT';

export interface SalaryPaymentObligation {
  id: string;
  payrollRecordId: string;
  employeeId: string;
  monthYear: string;
  /** Immutable net salary payable from the finalised payroll record. */
  netSalaryPayable: number;
  paymentStatus: SalaryPaymentStatus;
  documentStatus: DocumentLifecycleStatus;
  /** Statutory payday / credit due date — never overwritten by reschedule. */
  originalStatutoryDueDate: string;
  /** Company-committed credit date at finalisation. */
  companyCommittedDate: string | null;
  /** Latest revised expected date (reschedule writes here only). */
  revisedExpectedDate: string | null;
  /** Actual final credit date once fully settled. */
  actualFinalCreditDate: string | null;
  /** Set when first overdue; never cleared by reschedule. */
  overdueEventAt: string | null;
  confirmedPaidAmount: number;
  outstandingAmount: number;
  lastPaymentDate: string | null;
  timeliness: TimelinessIndicator;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryPaymentTransaction {
  id: string;
  obligationId: string;
  payrollRecordId: string;
  amount: number;
  paymentMode: string;
  initiatedAt: string;
  processedAt: string | null;
  /** Credited / value date. */
  creditedAt: string | null;
  sourceBankAccountRef: string | null;
  maskedDestinationAccount: string | null;
  /** UTR / bank transaction reference. */
  bankTransactionReference: string | null;
  transactionStatus: PaymentTransactionStatus;
  remarks: string | null;
  supportingEvidencePath: string | null;
  evidenceSha256: string | null;
  createdBy: string;
  confirmedBy: string | null;
  createdAt: string;
  confirmedAt: string | null;
  reversalOfTransactionId: string | null;
  reversalReason: string | null;
  /** Soft-deleted never; cancelled/reversed only. */
  cancelledAt: string | null;
}

export interface PaymentHoldOrDeferral {
  id: string;
  obligationId: string;
  kind: 'ON_HOLD' | 'PAYMENT_DEFERRED';
  reasonCategory: PaymentHoldReasonCategory;
  detailedExplanation: string;
  amountAffected: number;
  revisedExpectedDate: string;
  approvingUser: string;
  approvalTimestamp: string;
  employeeNotificationTimestamp: string | null;
  evidencePath: string | null;
  complianceReviewFlag: boolean;
  active: boolean;
  releasedAt: string | null;
  createdAt: string;
}

export interface PaymentAuditEvent {
  id: string;
  obligationId: string;
  transactionId: string | null;
  action: string;
  actorUserId: string;
  reason: string | null;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  emergencyOverride: boolean;
  createdAt: string;
}

export interface ActorContext {
  userId: string;
  /** Explicit permission to confirm own initiated payment. */
  emergencyOverridePermission: boolean;
}

export interface PaymentLedgerSummary {
  obligation: SalaryPaymentObligation;
  transactions: SalaryPaymentTransaction[];
  holds: PaymentHoldOrDeferral[];
  auditTimeline: PaymentAuditEvent[];
  payrollStatus: string;
  netSalaryDue: number;
  confirmedAmountPaid: number;
  outstandingBalance: number;
  originalDueDate: string;
  revisedExpectedDate: string | null;
  lastPaymentDate: string | null;
  timeliness: TimelinessIndicator;
}
