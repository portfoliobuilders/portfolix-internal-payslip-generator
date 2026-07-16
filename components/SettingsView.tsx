'use client';

import { useState } from 'react';
import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea } from '@/components/ui';
import EntityLogoUpload from '@/components/EntityLogoUpload';
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

export default function SettingsView() {
  const settings = useHRStore((s) => s.settings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const saveState = useHRStore((s) => s.saveState);
  const saveError = useHRStore((s) => s.saveError);

  const previewMonth = currentMonthKey();
  const [selectedEntity, setSelectedEntity] = useState<EntityCode>('PX');
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );
  const entity = settings.entities[selectedEntity];

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
            hint="Salary credit date. The query deadline is derived as payday − 2 at 6:00 PM."
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
          <Field label="Payroll contact (printed on the slip footer)">
            <Input
              value={settings.payrollContact}
              onChange={(e) => updateSettings({ payrollContact: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-[11px] text-muted">
          Preview for {formatMonthYear(previewMonth)} — review queries by{' '}
          <span className="font-semibold text-amber-brand">
            {formatQueryDeadline(reviewDeadline)}
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
          <Field label="Authorized signatory name">
            <Input
              value={settings.authorizedSignatoryName}
              onChange={(e) => updateSettings({ authorizedSignatoryName: e.target.value })}
            />
          </Field>
          <Field label="Authorized signatory title">
            <Input
              value={settings.authorizedSignatoryTitle}
              onChange={(e) => updateSettings({ authorizedSignatoryTitle: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-sm font-semibold text-ink">Entity branding & details</h3>
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
          <Field label="Legal line" hint='Non-parent brands use "A unit of Portfolix Enterprise Pvt Ltd".'>
            <Input
              value={entity.legalLine}
              onChange={(e) => updateEntity(selectedEntity, { legalLine: e.target.value })}
              placeholder="A unit of Portfolix Enterprise Pvt Ltd"
            />
          </Field>
          <Field label="Contact">
            <Input
              value={entity.contact}
              onChange={(e) => updateEntity(selectedEntity, { contact: e.target.value })}
            />
          </Field>
          <Field label="Address (one line per row)">
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

      <PayrollStressTestPanel />
    </div>
  );
}
