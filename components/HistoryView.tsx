'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileBadge2, Printer, Trash2, Wallet, X } from 'lucide-react';
import {
  fetchAuthorisedSlipYtd,
  logAuthorisedSlipGeneration,
  deletePayrollSlip,
} from '@/app/actions/payroll';
import {
  assertAuthorisedSlipPaymentGate,
  fetchPaymentObligationsForHistory,
} from '@/app/actions/salary-payment';
import { createSignatorySignedUrls, getSignatoryStorageStatus } from '@/app/actions/signatory-assets';
import { computeAuthorisedYtd } from '@/lib/authorised-slip';
import {
  authorisedSlipFilename,
  formatDate,
  formatDateTime,
  formatINR,
  formatMonthYear,
  slipFilename,
} from '@/lib/format';
import { exportElementToPdf } from '@/lib/pdf-export';
import { signatoryIncompleteReason } from '@/lib/settings-defaults';
import type { SalaryPaymentObligation } from '@/lib/salary-payment-types';
import type { AuthorisedSlipYtd, SlipSnapshot } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import AuthorisedSlip from './AuthorisedSlip';
import PaymentLedgerDrawer from './PaymentLedgerDrawer';
import SalarySlip from './SalarySlip';
import Toast from './Toast';
import { btnPrimary, btnSecondary, inputCls, Modal } from './ui';
import { statementMetaFor } from '@/lib/workforce';

interface HistoryViewProps {
  slipHistory: SlipSnapshot[];
  loading: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void>;
}

