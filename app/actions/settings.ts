'use server';

import { revalidatePath } from 'next/cache';
import { mergeSettings, SEED_SETTINGS } from '@/lib/settings-defaults';
import type { Settings } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Singleton row in public.app_settings (id integer, data jsonb). */
const APP_SETTINGS_ID = 1;

interface AppSettingsRow {
  id: number;
  data: Partial<Settings> | null;
  updated_at: string;
}

async function getSupabase() {
  return createClient();
}

function revalidateSettingsViews() {
  revalidatePath('/');
}

function clampPaydayDay(day: number): number {
  return Math.min(28, Math.max(3, Math.round(day)));
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    paydayDayOfMonth: clampPaydayDay(settings.paydayDayOfMonth),
    payrollContact: settings.payrollContact.trim(),
  };
}

/** Returns application settings from Supabase, seeding defaults if the row is missing. */
export async function fetchSettings(): Promise<ActionResult<Settings>> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('app_settings')
      .select('id,data,updated_at')
      .eq('id', APP_SETTINGS_ID)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    if (!data) {
      return saveSettings(SEED_SETTINGS);
    }

    const row = data as AppSettingsRow;
    return { ok: true, data: mergeSettings(row.data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch settings.',
    };
  }
}

/** Persists the full settings object to the singleton app_settings row. */
export async function saveSettings(settings: Settings): Promise<ActionResult<Settings>> {
  try {
    const supabase = await getSupabase();
    const normalized = normalizeSettings(settings);
    const payload = {
      id: APP_SETTINGS_ID,
      data: normalized,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'id' })
      .select('data')
      .single();

    if (error) return { ok: false, error: error.message };

    const row = data as Pick<AppSettingsRow, 'data'>;
    revalidateSettingsViews();
    return { ok: true, data: mergeSettings(row.data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save settings.',
    };
  }
}
