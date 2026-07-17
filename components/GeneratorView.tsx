'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { AlertTriangle, Download, Maximize2, Minus, Plus, Printer } from 'lucide-react';
import { computePayroll, derivePtThisMonth, validateVariablePaid } from '@/lib/payroll-calc';
import {
  formatINR,
  formatMinutes,
  formatMonthYear,
  slipFilename,
} from '@/lib/format';
import { exportAuthorisedSalarySlipPdf } from '@/lib/authorised-export';
import { exportElementToPdf } from '@/lib/pdf-export';
import { finalizePayrollSlip, savePayrollSlip, fetchAuthorisedSlipYtd, logAuthorisedSlipGeneration } from '@/app/actions/payroll';
import { createSignatorySignedUrls, getSignatoryStorageStatus } from '@/app/actions/signatory-assets';
import { assertAuthorisedSlipPaymentGate } from '@/app/actions/salary-payment';
import { computeAuthorisedYtd } from '@/lib/authorised-slip';
import type { AuthorisedSlipYtd, Employee, EntityInfo, SlipSnapshot, SlipStatus } from '@/lib/types';
import { generateId } from '@/lib/payroll-db';
import { findFinalSlipForMonth, findPreviousFinalSlip } from '@/lib/payroll-helpers';
import { useHRStore } from '@/store/useHRStore';
import { useUIStore } from '@/store/useUIStore';
import { signatoryIncompleteReason } from '@/lib/settings-defaults';
import { COMPANY_ENTITIES, PAYROLL_CONTACT } from '@/lib/constants/company';
import AuthorisedSlip from './AuthorisedSlip';
import SalarySlip from './SalarySlip';
import Toast from './Toast';
import { Field, Modal, btnPrimary, btnSecondary, inputAmountCls, inputCls } from './ui';
import { statementMetaFor } from '@/lib/workforce';

