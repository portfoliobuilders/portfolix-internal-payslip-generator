'use client';

/**
 * Client-side settings store. Draft edits live here until the user clicks
 * Save Settings; the saved baseline is synced from Supabase.
 * Client-side settings store. Edits autosave to Supabase after a short debounce.
 */

import { create } from 'zustand';
import { saveSettings } from '@/app/actions/settings';
import { SEED_SETTINGS } from '@/lib/settings-defaults';
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
export type SettingsSaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 700;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressAutosave = false;

interface HRState {
  settings: Settings;
  saveState: SettingsSaveState;
  saveError: string | null;
  setSettings: (settings: Settings) => void;
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
function scheduleAutosave(get: () => HRState, set: (partial: Partial<HRState>) => void) {
  if (suppressAutosave) return;

  if (autosaveTimer) clearTimeout(autosaveTimer);

  set({ saveState: 'saving', saveError: null });

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void (async () => {
      const result = await saveSettings(get().settings);
      if (result.ok) {
        set({ settings: result.data, saveState: 'saved', saveError: null });
      } else {
        set({ saveState: 'error', saveError: result.error });
      }
    })();
  }, AUTOSAVE_MS);
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
  saveState: 'idle',
  saveError: null,

  setSettings: (settings) => {
    suppressAutosave = true;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    set({ settings, saveState: 'idle', saveError: null });
    suppressAutosave = false;
  },

  updateSettings: (patch) => {
    set((state) => ({ settings: { ...state.settings, ...patch } }));
    scheduleAutosave(get, set);
  },

  updateEntity: (code, patch) => {
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
    scheduleAutosave(get, set);
  },
}));
