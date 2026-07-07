'use client';

/**
 * Client-side settings store. Edits autosave to Supabase after a short debounce.
 */

import { create } from 'zustand';
import { saveSettings } from '@/app/actions/settings';
import { SEED_SETTINGS } from '@/lib/settings-defaults';
import type { EntityCode, EntityInfo, Settings } from '@/lib/types';

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
}

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
    }));
    scheduleAutosave(get, set);
  },
}));
