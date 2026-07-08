'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, Printer, X } from 'lucide-react';
import { formatDate, formatINR, formatMonthYear, slipFilename } from '@/lib/format';
import { exportElementToPdf } from '@/lib/pdf-export';
import type { SlipSnapshot } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import SalarySlip from './SalarySlip';
import { btnSecondary, inputCls } from './ui';

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
    // Give React a frame to mount the off-screen slip before capturing.
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

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Loading slip history from Supabase…</p>;
  }

  const iconAction =
    'flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9';
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
        disabled={exportTarget !== null}
        onClick={() => void redownload(s)}
      >
        <Download size={16} />
      </button>
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
            {/* Mobile (< md): stacked cards. */}
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

            {/* md+ : full table. */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
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

      {/* Full-size viewer */}
      {viewing && (
        <div
          className="no-print fixed inset-0 z-50 overflow-auto bg-ink/50 p-4 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewing(null);
          }}
        >
          <div className="mx-auto w-fit">
            <div className="mb-2 flex justify-end gap-2">
              <button className={`${btnSecondary} bg-paper`} onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
              <button className={`${btnSecondary} bg-paper`} onClick={() => void redownload(viewing)}>
                <Download size={14} /> Re-download PDF
              </button>
              <button className={`${btnSecondary} bg-paper`} onClick={() => setViewing(null)}>
                <X size={14} /> Close
              </button>
            </div>
            <SalarySlip
              snapshot={viewing}
              entity={settings.entities[viewing.employee.entityCode]}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
            />
          </div>
        </div>
      )}

      {/* Print mount while viewing — window.print() captures the slip 1:1 */}
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

      {/* Off-screen export mount for re-downloads */}
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
    </div>
  );
}