export default function HistoryView({ slipHistory, loading, error, onRefresh }: HistoryViewProps) {
  const settings = useHRStore((s) => s.settings);

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statementFilter, setStatementFilter] = useState('');
  const [viewing, setViewing] = useState<SlipSnapshot | null>(null);
  const [exportTarget, setExportTarget] = useState<SlipSnapshot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SlipSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [bankCopyPending, setBankCopyPending] = useState<SlipSnapshot | null>(null);
  const [bankCopyExport, setBankCopyExport] = useState<{
    snapshot: SlipSnapshot;
    ytd: AuthorisedSlipYtd;
    signatureUrl: string | null;
    sealUrl: string | null;
  } | null>(null);
  const [bankCopyBusy, setBankCopyBusy] = useState(false);
  const [bankCopyError, setBankCopyError] = useState<string | null>(null);
  const [signatoryStorageConfigured, setSignatoryStorageConfigured] = useState(true);
  const [signatoryStorageMessage, setSignatoryStorageMessage] = useState<string | null>(null);
  const [obligationsByPayrollId, setObligationsByPayrollId] = useState<
    Map<string, SalaryPaymentObligation>
  >(new Map());
  const [ledgerTarget, setLedgerTarget] = useState<SlipSnapshot | null>(null);

  async function refreshObligations() {
    const result = await fetchPaymentObligationsForHistory();
    if (!result.ok) return;
    setObligationsByPayrollId(new Map(result.data.map((o) => [o.payrollRecordId, o])));
  }

  useEffect(() => {
    void refreshObligations();
  }, [slipHistory]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await getSignatoryStorageStatus();
      if (cancelled) return;
      setSignatoryStorageConfigured(status.configured);
      setSignatoryStorageMessage(status.message);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of slipHistory) map.set(s.employeeId, `${s.employee.fullName} · ${s.employee.empId}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [slipHistory]);

  const filtered = useMemo(
    () =>
      [...slipHistory]
        .filter((s) => (employeeFilter ? s.employeeId === employeeFilter : true))
        .filter((s) => (monthFilter ? s.monthYear === monthFilter : true))
        .filter((s) => {
          if (!statementFilter) return true;
          const title = statementMetaFor(s.employee.paymentType, s.employee.engagementType, s.employee.employmentStatus).statementTitle;
          return title === statementFilter;
        })
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [slipHistory, employeeFilter, monthFilter, statementFilter],
  );

  /**
   * Re-download renders the STORED snapshot (never recomputed): the
   * snapshot is mounted off-screen, captured to PDF, then unmounted.
   */
  async function redownload(snapshot: SlipSnapshot) {
    setExportTarget(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const el = document.getElementById('history-export-root');
    if (el) {
      await exportElementToPdf(
        el,
        slipFilename(
          snapshot.monthYear,
          snapshot.employee.empId,
          snapshot.status === 'draft',
          statementMetaFor(
            snapshot.employee.paymentType,
            snapshot.employee.engagementType,
            snapshot.employee.employmentStatus,
          ).statementTitle.replace(/\s+/g, ''),
        ),
      );
    }
    setExportTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deletePayrollSlip(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    if (viewing?.id === deleteTarget.id) setViewing(null);
    setDeleteTarget(null);
    setToastMessage('Slip removed from history.');
    await onRefresh?.();
  }

  async function generateBankCopy(snapshot: SlipSnapshot) {
    const entity = settings.entities[snapshot.employee.entityCode];
    const incomplete = signatoryIncompleteReason(entity);
    if (incomplete) {
      setBankCopyError(incomplete);
      return;
    }

    setBankCopyBusy(true);
    setBankCopyError(null);
    try {
      const paymentGate = await assertAuthorisedSlipPaymentGate(snapshot.id);
      if (!paymentGate.ok) {
        setBankCopyError(paymentGate.error);
        return;
      }

      const [ytdResult, urlsResult] = await Promise.all([
        fetchAuthorisedSlipYtd(snapshot.employeeId, snapshot.monthYear),
        createSignatorySignedUrls({
          signatureAssetPath: entity.signatureAssetPath,
          sealAssetPath: entity.sealAssetPath,
        }),
      ]);

      if (!ytdResult.ok) {
        setBankCopyError(ytdResult.error);
        return;
      }
      if (!urlsResult.ok) {
        setBankCopyError(urlsResult.error);
        return;
      }

      // Prefer server YTD; fall back to client-side from loaded history if needed.
      const ytd =
        ytdResult.data ??
        computeAuthorisedYtd(slipHistory, snapshot.employeeId, snapshot.monthYear);

      setBankCopyPending(null);
      setBankCopyExport({
        snapshot,
        ytd,
        signatureUrl: urlsResult.data.signatureUrl,
        sealUrl: urlsResult.data.sealUrl,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));
      const el = document.getElementById('authorised-export-root');
      if (!el) throw new Error('Authorised slip element not ready.');

      await exportElementToPdf(
        el,
        authorisedSlipFilename(
          snapshot.employee.entityCode,
          snapshot.monthYear,
          snapshot.employee.empId,
        ),
      );

      // Reprints are logged, never blocked — log after successful PDF.
      await logAuthorisedSlipGeneration(snapshot.id, {
        signatoryName: entity.signatoryName,
        signatoryDesignation: entity.signatoryDesignation,
        signatureAssetPath: entity.signatureAssetPath,
        sealAssetPath: entity.sealAssetPath,
        entityLegalName: entity.name,
        cin: entity.cin,
        registeredAddress: entity.registeredAddress,
        phone: entity.phone,
        payrollEmail: entity.payrollEmail,
      });
    } catch (err) {
      setBankCopyError(err instanceof Error ? err.message : 'Failed to generate bank copy.');
    } finally {
      setBankCopyBusy(false);
      setBankCopyExport(null);
    }
  }

  function StatusBadge({ status }: { status: SlipSnapshot['status'] }) {
    return status === 'final' ? (
      <span className="rounded border border-emerald-brand bg-emerald-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-deep">
        Final
      </span>
    ) : (
      <span className="rounded border border-amber-edge bg-amber-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-brand">
        Draft
      </span>
    );
  }

  function PaymentBadge({ obligation }: { obligation?: SalaryPaymentObligation }) {
    if (!obligation) {
      return <span className="text-[11px] text-muted">—</span>;
    }
    const tone =
      obligation.paymentStatus === 'PAID'
        ? 'border-emerald-brand bg-emerald-tint text-emerald-deep'
        : obligation.paymentStatus === 'OVERDUE' ||
            obligation.paymentStatus === 'FAILED' ||
            obligation.paymentStatus === 'REJECTED_BY_BANK'
          ? 'border-amber-edge bg-amber-tint text-amber-brand'
          : 'border-hairline bg-surface text-ink';
    return (
      <span
        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
      >
        {obligation.paymentStatus.replace(/_/g, ' ')}
      </span>
    );
  }

  function BankCopyButton({ snapshot, compact = false }: { snapshot: SlipSnapshot; compact?: boolean }) {
    if (snapshot.status !== 'final') return null;
    const entity = settings.entities[snapshot.employee.entityCode];
    const settingsReason = signatoryIncompleteReason(entity);
    const obligation = obligationsByPayrollId.get(snapshot.id);
    const paymentReason =
      obligation &&
      (obligation.paymentStatus !== 'PAID' || obligation.outstandingAmount > 0)
        ? 'Authorised salary slip blocked until payment is PAID and fully reconciled.'
        : !obligation
          ? 'Authorised salary slip blocked until payment obligation is PAID and fully reconciled.'
          : null;
    const reason =
      paymentReason ??
      (!signatoryStorageConfigured
        ? signatoryStorageMessage ??
          'Server key not configured (SUPABASE_SECRET_KEY). Bank copy cannot embed signature/seal.'
        : settingsReason);
    const disabled = !!reason || bankCopyBusy;

    if (compact) {
      return (
        <button
          title={reason ?? 'Bank Copy (PDF)'}
          aria-label={reason ?? 'Bank Copy (PDF)'}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:w-9"
          disabled={disabled}
          onClick={() => {
            setBankCopyError(null);
            setBankCopyPending(snapshot);
          }}
        >
          <FileBadge2 size={16} />
        </button>
      );
    }

    return (
      <div className="flex flex-col items-end gap-1">
        <button
          className={btnSecondary}
          disabled={disabled}
          title={reason ?? undefined}
          onClick={() => {
            setBankCopyError(null);
            setBankCopyPending(snapshot);
          }}
        >
          <FileBadge2 size={14} /> Bank Copy (PDF)
        </button>
        {reason && <p className="max-w-[220px] text-right text-[10px] text-amber-brand">{reason}</p>}
      </div>
    );
  }

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Loading slip history from Supabase…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-edge bg-amber-tint px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-brand">Could not load slip history</p>
        <p className="mt-1 text-[12px] text-muted">{error}</p>
        {onRefresh && (
          <button
            className="mt-4 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper"
            onClick={() => void onRefresh()}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-paper px-4 py-3 shadow-card sm:flex-row sm:flex-wrap sm:items-end">
        <div>
            <h1 className="text-sm font-semibold">Payment History</h1>
          <p className="text-[12px] text-muted">
            {filtered.length} of {slipHistory.length} snapshot{slipHistory.length === 1 ? '' : 's'} ·
            re-downloads always use the stored snapshot, never recomputed
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-end sm:gap-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Employee</span>
            <select className={`${inputCls} w-full sm:w-56`} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="">All employees</option>
              {employeeOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Type</span>
            <select className={`${inputCls} w-56`} value={statementFilter} onChange={(e) => setStatementFilter(e.target.value)}>
              <option value="">All statements</option>
              <option value="Salary Slip">Salary Slips</option>
              <option value="Stipend Statement">Stipend Statements</option>
              <option value="Professional Fee Statement">Professional Fee Statements</option>
              <option value="Consultancy Fee Statement">Consultancy Fee Statements</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Month</span>
            <input type="month" className={`${inputCls} w-40`} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-paper shadow-card">
        {filtered.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted">
            {slipHistory.length === 0
              ? 'No slips yet. Generate a slip from the Generator page — every export is saved to Supabase.'
              : 'No slips match the current filters.'}
          </p>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-semibold">Employee</th>
                <th className="px-3 py-2 font-semibold">Pay month</th>
                <th className="px-3 py-2 font-semibold">Payroll</th>
                <th className="px-3 py-2 font-semibold">Payment</th>
                <th className="px-3 py-2 text-right font-semibold">Net due</th>
                <th className="px-3 py-2 text-right font-semibold">Confirmed</th>
                <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                <th className="px-3 py-2 font-semibold">Original due</th>
                <th className="px-3 py-2 font-semibold">Revised expected</th>
                <th className="px-3 py-2 font-semibold">Last paid</th>
                <th className="px-3 py-2 font-semibold">Timeliness</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((s) => {
                const obl = obligationsByPayrollId.get(s.id);
                return (
                <tr key={s.id} className="hover:bg-surface/60">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{s.employee.fullName}</p>
                    <p className="text-[12px] text-muted">{s.employee.empId}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatMonthYear(s.monthYear)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2.5"><PaymentBadge obligation={obl} /></td>
                  <td className="amount px-3 py-2.5 text-right font-medium">
                    {formatINR(obl?.netSalaryPayable ?? s.computed.netPay)}
                  </td>
                  <td className="amount px-3 py-2.5 text-right text-[12px]">
                    {obl ? formatINR(obl.confirmedPaidAmount) : '—'}
                  </td>
                  <td className="amount px-3 py-2.5 text-right text-[12px]">
                    {obl ? formatINR(obl.outstandingAmount) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted whitespace-nowrap">
                    {obl ? formatDate(obl.originalStatutoryDueDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted whitespace-nowrap">
                    {obl?.revisedExpectedDate ? formatDate(obl.revisedExpectedDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted whitespace-nowrap">
                    {obl?.lastPaymentDate ? formatDate(obl.lastPaymentDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">
                    {obl ? obl.timeliness.replace(/_/g, ' ') : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        title="View slip"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                        onClick={() => setViewing(s)}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        title="Re-download PDF (from stored snapshot)"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                        disabled={exportTarget !== null}
                        onClick={() => void redownload(s)}
                      >
                        <Download size={15} />
                      </button>
                      {s.status === 'final' && (
                        <button
                          title="Payment Ledger"
                          className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                          onClick={() => setLedgerTarget(s)}
                        >
                          <Wallet size={15} />
                        </button>
                      )}
                      <BankCopyButton snapshot={s} compact />
                      <button
                        title="Delete slip"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-amber-brand"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(s);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>

      {viewing && (
        <div
          className="no-print fixed inset-0 z-50 overflow-auto bg-ink/50 p-4 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewing(null);
          }}
        >
          <div className="mx-auto w-fit">
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <button className={`${btnSecondary} bg-paper`} onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
              <button className={`${btnSecondary} bg-paper`} onClick={() => void redownload(viewing)}>
                <Download size={14} /> Re-download PDF
              </button>
              <BankCopyButton snapshot={viewing} />
              {viewing.status === 'final' && (
                <button
                  className={`${btnSecondary} bg-paper`}
                  onClick={() => setLedgerTarget(viewing)}
                >
                  <Wallet size={14} /> Payment Ledger
                </button>
              )}
              <button className={`${btnSecondary} bg-paper`} onClick={() => setViewing(null)}>
                <X size={14} /> Close
              </button>
            </div>
            {bankCopyError && viewing.status === 'final' && (
              <p className="mb-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] text-amber-brand">
                {bankCopyError}
              </p>
            )}
            <SalarySlip
              snapshot={viewing}
              entity={settings.entities[viewing.employee.entityCode]}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              reviewDeadlineTime={settings.reviewDeadlineTime}
            />
          </div>
        </div>
      )}

      {viewing &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="slip-print-root">
            <SalarySlip
              snapshot={viewing}
              entity={settings.entities[viewing.employee.entityCode]}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              reviewDeadlineTime={settings.reviewDeadlineTime}
            />
          </div>,
          document.body,
        )}

      {exportTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="history-export-root" style={{ position: 'absolute', top: 0, left: -10000 }}>
            <SalarySlip
              snapshot={exportTarget}
              entity={settings.entities[exportTarget.employee.entityCode]}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              reviewDeadlineTime={settings.reviewDeadlineTime}
            />
          </div>,
          document.body,
        )}

      {bankCopyExport &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="authorised-export-root" style={{ position: 'absolute', top: 0, left: -10000 }}>
            <AuthorisedSlip
              snapshot={bankCopyExport.snapshot}
              entity={settings.entities[bankCopyExport.snapshot.employee.entityCode]}
              ytd={bankCopyExport.ytd}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              signatureUrl={bankCopyExport.signatureUrl}
              sealUrl={bankCopyExport.sealUrl}
            />
          </div>,
          document.body,
        )}

      {bankCopyPending && (
        <Modal
          title="Generate bank copy?"
          onClose={() => {
            if (!bankCopyBusy) setBankCopyPending(null);
          }}
        >
          <p className="text-sm text-ink">
            This embeds the authorised signature and company seal. Generate?
          </p>
          <p className="mt-2 text-[12px] text-muted">
            {bankCopyPending.employee.fullName} · {bankCopyPending.employee.empId} ·{' '}
            {formatMonthYear(bankCopyPending.monthYear)}
          </p>
          {bankCopyError && (
            <p className="mt-3 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] text-amber-brand">
              {bankCopyError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className={btnSecondary}
              disabled={bankCopyBusy}
              onClick={() => setBankCopyPending(null)}
            >
              Cancel
            </button>
            <button
              className={btnPrimary}
              disabled={bankCopyBusy}
              onClick={() => void generateBankCopy(bankCopyPending)}
            >
              {bankCopyBusy ? 'Generating…' : 'Generate bank copy'}
            </button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete slip from history?"
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <p className="text-sm text-ink">
            Permanently remove the stored snapshot for{' '}
            <strong>{deleteTarget.employee.fullName}</strong> ({deleteTarget.employee.empId}) ·{' '}
            {formatMonthYear(deleteTarget.monthYear)}
            {deleteTarget.status === 'final' ? ' (Final)' : ' (Draft)'}?
          </p>
          <p className="mt-2 text-[12px] text-muted">
            Re-download and bank copy will no longer be available for this entry. Employee flex-bank
            balance is not changed.
          </p>
          {deleteError && (
            <p className="mt-3 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] text-amber-brand">
              {deleteError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className={btnSecondary}
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button className={btnPrimary} disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {ledgerTarget && (
        <PaymentLedgerDrawer
          payrollRecordId={ledgerTarget.id}
          employeeLabel={`${ledgerTarget.employee.fullName} · ${ledgerTarget.employee.empId}`}
          monthYearLabel={formatMonthYear(ledgerTarget.monthYear)}
          payrollStatus={ledgerTarget.status === 'final' ? 'FINAL' : 'DRAFT'}
          onClose={() => setLedgerTarget(null)}
          onChanged={async () => {
            await refreshObligations();
            await onRefresh?.();
          }}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  );
}
