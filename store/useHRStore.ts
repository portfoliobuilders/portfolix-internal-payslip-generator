'use client';

/**
 * Client-side settings store. Draft edits live here until the user clicks
 * Save Settings; the saved baseline is synced from Supabase.
 */

import { create } from 'zustand';
import type { EntityCode, EntityInfo, Settings } from '@/lib/types';
import { SEED_SETTINGS } from '@/lib/seed-settings';

export { SEED_SETTINGS };

interface HRState {
  settings: Settings;
  savedSettings: Settings;
  settingsLoading: boolean;
  settingsError: string | null;
  settingsSaving: boolean;
  settingsSaveError: string | null;
  settingsSavedAt: string | null;
  hydrateSettings: (settings: Settings) => void;
  setSettingsLoading: (loading: boolean) => void;
  setSettingsError: (error: string | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateEntity: (code: EntityCode, patch: Partial<EntityInfo>) => void;
  markSettingsSaved: (settings: Settings) => void;
  setSettingsSaving: (saving: boolean) => void;
  setSettingsSaveError: (error: string | null) => void;
  hasUnsavedSettings: () => boolean;
  discardSettingsChanges: () => void;
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const useHRStore = create<HRState>((set, get) => ({
  settings: SEED_SETTINGS,
  savedSettings: SEED_SETTINGS,
  settingsLoading: true,
  settingsError: null,
  settingsSaving: false,
  settingsSaveError: null,
  settingsSavedAt: null,

  hydrateSettings: (settings) =>
    set({
      settings,
      savedSettings: settings,
      settingsLoading: false,
      settingsError: null,
      settingsSaveError: null,
    }),

  setSettingsLoading: (loading) => set({ settingsLoading: loading }),

  setSettingsError: (error) => set({ settingsError: error, settingsLoading: false }),

  updateSettings: (patch) =>
    set((state) => ({
      settings: { ...state.settings, ...patch },
      settingsSaveError: null,
      settingsSavedAt: null,
    })),

  updateEntity: (code, patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        entities: {
          ...state.settings.entities,
          [code]: { ...state.settings.entities[code], ...patch },
        },
      },
      settingsSaveError: null,
      settingsSavedAt: null,
    })),

  markSettingsSaved: (settings) =>
    set({
      settings,
      savedSettings: settings,
      settingsSaving: false,
      settingsSaveError: null,
      settingsSavedAt: new Date().toISOString(),
    }),

  setSettingsSaving: (saving) => set({ settingsSaving: saving, settingsSaveError: saving ? null : get().settingsSaveError }),

  setSettingsSaveError: (error) => set({ settingsSaveError: error, settingsSaving: false }),

  hasUnsavedSettings: () => !settingsEqual(get().settings, get().savedSettings),

  discardSettingsChanges: () =>
    set((state) => ({
      settings: state.savedSettings,
      settingsSaveError: null,
      settingsSavedAt: null,
    })),
}));
