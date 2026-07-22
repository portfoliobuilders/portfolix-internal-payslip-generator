'use server';

/**
 * Settings server actions.
 *
 * - company_settings: legacy singleton branding row used by Settings UI
 * - app_settings (id=1, data jsonb): full Settings object including signatory fields
 *
 * TODO(auth session): wrap mutating exports with requirePayrollAdmin().
 */

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import {
  assertPtSlabsAllowed,
  mergeSettings,
  SEED_SETTINGS,
} from '@/lib/settings-defaults';
import { clampPaydayDayOfMonth } from '@/lib/format';
import { validatePtSlabs, type PtCollectionMode } from '@/lib/payroll-calc';
import type { Settings } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

export type SettingsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ActionResult<T> = SettingsActionResult<T>;

export interface CompanySettingsRecord {
  payday_day: number;
  payroll_contact: string;
  display_name: string;
  legal_line: string;
  address: string;
  logo_url: string | null;
}

const SETTINGS_ROW_ID = 1;
const APP_SETTINGS_ID = 1;
const BRANDING_BUCKET = 'branding';
const BRANDING_PATH = 'company-logo';

interface AppSettingsRow {
  id: number;
  data: Partial<Settings> | null;
  updated_at: string;
}

function revalidateSettingsViews() {
  revalidatePath('/');
  revalidatePath('/settings');
}

function clampPaydayDay(day: number): number {
  return clampPaydayDayOfMonth(day);
}

function normalizeSettings(settings: Settings): Settings {
  const months = (settings.ptDeductionMonths ?? [])
    .map((m) => Math.round(Number(m)))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const mode: PtCollectionMode =
    settings.ptCollectionMode === 'half_yearly_lump' ? 'half_yearly_lump' : 'monthly_accrual';
  const slabs = (settings.ptSlabs ?? SEED_SETTINGS.ptSlabs).map((s) => ({
    minGross: Number(s.minGross) || 0,
    maxGross: s.maxGross == null ? null : Number(s.maxGross),
    tax: Number(s.tax) || 0,
  }));
  // HARD CAP — reject before persist (Article 276).
  assertPtSlabsAllowed(slabs);
  const defaultPt = Math.max(0, Number(settings.defaultPtHalfYearly) || 0);
  return {
    ...settings,
    paydayDayOfMonth: clampPaydayDay(settings.paydayDayOfMonth),
    payrollContact: settings.payrollContact.trim() || SEED_SETTINGS.payrollContact,
    reviewDeadlineTime: settings.reviewDeadlineTime.trim() || '6:00 PM',
    ptDeductionMonths:
      months.length > 0 ? [...new Set(months)].sort((a, b) => a - b) : [8, 2],
    ptCollectionMode: mode,
    ptSlabs: slabs,
    defaultPtHalfYearly: defaultPt,
  };
}

/** Full app settings (jsonb singleton). */
export async function fetchSettings(): Promise<ActionResult<Settings>> {
  try {
    const supabase = await createClient();
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
    const stored = row.data ?? {};
    const merged = mergeSettings(stored);
    // Soft-migrate: persist founder-default PT slabs + monthly_accrual when
    // older app_settings rows pre-date this feature (additive keys only).
    const needsPtMigrate =
      stored.ptCollectionMode == null ||
      !Array.isArray(stored.ptSlabs) ||
      stored.ptSlabs.length === 0;
    if (needsPtMigrate) {
      return saveSettings(merged);
    }
    return { ok: true, data: merged };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch settings.',
    };
  }
}

export async function saveSettings(settings: Settings): Promise<ActionResult<Settings>> {
  try {
    const capError = validatePtSlabs(settings.ptSlabs ?? []);
    if (capError) return { ok: false, error: capError };

    const supabase = await createClient();
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

export async function fetchCompanySettings(): Promise<SettingsActionResult<CompanySettingsRecord | null>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('company_settings')
      .select('payday_day,payroll_contact,display_name,legal_line,address,logo_url')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data as CompanySettingsRecord | null) ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch company settings.',
    };
  }
}

export async function updateCompanySettings(
  data: CompanySettingsRecord,
): Promise<SettingsActionResult<CompanySettingsRecord>> {
  try {
    const supabase = await createClient();
    const payload = {
      id: SETTINGS_ROW_ID,
      payday_day: clampPaydayDay(Number(data.payday_day) || 5),
      payroll_contact: data.payroll_contact?.trim() ?? '',
      display_name: data.display_name?.trim() ?? '',
      legal_line: data.legal_line?.trim() ?? '',
      address: data.address?.trim() ?? '',
      logo_url: data.logo_url ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'id' })
      .select('payday_day,payroll_contact,display_name,legal_line,address,logo_url')
      .single();

    if (error) return { ok: false, error: error.message };
    revalidateSettingsViews();
    return { ok: true, data: upserted as CompanySettingsRecord };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update company settings.',
    };
  }
}

export async function uploadCompanyLogo(formData: FormData): Promise<SettingsActionResult<string>> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'Please choose a valid image file.' };
    }

    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
    if (!allowedTypes.has(file.type)) {
      return { ok: false, error: 'Please upload a PNG, JPEG, WebP, or SVG image.' };
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
    const safeExt = extension ? `.${extension.toLowerCase()}` : '';
    const logoPath = `${BRANDING_PATH}${safeExt}`;

    const supabase = await createClient();
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(logoPath, bytes, {
        upsert: true,
        contentType: file.type,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    const cacheBust = randomUUID();
    const { data: publicUrlData } = supabase.storage
      .from(BRANDING_BUCKET)
      .getPublicUrl(`${logoPath}?v=${cacheBust}`);
    const logoUrl = publicUrlData.publicUrl;

    const { error: settingsError } = await supabase.from('company_settings').upsert(
      {
        id: SETTINGS_ROW_ID,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (settingsError) return { ok: false, error: settingsError.message };

    revalidateSettingsViews();
    return { ok: true, data: logoUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to upload company logo.',
    };
  }
}
