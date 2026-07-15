'use client';

/**
 * The A4 salary slip document (draft + final modes). Renders ONLY the
 * numbers already computed by lib/payroll-calc.ts via the snapshot —
 * this component never re-derives an amount.
 *
 * Physical size is fixed at 210mm × 297mm; the parent scales it for
 * on-screen preview, and print CSS / html2canvas capture it 1:1.
 */

import { CheckCircle2 } from 'lucide-react';
import { FIXED_DIVISOR, slipStatutoryDeductions } from '@/lib/payroll-calc';
import { lopCalculationBasisLabel } from '@/lib/calculation-method';
import {
  formatDate,
  formatINR,
  formatMinutes,
  formatMonthYear,
  formatSalaryAttendanceCycle,
  payrollCycleDates,
} from '@/lib/format';
import type { EntityInfo, SlipSnapshot } from '@/lib/types';
import EntityLogo from '@/components/EntityLogo';
import { statementMetaFor } from '@/lib/workforce';

interface SalarySlipProps {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  payrollContact: string;
  paydayDayOfMonth: number;
  /** e.g. "6:00 PM" from settings.reviewDeadlineTime */
  reviewDeadlineTime?: string;
  /** Rule 7 — manual deferred-opening override broke the FINAL chain. */
  ledgerMismatch?: boolean;
  /** Payment obligation summary — FINAL ≠ PAID. */
  paymentStatus?: string | null;
  expectedPaymentDate?: string | null;
  actualCreditDate?: string | null;
  confirmedPaidAmount?: number | null;
  outstandingBalance?: number | null;
  attendancePeriodStart?: string | null;
  attendancePeriodEnd?: string | null;
  showResidentialAddress?: boolean;
}

function Row({
  label,
  value,
  bold = false,
  sub,
  rowClassName = 'slip-amount-row',
}: {
  label: React.ReactNode;
  value: string;
  bold?: boolean;
  sub?: React.ReactNode;
  rowClassName?: string;
}) {
  return (
    <div className={`${rowClassName} ${bold ? 'font-semibold' : ''}`}>
      <div className="min-w-0">
        <span className="text-[11px] leading-snug">{label}</span>
        {sub && <div className="text-[9.5px] leading-snug text-muted">{sub}</div>}
      </div>
      <span className="amount whitespace-nowrap text-[11px]">{value}</span>
    </div>
  );
}

function SectionTitle({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline gap-2 border-b border-ink/70 pb-1">
      <span className="text-[9px] font-bold text-muted">{tag}</span>
      <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em]">{children}</h3>
    </div>
  );
}

