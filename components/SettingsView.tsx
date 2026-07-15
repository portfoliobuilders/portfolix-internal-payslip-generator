'use client';

import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea } from '@/components/ui';
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
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const ENTITY_ORDER: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

function parsePtMonths(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
}

export default function SettingsView() {
  const settings = useHRStore((s) => s.settings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const saveState = useHRStore((s) => s.saveState);
  const saveError = useHRStore((s) => s.saveError);

  const previewMonth = currentMonthKey();
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Settings</h2>
          <p className="mt-1 text-sm text-muted">
            These values print on every slip. Settings and entity branding are stored in Supabase;
            changes save automatically.
          </p>
        </div>
        {saveState !== 'idle' && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
              saveState === 'error'
                ? 'bg-amber-tint text-amber-brand'
                : saveState === 'saved'
                  ? 'bg-emerald-tint text-emerald-deep'
                  : 'bg-surface text-muted'
            }`}
          >
            {saveState === 'saving' && (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving…
              </>
            )}
            {saveState === 'saved' && (
              <>
                <CheckCircle2 size={12} />
                All changes saved
              </>
            )}
            {saveState === 'error' && (
              <>
                <AlertTriangle size={12} />
                {saveError ?? 'Could not save'}
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <h3 className="mb-4 text-sm font-semibold text-ink">Payroll calendar &amp; contact</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Payday day of month"
            hint="Salary credit date. The query deadline is derived as payday − 2."
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
          <Field
            label="Review deadline time"
            hint="Printed on draft slips with the query-by date (e.g. 6:00 PM)."
          >
            <Input
              value={settings.reviewDeadlineTime}
              onChange={(e) => updateSettings({ reviewDeadlineTime: e.target.value })}
              placeholder="6:00 PM"
            />
          </Field>
          <Field
            label="Payroll contact (legacy fallback)"
            hint="Prefer each entity’s payroll email under Company & Signatory."
          >
            <Input
              value={settings.payrollContact}
              onChange={(e) => updateSettings({ payrollContact: e.target.value })}
            />
          </Field>
          <Field
            label="PT deduction months"
            hint="Months (1–12) when Kerala half-yearly Professional Tax is deducted. Default: 8, 2."
          >
            <Input
              value={settings.ptDeductionMonths.join(', ')}
              onChange={(e) => {
                const months = parsePtMonths(e.target.value);
                if (months.length > 0) updateSettings({ ptDeductionMonths: months });
              }}
              placeholder="8, 2"
            />
          </Field>
        </div>
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-[11px] text-muted">
          Preview for {formatMonthYear(previewMonth)} — review queries by{' '}
          <span className="font-semibold text-amber-brand">
            {formatQueryDeadline(reviewDeadline, settings.reviewDeadlineTime)}
          </span>
          , salary credited{' '}
          <span className="font-semibold text-emerald-deep">{formatDate(creditDate)}</span>.
        </p>
      </div>

      <div className="space-y-4">
        {ENTITY_ORDER.map((code) => {
          const entity = settings.entities[code];
          return (
            <div key={code} className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                  {code}
                </span>
                <h3 className="text-sm font-semibold text-ink">{entity.name || 'Entity'}</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <EntityLogoUpload code={code} />
                </div>
                <Field label="Display name">
                  <Input
                    value={entity.name}
                    onChange={(e) => updateEntity(code, { name: e.target.value })}
                  />
                </Field>
                <Field
                  label="Legal line"
                  hint='Non-parent brands use "A unit of Portfolix Enterprise Pvt Ltd".'
                >
                  <Input
                    value={entity.legalLine}
                    onChange={(e) => updateEntity(code, { legalLine: e.target.value })}
                    placeholder="A unit of Portfolix Enterprise Pvt Ltd"
                  />
                </Field>
                <Field label="Contact (legacy)">
                  <Input
                    value={entity.contact}
                    onChange={(e) => updateEntity(code, { contact: e.target.value })}
                  />
                </Field>
                <Field label="Address (one line per row)">
                  <Textarea
                    value={entity.addressLines.join('\n')}
                    onChange={(e) => updateEntity(code, { addressLines: e.target.value.split('\n') })}
                    onBlur={(e) =>
                      updateEntity(code, {
                        addressLines: e.target.value
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>
              </div>

              <div className="mt-6 border-t border-hairline pt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Company &amp; Signatory</h4>
                <p className="mb-4 text-[12px] text-muted">
                  Printed on the Authorised Slip (bank copy). Use SET-IN-SETTINGS until real values
                  are confirmed — never ship guessed emails or CIN numbers.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="CIN">
                    <Input
                      value={entity.cin}
                      onChange={(e) => updateEntity(code, { cin: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Contact phone">
                    <Input
                      value={entity.phone}
                      onChange={(e) => updateEntity(code, { phone: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Payroll email">
                    <Input
                      value={entity.payrollEmail}
                      onChange={(e) => updateEntity(code, { payrollEmail: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Registered address">
                      <Textarea
                        value={entity.registeredAddress}
                        onChange={(e) => updateEntity(code, { registeredAddress: e.target.value })}
                        placeholder="SET-IN-SETTINGS"
                      />
                    </Field>
                  </div>
                  <Field label="Signatory name">
                    <Input
                      value={entity.signatoryName}
                      onChange={(e) => updateEntity(code, { signatoryName: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Signatory designation">
                    <Input
                      value={entity.signatoryDesignation}
                      onChange={(e) =>
                        updateEntity(code, { signatoryDesignation: e.target.value })
                      }
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <SignatoryAssetUpload code={code} kind="signature" label="Authorised signature" />
                  <SignatoryAssetUpload code={code} kind="seal" label="Company seal" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <PayrollStressTestPanel />
    </div>
  );
}
