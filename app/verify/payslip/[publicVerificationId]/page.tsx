import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldX,
  XCircle,
} from 'lucide-react';
import { fetchPublicPayslipVerification } from '@/app/actions/verify-payslip';
import CopyDocumentNumberButton from '@/components/CopyDocumentNumberButton';
import {
  formatCheckedAtIst,
  formatDate,
  formatINR,
  formatMonthYear,
} from '@/lib/format';
import type { PublicVerificationStatus } from '@/lib/verification';

interface PageProps {
  params: { publicVerificationId: string };
}

function verdictCopy(status: PublicVerificationStatus): {
  label: string;
  sentence: string;
  bandClass: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'SUPERSEDED':
      return {
        label: 'SUPERSEDED',
        sentence:
          'This authorised salary slip has been superseded by a newer revision and is no longer the active document.',
        bandClass: 'border-amber-600 bg-amber-50 text-amber-950',
        Icon: AlertTriangle,
      };
    case 'REVOKED':
    case 'CANCELLED':
      return {
        label: 'REVOKED',
        sentence:
          'This authorised salary slip has been revoked and must not be relied upon for verification.',
        bandClass: 'border-red-700 bg-red-50 text-red-950',
        Icon: status === 'CANCELLED' ? ShieldX : XCircle,
      };
    case 'VALID':
    default:
      return {
        label: 'VALID',
        sentence:
          'This authorised salary slip matches employer records and is currently valid.',
        bandClass: 'border-emerald-700 bg-emerald-50 text-emerald-950',
        Icon: CheckCircle2,
      };
  }
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-hairline py-2.5 last:border-b-0 sm:grid-cols-[minmax(8rem,38%)_1fr] sm:gap-3 sm:items-baseline">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function VerifyPayslipPage({ params }: PageProps) {
  const result = await fetchPublicPayslipVerification(params.publicVerificationId);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-xl font-semibold text-ink">Payslip verification</h1>
        <p className="mt-3 text-sm text-red-700">{result.error}</p>
        <p className="mt-2 text-xs text-muted">
          If you received this link from an authorised salary slip, contact the employer payroll
          team for assistance.
        </p>
      </div>
    );
  }

  const d = result.data;
  const verdict = verdictCopy(d.documentStatus);
  const Icon = verdict.Icon;

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* 1. Full-width state band — first paint hierarchy */}
      <div className={`w-full border-b-2 ${verdict.bandClass}`}>
        <div className="mx-auto flex max-w-lg items-start gap-3 px-4 py-4 sm:px-5">
          <Icon className="mt-0.5 h-6 w-6 shrink-0" strokeWidth={2.25} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-[0.12em]">{verdict.label}</p>
            <p className="mt-1 text-sm leading-snug">{verdict.sentence}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-6 sm:px-5">
        {/* 2. Letterhead — echoes PDF typography */}
        <header className="flex items-start gap-3 border-b-2 border-ink pb-4">
          {d.companyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.companyLogoUrl}
              alt=""
              className="h-12 w-24 shrink-0 object-contain"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold leading-tight tracking-tight sm:text-base">
              {d.companyLegalName}
            </h1>
            {d.companyCin && (
              <p className="mt-1 text-[11px] text-muted">
                CIN: <span className="amount text-ink">{d.companyCin}</span>
              </p>
            )}
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
              Employer verification
            </p>
          </div>
        </header>

        {/* Title mirrors paper: AUTHORISED SALARY SLIP + salary month subtitle */}
        <div className="mt-5 text-center">
          <p className="text-[15px] font-bold uppercase tracking-[0.12em]">Authorised Salary Slip</p>
          <p className="mt-0.5 text-[13px] font-semibold">
            {d.salaryMonth ? formatMonthYear(d.salaryMonth) : '—'}
          </p>
        </div>

        {/* Document-details grid parity: Issue Date | Credit Date only */}
        <section className="mt-4 rounded-lg border border-hairline bg-paper shadow-card">
          <div className="grid grid-cols-2 divide-x divide-hairline">
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Issue date</p>
              <p className="mt-0.5 text-sm font-semibold">
                {d.issueDate ? formatDate(d.issueDate) : '—'}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Credit date</p>
              <p className="mt-0.5 text-sm font-semibold">
                {d.actualCreditDate ? formatDate(d.actualCreditDate) : '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-hairline bg-paper px-4 py-1 shadow-card">
          <dl>
            <DetailRow label="Payslip No">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all font-mono text-[13px] tabular-nums leading-snug">
                  {d.payslipNumber}
                  {' · '}
                  Rev {d.revisionNumber}
                </span>
                <CopyDocumentNumberButton value={d.payslipNumber} />
              </div>
            </DetailRow>
            <DetailRow label="Verification ID">
              <span className="break-all font-mono text-[12px] tabular-nums leading-snug">
                {d.publicVerificationId}
              </span>
            </DetailRow>
            <DetailRow label="Employee Name">{d.employeeDisplayName}</DetailRow>
            <DetailRow label="Employee ID">
              <span className="tabular-nums">{d.maskedEmployeeId}</span>
            </DetailRow>
            <DetailRow label="Net Salary">
              <span className="amount font-semibold">
                {d.netSalary != null ? formatINR(d.netSalary) : '—'}
              </span>
            </DetailRow>
            {d.verificationFingerprint && (
              <DetailRow label="Verification Fingerprint">
                <span className="break-all font-mono text-[11px] leading-snug">
                  {d.verificationFingerprint}
                </span>
              </DetailRow>
            )}
          </dl>
        </section>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          This page confirms document status only. Full PAN, bank account numbers, residential
          address, payment evidence and internal notes are never shown here.
        </p>
        <p className="mt-2 text-[11px] text-muted">
          Checked at {formatCheckedAtIst(d.checkedAtIso)}
        </p>
      </div>
    </div>
  );
}
