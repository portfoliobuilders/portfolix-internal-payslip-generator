'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FileBadge2, Printer, X } from 'lucide-react';
import {
  fetchAuthorisedSlipYtd,
  logAuthorisedSlipGeneration,
} from '@/app/actions/payroll';
import { createSignatorySignedUrls } from '@/app/actions/signatory-assets';
import { computeAuthorisedYtd } from '@/lib/authorised-slip';
import {
  authorisedSlipFilename,
  formatDate,
  formatINR,
  formatMonthYear,
  slipFilename,
} from '@/lib/format';
import { exportElementToPdf } from '@/lib/pdf-export';
import { signatoryIncompleteReason } from '@/lib/settings-defaults';
import type { AuthorisedSlipYtd, SlipSnapshot } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import AuthorisedSlip from './AuthorisedSlip';
import SalarySlip from './SalarySlip';
import { Modal, btnPrimary, btnSecondary, inputCls } from './ui';

interface HistoryViewProps {
  slipHistory: SlipSnapshot[];
  loading: boolean;
}

export default function HistoryView({ slipHistory, loading }: HistoryViewProps) {
  const settings = useHRStore((s) => s.settings);

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [viewing, setViewing] = useState<SlipSnapshot | null>(null);
  const [exportTarget, setExportTarget] = useState<SlipSnapshot | null>(null);

  const [bankCopyPending, setBankCopyPending] = useState<SlipSnapshot | null>(null);
  const [bankCopyExport, setBankCopyExport] = useState<{
    snapshot: SlipSnapshot;
    ytd: AuthorisedSlipYtd;
    signatureUrl: string | null;
    sealUrl: string | null;
  } | null>(null);
  const [bankCopyBusy, setBankCopyBusy] = useState(false);
  const [bankCopyError, setBankCopyError] = useState<string | null>(null);

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
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [slipHistory, employeeFilter, monthFilter],
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
        slipFilename(snapshot.monthYear, snapshot.employee.empId, snapshot.status === 'draft'),
      );
    }
    setExportTarget(null);
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
        contactPhone: entity.contactPhone,
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
        ✓ Final
      </span>
    ) : (
      <span className="rounded border border-amber-edge bg-amber-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-brand">
        Draft
      </span>
    );
  }

  function BankCopyButton({ snapshot, compact = false }: { snapshot: SlipSnapshot; compact?: boolean }) {
    if (snapshot.status !== 'final') return null;
    const entity = settings.entities[snapshot.employee.entityCode];
    const reason = signatoryIncompleteReason(entity);
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

  const iconAction =
    'flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:w-9';
  const dtCls = 'text-[10px] font-semibold uppercase tracking-wide text-muted';

  const renderActions = (s: SlipSnapshot) => (
    <div className="flex justify-end gap-1">
      <button title="View slip" aria-label="View slip" className={iconAction} onClick={() => setViewing(s)}>
        <Eye size={16} />
      </button>
      <button
        title="Re-download PDF (from stored snapshot)"
        aria-label="Re-download PDF"
        className={iconAction}
        disabled={exportTarget !== null || bankCopyBusy}
        onClick={() => void redownload(s)}
      >
        <Download size={16} />
      </button>
      <BankCopyButton snapshot={s} compact />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-paper px-4 py-3 shadow-card sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 className="text-sm font-semibold">Slip History</h1>
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
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Month</span>
            <input type="month" className={`${inputCls} w-full sm:w-40`} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-paper shadow-card">
        {filtered.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted">
            No slips match. Generate a slip from the Generator tab — every export lands here.
          </p>
        ) : (
          <>
            <div className="divide-y divide-hairline md:hidden">
              {filtered.map((s) => (
                <div key={s.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.employee.fullName}</p>
                      <p className="text-[12px] text-muted">{s.employee.empId}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                    <div>
                      <dt className={dtCls}>Pay month</dt>
                      <dd>{formatMonthYear(s.monthYear)}</dd>
                    </div>
                    <div>
                      <dt className={dtCls}>Net pay</dt>
                      <dd className="amount font-medium">{formatINR(s.computed.netPay)}</dd>
                    </div>
                    <div>
                      <dt className={dtCls}>Generated</dt>
                      <dd className="text-muted">{formatDate(s.generatedAt)}</dd>
                    </div>
                  </dl>
                  {renderActions(s)}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-semibold">Employee</th>
                    <th className="px-4 py-2.5 font-semibold">Pay month</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Net pay</th>
                    <th className="px-4 py-2.5 font-semibold">Generated</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map((s) => (
                    <tr key={s.id} className="transition-colors duration-150 hover:bg-surface/60">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{s.employee.fullName}</p>
                        <p className="text-[12px] text-muted">{s.employee.empId}</p>
                      </td>
                      <td className="px-4 py-2.5">{formatMonthYear(s.monthYear)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                      <td className="amount px-4 py-2.5 text-right font-medium">{formatINR(s.computed.netPay)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-muted">{formatDate(s.generatedAt)}</td>
                      <td className="px-4 py-2.5">{renderActions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
    </div>
  );
}
