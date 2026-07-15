/**
 * Salary-payment reconciliation — required scenarios.
 */

import { describe, expect, it } from 'vitest';
import {
  SalaryPaymentLedger,
  assertDocumentAllowed,
  assertImmutableAuditHistory,
  assertMakerChecker,
  assertManualPaidAllowed,
  computeConfirmedPaidAmount,
  createObligationFromFinalPayroll,
  detectDuplicateBankReference,
  deriveTimeliness,
  partialDocumentTitle,
  refreshObligationTotals,
} from '../salary-payment';

function freshLedger(net = 50000, monthYear = '2026-06') {
  const obligation = createObligationFromFinalPayroll({
    payrollRecordId: 'slip-1',
    employeeId: 'emp-1',
    monthYear,
    netSalaryPayable: net,
    paydayDayOfMonth: 5,
    now: new Date('2026-07-01T10:00:00Z'),
  });
  return new SalaryPaymentLedger(obligation);
}

const maker: { userId: string; emergencyOverridePermission: boolean } = {
  userId: 'user-maker',
  emergencyOverridePermission: false,
};
const checker: { userId: string; emergencyOverridePermission: boolean } = {
  userId: 'user-checker',
  emergencyOverridePermission: false,
};

describe('salary payment reconciliation', () => {
  it('no salary due blocks authorised slip and is distinct from waiver', () => {
    const ledger = freshLedger(50000);
    const result = ledger.markNoSalaryDue({
      reason: 'Executive elected not to draw salary this month',
      approvalBasis: 'Board note 2026-07-01',
      approvingAuthority: 'Board',
      actorUserId: maker.userId,
    });
    expect(result.ok).toBe(true);
    expect(ledger.obligation.paymentStatus).toBe('NO_SALARY_DUE');
    expect(ledger.obligation.outstandingAmount).toBe(0);
    expect(ledger.canIssueAuthorisedSlip().ok).toBe(false);
    expect(
      assertDocumentAllowed(
        'NO_SALARY_DRAWN_STATEMENT',
        ledger.obligation.documentStatus,
        ledger.obligation.paymentStatus,
        ledger.obligation.outstandingAmount,
      ).ok,
    ).toBe(true);
  });

  it('salary waived blocks authorised paid slip', () => {
    const ledger = freshLedger(50000);
    const result = ledger.markSalaryWaived({
      reason: 'Written waiver for July 2026',
      amountWaived: 50000,
      approvingAuthority: 'Director',
      dateApproved: '2026-07-28',
      taxAccountingReviewStatus: 'PENDING_REVIEW',
      actorUserId: maker.userId,
      evidencePath: 'private/waivers/july.pdf',
    });
    expect(result.ok).toBe(true);
    expect(ledger.obligation.paymentStatus).toBe('SALARY_WAIVED');
    expect(ledger.canIssueAuthorisedSlip().ok).toBe(false);
    expect(
      assertDocumentAllowed(
        'SALARY_WAIVER_RECORD',
        ledger.obligation.documentStatus,
        ledger.obligation.paymentStatus,
        0,
      ).ok,
    ).toBe(true);
  });

  it('full single payment → PAID, on-time', () => {
    const ledger = freshLedger(50000);
    const due = ledger.obligation.originalStatutoryDueDate;
    const add = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UTR111',
      now: new Date('2026-07-02T10:00:00Z'),
    });
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(ledger.obligation.confirmedPaidAmount).toBe(0); // unconfirmed excluded
    expect(ledger.obligation.paymentStatus).toBe('PROCESSING');

    const conf = ledger.confirm(add.transaction.id, checker, {
      creditedAt: due,
      now: new Date('2026-07-03T10:00:00Z'),
    });
    expect(conf.ok).toBe(true);
    expect(ledger.obligation.paymentStatus).toBe('PAID');
    expect(ledger.obligation.outstandingAmount).toBe(0);
    expect(ledger.obligation.confirmedPaidAmount).toBe(50000);
    expect(ledger.obligation.timeliness).toBe('PAID_ON_TIME');
    expect(ledger.obligation.netSalaryPayable).toBe(50000);
  });

  it('two-part payment', () => {
    const ledger = freshLedger(50000);
    const beforeDue = new Date('2026-07-03T10:00:00Z');
    const a = ledger.addPayment({
      amount: 20000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UTR-A',
      now: beforeDue,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, {
      creditedAt: '2026-07-03',
      now: beforeDue,
    });
    expect(ledger.obligation.paymentStatus).toBe('PARTIALLY_PAID');
    expect(ledger.obligation.confirmedPaidAmount).toBe(20000);
    expect(ledger.obligation.outstandingAmount).toBe(30000);

    const b = ledger.addPayment({
      amount: 30000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UTR-B',
      now: beforeDue,
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    ledger.confirm(b.transaction.id, checker, {
      creditedAt: '2026-07-04',
      now: new Date('2026-07-04T10:00:00Z'),
    });
    expect(ledger.obligation.paymentStatus).toBe('PAID');
    expect(ledger.obligation.outstandingAmount).toBe(0);
  });

  it('multi-phase payment', () => {
    const ledger = freshLedger(60000);
    for (const [i, amount] of [10000, 20000, 30000].entries()) {
      const r = ledger.addPayment({
        amount,
        paymentMode: 'UPI',
        createdBy: maker.userId,
        bankTransactionReference: `PHASE-${i}`,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      ledger.confirm(r.transaction.id, checker, { creditedAt: `2026-07-0${i + 2}` });
    }
    expect(ledger.obligation.paymentStatus).toBe('PAID');
    expect(ledger.obligation.confirmedPaidAmount).toBe(60000);
  });

  it('failed payment', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UTR-FAIL',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const fail = ledger.fail(a.transaction.id, maker, 'NEFT rejected');
    expect(fail.ok).toBe(true);
    expect(ledger.obligation.paymentStatus).toBe('FAILED');
    expect(ledger.obligation.confirmedPaidAmount).toBe(0);
  });

  it('reversed payment', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UTR-REV',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, { creditedAt: '2026-07-03' });
    expect(ledger.obligation.paymentStatus).toBe('PAID');

    const rev = ledger.reverse(a.transaction.id, checker, 'Wrong account credited');
    expect(rev.ok).toBe(true);
    expect(ledger.obligation.confirmedPaidAmount).toBe(0);
    expect(ledger.obligation.paymentStatus).toBe('REVERSED');
    expect(ledger.transactions.filter((t) => t.transactionStatus === 'REVERSED')).toHaveLength(2);
    // Never deleted
    expect(ledger.transactions.some((t) => t.id === a.transaction.id)).toBe(true);
  });

  it('partial payment followed by full settlement', () => {
    const ledger = freshLedger(45000);
    const beforeDue = new Date('2026-07-03T10:00:00Z');
    const p1 = ledger.addPayment({
      amount: 15000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'P1',
      now: beforeDue,
    });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    ledger.confirm(p1.transaction.id, checker, {
      creditedAt: '2026-07-03',
      now: beforeDue,
    });
    expect(ledger.obligation.paymentStatus).toBe('PARTIALLY_PAID');
    // Net salary immutable
    expect(ledger.obligation.netSalaryPayable).toBe(45000);

    const p2 = ledger.addPayment({
      amount: 30000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'P2',
      now: beforeDue,
    });
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    ledger.confirm(p2.transaction.id, checker, {
      creditedAt: '2026-07-04',
      now: new Date('2026-07-04T12:00:00Z'),
    });
    expect(ledger.obligation.paymentStatus).toBe('PAID');
    expect(ledger.obligation.netSalaryPayable).toBe(45000);
  });

  it('payment placed on hold', () => {
    const ledger = freshLedger(50000);
    const hold = ledger.hold({
      kind: 'ON_HOLD',
      reasonCategory: 'BANK_ISSUE',
      detailedExplanation: 'Beneficiary IFSC change pending',
      amountAffected: 50000,
      revisedExpectedDate: '2026-07-20',
      approvingUser: checker.userId,
      complianceReviewFlag: true,
      now: new Date('2026-07-06T10:00:00Z'),
    });
    expect(hold.ok).toBe(true);
    expect(ledger.obligation.paymentStatus).toBe('ON_HOLD');
    expect(ledger.obligation.revisedExpectedDate).toBe('2026-07-20');
    expect(ledger.holds[0]?.complianceReviewFlag).toBe(true);
  });

  it('extended expected date never overwrites original due or clears overdue', () => {
    const ledger = freshLedger(50000, '2026-05');
    // Force overdue: statutory due is payday of following month (5 Jun for May payroll)
    const due = ledger.obligation.originalStatutoryDueDate;
    ledger.obligation = refreshObligationTotals(
      ledger.obligation,
      ledger.transactions,
      ledger.holds,
      { now: new Date('2026-06-20T12:00:00Z'), payrollWorkflowStatus: 'FINAL' },
    );
    expect(ledger.obligation.paymentStatus).toBe('OVERDUE');
    expect(ledger.obligation.overdueEventAt).toBeTruthy();
    const overdueAt = ledger.obligation.overdueEventAt;

    const res = ledger.reschedule(
      '2026-07-15',
      checker.userId,
      'Funding delay — board approved extension',
      new Date('2026-06-21T10:00:00Z'),
    );
    expect(res.ok).toBe(true);
    expect(ledger.obligation.originalStatutoryDueDate).toBe(due);
    expect(ledger.obligation.revisedExpectedDate).toBe('2026-07-15');
    expect(ledger.obligation.overdueEventAt).toBe(overdueAt);
  });

  it('overdue detection', () => {
    const obligation = createObligationFromFinalPayroll({
      payrollRecordId: 'slip-ov',
      employeeId: 'emp-1',
      monthYear: '2026-04',
      netSalaryPayable: 10000,
      paydayDayOfMonth: 5,
      now: new Date('2026-05-01T10:00:00Z'),
    });
    const refreshed = refreshObligationTotals(obligation, [], [], {
      now: new Date('2026-05-10T10:00:00Z'),
      payrollWorkflowStatus: 'FINAL',
    });
    expect(refreshed.paymentStatus).toBe('OVERDUE');
    expect(refreshed.overdueEventAt).toBeTruthy();
  });

  it('paid-late detection', () => {
    const ledger = freshLedger(50000, '2026-05');
    const statutory = ledger.obligation.originalStatutoryDueDate;
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'LATE1',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    // Credit after statutory due
    ledger.confirm(a.transaction.id, checker, {
      creditedAt: '2026-06-20',
      now: new Date('2026-06-20T10:00:00Z'),
    });
    expect(ledger.obligation.paymentStatus).toBe('PAID');
    expect(ledger.obligation.timeliness).toBe('PAID_LATE');
    expect(deriveTimeliness(ledger.obligation)).toBe('PAID_LATE');
    expect(statutory).toBeTruthy();
  });

  it('duplicate transaction reference rejected', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 10000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'DUP-UTR',
    });
    expect(a.ok).toBe(true);
    const b = ledger.addPayment({
      amount: 10000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'dup-utr',
    });
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.code).toBe('DUPLICATE_TRANSACTION_REFERENCE');
    expect(
      detectDuplicateBankReference(ledger.transactions, 'DUP-UTR'),
    ).toBe(true);
  });

  it('payment greater than outstanding amount rejected', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 20000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'PART',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, { creditedAt: '2026-07-03' });

    const over = ledger.addPayment({
      amount: 40000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'OVER',
    });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.code).toBe('AMOUNT_EXCEEDS_OUTSTANDING');
  });

  it('unconfirmed transaction excluded from paid total', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'UNC',
    });
    expect(a.ok).toBe(true);
    expect(computeConfirmedPaidAmount(ledger.transactions)).toBe(0);
    expect(ledger.obligation.confirmedPaidAmount).toBe(0);
    expect(ledger.obligation.outstandingAmount).toBe(50000);
  });

  it('same person maker-checker rejection', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'MC1',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const same = ledger.confirm(a.transaction.id, maker);
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.code).toBe('MAKER_CHECKER_SAME_USER');

    const gate = assertMakerChecker(maker.userId, maker);
    expect(gate.ok).toBe(false);

    const overrideUser = {
      userId: maker.userId,
      emergencyOverridePermission: true,
    };
    const withReason = ledger.confirm(a.transaction.id, overrideUser, {
      overrideReason: 'Sole authorised admin — emergency',
      creditedAt: '2026-07-05',
    });
    expect(withReason.ok).toBe(true);
    expect(ledger.audit.some((e) => e.emergencyOverride)).toBe(true);
  });

  it('authorised salary-slip blocking while outstanding exists', () => {
    const ledger = freshLedger(50000);
    const a = ledger.addPayment({
      amount: 10000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'AUTH-BLOCK',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, { creditedAt: '2026-07-03' });

    const blocked = ledger.canIssueAuthorisedSlip();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe('AUTHORISED_BLOCKED_OUTSTANDING');

    expect(
      assertDocumentAllowed(
        'INTERNAL_PAY_SLIP',
        ledger.obligation.documentStatus,
        ledger.obligation.paymentStatus,
        ledger.obligation.outstandingAmount,
      ).ok,
    ).toBe(true);

    expect(
      assertDocumentAllowed(
        'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID',
        ledger.obligation.documentStatus,
        ledger.obligation.paymentStatus,
        ledger.obligation.outstandingAmount,
      ).ok,
    ).toBe(true);
    expect(partialDocumentTitle('SALARY_PAYMENT_ADVICE_PARTIALLY_PAID')).toBe(
      'SALARY PAYMENT ADVICE — PARTIALLY PAID',
    );
  });

  it('immutable audit history', () => {
    const ledger = freshLedger(50000);
    const before = [...ledger.audit];
    const a = ledger.addPayment({
      amount: 25000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'AUD1',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, { creditedAt: '2026-07-03' });
    const after = ledger.audit;
    expect(assertImmutableAuditHistory(before, after).ok).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);

    // Mutating prior events is detected
    const mutated = after.map((e, i) => (i === 0 ? { ...e, action: 'TAMPERED' } : e));
    expect(assertImmutableAuditHistory(after, mutated).ok).toBe(false);
  });

  it('manual PAID blocked unless settled txs reconcile exactly', () => {
    const ledger = freshLedger(50000);
    expect(assertManualPaidAllowed(50000, 0).ok).toBe(false);
    expect(assertManualPaidAllowed(50000, 49999).ok).toBe(false);
    const a = ledger.addPayment({
      amount: 50000,
      paymentMode: 'Bank Transfer',
      createdBy: maker.userId,
      bankTransactionReference: 'FULL',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    ledger.confirm(a.transaction.id, checker, { creditedAt: '2026-07-05' });
    expect(ledger.tryManualPaid().ok).toBe(true);
  });

  it('FINAL payroll does not imply PAID', () => {
    const obligation = createObligationFromFinalPayroll({
      payrollRecordId: 'slip-final',
      employeeId: 'emp-1',
      monthYear: '2026-06',
      netSalaryPayable: 50000,
      paydayDayOfMonth: 5,
    });
    expect(obligation.paymentStatus).not.toBe('PAID');
    expect(['SCHEDULED', 'NOT_SCHEDULED']).toContain(obligation.paymentStatus);
    expect(obligation.documentStatus).not.toBe('AUTHORISED_ELIGIBLE');
  });
});
