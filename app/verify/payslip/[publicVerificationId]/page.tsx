import { fetchPublicPayslipVerification } from '@/app/actions/verification';
import { formatDate, formatMonthYear } from '@/lib/format';

interface PageProps {
  params: { publicVerificationId: string };
}

/**
 * Public bank verification page — no login required.
 * Exposes only: validity, issuer, employee name, salary month, document number,
 * issue/revision status. No PAN, bank, address, UTR, or full identity.
 */
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
    d.status === 'VALID'
      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
      : 'border-amber-600 bg-amber-50 text-amber-900';

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">Employer verification</p>
          <h1 className="text-lg font-bold leading-tight">{d.companyLegalName}</h1>
        </div>

        <div className={`mt-4 inline-block rounded border px-2 py-1 text-xs font-bold ${statusTone}`}>
          {d.status}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Document number</dt>
            <dd className="font-medium tabular-nums">{d.payslipNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Employee</dt>
            <dd className="font-medium">{d.employeeDisplayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Salary month</dt>
            <dd className="font-medium">{formatMonthYear(d.salaryMonth)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Revision</dt>
            <dd className="font-medium">{d.revisionNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Issue date</dt>
            <dd className="font-medium">
              {d.issueDate ? formatDate(d.issueDate) : '—'}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-[11px] leading-relaxed text-neutral-500">
          This page confirms document status only. Full PAN, bank account numbers, residential
          address, net salary, payment evidence and internal notes are never shown here.
        </p>
      </div>
    </main>
  );
}
