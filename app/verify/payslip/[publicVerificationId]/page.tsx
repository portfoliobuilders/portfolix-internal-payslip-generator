import type { ReactNode } from 'react';
import { fetchPublicPayslipVerification } from '@/app/actions/verification';
import { formatDate, formatINR, formatMonthYear } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { publicVerificationId: string };
}

function VerifyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-hairline pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default async function VerifyPayslipPage({ params }: PageProps) {
  const result = await fetchPublicPayslipVerification(params.publicVerificationId);

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-xl px-1 py-8 text-ink sm:px-0 sm:py-12">
        <h1 className="text-lg font-semibold sm:text-xl">Payslip verification</h1>
        <p className="mt-3 text-sm text-muted">{result.error}</p>
        <p className="mt-6 rounded border border-hairline bg-surface px-3 py-2 text-xs">
          Status: <span className="font-semibold">{result.status}</span>
        </p>
      </div>
    );
  }

  const d = result.data;
  const statusColor =
    d.status === 'VALID'
      ? 'text-emerald-700'
      : d.status === 'SUPERSEDED'
        ? 'text-amber-700'
        : 'text-rose-700';

  return (
    <div className="mx-auto w-full max-w-xl px-1 py-8 text-ink sm:px-0 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Official verification
      </p>
      <h1 className="mt-1 break-words text-lg font-semibold sm:text-xl">{d.companyLegalName}</h1>
      <p className={`mt-3 text-sm font-bold ${statusColor}`}>Document status: {d.status}</p>

      <dl className="mt-8 space-y-3 text-sm">
        <VerifyRow label="Payslip number">{d.payslipNumber}</VerifyRow>
        <VerifyRow label="Employee">{d.employeeDisplayName}</VerifyRow>
        <VerifyRow label="Employee ID">{d.maskedEmployeeId}</VerifyRow>
        <VerifyRow label="Salary month">{formatMonthYear(d.salaryMonth)}</VerifyRow>
        <VerifyRow label="Actual credit date">
          {d.actualCreditDate ? formatDate(d.actualCreditDate) : '—'}
        </VerifyRow>
        <VerifyRow label="Net salary">
          {d.netSalary != null ? formatINR(d.netSalary) : '—'}
        </VerifyRow>
        <VerifyRow label="Revision">{d.revisionNumber}</VerifyRow>
        <VerifyRow label="Issue date">
          {d.issueDate ? formatDate(d.issueDate) : '—'}
        </VerifyRow>
        <VerifyRow label="Verification fingerprint">
          <span className="break-all font-mono text-[11px]">
            {d.verificationFingerprint ?? '—'}
          </span>
        </VerifyRow>
      </dl>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        This page shows only controlled verification fields. Full PAN, bank account numbers,
        UTR, residential address, payment evidence, and internal audit logs are never disclosed
        here.
      </p>
    </div>
  );
}
