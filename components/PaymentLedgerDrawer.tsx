'use client';

/**
 * Payment Ledger drawer — add / confirm / fail / reverse / hold / reschedule / audit.
 * Does not redesign PDF output.
 */

import { useEffect, useState } from 'react';
import {
  confirmSalaryPayment,
  failSalaryPayment,
  fetchPaymentLedger,
  putSalaryPaymentOnHold,
  recordSalaryPayment,
  rescheduleSalaryPayment,
  reverseSalaryPayment,
} from '@/app/actions/salary-payment';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import type {
  PaymentAuditEvent,
  PaymentHoldOrDeferral,
  SalaryPaymentObligation,
  SalaryPaymentTransaction,
} from '@/lib/salary-payment-types';
import { partialDocumentTitle } from '@/lib/salary-payment';
import { btnPrimary, btnSecondary, inputCls, Modal } from './ui';

const ACTOR_KEY = 'portfolix_payment_actor';

function readActor(): string {
  if (typeof window === 'undefined') return 'hr-user';
  const stored = window.localStorage.getItem(ACTOR_KEY);
  if (stored?.trim()) return stored.trim();
  const generated = `hr-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(ACTOR_KEY, generated);
  return generated;
}

function PaymentStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'PAID'
      ? 'border-emerald-brand bg-emerald-tint text-emerald-deep'
      : status === 'OVERDUE' || status === 'FAILED' || status === 'REJECTED_BY_BANK'
        ? 'border-amber-edge bg-amber-tint text-amber-brand'
        : status === 'PARTIALLY_PAID' || status === 'PROCESSING'
          ? 'border-hairline bg-surface text-ink'
          : 'border-hairline bg-surface text-muted';
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface PaymentLedgerDrawerProps {
  payrollRecordId: string;
  employeeLabel: string;
  monthYearLabel: string;
  payrollStatus: string;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}

export default function PaymentLedgerDrawer({
  payrollRecordId,
  employeeLabel,
  monthYearLabel,
  payrollStatus,
  onClose,
  onChanged,
}: PaymentLedgerDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [obligation, setObligation] = useState<SalaryPaymentObligation | null>(null);
  const [transactions, setTransactions] = useState<SalaryPaymentTransaction[]>([]);
  const [holds, setHolds] = useState<PaymentHoldOrDeferral[]>([]);
  const [audit, setAudit] = useState<PaymentAuditEvent[]>([]);
  const [actorId, setActorId] = useState('hr-user');
  const [emergencyOverride, setEmergencyOverride] = useState(false);

  const [panel, setPanel] = useState<
    | null
    | 'add'
    | 'confirm'
    | 'fail'
    | 'reverse'
    | 'hold'
    | 'reschedule'
  >(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add payment form
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [utr, setUtr] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [destMasked, setDestMasked] = useState('');
  const [creditedAt, setCreditedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [evidencePath, setEvidencePath] = useState('');
  const [evidenceHash, setEvidenceHash] = useState('');

  // Shared reason fields
  const [reason, setReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [revisedDate, setRevisedDate] = useState('');
  const [holdKind, setHoldKind] = useState<'ON_HOLD' | 'PAYMENT_DEFERRED'>('ON_HOLD');
  const [holdCategory, setHoldCategory] = useState('BANK_ISSUE');
  const [complianceFlag, setComplianceFlag] = useState(false);

  useEffect(() => {
    setActorId(readActor());
  }, []);

  async function reload() {
    setLoading(true);
    setError(null);
    const result = await fetchPaymentLedger(payrollRecordId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setObligation(result.data.obligation);
    setTransactions(result.data.transactions);
    setHolds(result.data.holds);
    setAudit(result.data.auditTimeline);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollRecordId]);

  function openPanel(next: typeof panel, txId?: string) {
    setFormError(null);
    setReason('');
    setOverrideReason('');
    setSelectedTxId(txId ?? null);
    if (next === 'add' && obligation) {
      setAmount(String(obligation.outstandingAmount || ''));
    }
    setPanel(next);
  }

  async function afterMutation() {
    await reload();
    await onChanged?.();
  }

  async function submitAdd() {
    if (!obligation) return;
    setBusy(true);
    setFormError(null);
    const result = await recordSalaryPayment({
      payrollRecordId,
      amount: Number(amount),
      paymentMode,
      createdBy: actorId,
      bankTransactionReference: utr || null,
      sourceBankAccountRef: sourceRef || null,
      maskedDestinationAccount: destMasked || null,
      creditedAt: creditedAt || null,
      remarks: remarks || null,
      supportingEvidencePath: evidencePath || null,
      evidenceSha256: evidenceHash || null,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  async function submitConfirm() {
    if (!selectedTxId) return;
    setBusy(true);
    setFormError(null);
    const result = await confirmSalaryPayment({
      payrollRecordId,
      transactionId: selectedTxId,
      confirmer: {
        userId: actorId,
        emergencyOverridePermission: emergencyOverride,
      },
      overrideReason: overrideReason || null,
      creditedAt: creditedAt || null,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  async function submitFail(asRejectedByBank: boolean) {
    if (!selectedTxId) return;
    setBusy(true);
    setFormError(null);
    const result = await failSalaryPayment({
      payrollRecordId,
      transactionId: selectedTxId,
      actorUserId: actorId,
      reason,
      asRejectedByBank,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  async function submitReverse() {
    if (!selectedTxId) return;
    setBusy(true);
    setFormError(null);
    const result = await reverseSalaryPayment({
      payrollRecordId,
      transactionId: selectedTxId,
      approver: { userId: actorId, emergencyOverridePermission: emergencyOverride },
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  async function submitHold() {
    if (!obligation) return;
    setBusy(true);
    setFormError(null);
    const result = await putSalaryPaymentOnHold({
      payrollRecordId,
      kind: holdKind,
      reasonCategory: holdCategory as PaymentHoldOrDeferral['reasonCategory'],
      detailedExplanation: reason,
      amountAffected: Number(amount) || obligation.outstandingAmount,
      revisedExpectedDate: revisedDate,
      approvingUser: actorId,
      complianceReviewFlag: complianceFlag,
      evidencePath: evidencePath || null,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  async function submitReschedule() {
    setBusy(true);
    setFormError(null);
    const result = await rescheduleSalaryPayment({
      payrollRecordId,
      revisedExpectedDate: revisedDate,
      actorUserId: actorId,
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setPanel(null);
    await afterMutation();
  }

  function downloadAdvice() {
    if (!obligation) return;
    const title =
      obligation.paymentStatus === 'PARTIALLY_PAID'
        ? partialDocumentTitle('SALARY_PAYMENT_ADVICE_PARTIALLY_PAID')
        : obligation.outstandingAmount > 0
          ? partialDocumentTitle('OUTSTANDING_SALARY_STATEMENT')
          : 'SALARY PAYMENT ADVICE';
    const lines = [
      title,
      `Employee: ${employeeLabel}`,
      `Pay month: ${monthYearLabel}`,
      `Payroll status: ${payrollStatus}`,
      `Payment status: ${obligation.paymentStatus}`,
      `Net salary due: ${formatINR(obligation.netSalaryPayable)}`,
      `Confirmed paid: ${formatINR(obligation.confirmedPaidAmount)}`,
      `Outstanding: ${formatINR(obligation.outstandingAmount)}`,
      `Original due: ${obligation.originalStatutoryDueDate}`,
      `Revised expected: ${obligation.revisedExpectedDate ?? '—'}`,
      `Last payment: ${obligation.lastPaymentDate ?? '—'}`,
      `Timeliness: ${obligation.timeliness}`,
      '',
      'Transactions:',
      ...transactions.map(
        (t) =>
          `- ${t.id} | ${formatINR(t.amount)} | ${t.transactionStatus} | UTR ${t.bankTransactionReference ?? '—'} | by ${t.createdBy}${t.confirmedBy ? ` / confirmed ${t.confirmedBy}` : ''}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-advice-${payrollRecordId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Full-width on phones; capped drawer on sm+. Body scrolls independently. */}
      <aside className="flex h-full max-h-[100dvh] w-full max-w-none flex-col border-l border-hairline bg-paper shadow-pop sm:max-w-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Payment Ledger</h2>
            <p className="mt-0.5 break-words text-[12px] text-muted">
              {employeeLabel} · {monthYearLabel}
            </p>
          </div>
          <button className={`${btnSecondary} shrink-0`} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="shrink-0 border-b border-hairline px-4 py-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Acting as user id (maker-checker)
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} w-full max-w-xs`}
              value={actorId}
              onChange={(e) => {
                setActorId(e.target.value);
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(ACTOR_KEY, e.target.value);
                }
              }}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={emergencyOverride}
                onChange={(e) => setEmergencyOverride(e.target.checked)}
              />
              Emergency override permission
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
          {loading && <p className="text-sm text-muted">Loading payment ledger…</p>}
          {error && (
            <p className="rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] text-amber-brand">
              {error}
            </p>
          )}

          {obligation && (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <dt className="text-muted">Payroll status</dt>
                  <dd className="font-medium">{payrollStatus}</dd>
                </div>
                <div>
                  <dt className="text-muted">Payment status</dt>
                  <dd>
                    <PaymentStatusBadge status={obligation.paymentStatus} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Document status</dt>
                  <dd className="font-medium">{obligation.documentStatus.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-muted">Timeliness</dt>
                  <dd className="font-medium">{obligation.timeliness.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-muted">Net salary due</dt>
                  <dd className="amount font-medium">{formatINR(obligation.netSalaryPayable)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Confirmed paid</dt>
                  <dd className="amount font-medium">{formatINR(obligation.confirmedPaidAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Outstanding</dt>
                  <dd className="amount font-medium">{formatINR(obligation.outstandingAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Original due</dt>
                  <dd>{formatDate(obligation.originalStatutoryDueDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Revised expected</dt>
                  <dd>
                    {obligation.revisedExpectedDate
                      ? formatDate(obligation.revisedExpectedDate)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Last payment</dt>
                  <dd>
                    {obligation.lastPaymentDate ? formatDate(obligation.lastPaymentDate) : '—'}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={() => openPanel('add')}>
                  Add payment
                </button>
                <button className={btnSecondary} onClick={() => openPanel('hold')}>
                  Put on hold / defer
                </button>
                <button className={btnSecondary} onClick={() => openPanel('reschedule')}>
                  Reschedule expected
                </button>
                <button className={btnSecondary} onClick={downloadAdvice}>
                  Download payment advice
                </button>
              </div>

              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Transactions
                </h3>
                {transactions.length === 0 ? (
                  <p className="text-[12px] text-muted">No payment transactions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {transactions.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-md border border-hairline bg-surface/40 px-3 py-2 text-[12px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              {formatINR(t.amount)} · {t.transactionStatus}
                            </p>
                            <p className="text-muted">
                              UTR {t.bankTransactionReference ?? '—'} · {t.paymentMode}
                            </p>
                            <p className="text-muted">
                              Maker {t.createdBy}
                              {t.confirmedBy ? ` · Checker ${t.confirmedBy}` : ''}
                            </p>
                            {t.supportingEvidencePath && (
                              <p className="text-muted">
                                Proof: {t.supportingEvidencePath}
                                {t.evidenceSha256 ? ` · SHA-256 ${t.evidenceSha256.slice(0, 12)}…` : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(t.transactionStatus === 'INITIATED' ||
                              t.transactionStatus === 'PROCESSING') && (
                              <>
                                <button
                                  className={btnSecondary}
                                  onClick={() => openPanel('confirm', t.id)}
                                >
                                  Confirm
                                </button>
                                <button
                                  className={btnSecondary}
                                  onClick={() => openPanel('fail', t.id)}
                                >
                                  Record failed
                                </button>
                              </>
                            )}
                            {(t.transactionStatus === 'CONFIRMED' ||
                              t.transactionStatus === 'SETTLED') && (
                              <button
                                className={btnSecondary}
                                onClick={() => openPanel('reverse', t.id)}
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {holds.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Holds / deferrals
                  </h3>
                  <ul className="space-y-2 text-[12px]">
                    {holds.map((h) => (
                      <li key={h.id} className="rounded-md border border-hairline px-3 py-2">
                        <p className="font-medium">
                          {h.kind.replace(/_/g, ' ')} · {h.reasonCategory}
                          {h.active ? ' (active)' : ' (released)'}
                        </p>
                        <p className="text-muted">{h.detailedExplanation}</p>
                        <p className="text-muted">
                          Revised {formatDate(h.revisedExpectedDate)} · Approved by {h.approvingUser}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Audit timeline
                </h3>
                {audit.length === 0 ? (
                  <p className="text-[12px] text-muted">No audit events.</p>
                ) : (
                  <ol className="space-y-1.5 border-l border-hairline pl-3 text-[12px]">
                    {audit.map((e) => (
                      <li key={e.id}>
                        <p className="font-medium">
                          {e.action.replace(/_/g, ' ')}
                          {e.emergencyOverride ? ' · OVERRIDE' : ''}
                        </p>
                        <p className="text-muted">
                          {formatDateTime(e.createdAt)} · {e.actorUserId}
                          {e.reason ? ` · ${e.reason}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </aside>

      {panel === 'add' && (
        <Modal title="Add payment" onClose={() => setPanel(null)} wide>
          <div className="space-y-3">
            <label className="block text-[12px]">
              Amount
              <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-[12px]">
              Payment mode
              <select
                className={inputCls}
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option>Bank Transfer</option>
                <option>UPI</option>
                <option>Cheque</option>
                <option>Cash</option>
              </select>
            </label>
            <label className="block text-[12px]">
              UTR / bank reference
              <input className={inputCls} value={utr} onChange={(e) => setUtr(e.target.value)} />
            </label>
            <label className="block text-[12px]">
              Source bank account ref
              <input
                className={inputCls}
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Masked destination account
              <input
                className={inputCls}
                value={destMasked}
                onChange={(e) => setDestMasked(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Value / credit date
              <input
                type="date"
                className={inputCls}
                value={creditedAt}
                onChange={(e) => setCreditedAt(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Evidence path
              <input
                className={inputCls}
                value={evidencePath}
                onChange={(e) => setEvidencePath(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Evidence SHA-256
              <input
                className={inputCls}
                value={evidenceHash}
                onChange={(e) => setEvidenceHash(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Remarks
              <input
                className={inputCls}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </label>
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitAdd()}>
                {busy ? 'Saving…' : 'Record payment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'confirm' && (
        <Modal title="Confirm payment (checker)" onClose={() => setPanel(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-muted">
              Maker and checker must be different users unless emergency override is enabled with a
              reason.
            </p>
            <label className="block text-[12px]">
              Credit / value date
              <input
                type="date"
                className={inputCls}
                value={creditedAt}
                onChange={(e) => setCreditedAt(e.target.value)}
              />
            </label>
            {emergencyOverride && (
              <label className="block text-[12px]">
                Override reason
                <input
                  className={inputCls}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </label>
            )}
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitConfirm()}>
                {busy ? 'Confirming…' : 'Confirm payment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'fail' && (
        <Modal title="Record failed transaction" onClose={() => setPanel(null)}>
          <div className="space-y-3">
            <label className="block text-[12px]">
              Reason
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button
                className={btnSecondary}
                disabled={busy}
                onClick={() => void submitFail(true)}
              >
                Rejected by bank
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitFail(false)}>
                Mark failed
              </button>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'reverse' && (
        <Modal title="Reverse confirmed payment" onClose={() => setPanel(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-muted">
              Confirmed transactions are never deleted. This posts a reversal and restores
              outstanding balance.
            </p>
            <label className="block text-[12px]">
              Reversal reason (required)
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitReverse()}>
                Approve reversal
              </button>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'hold' && (
        <Modal title="Put payment on hold / defer" onClose={() => setPanel(null)} wide>
          <div className="space-y-3">
            <label className="block text-[12px]">
              Kind
              <select
                className={inputCls}
                value={holdKind}
                onChange={(e) => setHoldKind(e.target.value as 'ON_HOLD' | 'PAYMENT_DEFERRED')}
              >
                <option value="ON_HOLD">ON_HOLD</option>
                <option value="PAYMENT_DEFERRED">PAYMENT_DEFERRED</option>
              </select>
            </label>
            <label className="block text-[12px]">
              Reason category
              <select
                className={inputCls}
                value={holdCategory}
                onChange={(e) => setHoldCategory(e.target.value)}
              >
                <option value="BANK_DETAILS_PENDING">BANK_DETAILS_PENDING</option>
                <option value="BANK_TRANSFER_FAILED">BANK_TRANSFER_FAILED</option>
                <option value="BANK_ISSUE">BANK_ISSUE</option>
                <option value="EMPLOYEE_REQUEST">EMPLOYEE_REQUEST</option>
                <option value="PAYROLL_DISPUTE">PAYROLL_DISPUTE</option>
                <option value="DISPUTE">DISPUTE</option>
                <option value="EXIT_SETTLEMENT_REVIEW">EXIT_SETTLEMENT_REVIEW</option>
                <option value="INTERNAL_FINANCIAL_DELAY">INTERNAL_FINANCIAL_DELAY</option>
                <option value="FUNDING_DELAY">FUNDING_DELAY</option>
                <option value="STATUTORY_OR_COURT_DIRECTION">STATUTORY_OR_COURT_DIRECTION</option>
                <option value="COMPLIANCE_HOLD">COMPLIANCE_HOLD</option>
                <option value="OTHER">OTHER (requires detailed explanation)</option>
              </select>
            </label>
            <label className="block text-[12px]">
              Detailed explanation
              <textarea
                className={inputCls}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Amount affected
              <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-[12px]">
              Revised expected date
              <input
                type="date"
                className={inputCls}
                value={revisedDate}
                onChange={(e) => setRevisedDate(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Optional evidence path
              <input
                className={inputCls}
                value={evidencePath}
                onChange={(e) => setEvidencePath(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={complianceFlag}
                onChange={(e) => setComplianceFlag(e.target.checked)}
              />
              Compliance review required
            </label>
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitHold()}>
                Approve hold
              </button>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'reschedule' && (
        <Modal title="Reschedule expected payment" onClose={() => setPanel(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-muted">
              Original statutory due date and any overdue event are preserved.
            </p>
            <label className="block text-[12px]">
              Revised expected date
              <input
                type="date"
                className={inputCls}
                value={revisedDate}
                onChange={(e) => setRevisedDate(e.target.value)}
              />
            </label>
            <label className="block text-[12px]">
              Reason
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {formError && <p className="text-[12px] text-amber-brand">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} disabled={busy} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button className={btnPrimary} disabled={busy} onClick={() => void submitReschedule()}>
                Save reschedule
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
