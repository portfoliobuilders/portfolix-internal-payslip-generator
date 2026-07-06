'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { computePayroll, validateVariablePaid } from '@/lib/payroll-calc';
import { formatINR, slipFilename } from '@/lib/format';
import { exportElementToPdf } from '@/lib/pdf-export';
import type { SlipSnapshot, SlipStatus } from '@/lib/types';
import {
  findFinalSlipForMonth,
  findPreviousFinalSlip,
  generateId,
  useHRStore,
} from '@/store/useHRStore';
import { useUIStore } from '@/store/useUIStore';
import SalarySlip from './SalarySlip';
import { Field, Modal, btnPrimary, btnSecondary, inputAmountCls, inputCls } from './ui';

interface FormState {
  monthYear: string;
  absentDays: string;
  halfDays: string;
  lateMinutes: string;
  flexMinutesEarned: string;
  fixedAllowance: string;
  otherDeductions: string;
  variableLabel: string;
  variableEarned: string;
  variablePaid: string;
  deferredOpening: string;
  committedPayoutDate: string;
  remarks: string;
}

function emptyForm(monthYear: string): FormState {
  return {
    monthYear,
    absentDays: '0',
    halfDays: '0',
    lateMinutes: '0',
    flexMinutesEarned: '0',
    fixedAllowance: '0',
    otherDeductions: '0',
    variableLabel: '',
    variableEarned: '0',
    variablePaid: '0',
    deferredOpening: '0',
    committedPayoutDate: '',
    remarks: '',
  };
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nonNegative(value: string, label: string): string | null {
  if (value.trim() === '') return `${label} is required (use 0 if none).`;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  return null;
}

/** Scales the fixed 210mm sheet to fit its container width. */
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const SHEET_PX = 794; // 210mm at 96dpi

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScale(Math.min(el.clientWidth / SHEET_PX, 1));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: SHEET_PX,
          height: 1123 * scale, // 297mm at 96dpi
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function GeneratorView() {
  const employees = useHRStore((s) => s.employees);
  const settings = useHRStore((s) => s.settings);
  const slipHistory = useHRStore((s) => s.slipHistory);
  const finalizeSlip = useHRStore((s) => s.finalizeSlip);
  const recordDraftSlip = useHRStore((s) => s.recordDraftSlip);
  const preselectedId = useUIStore((s) => s.generatorEmployeeId);
  const setGeneratorEmployeeId = useUIStore((s) => s.setGeneratorEmployeeId);

  const currentMonth = format(new Date(), 'yyyy-MM');
  const [employeeId, setEmployeeId] = useState<string>(preselectedId ?? '');
  const [form, setForm] = useState<FormState>(() => emptyForm(currentMonth));
  const [status, setStatus] = useState<SlipStatus>('draft');
  const [supersedePending, setSupersedePending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preselectedId) {
      setEmployeeId(preselectedId);
      setGeneratorEmployeeId(null);
    }
  }, [preselectedId, setGeneratorEmployeeId]);

  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const entity = employee ? settings.entities[employee.entityCode] : null;

  // Rule 7: deferred opening auto-fills from the most recent FINAL slip.
  const previousFinal = useMemo(
    () =>
      employee ? findPreviousFinalSlip(slipHistory, employee.id, form.monthYear) : null,
    [employee, slipHistory, form.monthYear],
  );
  const expectedOpening = previousFinal ? previousFinal.computed.deferredClosing : 0;

  // If a FINAL already exists for this month (supersede scenario), compute
  // from the flex balance that slip STARTED from — the committed balance
  // already includes this month's lateness and must not be charged twice.
  const existingFinal = useMemo(
    () => (employee ? findFinalSlipForMonth(slipHistory, employee.id, form.monthYear) : null),
    [employee, slipHistory, form.monthYear],
  );
  const flexBankBase = existingFinal
    ? existingFinal.inputs.flexBankBalanceBefore
    : employee?.flexBankBalance ?? 0;

  useEffect(() => {
    // Re-seed the chained opening whenever employee or month changes.
    setForm((f) => ({ ...f, deferredOpening: String(expectedOpening) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, form.monthYear, expectedOpening]);

  const ledgerMismatch =
    previousFinal !== null && Math.abs(num(form.deferredOpening) - expectedOpening) > 0.005;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ---------- Live computation via the pure engine ----------
  const result = useMemo(() => {
    if (!employee) return null;
    return computePayroll({
      baseSalary: employee.baseSalary,
      flexBankBalance: flexBankBase,
      flexMinutesEarned: num(form.flexMinutesEarned),
      totalLateMinutes: num(form.lateMinutes),
      absentDays: num(form.absentDays),
      halfDays: num(form.halfDays),
      fixedAllowance: num(form.fixedAllowance),
      otherDeductions: num(form.otherDeductions),
      variableEarned: num(form.variableEarned),
      variablePaid: num(form.variablePaid),
      deferredOpening: num(form.deferredOpening),
      committedPayoutDate: form.committedPayoutDate || null,
    });
  }, [employee, form, flexBankBase]);

  const needsPayoutDate = (result?.deferredClosing ?? 0) > 0;

  // ---------- Inline validation ----------
  const errors: Partial<Record<keyof FormState | 'employee', string>> = {};
  if (!employee) errors.employee = 'Select an employee.';
  if (!/^\d{4}-\d{2}$/.test(form.monthYear)) errors.monthYear = 'Pick a pay month.';
  for (const [key, label] of [
    ['absentDays', 'Absent days'],
    ['halfDays', 'Half days'],
    ['lateMinutes', 'Late minutes'],
    ['flexMinutesEarned', 'Flex minutes earned'],
    ['fixedAllowance', 'Fixed allowance'],
    ['otherDeductions', 'Other deductions'],
    ['variableEarned', 'Variable earned'],
    ['variablePaid', 'Variable paid'],
    ['deferredOpening', 'Deferred opening'],
  ] as const) {
    const err = nonNegative(form[key], label);
    if (err) errors[key] = err;
  }
  if (num(form.absentDays) > 31) errors.absentDays = 'Absent days cannot exceed 31.';
  if (num(form.halfDays) > 31) errors.halfDays = 'Half days cannot exceed 31.';
  const variableViolation = validateVariablePaid({
    deferredOpening: num(form.deferredOpening),
    variableEarned: num(form.variableEarned),
    variablePaid: num(form.variablePaid),
  });
  if (variableViolation && !errors.variablePaid) errors.variablePaid = variableViolation;
  if (needsPayoutDate && !form.committedPayoutDate)
    errors.committedPayoutDate =
      'A deferred closing balance requires a committed payout date before export.';

  const hasErrors = Object.keys(errors).length > 0;

  // ---------- Live snapshot for the preview ----------
  const snapshot: SlipSnapshot | null = useMemo(() => {
    if (!employee || !result) return null;
    return {
      id: 'preview',
      employeeId: employee.id,
      monthYear: form.monthYear,
      status,
      inputs: {
        absentDays: num(form.absentDays),
        halfDays: num(form.halfDays),
        lateMinutes: num(form.lateMinutes),
        flexMinutesEarned: num(form.flexMinutesEarned),
        fixedAllowance: num(form.fixedAllowance),
        otherDeductions: num(form.otherDeductions),
        variableLabel: form.variableLabel,
        variableEarned: num(form.variableEarned),
        variablePaid: num(form.variablePaid),
        deferredOpening: num(form.deferredOpening),
        committedPayoutDate: form.committedPayoutDate || null,
        remarks: form.remarks,
        flexBankBalanceBefore: flexBankBase,
        baseSalary: employee.baseSalary,
      },
      computed: {
        perDayRate: result.perDayRate,
        flexAvailable: result.flexAvailable,
        unpaidLateMinutes: result.unpaidLateMinutes,
        flexOffsetMinutes: result.flexOffsetMinutes,
        lopFromLateness: result.lopFromLateness,
        lopDays: result.lopDays,
        lopDeduction: result.lopDeduction,
        otherDeductions: result.otherDeductions,
        totalDeductions: result.totalDeductions,
        grossFixed: result.grossFixed,
        variableEarned: result.variableEarned,
        variablePaid: result.variablePaid,
        variableDeferred: result.variableDeferred,
        deferredOpening: result.deferredOpening,
        deferredClosing: result.deferredClosing,
        committedPayoutDate: result.committedPayoutDate,
        netPay: result.netPay,
        netPayWords: result.netPayWords,
      },
      flexBalanceAfter: result.newFlexBalance,
      generatedAt: new Date().toISOString(),
      employee: {
        fullName: employee.fullName,
        empId: employee.empId,
        entityCode: employee.entityCode,
        department: employee.department,
        designation: employee.designation,
        joiningDate: employee.joiningDate,
        employeeAddress: employee.employeeAddress,
        paymentMode: employee.paymentMode,
        bankLast4: employee.bankLast4,
        panMasked: employee.panMasked,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, result, form, status]);

  // ---------- Export / finalize flow ----------
  async function doExport(confirmedSupersede: boolean) {
    if (!employee || !snapshot || !result || hasErrors) return;

    if (status === 'final' && !confirmedSupersede) {
      const existing = findFinalSlipForMonth(slipHistory, employee.id, form.monthYear);
      if (existing) {
        setSupersedePending(true);
        return;
      }
    }

    const finalSnapshot: SlipSnapshot = {
      ...snapshot,
      id: generateId(),
      generatedAt: new Date().toISOString(),
    };

    setExporting(true);
    try {
      const el = exportRef.current;
      if (!el) throw new Error('Slip element not ready');
      await exportElementToPdf(
        el,
        slipFilename(form.monthYear, employee.empId, status === 'draft'),
      );
      if (status === 'final') {
        finalizeSlip(finalSnapshot, result.newFlexBalance);
      } else {
        recordDraftSlip(finalSnapshot);
      }
    } finally {
      setExporting(false);
      setSupersedePending(false);
    }
  }

  const employeeOptions = [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      {/* ================= Left panel — inputs ================= */}
      <div className="no-print space-y-4">
        <div className="rounded-lg border border-hairline bg-paper p-4">
          <h1 className="mb-3 text-sm font-semibold">Slip Generator</h1>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Employee" error={errors.employee ?? null}>
                <select
                  className={inputCls}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">— Select employee —</option>
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} · {e.empId}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Pay month" error={errors.monthYear ?? null}>
              <input
                type="month"
                className={inputCls}
                value={form.monthYear}
                onChange={(e) => set('monthYear', e.target.value)}
              />
            </Field>
            <Field label="Absent days" error={errors.absentDays ?? null}>
              <input type="number" min={0} step={0.5} className={inputAmountCls} value={form.absentDays} onChange={(e) => set('absentDays', e.target.value)} />
            </Field>
            <Field label="Half days" error={errors.halfDays ?? null}>
              <input type="number" min={0} step={1} className={inputAmountCls} value={form.halfDays} onChange={(e) => set('halfDays', e.target.value)} />
            </Field>
            <Field label="Late minutes this month" error={errors.lateMinutes ?? null}>
              <input type="number" min={0} step={1} className={inputAmountCls} value={form.lateMinutes} onChange={(e) => set('lateMinutes', e.target.value)} />
            </Field>
            <Field
              label="Flex minutes earned this month"
              error={errors.flexMinutesEarned ?? null}
              hint={employee ? `Bank balance carried in: ${flexBankBase} min` : undefined}
            >
              <input type="number" min={0} step={1} className={inputAmountCls} value={form.flexMinutesEarned} onChange={(e) => set('flexMinutesEarned', e.target.value)} />
            </Field>
            <Field label="Fixed allowance (₹)" error={errors.fixedAllowance ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.fixedAllowance} onChange={(e) => set('fixedAllowance', e.target.value)} />
            </Field>
            <Field label="Other deductions (₹)" error={errors.otherDeductions ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.otherDeductions} onChange={(e) => set('otherDeductions', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-hairline bg-paper p-4">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Variable component
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Label">
                <input className={inputCls} value={form.variableLabel} onChange={(e) => set('variableLabel', e.target.value)} placeholder="Performance incentive" />
              </Field>
            </div>
            <Field label="Earned this month (₹)" error={errors.variableEarned ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.variableEarned} onChange={(e) => set('variableEarned', e.target.value)} />
            </Field>
            <Field label="Paid this month (₹)" error={errors.variablePaid ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.variablePaid} onChange={(e) => set('variablePaid', e.target.value)} />
            </Field>
            <Field
              label="Deferred opening (₹)"
              error={errors.deferredOpening ?? null}
              hint={
                previousFinal
                  ? `Auto-filled from FINAL ${previousFinal.monthYear}: ${formatINR(expectedOpening)}`
                  : 'No prior FINAL slip — starts at 0.'
              }
            >
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.deferredOpening} onChange={(e) => set('deferredOpening', e.target.value)} />
            </Field>
            {needsPayoutDate && (
              <Field label="Committed payout date" error={errors.committedPayoutDate ?? null}>
                <input type="date" className={inputCls} value={form.committedPayoutDate} onChange={(e) => set('committedPayoutDate', e.target.value)} />
              </Field>
            )}
          </div>

          {ledgerMismatch && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Ledger mismatch: opening balance differs from the last FINAL slip&apos;s closing (
              {formatINR(expectedOpening)}). The warning stays on the slip until the chain is
              restored.
            </div>
          )}
          {needsPayoutDate && !form.committedPayoutDate && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Deferred closing is {formatINR(result?.deferredClosing ?? 0)} — set a committed
              payout date to unlock PDF export.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-hairline bg-paper p-4">
          <Field label="Remarks / operations note">
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder="e.g. Variable deferred pending client payment clearance."
            />
          </Field>
        </div>
      </div>

      {/* ================= Right panel — live preview ================= */}
      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-paper px-4 py-2.5">
          <div className="flex overflow-hidden rounded-md border border-hairline">
            <button
              onClick={() => setStatus('draft')}
              className={`px-3 py-1.5 text-sm font-medium ${
                status === 'draft' ? 'bg-amber-tint text-amber-brand' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setStatus('final')}
              className={`border-l border-hairline px-3 py-1.5 text-sm font-medium ${
                status === 'final' ? 'bg-emerald-tint text-emerald-deep' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              ✓ Final
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className={btnSecondary} disabled={!snapshot || hasErrors} onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button
              className={btnPrimary}
              disabled={!snapshot || hasErrors || exporting}
              onClick={() => void doExport(false)}
              title={
                errors.committedPayoutDate ??
                (hasErrors ? 'Fix the highlighted inputs first.' : undefined)
              }
            >
              <Download size={14} />
              {exporting ? 'Exporting…' : status === 'final' ? 'Download PDF & finalize' : 'Download draft PDF'}
            </button>
          </div>
        </div>

        {snapshot && entity ? (
          <ScaledPreview>
            <SalarySlip
              snapshot={snapshot}
              entity={entity}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              ledgerMismatch={ledgerMismatch}
            />
          </ScaledPreview>
        ) : (
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
            Select an employee to see the live A4 preview.
          </div>
        )}
      </div>

      {/* Unscaled off-screen copy — the capture source for PDF and window.print(). */}
      {snapshot && entity &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="slip-print-root" ref={exportRef}>
            <SalarySlip
              snapshot={snapshot}
              entity={entity}
              payrollContact={settings.payrollContact}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              ledgerMismatch={ledgerMismatch}
            />
          </div>,
          document.body,
        )}

      {supersedePending && employee && (
        <Modal title="Supersede existing FINAL slip?" onClose={() => setSupersedePending(false)}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-brand" />
            <p className="text-sm">
              A FINAL slip for <strong>{employee.fullName}</strong> ({form.monthYear}) already
              exists. Finalizing again appends a new FINAL snapshot that supersedes it, commits the
              flex balance again, and becomes the new source of next month&apos;s deferred opening.
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setSupersedePending(false)}>
              Cancel
            </button>
            <button className={btnPrimary} onClick={() => void doExport(true)}>
              Supersede &amp; finalize
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
