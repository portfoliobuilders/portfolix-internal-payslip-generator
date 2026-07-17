'use client';

/**
 * AUTHORISED SALARY SLIP — bank / visa / third-party verification copy.
 * Separate template from the Internal Pay Slip. Generation is gated until
 * payment is fully PAID and reconciled. Never invents credit dates.
 */

import { useEffect, useState } from 'react';
import {
  formatAmount,
  formatDate,
  formatINR,
  formatMonthYear,
  formatSalaryAttendanceCycle,
} from '@/lib/format';
import { slipStatutoryDeductions } from '@/lib/payroll-calc';
import type { AuthorisedSlipYtd, EntityInfo, SlipSnapshot } from '@/lib/types';
import EntityLogo from '@/components/EntityLogo';
import { createSignatorySignedUrl } from '@/app/actions/signatory-assets';

interface AuthorisedSlipProps {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
  ytd: AuthorisedSlipYtd;
  /** @deprecated Prefer actualCreditDate from payment ledger. */
  paydayDayOfMonth?: number;
  signatureUrl: string | null;
  sealUrl: string | null;
  signatureAssetPath?: string | null;
  sealAssetPath?: string | null;
  issueDate?: Date | string;
  actualCreditDate: string;
  paymentMode?: string;
  confirmedPaidAmount?: number;
  outstandingBalance?: number;
  attendancePeriodStart?: string | null;
  attendancePeriodEnd?: string | null;
  documentNumber?: string | null;
  verificationId?: string | null;
  verificationUrl?: string | null;
  verificationFingerprint?: string | null;
  revisionNumber?: number;
  payrollFinalisedDate?: string | null;
  qrDataUrl?: string | null;
  financialYearLabel?: string | null;
  /** Called when preview images finish loading (success or failure). */
  onAssetsReady?: (ready: boolean) => void;
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
  signatureUrl: initialSignatureUrl,
  sealUrl: initialSealUrl,
  signatureAssetPath = null,
  sealAssetPath = null,
  issueDate,
  actualCreditDate,
  paymentMode,
  confirmedPaidAmount,
  outstandingBalance = 0,
  attendancePeriodStart = null,
  attendancePeriodEnd = null,
  documentNumber = null,
  verificationId = null,
  verificationUrl = null,
  verificationFingerprint = null,
  revisionNumber = 1,
  payrollFinalisedDate = null,
  qrDataUrl = null,
  financialYearLabel = null,
  onAssetsReady,
}: AuthorisedSlipProps) {
  const { inputs, computed, employee } = snapshot;
  const attendanceCycle = formatSalaryAttendanceCycle(snapshot.monthYear, 'PREVIOUS_25_TO_CURRENT_24', {
    start: attendancePeriodStart,
    end: attendancePeriodEnd,
  });

  const { tds, pt } = slipStatutoryDeductions(computed, inputs);
  const other = computed.otherDeductions;
  const lop = computed.lopDeduction;
  const totalDeductions = computed.totalDeductions;
  const variablePaid = computed.variablePaid;
  const grossThisMonth = inputs.baseSalary + inputs.fixedAllowance + variablePaid;
  const paidAmount = confirmedPaidAmount ?? computed.netPay;
  const issued = issueDate ?? new Date();

  const [yStr, mStr] = snapshot.monthYear.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const fyLabel =
    financialYearLabel ??
    (m >= 4 ? `FY ${y}-${String(y + 1).slice(-2)}` : `FY ${y - 1}-${String(y).slice(-2)}`);

  const [signatureUrl, setSignatureUrl] = useState(initialSignatureUrl);
  const [sealUrl, setSealUrl] = useState(initialSealUrl);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [sealError, setSealError] = useState<string | null>(null);
  const [signatureLoaded, setSignatureLoaded] = useState(!initialSignatureUrl);
  const [sealLoaded, setSealLoaded] = useState(!initialSealUrl);

  useEffect(() => {
    setSignatureUrl(initialSignatureUrl);
    setSealUrl(initialSealUrl);
    setSignatureError(null);
    setSealError(null);
    setSignatureLoaded(!initialSignatureUrl);
    setSealLoaded(!initialSealUrl);
  }, [initialSignatureUrl, initialSealUrl]);

  useEffect(() => {
    if (!signatureAssetPath?.trim() && !sealAssetPath?.trim()) {
      onAssetsReady?.(true);
      return;
    }
    onAssetsReady?.(signatureLoaded && sealLoaded && !signatureError && !sealError);
  }, [
    signatureLoaded,
    sealLoaded,
    signatureError,
    sealError,
    signatureAssetPath,
    sealAssetPath,
    onAssetsReady,
  ]);

  async function refreshSignedUrl(
    path: string | null | undefined,
    kind: 'signature' | 'seal',
  ) {
    if (!path?.trim()) return;
    const result = await createSignatorySignedUrl(path);
    if (!result.ok || !result.data.signedUrl) {
      if (kind === 'signature') {
        setSignatureError('Signature image could not be loaded from company settings.');
        setSignatureLoaded(true);
      } else {
        setSealError('Company seal is missing.');
        setSealLoaded(true);
      }
      return;
    }
    if (kind === 'signature') {
      setSignatureUrl(result.data.signedUrl);
      setSignatureError(null);
      setSignatureLoaded(false);
    } else {
      setSealUrl(result.data.signedUrl);
      setSealError(null);
      setSealLoaded(false);
    }
  }

  return (
    <div
      className="slip-sheet relative mx-auto box-border flex flex-col bg-paper text-ink shadow-lg"
      style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm' }}
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-ink p-1.5">
            <EntityLogo entity={entity} code={employee.entityCode} className="max-h-full max-w-full" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold leading-tight tracking-tight">{entity.name}</h1>
            <p className="mt-1 text-[10px] text-muted">
              CIN: <span className="amount text-ink">{entity.cin}</span>
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted">{entity.registeredAddress}</p>
            <p className="mt-1 text-[10px] text-muted">
              Tel: <span className="text-ink">{entity.phone}</span>
              {' · '}
              Payroll: <span className="text-ink">{entity.payrollEmail}</span>
            </p>
          </div>
        </div>
        {qrDataUrl && (
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Verification QR" className="h-16 w-16" />
            <p className="mt-0.5 max-w-[72px] break-all text-[7px] text-muted">{verificationId}</p>
          </div>
        )}
      </header>

      <div className="mt-4 text-center">
        <p className="text-[16px] font-bold uppercase tracking-[0.14em]">Authorised Salary Slip</p>
        <p className="mt-1 text-[11px] font-medium">
          Salary month: {formatMonthYear(snapshot.monthYear)} · {fyLabel}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">Attendance cycle: {attendanceCycle}</p>
        <p className="mt-0.5 text-[10px] text-muted">
          Payslip no: <span className="amount text-ink">{documentNumber ?? '—'}</span>
          {' · '}
          Rev {revisionNumber}
          {' · '}
          Status: ISSUED
        </p>
        <p className="mt-0.5 text-[10px] text-muted">
          Payroll finalised:{' '}
          {payrollFinalisedDate ? formatDate(payrollFinalisedDate) : formatDate(snapshot.generatedAt)}
          {' · '}
          Issue date: {formatDate(issued)}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-ink">
          Actual salary-credit date: {formatDate(actualCreditDate)}
        </p>
      </div>

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
            <p>{paymentMode ?? employee.paymentMode}</p>
          </div>
        </div>
      </section>

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
              <td className="px-2 py-1">
                Loss of Pay
                <DeductionNote>
                  {computed.lopDays.toFixed(1)} LOP day(s) · payable days referenced for rate basis
                </DeductionNote>
              </td>
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

      <section className="slip-net-band mt-5 rounded border px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em]">Net Salary</p>
          <p className="amount shrink-0 text-[24px] font-bold">{formatINR(computed.netPay)}</p>
        </div>
        <p className="mt-1 border-t border-emerald-600/30 pt-1 text-[10px] font-medium">
          {computed.netPayWords}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-emerald-600/20 pt-2 text-[10px]">
          <div>
            <p className="text-[8px] uppercase tracking-wider text-muted">Payment status</p>
            <p className="font-semibold">Paid</p>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-wider text-muted">Confirmed paid</p>
            <p className="amount font-semibold">{formatINR(paidAmount)}</p>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-wider text-muted">Outstanding</p>
            <p className="amount font-semibold">{formatINR(outstandingBalance)}</p>
          </div>
        </div>
      </section>

      {(signatureError || sealError) && (
        <div className="no-print mt-3 space-y-1 rounded border border-amber-edge bg-amber-tint px-3 py-2 text-[11px] font-medium text-amber-brand">
          {signatureError && <p>{signatureError}</p>}
          {sealError && <p>{sealError}</p>}
        </div>
      )}

      <section className="mt-8 grid grid-cols-[1fr_auto] items-end gap-6">
        <div>
          <p className="text-[10px]">For {entity.name}</p>
          <div className="relative mt-2 inline-block min-h-[64px] min-w-[180px]">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Authorised signature"
                className="relative z-0 max-h-16 max-w-[180px] object-contain"
                onLoad={() => {
                  setSignatureLoaded(true);
                  setSignatureError(null);
                }}
                onError={() => {
                  setSignatureLoaded(true);
                  setSignatureError('Signature image could not be loaded from company settings.');
                  void refreshSignedUrl(signatureAssetPath, 'signature');
                }}
              />
            ) : signatureAssetPath ? (
              <p className="no-print text-[10px] text-amber-brand">Loading signature…</p>
            ) : null}
            {sealUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sealUrl}
                alt="Company seal"
                className="pointer-events-none absolute -bottom-2 -right-4 z-10 h-14 w-14 object-contain"
                onLoad={() => {
                  setSealLoaded(true);
                  setSealError(null);
                }}
                onError={() => {
                  setSealLoaded(true);
                  setSealError('Company seal is missing.');
                  void refreshSignedUrl(sealAssetPath, 'seal');
                }}
              />
            )}
          </div>
          <p className="mt-1 text-[11px] font-semibold">{entity.signatoryName}</p>
          <p className="text-[10px] text-muted">{entity.signatoryDesignation} / Authorised Signatory</p>
          <p className="mt-3 text-[9.5px] text-muted">
            Place: Kochi
            {' · '}
            Date: {formatDate(issued)}
          </p>
        </div>
        <div className="text-right text-[9px] text-muted">
          <p>Verification ID</p>
          <p className="amount font-semibold text-ink">{verificationId ?? '—'}</p>
          {verificationFingerprint && (
            <>
              <p className="mt-1">Fingerprint</p>
              <p className="amount break-all text-[8px]">{verificationFingerprint}</p>
            </>
          )}
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

      <footer className="mt-auto border-t border-hairline pt-3 text-[8.5px] leading-relaxed text-muted">
        <p>Authorised and issued by the employer.</p>
        <p>
          Authorised and issued by the employer. This computer-generated authorised salary slip may
          be verified through the QR code and verification ID
          {verificationUrl ? ` at ${verificationUrl}` : ''}.
        </p>
        <p>
          For employer verification contact {entity.payrollEmail} / {entity.phone}. Do not treat a
          pasted signature image as a cryptographic digital signature.
        </p>
      </footer>
    </div>
  );
}
