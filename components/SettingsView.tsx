'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { EntityCode, PtSlab } from '@/lib/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea, btnPrimary, btnSecondary, Modal } from '@/components/ui';
import EntityLogoUpload from '@/components/EntityLogoUpload';
import SignatoryAssetUpload from '@/components/SignatoryAssetUpload';
import PayrollStressTestPanel from '@/components/PayrollStressTestPanel';
import {
  currentMonthKey,
  formatDate,
  formatINR,
  formatMonthYear,
  formatQueryDeadline,
  payrollCycleDates,
} from '@/lib/format';
import { KERALA_PT_SLABS_SEED, validatePtSlabs } from '@/lib/payroll-calc';
import {
  recalculatePtFromSlabs,
  type PtRecalcDiff,
} from '@/app/actions/payroll';
import { checkSchemaDrift } from '@/app/actions/schema-drift';
import type { SchemaDriftReport } from '@/lib/schema-drift';

const ENTITY_ORDER: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

export default function SettingsView() {
  const settings = useHRStore((s) => s.settings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const discardSettingsChanges = useHRStore((s) => s.discardSettingsChanges);

  const {
    settingsLoading,
    settingsError,
    settingsSaving,
    settingsSaveError,
    settingsSavedAt,
    hasUnsavedSettings,
    save,
  } = useAppSettings();

  const previewMonth = currentMonthKey();
  const [selectedEntity, setSelectedEntity] = useState<EntityCode>('PX');
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );
  const entity = settings.entities[selectedEntity];

  const [ptRecalcOpen, setPtRecalcOpen] = useState(false);
  const [ptRecalcLoading, setPtRecalcLoading] = useState(false);
  const [ptRecalcApplying, setPtRecalcApplying] = useState(false);
  const [ptRecalcIncludeManual, setPtRecalcIncludeManual] = useState(false);
  const [ptRecalcDiffs, setPtRecalcDiffs] = useState<PtRecalcDiff[]>([]);
  const [ptRecalcError, setPtRecalcError] = useState<string | null>(null);
  const slabCapError = validatePtSlabs(settings.ptSlabs ?? []);
  const [schemaDrift, setSchemaDrift] = useState<SchemaDriftReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkSchemaDrift().then((result) => {
      if (cancelled || !result.ok) return;
      setSchemaDrift(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    await save();
  }

  async function openPtRecalc() {
    setPtRecalcOpen(true);
    setPtRecalcError(null);
    setPtRecalcLoading(true);
    const result = await recalculatePtFromSlabs({
      includeManualOverrides: ptRecalcIncludeManual,
      apply: false,
    });
    setPtRecalcLoading(false);
    if (!result.ok) {
      setPtRecalcError(result.error);
      setPtRecalcDiffs([]);
      return;
    }
    setPtRecalcDiffs(result.data.diffs);
  }

  async function refreshPtRecalcPreview(includeManual: boolean) {
    setPtRecalcIncludeManual(includeManual);
    setPtRecalcLoading(true);
    setPtRecalcError(null);
    const result = await recalculatePtFromSlabs({
      includeManualOverrides: includeManual,
      apply: false,
    });
    setPtRecalcLoading(false);
    if (!result.ok) {
      setPtRecalcError(result.error);
      return;
    }
    setPtRecalcDiffs(result.data.diffs);
  }

  async function applyPtRecalc() {
    setPtRecalcApplying(true);
    setPtRecalcError(null);
    const result = await recalculatePtFromSlabs({
      includeManualOverrides: ptRecalcIncludeManual,
      apply: true,
    });
    setPtRecalcApplying(false);
    if (!result.ok) {
      setPtRecalcError(result.error);
      return;
    }
    setPtRecalcOpen(false);
  }

  function updateSlab(index: number, patch: Partial<PtSlab>) {
    const next = (settings.ptSlabs ?? []).map((row, i) => (i === index ? { ...row, ...patch } : row));
    updateSettings({ ptSlabs: next });
  }

  function resetSlabsToSeed() {
    updateSettings({ ptSlabs: KERALA_PT_SLABS_SEED.map((s) => ({ ...s })) });
  }

  if (settingsLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted">
        <Loader2 className="mr-2 inline animate-spin" size={16} />
        Loading settings from Supabase…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {schemaDrift?.bannerMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border-2 border-amber-brand bg-amber-tint px-4 py-3 text-sm font-medium text-ink"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-brand" />
          <div>
            <p>{schemaDrift.bannerMessage}</p>
            {schemaDrift.missingCanaries.length > 0 && (
              <p className="mt-1 text-[12px] font-normal text-muted">
                Missing columns: {schemaDrift.missingCanaries.join('; ')}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Settings</h2>
          <p className="mt-1 text-sm text-muted">
            These values print on every slip and are saved to Supabase. Edit each entity (PX, PB,
            PT, PH) and save when you are done.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedSettings && (
            <button type="button" className={btnSecondary} onClick={discardSettingsChanges}>
              Discard changes
            </button>
          )}
          <button
            type="button"
            className={btnPrimary}
            disabled={settingsSaving || !hasUnsavedSettings || Boolean(slabCapError)}
            onClick={() => void handleSave()}
          >
            {settingsSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              'Save settings'
            )}
          </button>
        </div>
      </div>

      {settingsSavedAt && !hasUnsavedSettings && !settingsSaveError && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-brand/30 bg-emerald-tint px-3 py-2 text-[12px] font-medium text-emerald-deep">
          <CheckCircle2 size={14} className="shrink-0" />
          All changes saved to Supabase.
        </div>
      )}

      {(settingsError || settingsSaveError || slabCapError) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {slabCapError ?? settingsSaveError ?? settingsError}
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Payroll calendar &amp; contact</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Payday (day of month)"
            hint="Salary credit date. Query deadline is payday − 2."
          >
            <NumberInput
              value={settings.paydayDayOfMonth}
              min={3}
              max={28}
              onChange={(e) => {
                const day = Math.min(28, Math.max(3, Math.round(Number(e.target.value) || 0)));
                updateSettings({ paydayDayOfMonth: day });
              }}
            />
          </Field>
          <Field label="Payroll contact (printed on slip footer)">
            <Input
              value={settings.payrollContact}
              onChange={(e) => updateSettings({ payrollContact: e.target.value })}
              placeholder="payroll@portfolix.tech"
            />
          </Field>
          <Field label="Review deadline time">
            <Input
              value={settings.reviewDeadlineTime}
              onChange={(e) => updateSettings({ reviewDeadlineTime: e.target.value })}
              placeholder="6:00 PM"
            />
          </Field>
          <Field
            label="PT collection mode"
            hint="Monthly accrual is the default. Lump mode deducts the full half-yearly amount only in the months below."
          >
            <select
              className="h-10 w-full rounded-md border border-hairline bg-paper px-3 text-sm text-ink focus:border-ink/30 focus:outline-none focus:ring-2 focus:ring-ink/10"
              value={settings.ptCollectionMode ?? 'monthly_accrual'}
              onChange={(e) =>
                updateSettings({
                  ptCollectionMode:
                    e.target.value === 'half_yearly_lump' ? 'half_yearly_lump' : 'monthly_accrual',
                })
              }
            >
              <option value="monthly_accrual">Monthly accrual (default)</option>
              <option value="half_yearly_lump">Half-yearly lump (Aug / Feb style)</option>
            </select>
          </Field>
          <Field
            label="PT deduction months (lump mode only)"
            hint="Comma-separated month numbers (e.g. 8,2 for Aug and Feb)."
          >
            <Input
              value={settings.ptDeductionMonths.join(', ')}
              onChange={(e) => {
                const months = e.target.value
                  .split(',')
                  .map((m) => Math.round(Number(m.trim())))
                  .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
                updateSettings({
                  ptDeductionMonths:
                    months.length > 0 ? [...new Set(months)].sort((a, b) => a - b) : [8, 2],
                });
              }}
            />
          </Field>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Preview for {formatMonthYear(previewMonth)} — review queries by{' '}
          <span className="font-semibold text-amber-brand">
            {formatQueryDeadline(reviewDeadline, settings.reviewDeadlineTime)}
          </span>
          , salary credited{' '}
          <span className="font-semibold text-emerald-deep">{formatDate(creditDate)}</span>.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Kerala Professional Tax slabs</h3>
            <p className="mt-1 text-[12px] text-muted">
              Basis = half-yearly gross (monthly fixed pay × 6). Hard cap ₹1,250/half-year and
              ₹2,500/year (Article 276) — not configurable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={resetSlabsToSeed}>
              Reset to Kerala seed
            </button>
            <button type="button" className={btnPrimary} onClick={() => void openPtRecalc()}>
              Recalculate PT from slabs for everyone
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-hairline text-muted">
                <th className="px-2 py-1.5 font-semibold">Min gross (₹)</th>
                <th className="px-2 py-1.5 font-semibold">Max gross (₹)</th>
                <th className="px-2 py-1.5 font-semibold">Tax / half-year (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(settings.ptSlabs ?? []).map((slab, index) => (
                <tr key={index} className="border-b border-hairline/60">
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      className="amount h-8 w-full rounded border border-hairline bg-paper px-2"
                      value={slab.minGross}
                      onChange={(e) =>
                        updateSlab(index, { minGross: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      placeholder="∞"
                      className="amount h-8 w-full rounded border border-hairline bg-paper px-2"
                      value={slab.maxGross ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        updateSlab(index, {
                          maxGross: raw === '' ? null : Math.max(0, Number(raw) || 0),
                        });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={1250}
                      className="amount h-8 w-full rounded border border-hairline bg-paper px-2"
                      value={slab.tax}
                      onChange={(e) =>
                        updateSlab(index, { tax: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <h3 className="mb-4 text-sm font-semibold text-ink">Authorised slip for bank verification</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Enable by default in Generator">
            <select
              className="h-10 w-full rounded-md border border-hairline bg-paper px-3 text-sm text-ink focus:border-ink/30 focus:outline-none focus:ring-2 focus:ring-ink/10"
              value={settings.bankVerificationEnabledByDefault ? 'yes' : 'no'}
              onChange={(e) =>
                updateSettings({ bankVerificationEnabledByDefault: e.target.value === 'yes' })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Authorised signatory name (internal slip banner)">
            <Input
              value={settings.authorizedSignatoryName}
              onChange={(e) => updateSettings({ authorizedSignatoryName: e.target.value })}
            />
          </Field>
          <Field label="Authorised signatory title (internal slip banner)">
            <Input
              value={settings.authorizedSignatoryTitle}
              onChange={(e) => updateSettings({ authorizedSignatoryTitle: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-sm font-semibold text-ink">Entity branding &amp; details</h3>
          {ENTITY_ORDER.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setSelectedEntity(code)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                selectedEntity === code
                  ? 'border-ink bg-ink text-paper'
                  : 'border-hairline bg-paper text-ink hover:bg-surface'
              }`}
            >
              {code}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink">
            {selectedEntity}
          </span>
          <h3 className="text-sm font-semibold text-ink">{entity.name || 'Entity'}</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <EntityLogoUpload code={selectedEntity} />
          </div>
          <Field label="Display name">
            <Input
              value={entity.name}
              onChange={(e) => updateEntity(selectedEntity, { name: e.target.value })}
            />
          </Field>
          <Field
            label="Legal line"
            hint='Non-parent brands use "A unit of Portfolix Entreprise Pvt Ltd".'
          >
            <Input
              value={entity.legalLine}
              onChange={(e) => updateEntity(selectedEntity, { legalLine: e.target.value })}
              placeholder="A unit of Portfolix Entreprise Pvt Ltd"
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={entity.contact}
              onChange={(e) => updateEntity(selectedEntity, { contact: e.target.value })}
            />
          </Field>
          <Field label="Payroll email">
            <Input
              value={entity.payrollEmail}
              onChange={(e) => updateEntity(selectedEntity, { payrollEmail: e.target.value })}
            />
          </Field>
          <Field label="Address (one line per row — printed on internal slip)">
            <Textarea
              value={entity.addressLines.join('\n')}
              onChange={(e) =>
                updateEntity(selectedEntity, { addressLines: e.target.value.split('\n') })
              }
              onBlur={(e) =>
                updateEntity(selectedEntity, {
                  addressLines: e.target.value
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <h3 className="mb-1 text-sm font-semibold text-ink">
          Company legal &amp; signatory — {selectedEntity}
        </h3>
        <p className="mb-4 text-[12px] text-muted">
          Required for the authorised bank-verification PDF (signature, seal, CIN, registered
          address).
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="CIN">
            <Input
              value={entity.cin}
              onChange={(e) => updateEntity(selectedEntity, { cin: e.target.value })}
            />
          </Field>
          <Field label="Phone (authorised slip)">
            <Input
              value={entity.phone}
              onChange={(e) => updateEntity(selectedEntity, { phone: e.target.value })}
            />
          </Field>
          <Field label="Registered address (authorised slip letterhead)">
            <Textarea
              value={entity.registeredAddress}
              onChange={(e) => updateEntity(selectedEntity, { registeredAddress: e.target.value })}
            />
          </Field>
          <Field label="Signatory name">
            <Input
              value={entity.signatoryName}
              onChange={(e) => updateEntity(selectedEntity, { signatoryName: e.target.value })}
            />
          </Field>
          <Field label="Signatory designation">
            <Input
              value={entity.signatoryDesignation}
              onChange={(e) =>
                updateEntity(selectedEntity, { signatoryDesignation: e.target.value })
              }
            />
          </Field>
          <div className="md:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SignatoryAssetUpload code={selectedEntity} kind="signature" label="Signature image" />
            <SignatoryAssetUpload code={selectedEntity} kind="seal" label="Company seal" />
          </div>
        </div>
      </div>

      <PayrollStressTestPanel />

      {ptRecalcOpen && (
        <Modal title="Recalculate PT from slabs for everyone" onClose={() => setPtRecalcOpen(false)} wide>
          <p className="mb-3 text-[12px] text-muted">
            Confirm the before → after half-yearly PT for each employee. Manual-override employees
            are skipped unless you include them.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ptRecalcIncludeManual}
              onChange={(e) => void refreshPtRecalcPreview(e.target.checked)}
            />
            Include manual-override employees
          </label>
          {ptRecalcError && (
            <p className="mb-3 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
              {ptRecalcError}
            </p>
          )}
          {ptRecalcLoading ? (
            <p className="py-8 text-center text-sm text-muted">
              <Loader2 className="mr-2 inline animate-spin" size={14} />
              Computing diffs…
            </p>
          ) : (
            <div className="max-h-72 overflow-auto rounded border border-hairline">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-hairline text-muted">
                    <th className="px-2 py-1.5 font-semibold">Employee</th>
                    <th className="px-2 py-1.5 font-semibold">Current</th>
                    <th className="px-2 py-1.5 font-semibold">New</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ptRecalcDiffs.map((d) => (
                    <tr key={d.id} className="border-b border-hairline/60">
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-ink">{d.fullName}</span>
                        <span className="ml-1 text-muted">({d.empId})</span>
                      </td>
                      <td className="amount px-2 py-1.5">{formatINR(d.current)}</td>
                      <td className="amount px-2 py-1.5">{formatINR(d.suggested)}</td>
                      <td className="px-2 py-1.5 text-muted">
                        {d.skipped
                          ? 'Skipped (manual)'
                          : d.current === d.suggested
                            ? 'Unchanged'
                            : 'Will update'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setPtRecalcOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={ptRecalcLoading || ptRecalcApplying}
              onClick={() => void applyPtRecalc()}
            >
              {ptRecalcApplying ? 'Applying…' : 'Confirm recalculate'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}