export default function SalarySlip({
  snapshot,
  entity,
  payrollContact,
  paydayDayOfMonth,
  reviewDeadlineTime = '6:00 PM',
  ledgerMismatch = false,
  paymentStatus = null,
  expectedPaymentDate = null,
  actualCreditDate = null,
  confirmedPaidAmount = null,
  outstandingBalance = null,
  attendancePeriodStart = null,
  attendancePeriodEnd = null,
  showResidentialAddress = false,
}: SalarySlipProps) {
  const { inputs, computed, employee } = snapshot;
  /** Review window and draft chrome key ONLY on the rendered variant. */
  const isDraft = snapshot.status === 'draft';
  const { creditDate, reviewDeadline } = payrollCycleDates(snapshot.monthYear, paydayDayOfMonth);
  const expectedDate = expectedPaymentDate ?? formatDate(creditDate);
  const isPaid = paymentStatus === 'PAID';
  const attendanceCycle = formatSalaryAttendanceCycle(snapshot.monthYear, 'PREVIOUS_25_TO_CURRENT_24', {
    start: attendancePeriodStart,
    end: attendancePeriodEnd,
  });
  const variableLabel = inputs.variableLabel.trim() || 'Variable / Incentive';
  const hasLateness = inputs.lateMinutes > 0 || inputs.flexMinutesEarned > 0;
  const { tds, pt } = slipStatutoryDeductions(computed, inputs);
  const statementMeta = statementMetaFor(
    employee.paymentType,
    employee.engagementType,
    employee.employmentStatus,
  );
  const paymentLabel = paymentStatus
    ? paymentStatus.replace(/_/g, ' ')
    : isDraft
      ? 'NOT SCHEDULED'
      : 'SCHEDULED';

  return (
    <div
      className="slip-sheet relative mx-auto box-border flex flex-col bg-paper text-ink shadow-lg"
      style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm' }}
    >
      {/* ---------- Entity header ---------- */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-ink p-1.5">
            <EntityLogo
              entity={entity}
              code={employee.entityCode}
              className="max-h-full max-w-full"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-muted">
              {employee.entityCode} · Payroll Document
            </p>
            <h1 className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight">
              {entity.name}
            </h1>
            {entity.legalLine && (
              <p className="text-[10px] italic text-muted">{entity.legalLine}</p>
            )}
            <p className="mt-1 text-[9.5px] leading-snug text-muted">
              {entity.addressLines.join(' · ')}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold uppercase tracking-[0.12em]">Internal Pay Slip</p>
          <p className="text-[11px] font-medium text-muted">
            Salary month: {formatMonthYear(snapshot.monthYear)}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">Attendance cycle: {attendanceCycle}</p>
          {statementMeta.statusBadge && (
            <p className="mt-1 text-[10px] font-semibold text-amber-brand">{statementMeta.statusBadge}</p>
          )}
          {isDraft ? (
            <span className="slip-badge-draft mt-1.5 inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              Draft — Provisional
            </span>
          ) : (
            <span className="slip-badge-final mt-1.5 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              <CheckCircle2 size={11} strokeWidth={3} /> Finalised
            </span>
          )}
        </div>
      </header>

      {/* ---------- Draft banner ---------- */}
      {isDraft && (
        <div className="slip-banner-draft mt-3 rounded border px-3 py-2 text-[10px] font-semibold">
          DRAFT — PROVISIONAL INTERNAL PAYROLL STATEMENT. Invalid for financial or official use.
          Pending attendance lock, LOP confirmation, review and approval.
        </div>
      )}

      {ledgerMismatch && (
        <div className="slip-banner-draft mt-2 rounded border px-3 py-2 text-[10px] font-semibold">
          LEDGER MISMATCH: the deferred opening balance on this slip does not match this
          employee&apos;s last finalized slip. Verify before issuing.
        </div>
      )}

      {/* ---------- Period / payment strip ---------- */}
      <div className="mt-3 grid grid-cols-2 divide-x divide-hairline rounded border border-hairline bg-surface text-[10px] sm:grid-cols-4">
        <div className="px-3 py-2">
          <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Payroll status</p>
          <p className="font-semibold">{isDraft ? 'Draft' : 'Finalised'}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Payment status</p>
          <p className="font-semibold">{paymentLabel}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">
            {isPaid ? 'Actual salary credit date' : 'Expected payment date'}
          </p>
          <p className="font-semibold">
            {isPaid && actualCreditDate
              ? formatDate(actualCreditDate)
              : typeof expectedDate === 'string' && expectedDate.includes('-')
                ? formatDate(expectedDate)
                : expectedDate}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">
            {isDraft ? 'Review window' : 'Outstanding / paid'}
          </p>
          <p className="font-semibold">
            {isDraft
              ? `By ${formatDate(reviewDeadline)} · ${reviewDeadlineTime}`
              : isPaid
                ? `Paid ${formatINR(confirmedPaidAmount ?? computed.netPay)} · ₹0 due`
                : `Paid ${formatINR(confirmedPaidAmount ?? 0)} · Due ${formatINR(outstandingBalance ?? computed.netPay)}`}
          </p>
        </div>
      </div>

      {/* ---------- Employee details ---------- */}
      <section className="mt-4">
        <SectionTitle tag="01">Employee Details</SectionTitle>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-[10.5px]">
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Name</p>
            <p className="font-semibold">{employee.fullName}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Employee ID</p>
            <p className="amount font-semibold">{employee.empId}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Department</p>
            <p>{employee.department || '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Designation</p>
            <p>{employee.designation || '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Date of joining</p>
            <p>{formatDate(employee.joiningDate)}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Payment mode</p>
            <p>
              {employee.paymentMode}
              {employee.bankLast4 && (
                <span className="amount text-muted"> · a/c ····{employee.bankLast4}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">PAN</p>
            <p className="amount">{employee.panMasked || '—'}</p>
          </div>
          {showResidentialAddress && (
            <div>
              <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Address</p>
              <p className="leading-snug">{employee.employeeAddress || '—'}</p>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Attendance & LOP divisor (not the attendance cycle) ---------- */}
      <section className="mt-4">
        <SectionTitle tag="02">Attendance &amp; LOP Calculation</SectionTitle>
        <div className="rounded border border-hairline bg-surface px-3 py-2">
          <p className="amount text-[11px] font-semibold">
            {formatINR(inputs.compensationAmount)} ÷ {FIXED_DIVISOR} = {formatINR(computed.perDayRate)}/day
          </p>
          <p className="mt-0.5 text-[9px] text-muted">
            {lopCalculationBasisLabel('FIXED_25')} — this is the salary-calculation divisor, not the
            attendance-cycle length ({attendanceCycle}).
          </p>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-6">
          <Row
            rowClassName="slip-stat-row"
            label="Absent days"
            value={String(inputs.absentDays)}
          />
          <Row rowClassName="slip-stat-row" label="Half days" value={String(inputs.halfDays)} />
          <Row
            rowClassName="slip-stat-row"
            label="Late minutes"
            value={formatMinutes(inputs.lateMinutes)}
          />
          <Row
            rowClassName="slip-stat-row"
            label="LOP days (total)"
            value={computed.lopDays.toFixed(1)}
          />
        </div>
        {isDraft && hasLateness && (
          <div className="mt-1 rounded border border-hairline px-3 py-1.5 text-[9.5px] text-muted">
            <span className="font-semibold text-ink">Flex-bank working:</span>{' '}
            {formatMinutes(inputs.flexBankBalanceBefore)} carried in + {formatMinutes(inputs.flexMinutesEarned)} earned ={' '}
            {formatMinutes(computed.flexAvailable)} available · offset {formatMinutes(computed.flexOffsetMinutes)} of{' '}
            {formatMinutes(inputs.lateMinutes)} late → unpaid {formatMinutes(computed.unpaidLateMinutes)} ={' '}
            {computed.lopFromLateness.toFixed(1)} LOP day(s) (floored to 0.5, in employee&apos;s favour) · closing flex
            balance {formatMinutes(snapshot.flexBalanceAfter)}
          </div>
        )}
      </section>

      {/* ---------- Earnings & deductions ---------- */}
      <section className="mt-4 grid grid-cols-2 gap-5">
        <div className="flex h-full flex-col">
          <SectionTitle tag="A">Fixed Earnings</SectionTitle>
          <div className="flex-1">
            <Row label={statementMeta.mainEarningLabel} value={formatINR(inputs.compensationAmount)} />
            <Row label="Fixed allowance" value={formatINR(inputs.fixedAllowance)} />
          </div>
          <div className="mt-auto border-t border-ink/60">
            <Row label="Gross fixed (A)" value={formatINR(computed.grossFixed)} bold />
          </div>
        </div>
        <div className="flex h-full flex-col">
          <SectionTitle tag="B">Deductions</SectionTitle>
          <div className="flex-1">
            <Row
              label={
                <span className="whitespace-nowrap">
                  Loss of pay — {computed.lopDays.toFixed(1)} day(s)
                </span>
              }
              sub={
                <>
                  <span className="amount block whitespace-nowrap">
                    × {formatINR(computed.perDayRate)}/day
                  </span>
                  {isDraft && (
                    <span className="mt-0.5 block">
                      {inputs.absentDays} absent + {inputs.halfDays} × 0.5 half-day +{' '}
                      {computed.lopFromLateness.toFixed(1)} from lateness
                    </span>
                  )}
                </>
              }
              value={formatINR(computed.lopDeduction)}
            />
            <Row label="Professional Tax (Kerala)" value={formatINR(pt)} />
            <Row label="TDS (Income Tax)" value={formatINR(tds)} />
            <Row label="Other deductions" value={formatINR(computed.otherDeductions)} />
          </div>
          <div className="mt-auto border-t border-ink/60">
            <Row label="Total deductions (B)" value={formatINR(computed.totalDeductions)} bold />
          </div>
        </div>
      </section>

      {/* ---------- Variable pay ---------- */}
      <section className="mt-4">
        <SectionTitle tag="C">Variable Pay — {variableLabel}</SectionTitle>
        <div className="grid grid-cols-3 divide-x divide-hairline rounded border border-hairline text-center">
          <div className="px-3 py-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Earned this month</p>
            <p className="amount text-[11.5px] font-semibold">{formatINR(computed.variableEarned)}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Paid this month (C)</p>
            <p className="amount text-[11.5px] font-semibold">{formatINR(computed.variablePaid)}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Deferred</p>
            <p
              className={`amount text-[11.5px] font-semibold ${computed.variableDeferred > 0 ? 'text-amber-600' : ''}`}
            >
              {formatINR(computed.variableDeferred)}
            </p>
          </div>
        </div>

        {/* Carry-forward ledger */}
        <div className="mt-2 rounded border border-hairline px-3 py-2">
          <p className="mb-1 text-[8.5px] font-semibold uppercase tracking-wider text-muted">
            Deferred variable — carry-forward ledger
          </p>
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div>
              <span className="block text-[8.5px] text-muted">Opening</span>
              <span className="amount block text-right tabular-nums">{formatINR(computed.deferredOpening)}</span>
            </div>
            <div>
              <span className="block text-[8.5px] text-muted">+ Earned</span>
              <span className="amount block text-right tabular-nums">{formatINR(computed.variableEarned)}</span>
            </div>
            <div>
              <span className="block text-[8.5px] text-muted">− Paid</span>
              <span className="amount block text-right tabular-nums">{formatINR(computed.variablePaid)}</span>
            </div>
            <div className="font-semibold">
              <span className="block text-[8.5px] font-normal text-muted">Closing</span>
              <span className="amount block text-right tabular-nums">{formatINR(computed.deferredClosing)}</span>
            </div>
          </div>
          {computed.deferredClosing > 0 && (
            <div className="slip-banner-deferred mt-2 rounded border px-2.5 py-1.5 text-[9.5px] font-semibold">
              Deferred balance of {formatINR(computed.deferredClosing)} committed for payout on{' '}
              {computed.committedPayoutDate ? formatDate(computed.committedPayoutDate) : '— date pending —'}.
              Fixed wages are never deferred; this applies to the variable component only.
            </div>
          )}
        </div>
      </section>

      {/* ---------- Net pay band ---------- */}
      <section className="slip-net-band mt-4 rounded border px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em]">Net Pay — A − B + C</p>
            <p className="amount mt-0.5 text-[10px]">
              {formatINR(computed.grossFixed)} − {formatINR(computed.totalDeductions)} +{' '}
              {formatINR(computed.variablePaid)}
            </p>
          </div>
          <p className="amount shrink-0 text-[22px] font-bold">{formatINR(computed.netPay)}</p>
        </div>
        <p className="mt-1 border-t border-emerald-600/30 pt-1 text-[9.5px] font-medium">
          {computed.netPayWords}
        </p>
      </section>

      {/* ---------- Remarks ---------- */}
      {inputs.remarks.trim() && (
        <section className="mt-3 min-w-0">
          <SectionTitle tag="03">Remarks / Operations Note</SectionTitle>
          <p className="slip-remarks max-w-full whitespace-pre-wrap break-words text-[10px] leading-snug">
            {inputs.remarks.trim()}
          </p>
        </section>
      )}

      {/* ---------- Footer ---------- */}
      <footer className="mt-6 border-t border-hairline pt-3 text-[8.5px] leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-ink">Queries:</span> {payrollContact}
          {isDraft
            ? ` — reply before ${formatDate(reviewDeadline)}, ${reviewDeadlineTime}.`
            : '.'}{' '}
          {isPaid
            ? `Actual salary credit date: ${actualCreditDate ? formatDate(actualCreditDate) : '—'}.`
            : `Expected payment date: ${typeof expectedDate === 'string' && expectedDate.includes(' ') ? expectedDate : formatDate(String(expectedDate))}.`}
        </p>
        {statementMeta.disclaimer && <p>{statementMeta.disclaimer}</p>}
        <p>
          Confidential internal payroll record. This document is intended for the named employee and
          authorised company personnel only. It is not an authorised income certificate and must not
          be used for bank, loan, visa or third-party verification purposes.
        </p>
        <p>
          This is a computer-generated internal payroll document and does not require a physical
          signature.
        </p>
      </footer>
    </div>
  );
}
