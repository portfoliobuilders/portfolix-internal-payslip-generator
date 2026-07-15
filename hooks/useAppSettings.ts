'use client';

import { useCallback, useEffect } from 'react';
import { fetchSettings, saveSettings } from '@/app/actions/settings';
import { useHRStore } from '@/store/useHRStore';

export function useAppSettings() {
  const hydrateSettings = useHRStore((s) => s.hydrateSettings);
  const setSettingsLoading = useHRStore((s) => s.setSettingsLoading);
  const setSettingsError = useHRStore((s) => s.setSettingsError);
  const settings = useHRStore((s) => s.settings);
  const settingsLoading = useHRStore((s) => s.settingsLoading);
  const settingsError = useHRStore((s) => s.settingsError);
  const settingsSaving = useHRStore((s) => s.settingsSaving);
  const settingsSaveError = useHRStore((s) => s.settingsSaveError);
  const settingsSavedAt = useHRStore((s) => s.settingsSavedAt);
  const markSettingsSaved = useHRStore((s) => s.markSettingsSaved);
  const setSettingsSaving = useHRStore((s) => s.setSettingsSaving);
  const setSettingsSaveError = useHRStore((s) => s.setSettingsSaveError);
  const hasUnsavedSettings = useHRStore((s) => s.hasUnsavedSettings);

  const load = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    const result = await fetchSettings();
    if (!result.ok) {
      setSettingsError(result.error);
      return;
    }
    hydrateSettings(result.data);
  }, [hydrateSettings, setSettingsError, setSettingsLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSettingsSaving(true);
    const result = await saveSettings(settings);
    if (!result.ok) {
      setSettingsSaveError(result.error);
      return false;
    }
    markSettingsSaved(result.data);
    return true;
  }, [markSettingsSaved, setSettingsSaveError, setSettingsSaving, settings]);

  return {
    settingsLoading,
    settingsError,
    settingsSaving,
    settingsSaveError,
    settingsSavedAt,
    hasUnsavedSettings: hasUnsavedSettings(),
    reload: load,
    save,
  };
}
