'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { EntityCode } from '@/lib/types';
import { applyPtHalfYearlyToAll } from '@/app/actions/payroll';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea, btnPrimary, btnSecondary } from '@/components/ui';
import EntityLogoUpload from '@/components/EntityLogoUpload';
import SignatoryAssetUpload from '@/components/SignatoryAssetUpload';
import PayrollStressTestPanel from '@/components/PayrollStressTestPanel';
import {
  currentMonthKey,
  formatDate,
  formatMonthYear,
  formatQueryDeadline,
  payrollCycleDates,
} from '@/lib/format';

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
  const [ptApplyBusy, setPtApplyBusy] = useState(false);
  const [ptApplyMessage, setPtApplyMessage] = useState<string | null>(null);
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );
  const entity = settings.entities[selectedEntity];

  async function handleSave() {
    await save();
  }

  async function handleApplyPtToAll() {
    setPtApplyBusy(true);
    setPtApplyMessage(null);
    const result = await applyPtHalfYearlyToAll(settings.defaultPtHalfYearly);
    setPtApplyBusy(false);
    if (!result.ok) {
      setPtApplyMessage(result.error);
      return;
    }
    setPtApplyMessage(
      result.data.count === 0
        ? 'No employees on the roster yet.'
        : `Updated Professional Tax to ₹${result.data.amount.toFixed(0)} for ${result.data.count} employee${result.data.count === 1 ? '' : 's'}.`,
    );
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
            disabled={settingsSaving || !hasUnsavedSettings}
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

      {(settingsError || settingsSaveError) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {settingsSaveError ?? settingsError}
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
            label="PT deduction months"
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
          <Field
            label="Default PT half-yearly (₹)"
            hint="Suggested amount for new employees. Use Apply below to set everyone."
          >
            <NumberInput
              value={settings.defaultPtHalfYearly}
              min={0}
              step={1}
              onChange={(e) => {
                const amount = Math.max(0, Math.round(Number(e.target.value) || 0));
                updateSettings({ defaultPtHalfYearly: amount });
              }}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnSecondary}
            disabled={ptApplyBusy}
            onClick={() => void handleApplyPtToAll()}
          >
            {ptApplyBusy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Applying…
              </>
            ) : (
              `Apply ₹${settings.defaultPtHalfYearly.toFixed(0)} PT to everyone`
            )}
          </button>
          {ptApplyMessage && (
            <span className="text-[12px] text-muted">{ptApplyMessage}</span>
          )}
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
        <h3 className="mb-4 text-sm font-semibold text-ink">Authorized slip for bank verification</h3>
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
          <Field label="Authorized signatory name (internal slip banner)">
            <Input
              value={settings.authorizedSignatoryName}
              onChange={(e) => updateSettings({ authorizedSignatoryName: e.target.value })}
            />
          </Field>
          <Field label="Authorized signatory title (internal slip banner)">
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
    </div>
  );
}
