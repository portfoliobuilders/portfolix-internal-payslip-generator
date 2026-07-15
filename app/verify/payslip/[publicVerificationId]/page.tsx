import { fetchPublicPayslipVerification } from '@/app/actions/verification';
import { formatDate, formatINR, formatMonthYear } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { publicVerificationId: string };
}

export default async function VerifyPayslipPage({ params }: PageProps) {
  const result = await fetchPublicPayslipVerification(params.publicVerificationId);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-ink">
        <h1 className="text-xl font-semibold">Payslip verification</h1>
        <p className="mt-3 text-sm text-muted">{result.error}</p>
        <p className="mt-6 rounded border border-hairline bg-surface px-3 py-2 text-xs">
          Status: <span className="font-semibold">{result.status}</span>
        </p>
      </main>
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
    <main className="mx-auto max-w-xl px-4 py-16 text-ink">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Official verification
      </p>
      <h1 className="mt-1 text-xl font-semibold">{d.companyLegalName}</h1>
      <p className={`mt-3 text-sm font-bold ${statusColor}`}>Document status: {d.status}</p>

      <dl className="mt-8 space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Payslip number</dt>
          <dd className="font-medium">{d.payslipNumber}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Employee</dt>
          <dd className="font-medium">{d.employeeDisplayName}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Employee ID</dt>
          <dd className="font-medium">{d.maskedEmployeeId}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Salary month</dt>
          <dd className="font-medium">{formatMonthYear(d.salaryMonth)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Actual credit date</dt>
          <dd className="font-medium">
            {d.actualCreditDate ? formatDate(d.actualCreditDate) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Net salary</dt>
          <dd className="font-medium">
            {d.netSalary != null ? formatINR(d.netSalary) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Revision</dt>
          <dd className="font-medium">{d.revisionNumber}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Issue date</dt>
          <dd className="font-medium">
            {d.issueDate ? formatDate(d.issueDate) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-hairline pb-2">
          <dt className="text-muted">Verification fingerprint</dt>
          <dd className="max-w-[55%] break-all text-right text-[11px] font-medium">
            {d.verificationFingerprint ?? '—'}
          </dd>
        </div>
      </dl>

      <p className="mt-8 text-[11px] leading-relaxed text-muted">
        This page shows only controlled verification fields. Full PAN, bank account numbers,
        UTR, residential address, payment evidence, and internal audit logs are never disclosed
        here.
      </p>
    </main>
  );
}
