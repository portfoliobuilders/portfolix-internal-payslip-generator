'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EntityCode } from '@/lib/types';
import { fetchCompanySettings, updateCompanySettings } from '@/app/actions/settings';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea, btnPrimary, btnSecondary } from '@/components/ui';
import EntityLogoUpload from '@/components/EntityLogoUpload';
import PayrollStressTestPanel from '@/components/PayrollStressTestPanel';
import {
  currentMonthKey,
  formatMonthYear,
  formatQueryDeadline,
  payrollCycleDates,
} from '@/lib/format';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const PRIMARY_ENTITY: EntityCode = 'PX';

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
  const setSettings = useHRStore((s) => s.setSettings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const discardSettingsChanges = useHRStore((s) => s.discardSettingsChanges);

  const previewMonth = currentMonthKey();
  const primaryEntity = settings.entities[PRIMARY_ENTITY];
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
        <h3 className="text-sm font-semibold text-ink">Payroll calendar</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payday (day of month)">
            <NumberInput
              value={settings.paydayDayOfMonth}
              min={3}
              max={28}
              onChange={(e) =>
                updateSettings({ paydayDayOfMonth: Number(e.target.value) || 5 })
              }
            />
          </Field>
          <Field label="Payroll contact">
            <Input
              value={settings.payrollContact}
              onChange={(e) => updateSettings({ payrollContact: e.target.value })}
              placeholder="payroll@example.com"
            />
          </Field>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Preview for {formatMonthYear(previewMonth)}: credit {creditDate.toDateString()} · query
          deadline {formatQueryDeadline(reviewDeadline, settings.reviewDeadlineTime)}
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-paper p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink">
            {PRIMARY_ENTITY}
          </span>
          <h3 className="text-sm font-semibold text-ink">{primaryEntity.name || 'Entity branding'}</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <EntityLogoUpload code={PRIMARY_ENTITY} />
          </div>
          <Field label="Display name">
            <Input
              value={primaryEntity.name}
              onChange={(e) => updateEntity(PRIMARY_ENTITY, { name: e.target.value })}
            />
          </Field>
          <Field
            label="Legal line"
            hint='Optional; for sub-brands use "A unit of …" only when accurate.'
          >
            <Input
              value={primaryEntity.legalLine}
              onChange={(e) => updateEntity(PRIMARY_ENTITY, { legalLine: e.target.value })}
              placeholder="A unit of …"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address (one line per row)">
              <Textarea
                value={primaryEntity.addressLines.join('\n')}
                onChange={(e) =>
                  updateEntity(PRIMARY_ENTITY, {
                    addressLines: e.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                rows={4}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={() => void handleSave()} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {loading && <p className="text-xs text-muted">Loading settings from Supabase…</p>}
      </div>

      <PayrollStressTestPanel />
    </div>
  );
}