type PreviewMode = 'draft' | 'final' | 'authorised';

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
  authorizedForBankVerification: boolean;
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
    authorizedForBankVerification: false,
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
  const [manualScale, setManualScale] = useState<number | null>(null);
  const SHEET_PX = 794; // 210mm at 96dpi
  const SHEET_HEIGHT_PX = 1123;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (manualScale == null) setScale(Math.min(el.clientWidth / SHEET_PX, 1));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [manualScale]);

  function fitWidth() {
    const width = containerRef.current?.clientWidth ?? SHEET_PX;
    setManualScale(null);
    setScale(Math.min(width / SHEET_PX, 1));
  }

  function fitPage() {
    const width = containerRef.current?.clientWidth ?? SHEET_PX;
    const availableHeight = Math.max(420, window.innerHeight - 210);
    const next = Math.min(width / SHEET_PX, availableHeight / SHEET_HEIGHT_PX, 1);
    setManualScale(next);
    setScale(next);
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div className="no-print mb-2 flex flex-wrap items-center justify-end gap-1">
        <button type="button" className={btnSecondary} onClick={fitWidth}>Fit width</button>
        <button type="button" className={btnSecondary} onClick={fitPage}>Fit page</button>
        <button type="button" aria-label="Zoom out" className={btnSecondary} onClick={() => {
          const next = Math.max(0.25, scale - 0.1);
          setManualScale(next);
          setScale(next);
        }}><Minus size={14} /></button>
        <button type="button" aria-label="Zoom in" className={btnSecondary} onClick={() => {
          const next = Math.min(1.5, scale + 0.1);
          setManualScale(next);
          setScale(next);
        }}><Plus size={14} /></button>
        <button type="button" aria-label="Full screen" className={btnSecondary} onClick={() => {
          void containerRef.current?.requestFullscreen?.();
        }}><Maximize2 size={14} /></button>
      </div>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: SHEET_PX,
          height: SHEET_HEIGHT_PX * scale, // 297mm at 96dpi
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface GeneratorViewProps {
  employees: Employee[];
  slipHistory: SlipSnapshot[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export default function GeneratorView({
  employees,
  slipHistory,
  loading,
  onRefresh,
}: GeneratorViewProps) {
  const settings = useHRStore((s) => s.settings);
  const preselectedId = useUIStore((s) => s.generatorEmployeeId);
  const setGeneratorEmployeeId = useUIStore((s) => s.setGeneratorEmployeeId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentMonth = format(new Date(), 'yyyy-MM');
  const [employeeId, setEmployeeId] = useState<string>(preselectedId ?? '');
  const [selectedEntityId, setSelectedEntityId] = useState<string>(COMPANY_ENTITIES[0].id);
  const [form, setForm] = useState<FormState>(() => emptyForm(currentMonth));
  const [mode, setMode] = useState<PreviewMode>('draft');
  const status: SlipStatus = mode === 'final' ? 'final' : 'draft';
  const [supersedePending, setSupersedePending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [signatoryStorageConfigured, setSignatoryStorageConfigured] = useState(true);
  const [signatoryStorageMessage, setSignatoryStorageMessage] = useState<string | null>(null);
  const [authorisedBundle, setAuthorisedBundle] = useState<{
    snapshot: SlipSnapshot;
    ytd: AuthorisedSlipYtd;
    signatureUrl: string | null;
    sealUrl: string | null;
    actualCreditDate: string;
    confirmedPaidAmount: number;
    outstandingAmount: number;
  } | null>(null);
  const [authorisedLoading, setAuthorisedLoading] = useState(false);
  const [authorisedError, setAuthorisedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storage = await getSignatoryStorageStatus();
      if (cancelled) return;
      setSignatoryStorageConfigured(storage.configured);
      setSignatoryStorageMessage(storage.message);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (preselectedId) {
      setEmployeeId(preselectedId);
      setGeneratorEmployeeId(null);
    }
  }, [preselectedId, setGeneratorEmployeeId]);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      authorizedForBankVerification: settings.bankVerificationEnabledByDefault,
    }));
  }, [settings.bankVerificationEnabledByDefault]);

  const employee = employees.find((e) => e.id === employeeId) ?? null;

  useEffect(() => {
    if (!employee) return;
    const defaultEntityIdByCode: Record<string, string> = {
      PX: 'portfolix-entreprise',
      PT: 'portfolix-tech',
      PB: 'portfolio-builders',
      PH: 'portfolix-hub',
    };
    const suggestedEntityId = defaultEntityIdByCode[employee.entityCode];
    if (suggestedEntityId) setSelectedEntityId(suggestedEntityId);
  }, [employee]);

  const selectedCompanyEntity = useMemo(
    () => COMPANY_ENTITIES.find((entity) => entity.id === selectedEntityId) ?? COMPANY_ENTITIES[0],
    [selectedEntityId],
  );
  const entity: EntityInfo | null = useMemo(() => {
    if (!employee) return null;
    const fromSettings = settings.entities[employee.entityCode];
    // Prefer persisted settings. Overlay logo path from static catalog only when missing.
    return {
      ...fromSettings,
      name: fromSettings.name?.trim() || selectedCompanyEntity.displayName,
      legalLine: fromSettings.legalLine,
      addressLines:
        fromSettings.addressLines?.length > 0
          ? fromSettings.addressLines
          : selectedCompanyEntity.address.split('\n'),
      logoDataUrl: fromSettings.logoDataUrl ?? selectedCompanyEntity.logoPath,
    };
  }, [employee, selectedCompanyEntity, settings.entities]);

  // Rule 7: deferred opening auto-fills from the most recent FINAL slip.
  const previousFinal = useMemo(
    () =>
      employee ? findPreviousFinalSlip(slipHistory, employee.empId, form.monthYear) : null,
    [employee, slipHistory, form.monthYear],
  );
  const expectedOpening = previousFinal ? previousFinal.computed.deferredClosing : 0;

  // If a FINAL already exists for this month (supersede scenario), compute
  // from the flex balance that slip STARTED from — the committed balance
  // already includes this month's lateness and must not be charged twice.
  const existingFinal = useMemo(
    () => (employee ? findFinalSlipForMonth(slipHistory, employee.empId, form.monthYear) : null),
    [employee, slipHistory, form.monthYear],
  );
  const flexBankBase = existingFinal
    ? existingFinal.inputs.flexBankBalanceBefore
    : employee?.flexBankBalance ?? 0;

  // Authorised preview NEVER uses live form inputs — only a stored FINAL snapshot.
  useEffect(() => {
    if (mode !== 'authorised' || !existingFinal || !employee) {
      setAuthorisedBundle(null);
      setAuthorisedError(null);
      setAuthorisedLoading(false);
      return;
    }

    const entityInfo = settings.entities[existingFinal.employee.entityCode];
    let cancelled = false;
    setAuthorisedLoading(true);
    setAuthorisedError(null);

    void (async () => {
      try {
        const [ytdResult, urlsResult, paymentResult] = await Promise.all([
          fetchAuthorisedSlipYtd(existingFinal.employeeId, existingFinal.monthYear),
          createSignatorySignedUrls({
            signatureAssetPath: entityInfo.signatureAssetPath,
            sealAssetPath: entityInfo.sealAssetPath,
          }),
          assertAuthorisedSlipPaymentGate(existingFinal.id),
        ]);

        if (cancelled) return;

        if (!ytdResult.ok) {
          setAuthorisedError(ytdResult.error);
          setAuthorisedBundle(null);
          return;
        }
        if (!paymentResult.ok) {
          setAuthorisedError(paymentResult.error);
          setAuthorisedBundle(null);
          return;
        }

        const ytd =
          ytdResult.data ??
          computeAuthorisedYtd(slipHistory, existingFinal.employeeId, existingFinal.monthYear);

        // Signed URLs may fail when the secret key is missing — still show the
        // slip preview with an explicit warning; download stays gated.
        const signatureUrl = urlsResult.ok ? urlsResult.data.signatureUrl : null;
        const sealUrl = urlsResult.ok ? urlsResult.data.sealUrl : null;
        if (!urlsResult.ok) {
          setAuthorisedError(
            urlsResult.error ||
              'Signature image could not be loaded from company settings.',
          );
        } else if (
          entityInfo.signatureAssetPath &&
          !signatureUrl
        ) {
          setAuthorisedError('Signature image could not be loaded from company settings.');
        } else if (entityInfo.sealAssetPath && !sealUrl) {
          setAuthorisedError('Company seal is missing.');
        }

        setAuthorisedBundle({
          snapshot: existingFinal,
          ytd,
          signatureUrl,
          sealUrl,
          actualCreditDate: paymentResult.data.actualCreditDate,
          confirmedPaidAmount: paymentResult.data.confirmedPaidAmount,
          outstandingAmount: paymentResult.data.outstandingAmount,
        });
      } catch (err) {
        if (cancelled) return;
        setAuthorisedError(
          err instanceof Error ? err.message : 'Failed to load authorised bank copy.',
        );
        setAuthorisedBundle(null);
      } finally {
        if (!cancelled) setAuthorisedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, existingFinal, employee, settings.entities, slipHistory]);

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
  const ptThisMonth = useMemo(() => {
    if (!employee) return 0;
    return derivePtThisMonth(
      employee.ptHalfYearly,
      form.monthYear,
      settings.ptDeductionMonths,
    );
  }, [employee, form.monthYear, settings.ptDeductionMonths]);

  const result = useMemo(() => {
    if (!employee) return null;
    return computePayroll({
      baseSalary: employee.compensationAmount,
      flexBankBalance: flexBankBase,
      flexMinutesEarned: num(form.flexMinutesEarned),
      totalLateMinutes: num(form.lateMinutes),
      absentDays: num(form.absentDays),
      halfDays: num(form.halfDays),
      fixedAllowance: num(form.fixedAllowance),
      otherDeductions: num(form.otherDeductions),
      tdsMonthly: employee.tdsMonthly,
      ptThisMonth,
      variableEarned: num(form.variableEarned),
      variablePaid: num(form.variablePaid),
      deferredOpening: num(form.deferredOpening),
      committedPayoutDate: form.committedPayoutDate || null,
    });
  }, [employee, form, flexBankBase, ptThisMonth]);

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
      employeeId: employee.empId,
      monthYear: form.monthYear,
      status,
      inputs: {
        absentDays: num(form.absentDays),
        halfDays: num(form.halfDays),
        lateMinutes: num(form.lateMinutes),
        flexMinutesEarned: num(form.flexMinutesEarned),
        fixedAllowance: num(form.fixedAllowance),
        otherDeductions: num(form.otherDeductions),
        tdsMonthly: employee.tdsMonthly,
        ptThisMonth,
        variableLabel: form.variableLabel,
        variableEarned: num(form.variableEarned),
        variablePaid: num(form.variablePaid),
        deferredOpening: num(form.deferredOpening),
        committedPayoutDate: form.committedPayoutDate || null,
        remarks: form.remarks,
        authorizedForBankVerification: form.authorizedForBankVerification,
        flexBankBalanceBefore: flexBankBase,
        baseSalary: employee.compensationAmount,
        compensationAmount: employee.compensationAmount,
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
        tds: result.tds,
        pt: result.pt,
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
        engagementType: employee.engagementType,
        employmentStatus: employee.employmentStatus,
        paymentType: employee.paymentType,
        compensationAmount: employee.compensationAmount,
        bankName: employee.bankName ?? '',
        ifsc: employee.ifsc ?? null,
        bankDetailsVerified: employee.bankDetailsVerified === true,
        bankLast4: employee.bankLast4,
        panMasked: employee.panMasked,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, result, form, status]);

  // ---------- Export / finalize flow ----------
  async function doExport(confirmedSupersede: boolean) {
    if (!employee || !snapshot || !result || hasErrors || mode === 'authorised') return;

    if (status === 'final' && !confirmedSupersede) {
      const existing = findFinalSlipForMonth(slipHistory, employee.empId, form.monthYear);
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
        slipFilename(
          form.monthYear,
          employee.empId,
          status === 'draft',
          statementMetaFor(employee.paymentType, employee.engagementType, employee.employmentStatus)
            .statementTitle.replace(/\s+/g, ''),
        ),
      );
      if (status === 'final') {
        const saveResult = await finalizePayrollSlip(finalSnapshot, result.newFlexBalance, settings, {
          supersedeConfirmed: confirmedSupersede,
          // Phase 2: period/attendance warnings only until gates are turned on in Phase 5+.
          enforceStrictGates: false,
          attendanceLocked: false,
          paymentStatus: 'UNPAID',
        });
        if (!saveResult.ok) {
          setSaveError(saveResult.error);
          return;
        }
        const warningSuffix =
          saveResult.data.warnings.length > 0
            ? ` Warnings: ${saveResult.data.warnings.join(' ')}`
            : '';
        setToastMessage(`Final slip saved (server-recomputed).${warningSuffix}`);
      } else {
        const saveResult = await savePayrollSlip({ ...finalSnapshot, status: 'draft' }, settings);
        if (!saveResult.ok) {
          setSaveError(saveResult.error);
          return;
        }
        setToastMessage('Draft slip saved to Supabase history.');
      }
      setSaveError(null);
      await onRefresh();
    } finally {
      setExporting(false);
      setSupersedePending(false);
    }
  }

  const authorisedDisableReason = useMemo(() => {
    if (!employee || !entity) return 'Select an employee.';
    if (!existingFinal) {
      return 'Finalize this month first — the bank copy is generated from the finalized record.';
    }
    if (!signatoryStorageConfigured) {
      return (
        signatoryStorageMessage ??
        'SUPABASE_SECRET_KEY is not configured. Bank copy cannot embed signature/seal.'
      );
    }
    return signatoryIncompleteReason(entity);
  }, [
    employee,
    entity,
    existingFinal,
    signatoryStorageConfigured,
    signatoryStorageMessage,
  ]);

  async function doAuthorisedExport() {
    if (!employee || !entity || !existingFinal || authorisedDisableReason) return;

    setExporting(true);
    setAuthorisedError(null);
    try {
      // Production bank PDF: text/vector + verification registry (not html2canvas).
      const exported = await exportAuthorisedSalarySlipPdf({
        snapshot: existingFinal,
        entity,
      });
      if (!exported.ok) {
        setAuthorisedError(exported.error);
        return;
      }

      await logAuthorisedSlipGeneration(existingFinal.id, {
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
      setAuthorisedError(err instanceof Error ? err.message : 'Failed to generate bank copy.');
    } finally {
      setExporting(false);
    }
  }

  const employeeOptions = [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName));

  if (loading) {
    return (
      <p className="py-20 text-center text-sm text-muted">Loading payroll data from Supabase…</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      {/* ================= Left panel — inputs ================= */}
      <div className="no-print min-w-0 space-y-4">
        {saveError && (
          <p className="rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
            Saved PDF locally, but Supabase sync failed: {saveError}
          </p>
        )}
        <div className="rounded-lg border border-hairline bg-paper p-4">
          <h1 className="mb-3 text-sm font-semibold">Payment Statement Generator</h1>
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
            {employee && (
              <div className="col-span-2 rounded border border-hairline bg-surface px-3 py-2 text-xs">
                <p><strong>Engagement:</strong> {employee.engagementType}</p>
                <p><strong>Status:</strong> {employee.employmentStatus}</p>
                <p><strong>Payment Type:</strong> {employee.paymentType}</p>
              </div>
            )}
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
            <Field label={employee?.paymentType === 'stipend' ? 'Adjustments (₹)' : 'Allowances / Adjustments (₹)'} error={errors.fixedAllowance ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.fixedAllowance} onChange={(e) => set('fixedAllowance', e.target.value)} />
            </Field>
            <Field label={employee?.paymentType === 'professional_fee' || employee?.paymentType === 'consultancy_fee' ? 'TDS / Deductions (₹)' : 'Other deductions (₹)'} error={errors.otherDeductions ?? null}>
              <input type="number" min={0} step="0.01" className={inputAmountCls} value={form.otherDeductions} onChange={(e) => set('otherDeductions', e.target.value)} />
            </Field>
            <Field
              label="TDS this month (₹)"
              hint="From employee roster — edit on the employee record."
            >
              <input
                type="number"
                className={inputAmountCls}
                value={employee ? String(employee.tdsMonthly) : '0'}
                readOnly
                disabled
              />
            </Field>
            <Field
              label="Professional Tax this month (₹)"
              hint={
                employee
                  ? `Half-yearly ₹${employee.ptHalfYearly.toFixed(2)} · deducted in months ${settings.ptDeductionMonths.join(', ')}`
                  : undefined
              }
            >
              <input
                type="number"
                className={inputAmountCls}
                value={String(ptThisMonth)}
                readOnly
                disabled
              />
            </Field>
          </div>
        </div>

        {employee && result && (
          <div className="rounded-lg border border-hairline bg-surface px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Flex bank
              </h2>
              <span className="amount text-[12px] font-semibold text-ink">
                {formatMinutes(result.flexAvailable)} available
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-muted">Carried in</p>
                <p className="amount font-semibold text-ink">{formatMinutes(flexBankBase)}</p>
              </div>
              <div>
                <p className="text-muted">+ Earned this month</p>
                <p className="amount font-semibold text-ink">
                  {formatMinutes(num(form.flexMinutesEarned))}
                </p>
              </div>
              <div>
                <p className="text-muted">= Available</p>
                <p className="amount font-semibold text-ink">
                  {formatMinutes(result.flexAvailable)}
                </p>
              </div>
            </div>
            <div className="mt-2 border-t border-hairline pt-2 text-[11px] leading-relaxed">
              {num(form.lateMinutes) > 0 ? (
                <p className="text-ink">
                  Absorbs{' '}
                  <span className="amount font-semibold text-emerald-deep">
                    {formatMinutes(result.flexOffsetMinutes)}
                  </span>{' '}
                  of {formatMinutes(num(form.lateMinutes))} late this month
                  {result.unpaidLateMinutes > 0 ? (
                    <>
                      {' · '}
                      <span className="amount font-semibold text-amber-brand">
                        {formatMinutes(result.unpaidLateMinutes)}
                      </span>{' '}
                      unpaid → {result.lopFromLateness.toFixed(1)} LOP day(s)
                    </>
                  ) : (
                    <> · no loss of pay</>
                  )}
                  {' · '}balance after:{' '}
                  <span className="amount font-semibold text-ink">
                    {formatMinutes(result.newFlexBalance)}
                  </span>
                </p>
              ) : (
                <p className="text-muted">
                  No late minutes this month — the flex bank is{' '}
                  <span className="font-semibold text-ink">untouched</span> and{' '}
                  <span className="amount font-semibold text-ink">
                    {formatMinutes(result.newFlexBalance)}
                  </span>{' '}
                  carries forward. Flex only reduces pay when there are late minutes to absorb.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-hairline bg-paper p-4 shadow-card">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Variable component
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
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

        <div className="rounded-lg border border-hairline bg-paper p-4 shadow-card">
          <Field label="Authorized copy for bank verification">
            <select
              className={inputCls}
              value={form.authorizedForBankVerification ? 'yes' : 'no'}
              onChange={(e) => set('authorizedForBankVerification', e.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-hairline bg-paper p-4 shadow-card">
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
      <div className="no-print min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-paper px-4 py-2.5 shadow-card">
          <div className="flex overflow-hidden rounded-md border border-hairline">
            <button
              onClick={() => setMode('draft')}
              className={`min-h-[44px] px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20 sm:min-h-0 ${
                mode === 'draft' ? 'bg-amber-tint text-amber-brand' : 'bg-paper text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setMode('final')}
              className={`min-h-[44px] border-l border-hairline px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20 sm:min-h-0 ${
                mode === 'final' ? 'bg-emerald-tint text-emerald-deep' : 'bg-paper text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              ✓ Final
            </button>
            <button
              onClick={() => setMode('authorised')}
              className={`min-h-[44px] border-l border-hairline px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20 sm:min-h-0 ${
                mode === 'authorised' ? 'bg-surface text-ink' : 'bg-paper text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              <Download size={14} />
              {exporting
                ? 'Exporting…'
                : status === 'final'
                  ? employee?.paymentType === 'salary'
                    ? 'Generate Salary Slip'
                    : employee?.paymentType === 'stipend'
                      ? 'Generate Stipend Statement'
                      : 'Generate Payment Statement'
                  : 'Download draft PDF'}
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {mode === 'authorised' ? (
              <>
                <button
                  className={btnSecondary}
                  disabled={!authorisedBundle || !!authorisedDisableReason}
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button
                  className={btnPrimary}
                  disabled={!!authorisedDisableReason || exporting || authorisedLoading}
                  title={authorisedDisableReason ?? undefined}
                  onClick={() => void doAuthorisedExport()}
                >
                  <Download size={14} />
                  {exporting ? 'Exporting…' : 'Download bank copy PDF'}
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {mode === 'authorised' && existingFinal && authorisedDisableReason && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-edge bg-amber-tint px-4 py-2.5 text-[12px] font-medium text-amber-brand">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{authorisedDisableReason}</span>
          </div>
        )}

        {mode !== 'authorised' && hasErrors && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-edge bg-amber-tint px-4 py-2.5 text-[12px] font-medium text-amber-brand">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {needsPayoutDate && !form.committedPayoutDate ? (
                <>
                  Export blocked: {formatINR(result?.deferredClosing ?? 0)} is deferred (variable
                  earned − paid). Set a <strong>Committed payout date</strong> in the Variable
                  component below, or make paid ≥ earned so nothing is deferred.
                </>
              ) : (
                <>
                  Export blocked — fix the highlighted fields in the left panel to enable Print and
                  Download.
                </>
              )}
            </span>
          </div>
        )}

        {authorisedError && mode === 'authorised' && (
          <p className="rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] text-amber-brand">
            {authorisedError}
          </p>
        )}

        {mode === 'authorised' ? (
          !employee ? (
            <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
              Select an employee to see the authorised bank copy.
            </div>
          ) : !existingFinal ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline bg-paper px-6 text-center">
              <p className="max-w-sm text-sm text-muted">
                Finalize this month first — the bank copy is generated from the finalized record.
              </p>
              <button className={btnPrimary} onClick={() => setMode('final')}>
                Go to Final tab
              </button>
            </div>
          ) : authorisedLoading && !authorisedBundle ? (
            <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
              Loading authorised bank copy…
            </div>
          ) : authorisedBundle && entity ? (
            <div className="space-y-2">
              <p className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-[11px] font-medium text-muted">
                Rendered from the finalized slip for {formatMonthYear(existingFinal.monthYear)}.
              </p>
              <ScaledPreview>
                <AuthorisedSlip
                  snapshot={authorisedBundle.snapshot}
                  entity={entity}
                  ytd={authorisedBundle.ytd}
                  paydayDayOfMonth={settings.paydayDayOfMonth}
                  signatureUrl={authorisedBundle.signatureUrl}
                  sealUrl={authorisedBundle.sealUrl}
                  signatureAssetPath={entity.signatureAssetPath}
                  sealAssetPath={entity.sealAssetPath}
                  actualCreditDate={authorisedBundle.actualCreditDate}
                  confirmedPaidAmount={authorisedBundle.confirmedPaidAmount}
                  outstandingBalance={authorisedBundle.outstandingAmount}
                  payrollFinalisedDate={existingFinal.generatedAt}
                  documentNumber={`ASL-${existingFinal.employee.empId}-${existingFinal.monthYear}`}
                  verificationId={existingFinal.id.replace(/-/g, '').slice(0, 24)}
                />
              </ScaledPreview>
            </div>
          ) : (
            <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
              Unable to load the authorised bank copy.
            </div>
          )
        ) : snapshot && entity ? (
          <ScaledPreview>
            <SalarySlip
              snapshot={snapshot}
              entity={entity}
              payrollContact={PAYROLL_CONTACT}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              reviewDeadlineTime={settings.reviewDeadlineTime}
              ledgerMismatch={ledgerMismatch}
              authorizedSignatoryName={settings.authorizedSignatoryName}
              authorizedSignatoryTitle={settings.authorizedSignatoryTitle}
            />
          </ScaledPreview>
        ) : (
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
            Select an employee to see the live A4 preview.
          </div>
        )}
      </div>

      {/* Unscaled off-screen copy — the capture source for PDF and window.print(). */}
      {mode !== 'authorised' &&
        snapshot &&
        entity &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="slip-print-root" ref={exportRef}>
            <SalarySlip
              snapshot={snapshot}
              entity={entity}
              payrollContact={PAYROLL_CONTACT}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              reviewDeadlineTime={settings.reviewDeadlineTime}
              ledgerMismatch={ledgerMismatch}
              authorizedSignatoryName={settings.authorizedSignatoryName}
              authorizedSignatoryTitle={settings.authorizedSignatoryTitle}
            />
          </div>,
          document.body,
        )}

      {mode === 'authorised' &&
        authorisedBundle &&
        entity &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="slip-print-root" ref={exportRef}>
            <AuthorisedSlip
              snapshot={authorisedBundle.snapshot}
              entity={entity}
              ytd={authorisedBundle.ytd}
              paydayDayOfMonth={settings.paydayDayOfMonth}
              signatureUrl={authorisedBundle.signatureUrl}
              sealUrl={authorisedBundle.sealUrl}
              signatureAssetPath={
                settings.entities[(existingFinal ?? authorisedBundle.snapshot).employee.entityCode]
                  ?.signatureAssetPath ?? null
              }
              sealAssetPath={
                settings.entities[(existingFinal ?? authorisedBundle.snapshot).employee.entityCode]
                  ?.sealAssetPath ?? null
              }
              actualCreditDate={authorisedBundle.actualCreditDate}
              confirmedPaidAmount={authorisedBundle.confirmedPaidAmount}
              outstandingBalance={authorisedBundle.outstandingAmount}
              payrollFinalisedDate={(existingFinal ?? authorisedBundle.snapshot).generatedAt}
              documentNumber={`ASL-${(existingFinal ?? authorisedBundle.snapshot).employee.empId}-${(existingFinal ?? authorisedBundle.snapshot).monthYear}`}
              verificationId={(existingFinal ?? authorisedBundle.snapshot).id.replace(/-/g, '').slice(0, 24)}
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
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  );
}