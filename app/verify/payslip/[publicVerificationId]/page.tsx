import { fetchPublicPayslipVerification } from '@/app/actions/verify-payslip';
import { formatDate, formatINR, formatMonthYear } from '@/lib/format';

interface PageProps {
  params: { publicVerificationId: string };
}

export default async function VerifyPayslipPage({ params }: PageProps) {
  const result = await fetchPublicPayslipVerification(params.publicVerificationId);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-xl font-semibold">Payslip verification</h1>
        <p className="mt-3 text-sm text-red-700">{result.error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          If you received this link from an authorised salary slip, contact the employer payroll
          team for assistance.
        </p>
      </main>
    );
  }

  const d = result.data;
  const statusTone =
    d.documentStatus === 'VALID'
      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
      : 'border-amber-600 bg-amber-50 text-amber-900';

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          {d.companyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.companyLogoUrl}
              alt={d.companyLegalName}
              className="h-12 w-24 object-contain"
            />
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Employer verification</p>
            <h1 className="text-lg font-bold leading-tight">{d.companyLegalName}</h1>
          </div>
        </div>

        <div className={`mt-4 inline-block rounded border px-2 py-1 text-xs font-bold ${statusTone}`}>
          {d.documentStatus}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Payslip number</dt>
            <dd className="font-medium tabular-nums">{d.payslipNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Employee</dt>
            <dd className="font-medium">{d.employeeDisplayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Employee ID</dt>
            <dd className="font-medium tabular-nums">{d.maskedEmployeeId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Salary month</dt>
            <dd className="font-medium">{formatMonthYear(d.salaryMonth)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Actual credit date</dt>
            <dd className="font-medium">
              {d.actualCreditDate ? formatDate(d.actualCreditDate) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Net salary</dt>
            <dd className="font-semibold tabular-nums">{formatINR(d.netSalary)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Revision</dt>
            <dd className="font-medium">{d.revisionNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Issue date</dt>
            <dd className="font-medium">{formatDate(d.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Verification fingerprint</dt>
            <dd className="mt-1 break-all font-mono text-xs">{d.verificationFingerprint}</dd>
          </div>
        </dl>

        <p className="mt-6 text-[11px] leading-relaxed text-neutral-500">
          This page confirms document status only. Full PAN, bank account numbers, residential
          address, payment evidence and internal notes are never shown here.
        </p>
      </div>
    </main>
  );
}
