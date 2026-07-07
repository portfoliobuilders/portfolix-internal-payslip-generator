'use client';

import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea, btnPrimary, btnSecondary } from '@/components/ui';
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

interface SettingsViewProps {
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  savedAt: string | null;
  hasUnsavedChanges: boolean;
  onRetry: () => void;
  onSave: () => void;
}

export default function SettingsView({
  loading,
  error,
  saving,
  saveError,
  savedAt,
  hasUnsavedChanges,
  onRetry,
  onSave,
}: SettingsViewProps) {
  const settings = useHRStore((s) => s.settings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const discardSettingsChanges = useHRStore((s) => s.discardSettingsChanges);

  const previewMonth = currentMonthKey();
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Loading settings from Supabase…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-edge bg-amber-tint px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-brand">Could not load settings</p>
        <p className="mt-1 text-[12px] text-muted">{error}</p>
        <button className="mt-4 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Settings</h2>
          <p className="mt-1 text-sm text-muted">
            These values print on every slip. All settings and entity branding are stored in Supabase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedChanges && (
            <button className={btnSecondary} onClick={discardSettingsChanges} disabled={saving}>
              Discard changes
            </button>
          )}
          <button className={btnPrimary} onClick={onSave} disabled={saving || !hasUnsavedChanges}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving…
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Failed to save settings: {saveError}
        </div>
      )}

      {savedAt && !hasUnsavedChanges && !saveError && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-brand/30 bg-emerald-tint px-3 py-2 text-[12px] font-medium text-emerald-deep">
          <CheckCircle2 size={14} className="shrink-0" />
          Settings saved to Supabase at {formatDate(savedAt)}.
        </div>
      )}

      {hasUnsavedChanges && !saving && (
        <p className="text-[12px] font-medium text-amber-brand">You have unsaved changes.</p>
      )}

      <div className="rounded-lg border border-hairline bg-paper p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Payroll calendar &amp; contact</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <div className="space-y-4">
        {ENTITY_ORDER.map((code) => {
          const entity = settings.entities[code];
          return (
            <div key={code} className="rounded-lg border border-hairline bg-paper p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                  {code}
                </span>
                <h3 className="text-sm font-semibold text-ink">{entity.name || 'Entity'}</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
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
                <Field label="Contact">
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
            </div>
          );
        })}
      </div>

      <PayrollStressTestPanel />
    </div>
  );
}
