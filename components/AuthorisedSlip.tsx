'use client';

/**
 * Authorised Slip (bank copy) — render variant FROM a FINAL snapshot only.
 * Never recomputes; never invents deductions. Missing TDS/PT → ₹0.00 + reason.
 * Excludes flex-bank, deferral ledger, review window, rate-basis, draft language.
 */

import {
  formatAmount,
  formatDate,
  formatINR,
  formatMonthYear,
  payrollCycleDates,
} from '@/lib/format';
import { formatAttendanceCycleRange } from '@/lib/payroll-cycle';
import { slipStatutoryDeductions } from '@/lib/payroll-calc';
import type { AuthorisedSlipYtd, EntityInfo, SlipSnapshot } from '@/lib/types';
import EntityLogo from './EntityLogo';

interface AuthorisedSlipProps {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  ytd: AuthorisedSlipYtd;
  paydayDayOfMonth: number;
  /** Short-lived signed URL for the signature image (server-generated). */
  signatureUrl: string | null;
  /** Short-lived signed URL for the company seal (server-generated). */
  sealUrl: string | null;
  /** Issue date printed in the signatory block (defaults to now). */
  issueDate?: Date | string;
  verificationId?: string | null;
  verificationUrl?: string | null;
}

function MoneyCell({ amount }: { amount: number }) {
  return <td className="amount whitespace-nowrap px-2 py-1 text-right tabular-nums">{formatAmount(amount)}</td>;
}

