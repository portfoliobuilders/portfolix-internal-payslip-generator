/**
 * Salary exception (no-salary / waiver / deferred) validation tests.
 */

import { describe, expect, it } from 'vitest';
import {
  assertNoSalaryDue,
  assertSalaryDeferred,
  assertSalaryWaived,
  documentKindForException,
  exceptionDocumentTitle,
  isAuthorisedSlipPaymentBlocked,
} from '../salary-exceptions';
import { assertDocumentAllowed } from '../salary-payment';

describe('salary exceptions', () => {
  it('NO_SALARY_DUE requires reason, approval basis, month, authority', () => {
    expect(
      assertNoSalaryDue({
        reason: '',
        approvalBasis: 'Board minute',
        salaryMonth: '2026-07',
        approvingAuthority: 'Director',
      }).ok,
    ).toBe(false);

    expect(
      assertNoSalaryDue({
        reason: 'CEO elected not to draw salary this month',
        approvalBasis: 'Board resolution BR-2026-07',
        salaryMonth: '2026-07',
        approvingAuthority: 'Board of Directors',
      }).ok,
    ).toBe(true);
  });

  it('SALARY_WAIVED requires written waiver fields', () => {
    expect(
      assertSalaryWaived({
        reason: 'Waived',
        amountWaived: 50000,
        dateApproved: '2026-07-28',
        approvingAuthority: 'Board',
        taxAccountingReviewStatus: '',
      }).ok,
    ).toBe(false);

    expect(
      assertSalaryWaived({
        reason: 'Written waiver of July salary',
        amountWaived: 50000,
        dateApproved: '2026-07-28',
        approvingAuthority: 'Board of Directors',
        taxAccountingReviewStatus: 'Reviewed — no TDS payable this month',
        evidencePath: 'waivers/2026-07-ceo.pdf',
      }).ok,
    ).toBe(true);
  });

  it('SALARY_DEFERRED preserves original due and requires revised date', () => {
    const result = assertSalaryDeferred({
      originalAmountDue: 50000,
      originalDueDate: '2026-08-01',
      revisedExpectedDate: '2026-08-15',
      reason: 'Internal funding delay',
      approval: 'Director approval',
    });
    expect(result.ok).toBe(true);
  });

  it('authorised slip blocked for waived / no-salary / partial / deferred', () => {
    for (const status of [
      'SALARY_WAIVED',
      'NO_SALARY_DUE',
      'PARTIALLY_PAID',
      'PAYMENT_DEFERRED',
      'ON_HOLD',
      'SCHEDULED',
      'OVERDUE',
    ]) {
      expect(isAuthorisedSlipPaymentBlocked(status)).toBe(true);
    }
    expect(isAuthorisedSlipPaymentBlocked('PAID')).toBe(false);
  });

  it('partial advice and outstanding statements are allowed separately', () => {
    const partial = assertDocumentAllowed(
      'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID',
      'PARTIAL_ADVICE_ALLOWED',
      'PARTIALLY_PAID',
      30000,
    );
    expect(partial.ok).toBe(true);

    const outstanding = assertDocumentAllowed(
      'OUTSTANDING_SALARY_STATEMENT',
      'OUTSTANDING_STATEMENT_ALLOWED',
      'OVERDUE',
      30000,
    );
    expect(outstanding.ok).toBe(true);

    const authorised = assertDocumentAllowed(
      'AUTHORISED_SALARY_SLIP',
      'AUTHORISED_BLOCKED',
      'SALARY_WAIVED',
      0,
    );
    expect(authorised.ok).toBe(false);
  });

  it('exception document titles never claim paid salary slip', () => {
    expect(exceptionDocumentTitle(documentKindForException('NO_SALARY_DUE'))).toBe(
      'NO SALARY DRAWN STATEMENT',
    );
    expect(exceptionDocumentTitle(documentKindForException('SALARY_WAIVED'))).toBe(
      'SALARY WAIVER RECORD',
    );
    expect(exceptionDocumentTitle(documentKindForException('SALARY_DEFERRED'))).toBe(
      'DEFERRED SALARY STATEMENT',
    );
  });
});
