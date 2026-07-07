'use client';

import { useEffect, useState } from 'react';
import SettingsView from '@/components/SettingsView';
import { upsertAppSettings } from '@/app/actions/payroll';
import { useHRStore } from '@/store/useHRStore';

export default function SettingsPage() {
  const settings = useHRStore((s) => s.settings);
  const settingsLoading = useHRStore((s) => s.settingsLoading);
  const settingsError = useHRStore((s) => s.settingsError);
  const settingsSaving = useHRStore((s) => s.settingsSaving);
  const settingsSaveError = useHRStore((s) => s.settingsSaveError);
  const settingsSavedAt = useHRStore((s) => s.settingsSavedAt);
  const hasUnsavedSettings = useHRStore((s) => s.hasUnsavedSettings);
  const markSettingsSaved = useHRStore((s) => s.markSettingsSaved);
  const setSettingsSaving = useHRStore((s) => s.setSettingsSaving);
  const setSettingsSaveError = useHRStore((s) => s.setSettingsSaveError);
  const setSettingsError = useHRStore((s) => s.setSettingsError);
  const setSettingsLoading = useHRStore((s) => s.setSettingsLoading);
  const hydrateSettings = useHRStore((s) => s.hydrateSettings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function reload() {
    setSettingsLoading(true);
    setSettingsError(null);
    const { getAppSettings } = await import('@/app/actions/payroll');
    const result = await getAppSettings();
    if (!result.ok) {
      setSettingsError(result.error);
      return;
    }
    hydrateSettings(result.data);
  }

  async function save() {
    setSettingsSaving(true);
    const result = await upsertAppSettings(settings);
    if (!result.ok) {
      setSettingsSaveError(result.error);
      return;
    }
    markSettingsSaved(result.data);
  }

  if (!mounted) {
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;
  }

  return (
    <SettingsView
      loading={settingsLoading}
      error={settingsError}
      saving={settingsSaving}
      saveError={settingsSaveError}
      savedAt={settingsSavedAt}
      hasUnsavedChanges={hasUnsavedSettings()}
      onRetry={() => void reload()}
      onSave={() => void save()}
    />
  );
}