function DeductionNote({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[8.5px] font-normal italic leading-snug text-muted">{children}</span>;
}

export default function AuthorisedSlip({
  snapshot,
  entity,
  ytd,
  paydayDayOfMonth,
  signatureUrl,
  sealUrl,
  issueDate,
  verificationId,
  verificationUrl,
}: AuthorisedSlipProps) {
  const { inputs, computed, employee } = snapshot;
  const { creditDate } = payrollCycleDates(snapshot.monthYear, paydayDayOfMonth);
  const hasAttendanceCycle =
    Boolean(snapshot.attendancePeriodStart) && Boolean(snapshot.attendancePeriodEnd);
  const isPaid = snapshot.paymentStatus === 'PAID';
  const expectedPaymentDate = snapshot.expectedPaymentDate ?? creditDate;

  const { tds, pt } = slipStatutoryDeductions(computed, inputs);
  const other = computed.otherDeductions;
  const lop = computed.lopDeduction;
  const totalDeductions = computed.totalDeductions;
  const variablePaid = computed.variablePaid;
  const grossThisMonth = inputs.baseSalary + inputs.fixedAllowance + variablePaid;

  const issued = issueDate ?? new Date();

  return (
    <div
      className="slip-sheet relative mx-auto box-border flex flex-col bg-paper text-ink shadow-lg"
      style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm' }}
    >
      {/* ---------- Letterhead ---------- */}
      <header className="flex items-start gap-4 border-b-2 border-ink pb-3">
        <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-ink p-1.5">
          <EntityLogo
            entity={entity}
            code={employee.entityCode}
            className="max-h-full max-w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold leading-tight tracking-tight">{entity.name}</h1>
          <p className="mt-1 text-[10px] text-muted">
            CIN: <span className="amount text-ink">{entity.cin}</span>
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted">{entity.registeredAddress}</p>
          <p className="mt-1 text-[10px] text-muted">
            Tel: <span className="text-ink">{entity.phone}</span>
            {' · '}
            Payroll:{' '}
            <span className="text-ink">{entity.payrollEmail}</span>
          </p>
        </div>
      </header>

      {/* ---------- Title + period ---------- */}
      <div className="mt-4 text-center">
        <p className="text-[16px] font-bold uppercase tracking-[0.14em]">AUTHORISED SALARY SLIP</p>
        <p className="mt-1 text-[11px] font-medium">
          Salary month: {formatMonthYear(snapshot.monthYear)}
        </p>
        {hasAttendanceCycle ? (
          <p className="mt-0.5 text-[10px] text-muted">
            Attendance cycle:{' '}
            {formatAttendanceCycleRange(
              snapshot.attendancePeriodStart!,
              snapshot.attendancePeriodEnd!,
            )}
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] font-medium text-amber-brand">
            Attendance cycle unavailable
          </p>
        )}
        <div className="mt-2 text-[10px] text-muted">
          {isPaid && snapshot.actualCreditDate ? (
            <>
              <p className="font-medium text-ink">Payment status: Paid</p>
              <p>
                Actual salary-credit date:{' '}
                <span className="font-medium text-ink">{formatDate(snapshot.actualCreditDate)}</span>
              </p>
            </>
          ) : (
            <>
              {snapshot.paymentStatus && (
                <p>
                  Payment status:{' '}
                  <span className="font-medium text-ink">
                    {snapshot.paymentStatus.replace(/_/g, ' ')}
                  </span>
                </p>
              )}
              <p>
                Expected Payment Date:{' '}
                <span className="font-medium text-ink">{formatDate(expectedPaymentDate)}</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* ---------- Employee block ---------- */}
      <section className="mt-4 rounded border border-hairline px-3 py-2.5">
        <div className="grid grid-cols-4 gap-x-4 gap-y-2 text-[10.5px]">
          <div className="col-span-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Employee name</p>
            <p className="font-semibold">{employee.fullName}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Employee ID</p>
            <p className="amount font-semibold">{employee.empId}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Designation</p>
            <p>{employee.designation || '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Department</p>
            <p>{employee.department || '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Date of joining</p>
            <p>{formatDate(employee.joiningDate)}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">PAN</p>
            <p className="amount">{employee.panMasked || '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Bank a/c</p>
            <p className="amount">{employee.bankLast4 ? `····${employee.bankLast4}` : '—'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">Payment mode</p>
            <p>{employee.paymentMode}</p>
          </div>
        </div>
      </section>

      {/* ---------- Earnings ---------- */}
      <section className="mt-4">
        <h3 className="mb-1 border-b border-ink/70 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em]">
          Earnings
        </h3>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b border-hairline text-[8.5px] uppercase tracking-wider text-muted">
              <th className="px-2 py-1 text-left font-semibold">Particulars</th>
              <th className="px-2 py-1 text-right font-semibold">This Month</th>
              <th className="px-2 py-1 text-right font-semibold">YTD (FY)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline/60">
              <td className="px-2 py-1">Basic</td>
              <MoneyCell amount={inputs.baseSalary} />
              <MoneyCell amount={ytd.basic} />
            </tr>
            <tr className="border-b border-hairline/60">
              <td className="px-2 py-1">Fixed Allowance</td>
              <MoneyCell amount={inputs.fixedAllowance} />
              <MoneyCell amount={ytd.fixedAllowance} />
            </tr>
            <tr className="border-b border-hairline/60">
              <td className="px-2 py-1">Incentive / Variable</td>
              <MoneyCell amount={variablePaid} />
              <MoneyCell amount={ytd.variablePaid} />
            </tr>
            <tr className="font-semibold">
              <td className="px-2 py-1.5">Gross Earnings</td>
              <MoneyCell amount={grossThisMonth} />
              <MoneyCell amount={ytd.grossEarnings} />
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------- Deductions ---------- */}
      <section className="mt-4">
        <h3 className="mb-1 border-b border-ink/70 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em]">
          Deductions
        </h3>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="border-b border-hairline text-[8.5px] uppercase tracking-wider text-muted">
              <th className="px-2 py-1 text-left font-semibold">Particulars</th>
              <th className="px-2 py-1 text-right font-semibold">This Month</th>
              <th className="px-2 py-1 text-right font-semibold">YTD (FY)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">Loss of Pay</td>
              <MoneyCell amount={lop} />
              <MoneyCell amount={ytd.lopDeduction} />
            </tr>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">
                Professional Tax (Kerala)
                {pt === 0 && (
                  <DeductionNote>Nil for this month — not a PT deduction month</DeductionNote>
                )}
              </td>
              <MoneyCell amount={pt} />
              <MoneyCell amount={ytd.professionalTax} />
            </tr>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">
                TDS (Income Tax)
                {tds === 0 && (
                  <DeductionNote>Nil — Sec 87A rebate, new regime</DeductionNote>
                )}
              </td>
              <MoneyCell amount={tds} />
              <MoneyCell amount={ytd.tds} />
            </tr>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">
                EPF
                <DeductionNote>Not applicable — establishment below 20 employees</DeductionNote>
              </td>
              <MoneyCell amount={0} />
              <MoneyCell amount={0} />
            </tr>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">
                ESI
                <DeductionNote>Not applicable</DeductionNote>
              </td>
              <MoneyCell amount={0} />
              <MoneyCell amount={0} />
            </tr>
            <tr className="border-b border-hairline/60 align-top">
              <td className="px-2 py-1">Other</td>
              <MoneyCell amount={other} />
              <MoneyCell amount={ytd.otherDeductions} />
            </tr>
            <tr className="font-semibold">
              <td className="px-2 py-1.5">Total Deductions</td>
              <MoneyCell amount={totalDeductions} />
              <MoneyCell amount={ytd.totalDeductions} />
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------- Net ---------- */}
      <section className="slip-net-band mt-5 rounded border px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em]">Net Salary</p>
          <p className="amount shrink-0 text-[24px] font-bold">{formatINR(computed.netPay)}</p>
        </div>
        <p className="mt-1 border-t border-emerald-600/30 pt-1 text-[10px] font-medium">
          {computed.netPayWords}
        </p>
      </section>

      {/* ---------- Signatory + verification ---------- */}
      <section className="mt-8 grid grid-cols-[1fr_auto_auto] items-end gap-6">
        <div>
          <p className="text-[10px]">For {entity.name}</p>
          <div className="mt-2 flex h-16 items-end">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Authorised signatory"
                className="max-h-16 max-w-[180px] object-contain"
              />
            ) : (
              <div className="h-12 w-40 border-b border-hairline" />
            )}
          </div>
          <p className="mt-1 text-[11px] font-semibold">{entity.signatoryName}</p>
          <p className="text-[10px] text-muted">{entity.signatoryDesignation}</p>
          <p className="mt-3 text-[9.5px] text-muted">
            Place: Kochi
            {' · '}
            Date: {formatDate(issued)}
          </p>
        </div>
        <div className="flex h-20 w-20 items-center justify-center">
          {sealUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sealUrl} alt="Company seal" className="max-h-20 max-w-20 object-contain" />
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded border border-hairline bg-surface text-[8px] text-muted">
            {verificationUrl ? 'QR' : 'Verification QR'}
          </div>
          {verificationId && (
            <p className="text-[8.5px] text-muted">
              ID: <span className="amount text-ink">{verificationId}</span>
            </p>
          )}
          {verificationUrl && (
            <p className="max-w-[120px] break-all text-[7.5px] text-muted">{verificationUrl}</p>
          )}
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mt-auto border-t border-hairline pt-3 text-[8.5px] leading-relaxed text-muted">
        <p>Authorised and issued by the employer.</p>
        <p>
          This computer-generated authorised salary slip may be verified through the QR code and
          verification ID.
        </p>
      </footer>
    </div>
  );
}
