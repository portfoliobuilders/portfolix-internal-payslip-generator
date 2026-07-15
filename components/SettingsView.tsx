'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EntityCode } from '@/lib/types';
import { fetchCompanySettings, updateCompanySettings } from '@/app/actions/settings';
import { useHRStore } from '@/store/useHRStore';
import { Field, Input, NumberInput, Textarea, btnPrimary } from '@/components/ui';
import EntityLogoUpload from '@/components/EntityLogoUpload';
import PayrollStressTestPanel from '@/components/PayrollStressTestPanel';
import {
  currentMonthKey,
  formatMonthYear,
  formatQueryDeadline,
  payrollCycleDates,
} from '@/lib/format';

const PRIMARY_ENTITY: EntityCode = 'PX';

/**
 * Settings UI — loads/saves the company_settings singleton and mirrors
 * primary-entity branding into the local store for slip previews.
 */
export default function SettingsView() {
  const settings = useHRStore((s) => s.settings);
  const setSettings = useHRStore((s) => s.setSettings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewMonth = currentMonthKey();
  const primaryEntity = settings.entities[PRIMARY_ENTITY];
  const { creditDate, reviewDeadline } = payrollCycleDates(
    previewMonth,
    settings.paydayDayOfMonth,
  );

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      setLoading(true);
      setError(null);

      const result = await fetchCompanySettings();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.data) {
        const data = result.data;
        const current = useHRStore.getState().settings;
        setSettings({
          ...current,
          paydayDayOfMonth: data.payday_day,
          payrollContact: data.payroll_contact,
          entities: {
            ...current.entities,
            [PRIMARY_ENTITY]: {
              ...current.entities[PRIMARY_ENTITY],
              name: data.display_name,
              legalLine: data.legal_line,
              addressLines: data.address
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
              logoDataUrl: data.logo_url,
            },
          },
        });
      }

      setLoading(false);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [setSettings]);

  const settingsPayload = useMemo(
    () => ({
      payday_day: settings.paydayDayOfMonth,
      payroll_contact: settings.payrollContact,
      display_name: primaryEntity.name,
      legal_line: primaryEntity.legalLine,
      address: primaryEntity.addressLines.join('\n'),
      logo_url: primaryEntity.logoDataUrl,
    }),
    [settings, primaryEntity],
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await updateCompanySettings(settingsPayload);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setNotice('Settings saved to Supabase.');
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          These values print on every slip and are saved to Supabase. The legal
          company name must match the confirmed registration (see Company Legal
          settings after Phase 2 migrations are applied).
        </p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-brand/30 bg-emerald-tint px-3 py-2 text-[12px] font-medium text-emerald-deep">
          <CheckCircle2 size={14} className="shrink-0" />
          {notice}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
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
